import { ModelFactory } from '@/shared/models/factory.js';
import { log } from '@/shared/services/logger.service.js';
import { cryptoService } from '@/shared/services/crypto.service.js';
import { auditService, AuditAction, AuditResourceType } from '@/modules/audit/services/audit.service.js';
import { ModelProvider } from '@/shared/models/types.js';

interface UserContext {
    id: string;
    email: string;
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

export class LlmProviderService {
    async list(): Promise<ModelProvider[]> {
        return ModelFactory.modelProvider.findAll(
            { status: 'active' },
            { orderBy: { factory_name: 'asc' } }
        );
    }

    async getById(id: string): Promise<ModelProvider | undefined> {
        return ModelFactory.modelProvider.findById(id);
    }

    async getDefaults(): Promise<ModelProvider[]> {
        return ModelFactory.modelProvider.findDefaults();
    }

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
            status: 'deleted',
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
                status: 'active',
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
                status: 'active',
                is_default: data.is_default || false,
                created_by: user?.id || null,
                updated_by: user?.id || null,
            });
        }

        // Sync to shared tenant_llm table (used by task executors)
        try {
            await ModelFactory.tenantLlm.syncFromProvider(provider);
        } catch (err) {
            log.warn('Failed to sync model provider to tenant_llm', { error: String(err) });
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

        return provider;
    }

    async update(id: string, data: any, user?: UserContext): Promise<ModelProvider | undefined> {
        const updateData: any = {};
        if (data.factory_name !== undefined) updateData.factory_name = data.factory_name;
        if (data.model_type !== undefined) updateData.model_type = data.model_type;
        if (data.model_name !== undefined) updateData.model_name = data.model_name;
        // Encrypt the API key; skip masked placeholder '***' (means "keep existing")
        if (data.api_key !== undefined && data.api_key !== '***') {
            updateData.api_key = data.api_key
                ? cryptoService.encrypt(data.api_key)
                : data.api_key;
        }
        if (data.api_base !== undefined) updateData.api_base = data.api_base;
        if (data.max_tokens !== undefined) updateData.max_tokens = data.max_tokens;
        if (data.is_default !== undefined) updateData.is_default = data.is_default;
        if (data.vision !== undefined) updateData.vision = data.vision;
        if (user) updateData.updated_by = user.id;

        const provider = await ModelFactory.modelProvider.update(id, updateData);
        if (!provider) return undefined;

        try {
            await ModelFactory.tenantLlm.syncFromProvider(provider);
        } catch (err) {
            log.warn('Failed to sync model provider update to tenant_llm', { error: String(err) });
        }

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

    async delete(id: string, user?: UserContext): Promise<void> {
        // Fetch the provider before soft-deleting so we have the composite key
        const provider = await ModelFactory.modelProvider.findById(id);

        // Soft-delete the model_providers row
        await ModelFactory.modelProvider.update(id, { status: 'deleted' });

        // Remove the corresponding tenant_llm row so Python workers stop using it
        if (provider) {
            try {
                await ModelFactory.tenantLlm.deleteByProvider(provider);
            } catch (err) {
                log.warn('Failed to remove tenant_llm row on provider delete', { error: String(err) });
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
     * Test the connection to an LLM provider using raw HTTP fetch.
     * Routes by model_type for accurate health checks:
     *   - chat/VLM → POST chat/completions with a "hello" prompt
     *   - embedding → POST embeddings with a test input
     *   - others   → GET models list
     * Tries multiple URL patterns to support OpenAI, LiteLLM, and Ollama.
     * @param id - Provider UUID
     * @returns Test result with success flag, latency, and optional error
     */
    async testConnection(id: string): Promise<TestConnectionResult> {
        const provider = await ModelFactory.modelProvider.findById(id);
        if (!provider || provider.status !== 'active') {
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
                if (probeConfig.method === 'POST' && probeConfig.body) {
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
     * Build the probe configuration (endpoint + method + body) for a model type.
     * @param provider - The model provider record
     * @returns Probe config with endpoint path, HTTP method, and optional body
     */
    private buildProbeConfig(provider: ModelProvider): {
        endpoint: string;
        method: 'GET' | 'POST';
        body?: Record<string, unknown>;
    } {
        switch (provider.model_type) {
            case 'chat': {
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
            case 'embedding': {
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
            default: {
                // For rerank, speech2text, tts — list models as a connectivity check
                return {
                    endpoint: 'models',
                    method: 'GET',
                };
            }
        }
    }
}

export const llmProviderService = new LlmProviderService();
