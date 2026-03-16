/**
 * @fileoverview API service for Dashboard statistics.
 * @module features/dashboard/api/dashboardApi
 */
import { apiFetch } from '@/lib/api'
import type { DashboardStats } from '../types/dashboard.types'

/**
 * @description Fetch dashboard statistics from the admin API.
 * Builds query string from optional date range parameters.
 * @param {string} [startDate] - Optional ISO date string for range start.
 * @param {string} [endDate] - Optional ISO date string for range end.
 * @returns {Promise<DashboardStats>} Dashboard statistics payload.
 */
export async function fetchDashboardStats(
    startDate?: string,
    endDate?: string
): Promise<DashboardStats> {
    const params = new URLSearchParams()
    // Only include date params when provided to allow unbounded queries
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)

    const queryString = params.toString()
    const url = `/api/admin/dashboard/stats${queryString ? `?${queryString}` : ''}`

    return apiFetch<DashboardStats>(url)
}
