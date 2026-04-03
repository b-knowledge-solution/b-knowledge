/**
 * @fileoverview Service for managing LLM provider configurations with encryption and connection testing.
 * @module modules/llm-provider/services/llm-provider
 */
import { ModelFactory } from '@/shared/models/factory.js';
import { log } from '@/shared/services/logger.service.js';
import { config } from '@/shared/config/index.js';
import { cryptoService } from '@/shared/services/crypto.service.js';
import { auditService, AuditAction, AuditResourceType } from '@/modules/audit/services/audit.service.js';
import { ModelProvider } from '@/shared/models/types.js';
import { ProviderStatus, ModelType, ComparisonLiteral } from '@/shared/constants/index.js';
import {
    EMBED_WORKER_STATUS_KEY,
    SENTENCE_TRANSFORMERS_FACTORY,
    SYSTEM_API_KEY_SENTINEL,
    EmbeddingWorkerStatus,
    type EmbeddingWorkerStatusType,
} from '@/shared/constants/embedding.js';

/**
 * @description User context for audit logging on provider operations
 */
interface UserContext {
    /** User UUID */
    id: string;
    /** User email address */
    email: string;
    /** Client IP address */
    ip?: string;
}

/** Result of a provider connection test */
export interface TestConnectionResult {
    /** Whether the connection was successful */
    success: boolean;
    /** Round-trip latency in milliseconds (present on success) */
    latencyMs?: number;
    /** Error message (present on failure) */
    error?: string;
}

/**
 * @description Service for managing LLM provider configurations including CRUD, encryption, tenant sync, and connection testing
 */
export class LlmProviderService {
    /**
     * @description List all active model providers ordered by factory name
     * @returns {Promise<ModelProvider[]>} Array of active providers
     */
    async list(): Promise<(ModelProvider & { model_status?: string })[]> {
        const providers = await ModelFactory.modelProvider.findAll(
            { status: ProviderStatus.ACTIVE },
            { orderBy: { factory_name: 'asc' } }
        )

        // Enrich system providers with live model readiness status from Valkey
        const hasSystem = providers.some((p: ModelProvider) => p.is_system)
        if (hasSystem) {
            const status = await this.getEmbeddingWorkerStatus()
            return providers.map((p: ModelProvider) =>
                p.is_system ? { ...p, model_status: status } : p
            )
        }

        return providers
    }

    /**
     * @description Get a single model provider by ID
     * @param {string} id - Provider UUID
     * @returns {Promise<ModelProvider | undefined>} The provider or undefined
     */
    async getById(id: string): Promise<ModelProvider | undefined> {
        return ModelFactory.modelProvider.findById(id);
    }

    /**
     * @description Get default model providers for each model type
     * @returns {Promise<ModelProvider[]>} Array of default providers
     */
    async getDefaults(): Promise<ModelProvider[]> {
        return ModelFactory.modelProvider.findDefaults();
    }

    /**
     * @description Create a new model provider, reactivating soft-deleted duplicates if found
     * @param {any} data - Provider configuration data
     * @param {UserContext} user - Optional user context for audit trail
     * @returns {Promise<ModelProvider>} The created or reactivated provider
     */
    async create(data: any, user?: UserContext): Promise<ModelProvider> {
        // Encrypt the API key before persisting to database
        const encryptedKey = data.api_key
            ? cryptoService.encrypt(data.api_key)
            : null;

        // Check for a soft-deleted row matching the full composite key
        // (factory_name + model_type + model_name) so we reactivate the correct row type
        const [existing] = await ModelFactory.modelProvider.findAll({
            factory_name: data.factory_name,
            model_type: data.model_type,
            model_name: data.model_name,
            status: ProviderStatus.DELETED,
        });

        let provider: ModelProvider;

        if (existing) {
            // Reactivate the soft-deleted row with the new data
            provider = (await ModelFactory.modelProvider.update(existing.id, {
                model_type: data.model_type,
                api_key: encryptedKey,
                api_base: data.api_base || null,
                max_tokens: data.max_tokens || null,
                vision: data.vision || false,
                status: ProviderStatus.ACTIVE,
                is_default: data.is_default || false,
                updated_by: user?.id || null,
            }))!;
        } else {
            // No soft-deleted duplicate — insert as normal
            provider = await ModelFactory.modelProvider.create({
                factory_name: data.factory_name,
                model_type: data.model_type,
                model_name: data.model_name,
                api_key: encryptedKey,
                api_base: data.api_base || null,
                max_tokens: data.max_tokens || null,
                vision: data.vision || false,
                status: ProviderStatus.ACTIVE,
                is_default: data.is_default || false,
                created_by: user?.id || null,
                updated_by: user?.id || null,
            });
        }

        if (user) {
            await auditService.log({
                userId: user.id,
                userEmail: user.email,
                action: AuditAction.UPDATE_CONFIG,
                resourceType: AuditResourceType.MODEL_PROVIDER,
                resourceId: provider.id,
                details: { factory_name: provider.factory_name, model_name: provider.model_name },
                ipAddress: user.ip,
            });
        }

        // Auto-create/update paired image2text row for vision-capable chat models
        await this.syncVisionCompanion(provider, data, user);

        return provider;
    }

