/**
 * @fileoverview Loads system tool metadata from JSON config and exposes health checks.
 * @module modules/system-tools/system-tools.service
 */
import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from '@/shared/services/logger.service.js';
import { config } from '@/shared/config/index.js';
import { HealthStatus } from '@/shared/constants/index.js';
import { ModelFactory } from '@/shared/models/factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @description Configuration shape for a single system tool entry
 */
export interface SystemTool {
    /** Unique tool identifier */
    id: string;
    /** Display name */
    name: string;
    /** Human-readable description */
    description: string;
    /** Icon identifier for UI rendering */
    icon: string;
    /** URL to the tool's interface */
    url: string;
    /** Sort order for display */
    order: number;
    /** Whether the tool is currently enabled */
    enabled: boolean;
}

/**
 * @description Shape of the system tools config JSON file
 */
interface SystemToolsConfig {
    /** Array of tool definitions */
    tools: SystemTool[];
}

/**
 * @description Service for loading system tool configurations and aggregating system health metrics
 */
class SystemToolsService {
    private tools: SystemTool[] = [];
    private configPath: string = '';

    constructor() {
    }

    /**
     * @description Initialize the service by resolving the config file path and loading tools into memory
     * @returns {Promise<void>}
     */
    async initialize(): Promise<void> {
        this.configPath = await this.resolveConfigPath();
        await this.loadConfig();
    }

    /**
     * @description Resolve config file path from env variable, docker mount, or fallback to local source
     * @returns {Promise<string>} The resolved config file path
     */
    private async resolveConfigPath(): Promise<string> {
        // 1. Check environment variable
        const envPath = config.systemToolsConfigPath;
        if (envPath) {
            try {
                await fs.access(envPath, constants.F_OK);
                return envPath;
            } catch { }
        }

        // 2. Check docker volume mount
        const dockerPath = '/app/config/system-tools.config.json';
        try {
            await fs.access(dockerPath, constants.F_OK);
            return dockerPath;
        } catch { }

        // 3. Fallback to local source file
        const fallbackPath = path.join(__dirname, '../config/system-tools.config.json');
        return fallbackPath;
    }

    /**
     * @description Read and parse the system-tools config JSON file, populating the tools array
     * @returns {Promise<void>}
     */
    private async loadConfig(): Promise<void> {
        try {
            try {
                // Verify file exists
                await fs.access(this.configPath, constants.F_OK);
            } catch {
                log.warn('System tools config file not found', { path: this.configPath });
                this.tools = [];
                return;
            }

            // Read file content
            const configData = await fs.readFile(this.configPath, 'utf-8');
            const config: SystemToolsConfig = JSON.parse(configData);

            // Validate structure
            if (!config.tools || !Array.isArray(config.tools)) {
                log.error('Invalid system tools config format');
                this.tools = [];
                return;
            }

            this.tools = config.tools;
            log.debug('System tools configuration loaded', { count: this.tools.length });
        } catch (error) {
            log.error('Failed to load system tools config', {
                error: error instanceof Error ? error.message : String(error),
            });
            this.tools = [];
        }
    }

    /**
     * @description Get list of enabled tools (alias for getEnabledTools)
     * @returns {SystemTool[]} List of enabled tools
     */
    getTools(): SystemTool[] {
        return this.getEnabledTools();
    }

    /**
     * @description Return enabled tools filtered and sorted by order for UI consumption
     * @returns {SystemTool[]} Sorted and filtered tools
     */
    getEnabledTools(): SystemTool[] {
        return this.tools
            .filter(tool => tool.enabled)
            .sort((a, b) => a.order - b.order);
    }

    /**
     * @description Return all configured tools regardless of enabled flag, sorted by order
     * @returns {SystemTool[]} All configured tools
     */
    getAllTools(): SystemTool[] {
        return [...this.tools].sort((a, b) => a.order - b.order);
    }

    /**
     * @description Force reload of the config file from disk
     * @returns {Promise<void>}
     */
    async reload(): Promise<void> {
        log.debug('Reloading system tools configuration');
        await this.loadConfig();
    }

