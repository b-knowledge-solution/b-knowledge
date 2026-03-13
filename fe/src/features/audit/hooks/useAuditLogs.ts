/**
 * @fileoverview Hook for audit log data fetching and pagination.
 * Encapsulates log listing, filter option loading, debounced search,
 * and pagination handling via TanStack Query.
 * @module features/audit/hooks/useAuditLogs
 */
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import type { AuditLogEntry, AuditPagination } from '../types/audit.types'
import { auditApi } from '../api/auditApi'
import { useAuditFilters } from '../contexts/AuditFilterContext'

// ============================================================================
// Return Type
// ============================================================================

/**
 * @description Return type for the useAuditLogs hook.
 */
export interface UseAuditLogsReturn {
    /** Current page of audit log entries */
    logs: AuditLogEntry[]
    /** Current pagination state */
    pagination: AuditPagination
    /** Whether data is being loaded */
    isLoading: boolean
    /** Available action types for filter dropdown */
    actionTypes: string[]
    /** Available resource types for filter dropdown */
    resourceTypes: string[]
    /** Handle page or page-size change */
    handlePageChange: (page: number, pageSize?: number) => void
    /** Refresh current page data */
    refresh: () => void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Hook for managing audit log data, pagination, and filter options.
 * Reads filter state from AuditFilterContext and triggers debounced fetches
 * via TanStack Query for deduplication and caching.
 *
 * @returns {UseAuditLogsReturn} Audit log state and handlers.
 */
export const useAuditLogs = (): UseAuditLogsReturn => {
    const { filters } = useAuditFilters()
    const queryClient = useQueryClient()

    // Pagination state
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(25)

    // Debounced filter state for query key (prevents rapid refetches)
    const [debouncedFilters, setDebouncedFilters] = useState(filters)

    // Debounce filter changes by 300ms
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedFilters(filters)
            setPage(1) // Reset to page 1 when filters change
        }, 300)
        return () => clearTimeout(timer)
    }, [filters])

    /**
     * Fetch audit logs via TanStack Query (deduplicated, cached).
     */
    const {
        data: logsData,
        isLoading: isLogsLoading,
    } = useQuery({
        queryKey: queryKeys.audit.logs(page, limit, debouncedFilters as unknown as Record<string, unknown>),
        queryFn: () => auditApi.fetchLogs(page, limit, debouncedFilters),
    })

    /**
     * Fetch action types for filter dropdown via TanStack Query.
     */
    const { data: actionTypes = [] } = useQuery({
        queryKey: queryKeys.audit.actions(),
        queryFn: () => auditApi.fetchActions(),
    })

    /**
     * Fetch resource types for filter dropdown via TanStack Query.
     */
    const { data: resourceTypes = [] } = useQuery({
        queryKey: queryKeys.audit.resourceTypes(),
        queryFn: () => auditApi.fetchResourceTypes(),
    })

    // Derive logs and pagination from query data
    const logs = logsData?.data ?? []
    const pagination: AuditPagination = logsData?.pagination ?? {
        page,
        limit,
        total: 0,
        totalPages: 0,
    }

    /**
     * Handle page or page-size change from pagination control.
     * @param newPage - New page number.
     * @param newPageSize - New page size (triggers reset to page 1).
     */
    const handlePageChange = (newPage: number, newPageSize?: number) => {
        if (newPageSize && newPageSize !== limit) {
            setLimit(newPageSize)
            setPage(1)
        } else {
            setPage(newPage)
        }
    }

    /** Refresh current page data */
    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.audit.all })
    }

    return {
        logs,
        pagination,
        isLoading: isLogsLoading,
        actionTypes,
        resourceTypes,
        handlePageChange,
        refresh,
    }
}
