/**
 * @fileoverview API service for the Audit feature.
 * Centralizes all audit-related API calls using the shared apiFetch utility.
 * @module features/audit/api/auditApi
 */
import { apiFetch } from '@/lib/api'
import type { AuditLogEntry, AuditPagination, AuditFilters } from '../types/audit.types'

// ============================================================================
// API Response Types (internal)
// ============================================================================

/** Raw API response shape for audit log listing */
interface AuditLogApiResponse {
    data: AuditLogEntry[]
    pagination: AuditPagination
}

// ============================================================================
// API Service
// ============================================================================

/**
 * @description Centralized audit API service with methods for fetching logs and filter options.
 */
export const auditApi = {
    /**
     * @description Fetch audit logs with pagination and filters.
     * @param {number} page - Page number (1-indexed).
     * @param {number} limit - Items per page.
     * @param {AuditFilters} filters - Active filter state.
     * @returns {Promise<AuditLogApiResponse>} Paginated audit log entries.
     */
    fetchLogs: async (
        page: number,
        limit: number,
        filters: AuditFilters
    ): Promise<AuditLogApiResponse> => {
        const params = new URLSearchParams({
            page: String(page),
            limit: String(limit),
        })

        // Append only non-empty filter values to avoid sending blank params
        if (filters.search) params.append('search', filters.search)
        if (filters.action) params.append('action', filters.action)
        if (filters.resourceType) params.append('resourceType', filters.resourceType)
        if (filters.startDate) params.append('startDate', filters.startDate)
        if (filters.endDate) params.append('endDate', filters.endDate)

        return apiFetch<AuditLogApiResponse>(`/api/audit?${params}`)
    },

    /**
     * @description Fetch all available action types for filter dropdown.
     * @returns {Promise<string[]>} Array of action type strings.
     */
    fetchActions: async (): Promise<string[]> => {
        return apiFetch<string[]>('/api/audit/actions')
    },

    /**
     * @description Fetch all available resource types for filter dropdown.
     * @returns {Promise<string[]>} Array of resource type strings.
     */
    fetchResourceTypes: async (): Promise<string[]> => {
        return apiFetch<string[]>('/api/audit/resource-types')
    },
}