    /**
     * @description Update an existing model provider
     * @param {string} id - Provider UUID
     * @param {any} data - Fields to update
     * @param {UserContext} user - Optional user context for audit trail
     * @returns {Promise<ModelProvider | undefined>} The updated provider or undefined if not found
     */
    async update(id: string, data: any, user?: UserContext): Promise<ModelProvider | undefined> {
        // Build update payload with only provided fields
        const updateData: any = {};
        if (data.factory_name !== undefined) updateData.factory_name = data.factory_name;
        if (data.model_type !== undefined) updateData.model_type = data.model_type;
        if (data.model_name !== undefined) updateData.model_name = data.model_name;
        // Encrypt the API key; skip masked placeholder '***' (means "keep existing")
        if (data.api_key !== undefined && data.api_key !== ComparisonLiteral.MASKED_SECRET) {
            updateData.api_key = data.api_key
                ? cryptoService.encrypt(data.api_key)
                : data.api_key;
        }
        if (data.api_base !== undefined) updateData.api_base = data.api_base;
        if (data.max_tokens !== undefined) updateData.max_tokens = data.max_tokens;
        if (data.is_default !== undefined) updateData.is_default = data.is_default;
        if (data.vision !== undefined) updateData.vision = data.vision;
        if (user) updateData.updated_by = user.id;

        // When marking a provider as default, clear existing defaults for the same model_type
        if (data.is_default === true) {
            const existing = await ModelFactory.modelProvider.findById(id);
            if (existing) {
                await ModelFactory.modelProvider.clearDefaultsByModelType(existing.model_type, id);
            }
        }

        const provider = await ModelFactory.modelProvider.update(id, updateData);
        if (!provider) return undefined;

        // Auto-sync paired image2text companion when vision flag changes
        await this.syncVisionCompanion(provider, data, user);

        if (user) {
            await auditService.log({
                userId: user.id,
                userEmail: user.email,
                action: AuditAction.UPDATE_CONFIG,
                resourceType: AuditResourceType.MODEL_PROVIDER,
                resourceId: id,
                details: { changes: data },
                ipAddress: user.ip,
            });
        }

        return provider;
    }

    /**
     * @description Soft-delete a model provider by setting its status to 'deleted'
     * @param {string} id - Provider UUID
     * @param {UserContext} user - Optional user context for audit trail
     * @returns {Promise<void>}
     */
    async delete(id: string, user?: UserContext): Promise<void> {
        // Look up the provider before deleting to sync companion
        const provider = await ModelFactory.modelProvider.findById(id);

        // Soft-delete the model_providers row
        await ModelFactory.modelProvider.update(id, { status: ProviderStatus.DELETED });

        // Also soft-delete any paired image2text companion
        if (provider && provider.model_type === ModelType.CHAT) {
            const [companion] = await ModelFactory.modelProvider.findAll({
                factory_name: provider.factory_name,
                model_name: provider.model_name,
                model_type: ModelType.IMAGE2TEXT,
                status: ProviderStatus.ACTIVE,
            });
            if (companion) {
                await ModelFactory.modelProvider.update(companion.id, { status: ProviderStatus.DELETED });
            }
        }

        if (user) {
            await auditService.log({
                userId: user.id,
                userEmail: user.email,
                action: AuditAction.UPDATE_CONFIG,
                resourceType: AuditResourceType.MODEL_PROVIDER,
                resourceId: id,
                ipAddress: user.ip,
            });
        }
    }

