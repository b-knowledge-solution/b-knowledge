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
     * @description Aggregate service health (DB, Redis, Langfuse) plus host OS and disk metrics
     * @returns {Promise<any>} Health status object with services and system info
     */
    async getSystemHealth(): Promise<any> {
        // Dynamic import of os module for system metrics
        const os = await import('os');

        // Check Database - Knex
        const { db } = await import('@/shared/db/knex.js');
        let dbStatus = false;
        try {
            await db.raw('SELECT 1');
            dbStatus = true;
        } catch (e) {
            dbStatus = false;
        }



        // Check Langfuse availability based on required config keys
        const langfuseEnabled = !!(config.langfuse.publicKey && config.langfuse.secretKey && config.langfuse.baseUrl);
        const langfuseStatus = langfuseEnabled ? 'enabled' : 'disabled';

        // Check Redis connectivity with a short timeout to avoid blocking
        let redisStatus = 'disconnected';
        try {
            const { createClient } = await import('redis');
            const client = createClient({
                url: config.redis.url,
                socket: {
                    connectTimeout: 2000
                }
            });
            client.on('error', () => { }); // Prevent crash on error
            await client.connect();
            await client.ping();
            redisStatus = 'connected';
            await client.disconnect();
        } catch (e) {
            redisStatus = 'disconnected';
        }

        // Build and return aggregated health response with service statuses and system metrics
        return {
            timestamp: new Date().toISOString(),
            services: {
                database: {
                    status: dbStatus ? 'connected' : 'disconnected',
                    enabled: true,
                    host: config.database.host,
                },
                redis: {
                    status: redisStatus,
                    enabled: true,
                    host: config.redis.host,
                },
                langfuse: {
                    status: langfuseStatus,
                    enabled: langfuseEnabled,
                    host: config.langfuse.baseUrl ? new URL(config.langfuse.baseUrl).hostname : 'unknown',
                },
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
}

/** Singleton instance of the system tools service */
export const systemToolsService = new SystemToolsService();
