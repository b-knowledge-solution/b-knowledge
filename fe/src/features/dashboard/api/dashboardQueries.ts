/**
 * @fileoverview TanStack Query hooks for dashboard statistics.
 * Provides query hooks for fetching and managing dashboard data.
 * @module features/dashboard/api/dashboardQueries
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { DashboardStats } from '../types/dashboard.types'
import { fetchDashboardStats, fetchQueryAnalytics, fetchFeedbackAnalytics, fetchFeedbackStats } from './dashboardApi'
import { format } from 'date-fns'
import { queryKeys } from '@/lib/queryKeys'
import { CacheTime } from '@/constants'

// ============================================================================
// Return Type
// ============================================================================

/**
 * @description Return type for the useDashboardStats hook.
 */
export interface UseDashboardStatsReturn {
    /** Dashboard statistics data (null while loading initial) */
    stats: DashboardStats | null
    /** Whether data is being loaded */
    loading: boolean
    /** Current start date filter */
    startDate: Date | undefined
    /** Current end date filter */
    endDate: Date | undefined
    /** Handle date range change from picker */
    handleDateRangeChange: (start: Date | undefined, end: Date | undefined) => void
    /** Top users display limit */
    topUsersLimit: number
    /** Update top users limit */
    setTopUsersLimit: (limit: number) => void
    /** Manually refresh dashboard data */
    refresh: () => void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Hook for managing dashboard statistics data and filters.
 * Date range changes automatically trigger a refetch via query key.
 * @returns {UseDashboardStatsReturn} Dashboard state and handlers.
 */
export const useDashboardStats = (): UseDashboardStatsReturn => {
    const queryClient = useQueryClient()

    // Local UI state for date range and display limit
    const [startDate, setStartDate] = useState<Date | undefined>(undefined)
    const [endDate, setEndDate] = useState<Date | undefined>(undefined)
    const [topUsersLimit, setTopUsersLimit] = useState(10)

    // Convert dates to query-friendly strings
    const startStr = startDate ? format(startDate, 'yyyy-MM-dd') : undefined
    const endStr = endDate ? format(endDate, 'yyyy-MM-dd') : undefined

    // Fetch dashboard stats — re-fetches automatically when date range changes
    const statsQuery = useQuery({
        queryKey: queryKeys.dashboard.stats(startStr, endStr),
        queryFn: () => fetchDashboardStats(startStr, endStr),
    })

    /**
     * @description Handle date range change from the picker.
     * @param start - Start date.
     * @param end - End date.
     */
    const handleDateRangeChange = (start: Date | undefined, end: Date | undefined) => {
        setStartDate(start)
        setEndDate(end)
    }

    /** @description Manually refresh dashboard data by invalidating the query. */
    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats(startStr, endStr) })
    }

    return {
        stats: statsQuery.data ?? null,
        loading: statsQuery.isLoading,
        startDate,
        endDate,
        handleDateRangeChange,
        topUsersLimit,
        setTopUsersLimit,
        refresh,
    }
}

// ============================================================================
// Query Analytics Hook
// ============================================================================

/**
 * @description Hook for fetching query analytics data with date range filtering.
 * Uses 5-minute staleTime for manual refresh pattern (data considered fresh for 5 min).
 * @param {string} [startDate] - Optional start date string (yyyy-MM-dd).
 * @param {string} [endDate] - Optional end date string (yyyy-MM-dd).
 * @returns TanStack Query result with query analytics data.
 */
export const useQueryAnalytics = (startDate?: string, endDate?: string) => {
    return useQuery({
        queryKey: queryKeys.dashboard.analytics(startDate, endDate),
        queryFn: () => fetchQueryAnalytics(startDate, endDate),
        // 5-minute staleTime for manual refresh pattern per CONTEXT.md
        staleTime: CacheTime.DASHBOARD,
    })
}

// ============================================================================
// Feedback Analytics Hook
// ============================================================================

/**
 * @description Hook for fetching feedback analytics data with date range filtering.
 * Uses 5-minute staleTime for manual refresh pattern (data considered fresh for 5 min).
 * @param {string} [startDate] - Optional start date string (yyyy-MM-dd).
 * @param {string} [endDate] - Optional end date string (yyyy-MM-dd).
 * @returns TanStack Query result with feedback analytics data.
 */
export const useFeedbackAnalytics = (startDate?: string, endDate?: string) => {
    return useQuery({
        queryKey: queryKeys.dashboard.feedback(startDate, endDate),
        queryFn: () => fetchFeedbackAnalytics(startDate, endDate),
        // 5-minute staleTime for manual refresh pattern per CONTEXT.md
        staleTime: CacheTime.DASHBOARD,
    })
}

// ============================================================================
// Feedback Stats Hook (Source Breakdown + Top Flagged)
// ============================================================================

/**
 * @description Hook for fetching feedback stats (source breakdown and top flagged sessions).
 * Calls GET /api/feedback/stats which returns aggregated source counts and top flagged data.
 * Uses 5-minute staleTime for manual refresh pattern.
 * @param {string} [startDate] - Optional start date string (yyyy-MM-dd).
 * @param {string} [endDate] - Optional end date string (yyyy-MM-dd).
 * @returns TanStack Query result with feedback stats data.
 */
export const useFeedbackStats = (startDate?: string, endDate?: string) => {
    return useQuery({
        queryKey: queryKeys.dashboard.feedbackStats(startDate, endDate),
        queryFn: () => fetchFeedbackStats(startDate, endDate),
        // 5-minute staleTime for manual refresh pattern
        staleTime: CacheTime.DASHBOARD,
    })
}