    /**
     * @description Test LLM provider connectivity using model-type-specific probe requests, trying multiple URL patterns
     * @param {string} id - Provider UUID
     * @returns {Promise<TestConnectionResult>} Test result with success flag, latency, and optional error
     */
    async testConnection(id: string): Promise<TestConnectionResult> {
        const provider = await ModelFactory.modelProvider.findById(id);
        if (!provider || provider.status !== ProviderStatus.ACTIVE) {
            return { success: false, error: 'Provider not found or inactive' };
        }

        const apiBase = (provider.api_base || '').replace(/\/+$/, '');
        if (!apiBase) {
            return { success: false, error: 'No API base URL configured' };
        }

        // Debug: log connection test details
        log.info('LLM provider connection test starting', {
            providerId: id,
            modelType: provider.model_type,
            modelName: provider.model_name,
            apiBase,
            vision: provider.vision,
            hasApiKey: !!provider.api_key,
            factoryName: provider.factory_name,
        });

        // Build auth headers
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (provider.api_key) {
            headers['Authorization'] = `Bearer ${provider.api_key}`;
        }

        // Build candidate base paths to try (handles /v1 presence/absence)
        const basePaths: string[] = [apiBase];
        if (apiBase.endsWith('/v1')) {
            // api_base already has /v1, also try without
            basePaths.push(apiBase.replace(/\/v1$/, ''));
        } else {
            // api_base has no /v1, also try with
            basePaths.push(`${apiBase}/v1`);
        }

        // Determine endpoint path and request body based on model type
        const probeConfig = this.buildProbeConfig(provider);

        const start = Date.now();

        // Try each base path with the model-type-specific endpoint
        for (const base of basePaths) {
            const url = `${base}/${probeConfig.endpoint}`;

            try {
                log.info('Trying connection test', { url, method: probeConfig.method });

                const fetchOpts: RequestInit = {
                    method: probeConfig.method,
                    headers,
                    signal: AbortSignal.timeout(30_000),
                };

                // Add body for POST requests
                if (probeConfig.method === ComparisonLiteral.HTTP_METHOD_POST && probeConfig.body) {
                    fetchOpts.body = JSON.stringify(probeConfig.body);
                }

                const response = await fetch(url, fetchOpts);

                if (!response.ok) {
                    const errorText = await response.text().catch(() => '');
                    log.info('Connection test URL returned non-OK', {
                        url,
                        status: response.status,
                        body: errorText.slice(0, 200),
                    });
                    continue;
                }

                // Consume the response body (may be streamed for chat)
                await response.text();
                const latencyMs = Date.now() - start;

                log.info('LLM provider connection test succeeded', {
                    providerId: id,
                    modelType: provider.model_type,
                    modelName: provider.model_name,
                    matchedUrl: url,
                    latencyMs,
                });

                return { success: true, latencyMs };
            } catch (err: any) {
                log.info('Connection test URL failed', {
                    url,
                    error: err?.message || String(err),
                });
                continue;
            }
        }

        // All URLs failed
        const latencyMs = Date.now() - start;
        log.warn('LLM provider connection test failed — all URLs exhausted', {
            providerId: id,
            modelType: provider.model_type,
            modelName: provider.model_name,
            apiBase,
            latencyMs,
        });

        return { success: false, error: `Could not reach API at ${apiBase}` };
    }

    /**
     * @description Build the probe configuration (endpoint, method, body) based on model type for connection testing
     * @param {ModelProvider} provider - The model provider record
     * @returns {{ endpoint: string; method: 'GET' | 'POST'; body?: Record<string, unknown> }} Probe config
     */
    private buildProbeConfig(provider: ModelProvider): {
        endpoint: string;
        method: 'GET' | 'POST';
        body?: Record<string, unknown>;
    } {
        if (provider.factory_name === ComparisonLiteral.OLLAMA_FACTORY) {
            if (provider.model_type === ModelType.EMBEDDING) {
                return {
                    endpoint: 'api/embed',
                    method: 'POST',
                    body: {
                        model: provider.model_name,
                        input: 'healthcheck',
                    },
                };
            }
            return {
                endpoint: 'api/generate',
                method: 'POST',
                body: {
                    model: provider.model_name,
                    prompt: 'healthcheck',
                    stream: false,
                },
            };
        }

        switch (provider.model_type) {
            case ModelType.CHAT: {
                // Chat/VLM probe: send a real prompt to chat/completions
                return {
                    endpoint: 'chat/completions',
                    method: 'POST',
                    body: {
                        model: provider.model_name,
                        messages: [{ role: 'user', content: 'hello' }],
                        max_tokens: 5,
                        stream: false,
                    },
                };
            }
            case ModelType.EMBEDDING: {
                // Embedding probe: embed a short test string
                return {
                    endpoint: 'embeddings',
                    method: 'POST',
                    body: {
                        model: provider.model_name,
                        input: 'test',
                    },
                };
            }
            case ModelType.IMAGE2TEXT: {
                // Image2text probe: same as chat (vision-capable chat model)
                return {
                    endpoint: 'chat/completions',
                    method: 'POST',
                    body: {
                        model: provider.model_name,
                        messages: [{ role: 'user', content: 'hello' }],
                        max_tokens: 5,
                        stream: false,
                    },
                };
            }
            default: {
                // For rerank, speech2text, tts — list models as a connectivity check
                return {
                    endpoint: 'models',
                    method: 'GET',
                };
            }
        }
    }

