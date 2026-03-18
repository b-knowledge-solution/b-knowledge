/**
 * @fileoverview Centralized audit logging for user actions and resource changes.
 * Provides a best-effort, append-only audit trail that never throws on failures.
 * @module services/audit
 */
import { ModelFactory } from '@/shared/models/factory.js';
import { log } from '@/shared/services/logger.service.js';
import { AuditLog } from '@/shared/models/types.js';

/**
 * @description Enumeration of all auditable action types in the system
 */
export const AuditAction = {
    CREATE_USER: 'create_user',
    UPDATE_USER: 'update_user',
    DELETE_USER: 'delete_user',
    UPDATE_ROLE: 'update_role',
    CREATE_TEAM: 'create_team',
    UPDATE_TEAM: 'update_team',
    DELETE_TEAM: 'delete_team',
    CREATE_DOCUMENT_BUCKET: 'create_document_bucket',
    DISABLE_DOCUMENT_BUCKET: 'disable_document_bucket',
    DELETE_DOCUMENT_BUCKET: 'delete_document_bucket',
    CREATE_BUCKET: 'create_bucket',
    DELETE_BUCKET: 'delete_bucket',
    UPLOAD_DOCUMENT: 'upload_document',
    DELETE_DOCUMENT: 'delete_document',
    DOWNLOAD_DOCUMENT: 'download_document',
    CREATE_DOCUMENT_FOLDER: 'create_document_folder',
    DELETE_DOCUMENT_FOLDER: 'delete_document_folder',

    UPDATE_CONFIG: 'update_config',
    RELOAD_CONFIG: 'reload_config',
    CREATE_SOURCE: 'create_source',
    UPDATE_SOURCE: 'update_source',
    DELETE_SOURCE: 'delete_source',
    CREATE_BROADCAST: 'create_broadcast',
    UPDATE_BROADCAST: 'update_broadcast',
    DELETE_BROADCAST: 'delete_broadcast',
    DISMISS_BROADCAST: 'dismiss_broadcast',
    SET_PERMISSION: 'set_permission',
    BATCH_DELETE_DOCUMENTS: 'batch_delete_documents',
    RUN_MIGRATION: 'run_migration',
    SYSTEM_START: 'system_start',
    SYSTEM_STOP: 'system_stop',

    // Prompt actions
    CREATE_PROMPT: 'create_prompt',
    UPDATE_PROMPT: 'update_prompt',
    DELETE_PROMPT: 'delete_prompt',

    // Access control events (Phase 2)
    VIEW_DOCUMENT: 'view_document',
    SEARCH_QUERY: 'search_query',
    CHAT_ANSWER: 'chat_answer',
    CREATE_POLICY: 'create_policy',
    UPDATE_POLICY: 'update_policy',
    DELETE_POLICY: 'delete_policy',
    LOGIN: 'login',
    LOGOUT: 'logout',
    ACCESS_DENIED: 'access_denied',
} as const;

/** @description Union type of all valid audit action string values */
export type AuditActionType = typeof AuditAction[keyof typeof AuditAction];

/**
 * @description Enumeration of all auditable resource types in the system
 */
export const AuditResourceType = {
    USER: 'user',
    TEAM: 'team',
    SESSION: 'session',
    BUCKET: 'bucket',
    FILE: 'file',
    CONFIG: 'config',
    KNOWLEDGE_BASE_SOURCE: 'knowledge_base_source',
    BROADCAST_MESSAGE: 'broadcast_message',
    PERMISSION: 'permission',
    SYSTEM: 'system',
    ROLE: 'role',
    PROMPT: 'prompt',
    DATASET: 'dataset',
    DOCUMENT: 'document',
    MODEL_PROVIDER: 'model_provider',

    // Access control resource types (Phase 2)
    POLICY: 'policy',
    SEARCH: 'search',
    CHAT: 'chat',
    ORG: 'org',
} as const;

/** @description Union type of all valid audit resource type string values */
export type AuditResourceTypeValue = typeof AuditResourceType[keyof typeof AuditResourceType];

/**
 * @description Parameters required to create a new audit log entry
 */
export interface AuditLogParams {
    userId?: string | null | undefined;
    userEmail: string;
    action: AuditActionType | string;
    resourceType: AuditResourceTypeValue | string;
    resourceId?: string | null | undefined;
    details?: Record<string, any>;
    ipAddress?: string | null | undefined;
    tenantId?: string | null | undefined;
}

/**
 * @description Query parameters for filtering and paginating audit log results
 */
export interface AuditLogQueryParams {
    page?: number;
    limit?: number;
    userId?: string;
    action?: string;
    resourceType?: string;
    startDate?: Date;
    endDate?: Date;
    search?: string;
}

/**
 * @description Response shape for paginated audit log queries including data and pagination metadata
 */
