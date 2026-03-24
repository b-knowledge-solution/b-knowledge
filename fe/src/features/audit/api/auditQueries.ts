/**
 * @fileoverview TanStack Query hooks for audit log data fetching.
 * Encapsulates all audit-related queries using centralized query keys
 * and the auditApi service.
 * @module features/audit/api/auditQueries
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import type { AuditFilters } from '../types/audit.types'
import { auditApi } from './auditApi'

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * @description Fetches paginated audit logs with filters via TanStack Query.
 * Provides deduplication and caching out of the box.
 *
 * @param page - Current page number (1-indexed).
 * @param limit - Items per page.
 * @param filters - Active filter state.
 * @returns TanStack Query result with audit log data.
 */
export const useAuditLogsQuery = (page: number, limit: number, filters: AuditFilters) => {
    return useQuery({
        queryKey: queryKeys.audit.logs(page, limit, filters as unknown as Record<string, unknown>),
        queryFn: () => auditApi.fetchLogs(page, limit, filters),
    })
}

/**
 * @description Fetches available action types for the audit filter dropdown.
 *
 * @returns TanStack Query result with an array of action type strings.
 */
export const useAuditActionsQuery = () => {
    return useQuery({
        queryKey: queryKeys.audit.actions(),
        queryFn: () => auditApi.fetchActions(),
    })
}

/**
 * @description Fetches available resource types for the audit filter dropdown.
 *
 * @returns TanStack Query result with an array of resource type strings.
 */
export const useAuditResourceTypesQuery = () => {
    return useQuery({
        queryKey: queryKeys.audit.resourceTypes(),
        queryFn: () => auditApi.fetchResourceTypes(),
    })
}

/**
 * @description Returns a function that invalidates all audit-related query caches.
 *
 * @returns A refresh function that triggers cache invalidation.
 */
export const useAuditInvalidation = () => {
    const queryClient = useQueryClient()

    /**
     * @description Invalidate all audit queries to trigger a refetch.
     */
    const invalidateAuditQueries = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.audit.all })
    }

    return { invalidateAuditQueries }
}