    /**
     * @description Execute a system tool by ID (placeholder for future tool execution logic)
     * @param {string} id - Tool ID
     * @param {any} params - Execution parameters
     * @returns {Promise<any>} Execution result
     * @throws {Error} If tool not found
     */
    async runTool(id: string, params: any): Promise<any> {
        const tool = this.tools.find(t => t.id === id);
        // Guard: tool must exist in configuration
        if (!tool) throw new Error('Tool not found');
        return { message: `Tool ${tool.name} executed`, params };
    }

    /**
     * @description Aggregate service health (DB, Redis, S3, OpenSearch, Langfuse, Workers) plus host OS and disk metrics
     * @returns {Promise<any>} Health status object with services, workers, and system info
     */
    async getSystemHealth(): Promise<any> {
        // Dynamic import of os module for system metrics
        const os = await import('os');

        // Run all health checks concurrently for faster response
        const [dbStatus, redisResult, s3Status, opensearchResult, langfuseResult] = await Promise.allSettled([
            this.checkDatabase(),
            this.checkRedis(),
            this.checkS3(),
            this.checkOpenSearch(),
            this.checkLangfuse(),
        ]);

        // Extract worker heartbeats from Redis (only if Redis is connected)
        const redisData = redisResult.status === 'fulfilled' ? redisResult.value : { status: HealthStatus.DISCONNECTED, client: null };
        const [workerHeartbeats, converterHeartbeats] = await Promise.all([
            redisData.client ? this.getWorkerHeartbeats(redisData.client, 'TASKEXE') : [],
            redisData.client ? this.getWorkerHeartbeats(redisData.client, 'CONVERTER_WORKERS') : [],
        ]);

        // Disconnect the temporary Redis client
        if (redisData.client) {
            try { await redisData.client.disconnect(); } catch { /* noop */ }
        }

        // Build and return aggregated health response with service statuses, workers, and system metrics
        return {
            timestamp: new Date().toISOString(),
            services: {
                database: {
                    status: dbStatus.status === 'fulfilled' && dbStatus.value ? HealthStatus.CONNECTED : HealthStatus.DISCONNECTED,
                    enabled: true,
                    host: config.database.host,
                },
                redis: {
                    status: redisData.status,
                    enabled: true,
                    host: config.redis.host,
                },
                s3: {
                    status: s3Status.status === 'fulfilled' ? s3Status.value.status : 'disconnected',
                    enabled: true,
                    host: config.s3.endpoint,
                    bucket: config.s3.bucket,
                    provider: s3Status.status === 'fulfilled' ? s3Status.value.provider : 'S3',
                    bucketCount: s3Status.status === 'fulfilled' ? s3Status.value.bucketCount : 0,
                    totalSize: s3Status.status === 'fulfilled' ? s3Status.value.totalSize : 0,
                    objectCount: s3Status.status === 'fulfilled' ? s3Status.value.objectCount : 0,
                },
                opensearch: opensearchResult.status === 'fulfilled' ? opensearchResult.value : {
                    status: 'disconnected',
                    enabled: true,
                    host: config.opensearch.host,
                },
                langfuse: langfuseResult.status === 'fulfilled' ? langfuseResult.value : {
                    status: 'disabled',
                    enabled: false,
                    host: 'unknown',
                },
            },
            workers: {
                taskExecutors: workerHeartbeats,
                converters: converterHeartbeats,
            },
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                loadAvg: os.loadavg(),
                cpus: os.cpus().length,
                platform: os.platform(),
                arch: os.arch(),
                hostname: os.hostname(),
                nodeVersion: process.version,
                cpuModel: os.cpus()[0]?.model || 'Unknown',
                totalMemory: os.totalmem(),
                osRelease: os.release(),
                osType: os.type(),
                disk: await (async () => {
                    try {
                        const stats = await fs.statfs(process.cwd());
                        return {
                            total: stats.bsize * stats.blocks,
                            free: stats.bsize * stats.bfree,
                            available: stats.bsize * stats.bavail
                        };
                    } catch (e) {
                        return undefined;
                    }
                })()
            }
        };
    }

    // ========================================================================
    // Individual Health Check Methods
    // ========================================================================

    /**
     * @description Check PostgreSQL connectivity by executing a simple query
     * @returns {Promise<boolean>} True if database is reachable
     */
    private async checkDatabase(): Promise<boolean> {
        // Delegate to SystemConfigModel's healthCheck to avoid direct db import
        return ModelFactory.systemConfig.healthCheck()
    }

    /**
     * @description Check Redis connectivity and return both status and client for reuse by heartbeat checks
     * @returns {Promise<{ status: string, client: any }>} Redis status and connected client (or null)
     */
    private async checkRedis(): Promise<{ status: string; client: any }> {
        try {
            const { createClient } = await import('redis');
            const client = createClient({
                url: config.redis.url,
                socket: { connectTimeout: 2000 }
            });
            client.on('error', () => { });
            await client.connect();
            await client.ping();
            // Return client for reuse by heartbeat checks (caller is responsible for disconnect)
            return { status: HealthStatus.CONNECTED, client };
        } catch {
            return { status: HealthStatus.DISCONNECTED, client: null };
        }
    }

    /**
     * @description Check S3-compatible storage (MinIO/RustFS) connectivity, detect provider, and gather bucket usage stats
     * @returns {Promise<{ status: string, provider: string, bucketCount: number, totalSize: number, objectCount: number }>}
     */
    private async checkS3(): Promise<{ status: string; provider: string; bucketCount: number; totalSize: number; objectCount: number }> {
        try {
            const { minioClient } = await import('@/shared/services/minio.service.js');
            // listBuckets verifies connectivity and returns all bucket metadata
            const buckets = await minioClient.listBuckets();
            const bucketCount = buckets.length;

            // Detect S3 provider by probing the Server header from the S3 endpoint
            let provider = 'S3';
            try {
                const protocol = config.s3.useSSL ? 'https' : 'http';
                const probeUrl = `${protocol}://${config.s3.endpoint}:${config.s3.port}/minio/health/live`;
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 2000);
                const probeRes = await fetch(probeUrl, { signal: controller.signal });
                clearTimeout(timeout);
                // MinIO health endpoint returns 200 on /minio/health/live
                if (probeRes.ok) {
                    provider = 'MinIO';
                } else {
                    // Check generic Server header
                    const serverHeader = probeRes.headers.get('server') || '';
                    if (serverHeader.toLowerCase().includes('minio')) provider = 'MinIO';
                    else if (serverHeader.toLowerCase().includes('rustfs')) provider = 'RustFS';
                }
            } catch {
                // If probe fails, try a simpler detection from generic response headers
                try {
                    const protocol = config.s3.useSSL ? 'https' : 'http';
                    const genericUrl = `${protocol}://${config.s3.endpoint}:${config.s3.port}`;
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 2000);
                    const res = await fetch(genericUrl, { method: 'HEAD', signal: controller.signal });
                    clearTimeout(timeout);
                    const serverHeader = res.headers.get('server') || '';
                    if (serverHeader.toLowerCase().includes('minio')) provider = 'MinIO';
                    else if (serverHeader.toLowerCase().includes('rustfs')) provider = 'RustFS';
                } catch { /* keep default 'S3' */ }
            }

            // Aggregate object count and total size across all buckets
            let totalSize = 0;
            let objectCount = 0;

            // Iterate each bucket and stream object listing to compute totals
            await Promise.all(
                buckets.map(
                    (bucket) =>
                        new Promise<void>((resolve) => {
                            const stream = minioClient.listObjectsV2(bucket.name, '', true);
                            stream.on('data', (obj) => {
                                if (obj.size) {
                                    totalSize += obj.size;
                                }
                                objectCount += 1;
                            });
                            // Resolve on end or error to avoid blocking other bucket scans
                            stream.on('end', resolve);
                            stream.on('error', () => resolve());
                        })
                )
            );

            return { status: HealthStatus.CONNECTED, provider, bucketCount, totalSize, objectCount };
        } catch {
            return { status: HealthStatus.DISCONNECTED, provider: 'S3', bucketCount: 0, totalSize: 0, objectCount: 0 };
        }
    }

    /**
     * @description Check OpenSearch/VectorDB cluster health via HTTP
     * @returns {Promise<{ status: string, enabled: boolean, host: string, clusterStatus?: string, nodeCount?: number }>}
     */
    private async checkOpenSearch(): Promise<{ status: string; enabled: boolean; host: string; clusterStatus?: string | undefined; nodeCount?: number | undefined }> {
        const host = config.opensearch.host;
        if (!host) {
            return { status: HealthStatus.NOT_CONFIGURED, enabled: false, host: 'unknown' };
        }

        try {
            // Use native fetch to call OpenSearch cluster health endpoint
            const url = `${host}/_cluster/health`;
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };

            // Add basic auth if password is configured
            if (config.opensearch.password) {
                const credentials = Buffer.from(`admin:${config.opensearch.password}`).toString('base64');
                headers['Authorization'] = `Basic ${credentials}`;
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);

            const response = await fetch(url, {
                headers,
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (response.ok) {
                const data = await response.json() as { status?: string; number_of_nodes?: number };
                return {
                    status: HealthStatus.CONNECTED,
                    enabled: true,
                    host: new URL(host).hostname,
                    clusterStatus: data.status,
                    nodeCount: data.number_of_nodes,
                };
            }

            return { status: HealthStatus.DISCONNECTED, enabled: true, host: new URL(host).hostname };
        } catch {
            return { status: HealthStatus.DISCONNECTED, enabled: true, host: host };
        }
    }

    /**
     * @description Check Langfuse availability based on required configuration keys
     * @returns {Promise<{ status: string, enabled: boolean, host: string }>}
     */
    private async checkLangfuse(): Promise<{ status: string; enabled: boolean; host: string }> {
        const langfuseEnabled = !!(config.langfuse.publicKey && config.langfuse.secretKey && config.langfuse.baseUrl);
        return {
            status: langfuseEnabled ? 'enabled' : 'disabled',
            enabled: langfuseEnabled,
            host: config.langfuse.baseUrl ? new URL(config.langfuse.baseUrl).hostname : 'unknown',
        };
    }

    /**
     * @description Read worker heartbeats from a Redis set + sorted-set pattern
     * @param {any} redisClient - Connected Redis client
     * @param {string} setKey - Redis set key containing worker names (e.g. 'TASKEXE', 'CONVERTER_WORKERS')
     * @returns {Promise<Array<{ name: string, status: string, lastSeen: string, details: any }>>}
     */
    private async getWorkerHeartbeats(redisClient: any, setKey: string): Promise<Array<{ name: string; status: string; lastSeen: string; details: any }>> {
        const results: Array<{ name: string; status: string; lastSeen: string; details: any }> = [];
        const HEARTBEAT_TIMEOUT_SEC = 120;

        try {
            // Read all registered worker names from the set
            const workers: string[] = await redisClient.sMembers(setKey);
            if (!workers || workers.length === 0) return results;

            const now = Date.now() / 1000;

            for (const workerName of workers) {
                try {
                    // Get the most recent heartbeat entry (highest score = most recent timestamp)
                    // Use ZRANGE with REV to get the last entry by score descending, limited to 1
                    const entries = await redisClient.zRangeWithScores(workerName, 0, 0, { REV: true });
                    if (!entries || entries.length === 0) {
                        results.push({ name: workerName, status: 'offline', lastSeen: 'never', details: null });
                        continue;
                    }

                    const lastEntry = entries[0];
                    const age = now - lastEntry.score;
                    const isAlive = age < HEARTBEAT_TIMEOUT_SEC;

                    // Parse the heartbeat JSON payload
                    let details = null;
                    try { details = JSON.parse(lastEntry.value); } catch { /* noop */ }

                    results.push({
                        name: workerName,
                        status: isAlive ? 'online' : 'offline',
                        lastSeen: details?.now || new Date(lastEntry.score * 1000).toISOString(),
                        details,
                    });
                } catch {
                    results.push({ name: workerName, status: 'unknown', lastSeen: 'error', details: null });
                }
            }
        } catch (e) {
            log.warn('Failed to read worker heartbeats', { setKey, error: String(e) });
        }

        return results;
    }
}

/** Singleton instance of the system tools service */
export const systemToolsService = new SystemToolsService();