    /**
     * @description List active providers with safe fields only (no API keys).
     * Optionally filtered by model_type. Used by config dialogs (no admin permission).
     * @param {string} [modelType] - Filter by model_type: 'chat', 'embedding', 'rerank', 'tts', 'speech2text'
     * @returns {Promise<Array<Pick<ModelProvider, 'id' | 'factory_name' | 'model_type' | 'model_name' | 'max_tokens' | 'is_default' | 'vision'>>>} Safe provider records
     */
    async listPublic(modelType?: string) {
        const providers = await ModelFactory.modelProvider.findPublicList(modelType)

        // Enrich system providers with live model readiness status from Valkey
        const hasSystem = providers.some((p) => p.is_system)
        if (hasSystem) {
            const status = await this.getEmbeddingWorkerStatus()
            return providers.map((p) =>
                p.is_system ? { ...p, model_status: status } : p
            )
        }

        return providers
    }

    /**
     * @description Read embedding worker health status from Valkey.
     * The Python embedding worker publishes a TTL-based heartbeat key.
     * If the key exists, the worker is alive. If absent, it's offline.
     * @returns {Promise<'ready' | 'loading' | 'offline'>} Worker readiness status
     */
    /** Dedicated Redis client for health checks — avoids dependency on session Redis init */
    private healthRedisClient: import('redis').RedisClientType | null = null
    private healthRedisInitializing = false

    /**
     * @description Get or create a dedicated Redis client for health status reads.
     * Separate from the session Redis client to avoid the SESSION_STORE gate.
     * @returns {Promise<import('redis').RedisClientType | null>} Connected client or null
     */
    private async getHealthRedisClient() {
        if (this.healthRedisClient) return this.healthRedisClient
        if (this.healthRedisInitializing) return null

        this.healthRedisInitializing = true
        try {
            const { createClient } = await import('redis')
            const redisUrl = config.redis.url
            const client = createClient({ url: redisUrl })
            client.on('error', (err: Error) => {
                log.debug('Health Redis client error: {}', err.message)
            })
            await client.connect()
            this.healthRedisClient = client as import('redis').RedisClientType
            return this.healthRedisClient
        } catch (err) {
            log.debug('Failed to connect health Redis client: {}', err instanceof Error ? err.message : String(err))
            this.healthRedisInitializing = false
            return null
        }
    }

    /**
     * @description Read embedding worker health status from Valkey.
     * Uses a dedicated Redis client (not the session client) to avoid
     * SESSION_STORE gate issues in development mode.
     * @returns {Promise<EmbeddingWorkerStatusType>} Worker readiness status
     */
    private async getEmbeddingWorkerStatus(): Promise<EmbeddingWorkerStatusType> {
        try {
            const redis = await this.getHealthRedisClient()
            if (!redis) {
                return EmbeddingWorkerStatus.OFFLINE
            }

            const raw = await redis.get(EMBED_WORKER_STATUS_KEY)
            if (!raw) {
                return EmbeddingWorkerStatus.OFFLINE
            }

            const data = JSON.parse(raw) as { status: string }
            if (data.status === EmbeddingWorkerStatus.READY) return EmbeddingWorkerStatus.READY
            if (data.status === EmbeddingWorkerStatus.LOADING) return EmbeddingWorkerStatus.LOADING
            return EmbeddingWorkerStatus.OFFLINE
        } catch (err) {
            log.error('getEmbeddingWorkerStatus: error reading Valkey', { error: err instanceof Error ? err.message : String(err) })
            return EmbeddingWorkerStatus.OFFLINE
        }
    }

    // =========================================================================
    // System embedding provider auto-seed
    // =========================================================================

