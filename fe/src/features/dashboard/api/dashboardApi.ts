/**
 * @fileoverview API service for Dashboard statistics.
 * @module features/dashboard/api/dashboardApi
 */
import { apiFetch } from '@/lib/api'
import type { DashboardStats, QueryAnalytics, FeedbackAnalytics, FeedbackStatsResponse } from '../types/dashboard.types'

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

/**
 * @description Fetch query analytics data from the admin analytics API.
 * Includes total queries, response time, confidence metrics, and trend data.
 * @param {string} [startDate] - Optional ISO date string for range start.
 * @param {string} [endDate] - Optional ISO date string for range end.
 * @returns {Promise<QueryAnalytics>} Query analytics payload.
 */
export async function fetchQueryAnalytics(
    startDate?: string,
    endDate?: string
): Promise<QueryAnalytics> {
    const params = new URLSearchParams()
    // Only include date params when provided to allow unbounded queries
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)

    const queryString = params.toString()
    const url = `/api/admin/dashboard/analytics/queries${queryString ? `?${queryString}` : ''}`

    return apiFetch<QueryAnalytics>(url)
}

/**
 * @description Fetch feedback analytics data from the admin feedback API.
 * Includes satisfaction rate, feedback counts, trend, and negative feedback with Langfuse links.
 * @param {string} [startDate] - Optional ISO date string for range start.
 * @param {string} [endDate] - Optional ISO date string for range end.
 * @returns {Promise<FeedbackAnalytics>} Feedback analytics payload.
 */
export async function fetchFeedbackAnalytics(
    startDate?: string,
    endDate?: string
): Promise<FeedbackAnalytics> {
    const params = new URLSearchParams()
    // Only include date params when provided to allow unbounded queries
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)

    const queryString = params.toString()
    const url = `/api/admin/dashboard/analytics/feedback${queryString ? `?${queryString}` : ''}`

    return apiFetch<FeedbackAnalytics>(url)
}

/**
 * @description Fetch feedback stats (source breakdown and top flagged sessions) from the feedback API.
 * Calls GET /api/feedback/stats which provides aggregated source breakdown and top flagged data.
 * @param {string} [startDate] - Optional ISO date string for range start.
 * @param {string} [endDate] - Optional ISO date string for range end.
 * @returns {Promise<FeedbackStatsResponse>} Source breakdown and top flagged sessions.
 */
export async function fetchFeedbackStats(
    startDate?: string,
    endDate?: string
): Promise<FeedbackStatsResponse> {
    const params = new URLSearchParams()
    // Only include date params when provided to allow unbounded queries
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)

    const queryString = params.toString()
    const url = `/api/feedback/stats${queryString ? `?${queryString}` : ''}`

    return apiFetch<FeedbackStatsResponse>(url)
}