export interface AuditLogResponse {
    data: AuditLog[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

/**
 * @description Centralized audit service providing best-effort, append-only logging for security events and resource changes
 */
class AuditService {
    /**
     * @description Persist a single audit entry using best-effort semantics (never throws on failure)
     * @param {AuditLogParams} params - The audit log parameters including user, action, and resource details
     * @returns {Promise<number | null>} The ID of the created log entry, or null if logging failed
     */
    async log(params: AuditLogParams): Promise<number | null> {
        try {
            // Destructure params with default values
            const {
                userId = null,
                userEmail,
                action,
                resourceType,
                resourceId = null,
                details = {},
                ipAddress = null,
                tenantId = null,
            } = params;

            // Create audit log entry using model factory (includes tenant_id for org-scoped filtering)
            const logEntry = await ModelFactory.auditLog.create({
                user_id: userId,
                user_email: userEmail,
                action,
                resource_type: resourceType,
                resource_id: resourceId,
                details: JSON.stringify(details),
                ip_address: ipAddress,
                tenant_id: tenantId || null,
            });

            // Log debug info for successful creation
            log.debug('Audit log created', {
                id: logEntry.id,
                action,
                resourceType,
                userId,
            });

            // Return the new log ID
            return logEntry.id;
        } catch (error) {
            // Log error but suppress exception to prevent disrupting main flow
            log.error('Failed to create audit log', {
                error: error instanceof Error ? error.message : String(error),
                action: params.action,
                resourceType: params.resourceType,
            });
            return null;
        }
    }

    /**
     * @description Retrieve paginated audit logs with lightweight filtering by user, action, and resource type
     * @param {Record<string, string>} filters - Filtering criteria (userId, action, resourceType)
     * @param {number} limit - Number of logs per page (default: 50)
     * @param {number} offset - Pagination offset (default: 0)
     * @returns {Promise<AuditLogResponse>} Paginated audit logs with parsed details and pagination metadata
     */
    async getLogs(filters: any = {}, limit: number = 50, offset: number = 0): Promise<AuditLogResponse> {
        // Build where clause based on filters
        const whereClause: any = {};
        if (filters.userId) whereClause.user_id = filters.userId;
        if (filters.action) whereClause.action = filters.action;
        if (filters.resourceType) whereClause.resource_type = filters.resourceType;
        // Tenant-scoped filtering for org isolation
        if (filters.tenantId) whereClause.tenant_id = filters.tenantId;

        // Run data fetch and count in parallel for efficiency
        const [data, total] = await Promise.all([
            ModelFactory.auditLog.findAll(whereClause, {
                orderBy: { created_at: 'desc' },
                limit,
                offset
            }),
            ModelFactory.auditLog.count(whereClause)
        ]);

        // Calculate current page number
        const page = Math.floor(offset / limit) + 1;
        // Calculate total pages
        const totalPages = Math.ceil(total / limit);

        // Parse details JSON string back to object
        const parsedData = data.map(entry => ({
            ...entry,
            details: typeof entry.details === 'string' ? JSON.parse(entry.details as string) : entry.details
        }));

        // Return structured response
        return {
            data: parsedData,
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        };
    }

    /**
     * @description Retrieve the full audit history for a specific resource identified by type and ID
     * @param {string} resourceType - The resource type to filter by (e.g., 'user', 'team')
     * @param {string} resourceId - The unique resource identifier
     * @returns {Promise<AuditLog[]>} Array of audit logs sorted newest-first with parsed details
     */
    async getResourceHistory(resourceType: string, resourceId: string): Promise<AuditLog[]> {
        // Fetch logs for the specific resource
        const logs = await ModelFactory.auditLog.findAll({
            resource_type: resourceType,
            resource_id: resourceId
        }, { orderBy: { created_at: 'desc' } });

        // Parse details field for each log
        return logs.map(entry => ({
            ...entry,
            details: typeof entry.details === 'string' ? JSON.parse(entry.details as string) : entry.details
        }));
    }

    /**
     * @description Generate a CSV-formatted string of all audit logs matching the given filters for bulk export
     * @param {Record<string, any>} filters - Filters to apply (same as getLogs filters)
     * @returns {Promise<string>} CSV string with header row, or empty string if no logs match
     */
    async exportLogsToCsv(filters: any): Promise<string> {
        // Fetch a large batch of logs (limit 1,000,000)
        const response = await this.getLogs(filters, 1000000, 0);
        const logs = response.data;

        // Return empty string if no logs found
        if (logs.length === 0) return '';

        // Define CSV header
        const header = ['ID', 'User Email', 'Action', 'Resource Type', 'Resource ID', 'IP Address', 'Created At', 'Details'].join(',');

        // Map logs to CSV rows
        const rows = logs.map(log => {
            // Escape double quotes in details JSON
            const details = JSON.stringify(log.details).replace(/"/g, '""');
            // Construct row string
            return [
                log.id,
                log.user_email,
                log.action,
                log.resource_type,
                log.resource_id,
                log.ip_address,
                log.created_at,
                `"${details}"`
            ].join(',');
        });

        // Join header and rows with newlines
        return [header, ...rows].join('\n');
    }

    /**
     * @description Return all defined audit action type values for filter dropdown population
     * @returns {Promise<string[]>} Array of action type strings
     */
    async getActionTypes(): Promise<string[]> {
        // Return values of AuditAction constant
        return Object.values(AuditAction);
    }

    /**
     * @description Return all defined audit resource type values for filter dropdown population
     * @returns {Promise<string[]>} Array of resource type strings
     */
    async getResourceTypes(): Promise<string[]> {
        // Return values of AuditResourceType constant
        return Object.values(AuditResourceType);
    }

    /**
     * @description Placeholder for future log retention policy; currently a no-op returning 0
     * @param {number} olderThanDays - Threshold in days for log deletion
     * @returns {Promise<number>} Number of deleted logs (currently always 0)
     */
    async deleteOldLogs(olderThanDays: number): Promise<number> {
        // Currently returns 0 as not implemented
        return 0;
    }
}

/** Singleton instance of AuditService */
export const auditService = new AuditService();
