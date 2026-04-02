/**
 * @fileoverview System tools service for fetching monitoring tool configuration.
 * 
 * Provides API functions for system monitoring tools:
 * - Fetch enabled tools from backend
 * - Reload configuration (admin only)
 * 
 * @module features/system/api/systemToolsApi
 */

/** Backend API base URL */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// ============================================================================
// Types
// ============================================================================

/**
 * System monitoring tool configuration.
 */
export interface SystemTool {
    /** Unique tool identifier */
    id: string;
    /** Display name */
    name: string;
    /** Tool description */
    description: string;
    /** Icon path (relative to /static/icons/) */
    icon: string;
    /** External URL to open */
    url: string;
    /** Display order (lower = first) */
    order: number;
    /** Whether tool is enabled */
    enabled: boolean;
}

/**
 * Response from system tools API.
 */
export interface SystemToolsResponse {
    /** Array of tool configurations */
    tools: SystemTool[];
    /** Total count of tools */
    count: number;
}

/**
 * @description Worker heartbeat entry from Redis sorted-set
 */
export interface WorkerHeartbeat {
    /** Worker name / identifier */
    name: string;
    /** 'online' if heartbeat within timeout, 'offline' otherwise */
    status: 'online' | 'offline' | 'unknown';
    /** ISO timestamp of last heartbeat */
    lastSeen: string;
    /** Parsed heartbeat payload (varies by worker type) */
    details: {
        name?: string;
        now?: string;
        boot_at?: string;
        pid?: number;
        ip_address?: string;
        /** Task executor specific */
        pending?: number;
        lag?: number;
        done?: number;
        failed?: number;
        current?: Record<string, unknown>[];
        /** Converter specific */
        status?: string;
        current_job?: string | null;
    } | null;
}

/**
 * @description OpenSearch service status with cluster details
 */
export interface OpenSearchServiceStatus {
    status: 'connected' | 'disconnected' | 'not_configured';
    enabled: boolean;
    host: string;
    /** Cluster health color: green, yellow, red */
    clusterStatus?: string;
    /** Number of nodes in cluster */
    nodeCount?: number;
}

/**
 * @description System health response from GET /api/system-tools/health
 */
export interface SystemHealth {
    timestamp: string;
    services: {
        database: { status: 'connected' | 'disconnected'; enabled: boolean; host: string };
        redis: { status: 'connected' | 'connecting' | 'disconnected' | 'not_initialized' | 'not_configured'; enabled: boolean; host: string };
        s3: {
            status: 'connected' | 'disconnected';
            enabled: boolean;
            host: string;
            /** Detected S3 provider name (MinIO, RustFS, or generic S3) */
            provider?: string;
            /** Configured bucket name */
            bucket?: string;
            /** Number of buckets found */
            bucketCount?: number;
            /** Total storage size in bytes across all buckets */
            totalSize?: number;
            /** Total number of objects across all buckets */
            objectCount?: number;
        };
        opensearch: OpenSearchServiceStatus;
        langfuse: { status: 'enabled' | 'disabled' | 'connected' | 'disconnected'; enabled: boolean; host: string };
    };
    workers: {
        taskExecutors: WorkerHeartbeat[];
        converters: WorkerHeartbeat[];
    };
    system: {
        uptime: number;
        memory: {
            rss: number;
            heapTotal: number;
            heapUsed: number;
            external: number;
        };
        loadAvg: number[];
        cpus: number;
        platform: string;
        arch: string;
        hostname: string;
        nodeVersion?: string;
        cpuModel?: string;
        totalMemory?: number;
        osRelease?: string;
        osType?: string;
        disk?: {
            total: number;
            free: number;
            available: number;
        };
    };
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch all enabled system monitoring tools.
 * @returns Array of enabled system tools
 * @throws Error if fetch fails
 */
export const getSystemTools = async (): Promise<SystemTool[]> => {
    const response = await fetch(`${API_BASE_URL}/api/system-tools`, {
        credentials: 'include',
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch system tools: ${response.statusText}`);
    }

    const data: SystemToolsResponse = await response.json();
    return data.tools;
};

/**
 * Reload system tools configuration from disk.
 * Requires admin role.
 * @throws Error if reload fails
 */
export const reloadSystemTools = async (): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/system-tools/reload`, {
        method: 'POST',
        credentials: 'include',
    });

    if (!response.ok) {
        throw new Error(`Failed to reload system tools: ${response.statusText}`);
    }
};

/**
 * Get system health metrics.
 * @returns System health data
 */
export const getSystemHealth = async (): Promise<SystemHealth> => {
    const response = await fetch(`${API_BASE_URL}/api/system-tools/health`, {
        credentials: 'include',
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch system health: ${response.statusText}`);
    }

    return await response.json();
};
