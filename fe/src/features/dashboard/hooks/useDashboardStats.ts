/**
 * @fileoverview Hook for dashboard data fetching and date range state.
 * @module features/dashboard/hooks/useDashboardStats
 */
import { useState, useEffect, useCallback } from 'react'
import type { DashboardStats } from '../types/dashboard.types'
import { fetchDashboardStats } from '../api/dashboardApi'
import { format } from 'date-fns'

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
 * @returns {UseDashboardStatsReturn} Dashboard state and handlers.
 */
export const useDashboardStats = (): UseDashboardStatsReturn => {
    const [startDate, setStartDate] = useState<Date | undefined>(undefined)
    const [endDate, setEndDate] = useState<Date | undefined>(undefined)
    const [stats, setStats] = useState<DashboardStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [topUsersLimit, setTopUsersLimit] = useState(10)

    /**
     * Fetch dashboard data from the API.
     * Converts Date objects to YYYY-MM-DD strings for the query.
     */
    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const start = startDate ? format(startDate, 'yyyy-MM-dd') : undefined
            const end = endDate ? format(endDate, 'yyyy-MM-dd') : undefined
            const data = await fetchDashboardStats(start, end)
            setStats(data)
        } catch (error) {
            console.error('Failed to fetch dashboard stats:', error)
        } finally {
            setLoading(false)
        }
    }, [startDate, endDate])

    // Load data on mount and when date range changes
    useEffect(() => {
        loadData()
    }, [loadData])

    /**
     * Handle date range change from the picker.
     * @param start - Start date.
     * @param end - End date.
     */
    const handleDateRangeChange = (start: Date | undefined, end: Date | undefined) => {
        setStartDate(start)
        setEndDate(end)
    }

    return {
        stats,
        loading,
        startDate,
        endDate,
        handleDateRangeChange,
        topUsersLimit,
        setTopUsersLimit,
        refresh: loadData,
    }
}