    /**
     * @description Auto-seed or remove system-managed embedding provider based on
     * LOCAL_EMBEDDING_ENABLE env var. Called on every backend startup (idempotent).
     * Per D-07: upserts when enabled, removes when disabled.
     * Per D-11: auto-discovery wires SentenceTransformersEmbed into task_executor --
     * document embedding reuses existing embed_limiter + EMBEDDING_BATCH_SIZE.
     * @returns {Promise<void>}
     */
    async seedSystemEmbeddingProvider(): Promise<void> {
        if (config.localEmbedding.enabled) {
            // Fail fast if model name not specified (per D-04)
            if (!config.localEmbedding.model) {
                log.error('LOCAL_EMBEDDING_ENABLE=true but LOCAL_EMBEDDING_MODEL is not set. Skipping system provider seed.')
                return
            }

            // Upsert the SentenceTransformers provider for the system tenant
            const providerId = await ModelFactory.modelProvider.upsertSystemProvider({
                factory_name: SENTENCE_TRANSFORMERS_FACTORY,
                model_type: 'embedding',
                model_name: config.localEmbedding.model,
                tenant_id: config.opensearch.systemTenantId,
            })
            log.info(`System embedding provider seeded: SentenceTransformers/${config.localEmbedding.model} (id=${providerId})`)
        } else {
            // Remove any stale system-managed providers when feature is disabled
            const removed = await ModelFactory.modelProvider.removeSystemProviders()
            if (removed > 0) {
                log.info(`Removed ${removed} system-managed provider(s) (LOCAL_EMBEDDING_ENABLE=false)`)
            }
        }
    }

    // =========================================================================
    // Vision companion sync
    // =========================================================================

    /**
     * @description Auto-create, update, or soft-delete a paired `image2text` row
     * for vision-capable chat models. The companion shares the same credentials
     * (api_key, api_base, factory_name, model_name) so advance-rag can query
     * `model_providers` directly for IMAGE2TEXT defaults.
     * @param {ModelProvider} provider - The chat provider that was just created/updated
     * @param {any} data - The original request data (to check vision flag)
     * @param {UserContext} user - Optional user context for audit trail
     */
    private async syncVisionCompanion(provider: ModelProvider, data: any, user?: UserContext): Promise<void> {
        // Only applies to chat models
        if (provider.model_type !== ModelType.CHAT) return;

        const isVision = data.vision ?? provider.vision ?? false;

        if (isVision) {
            // Upsert the image2text companion with shared credentials
            const [existing] = await ModelFactory.modelProvider.findAll({
                factory_name: provider.factory_name,
                model_name: provider.model_name,
                model_type: ModelType.IMAGE2TEXT,
            });

            if (existing && existing.status === ProviderStatus.ACTIVE) {
                // Update existing active companion
                await ModelFactory.modelProvider.update(existing.id, {
                    api_key: provider.api_key ?? null,
                    api_base: provider.api_base ?? null,
                    max_tokens: provider.max_tokens ?? null,
                    is_default: provider.is_default,
                    vision: true,
                    updated_by: user?.id || null,
                });
            } else if (existing) {
                // Reactivate soft-deleted companion
                await ModelFactory.modelProvider.update(existing.id, {
                    api_key: provider.api_key ?? null,
                    api_base: provider.api_base ?? null,
                    max_tokens: provider.max_tokens ?? null,
                    status: ProviderStatus.ACTIVE,
                    is_default: provider.is_default,
                    vision: true,
                    updated_by: user?.id || null,
                });
            } else {
                // Create new companion
                await ModelFactory.modelProvider.create({
                    factory_name: provider.factory_name,
                    model_type: ModelType.IMAGE2TEXT,
                    model_name: provider.model_name,
                    api_key: provider.api_key ?? null,
                    api_base: provider.api_base ?? null,
                    max_tokens: provider.max_tokens ?? null,
                    vision: true,
                    status: ProviderStatus.ACTIVE,
                    is_default: provider.is_default,
                    created_by: user?.id || null,
                    updated_by: user?.id || null,
                });
            }
        } else {
            // Vision disabled — soft-delete any existing image2text companion
            const [existing] = await ModelFactory.modelProvider.findAll({
                factory_name: provider.factory_name,
                model_name: provider.model_name,
                model_type: ModelType.IMAGE2TEXT,
                status: ProviderStatus.ACTIVE,
            });
            if (existing) {
                await ModelFactory.modelProvider.update(existing.id, { status: ProviderStatus.DELETED });
            }
        }
    }
}

/** Singleton instance of the LLM provider service */
export const llmProviderService = new LlmProviderService();
