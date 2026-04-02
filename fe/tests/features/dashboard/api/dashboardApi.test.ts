/**
 * @fileoverview Tests for Dashboard API service.
 *
 * Tests:
 * - fetchDashboardStats: URL construction with and without date params
 * - fetchQueryAnalytics: URL construction with and without date params
 * - fetchFeedbackAnalytics: URL construction with and without date params
 *
 * Mocks `apiFetch` from `@/lib/api` to verify correct endpoint and query string construction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

// Mock apiFetch so no real HTTP calls are made
const mockApiFetch = vi.fn()
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

// ============================================================================
// Tests
// ============================================================================

describe('dashboardApi', () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
    // Default resolved value so calls don't reject
    mockApiFetch.mockResolvedValue({})
  })

  /**
   * @description Dynamically imports the module under test so the mock is picked up
   * @returns {Promise<typeof import('@/features/dashboard/api/dashboardApi')>} Module exports
   */
  async function importModule() {
    return await import('@/features/dashboard/api/dashboardApi')
  }

  // --------------------------------------------------------------------------
  // fetchDashboardStats
  // --------------------------------------------------------------------------

  describe('fetchDashboardStats', () => {
    /** @description Should call apiFetch with base URL when no dates are provided */
    it('should call apiFetch with no query string when dates are omitted', async () => {
      const { fetchDashboardStats } = await importModule()

      await fetchDashboardStats()

      // No date params means no query string appended
      expect(mockApiFetch).toHaveBeenCalledWith('/api/admin/dashboard/stats')
    })

    /** @description Should append only startDate when endDate is omitted */
    it('should append startDate param when only startDate is provided', async () => {
      const { fetchDashboardStats } = await importModule()

      await fetchDashboardStats('2024-01-01')

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/admin/dashboard/stats?startDate=2024-01-01'
      )
    })

    /** @description Should append only endDate when startDate is omitted */
    it('should append endDate param when only endDate is provided', async () => {
      const { fetchDashboardStats } = await importModule()

      await fetchDashboardStats(undefined, '2024-12-31')

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/admin/dashboard/stats?endDate=2024-12-31'
      )
    })

    /** @description Should append both date params when both are provided */
    it('should include both startDate and endDate in query string', async () => {
      const { fetchDashboardStats } = await importModule()

      await fetchDashboardStats('2024-01-01', '2024-12-31')

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/admin/dashboard/stats?startDate=2024-01-01&endDate=2024-12-31'
      )
    })

    /** @description Should return the data from apiFetch */
    it('should return the resolved value from apiFetch', async () => {
      const mockData = { totalUsers: 42, totalDocuments: 100 }
      mockApiFetch.mockResolvedValueOnce(mockData)
      const { fetchDashboardStats } = await importModule()

      const result = await fetchDashboardStats()

      expect(result).toEqual(mockData)
    })
  })

  // --------------------------------------------------------------------------
  // fetchQueryAnalytics
  // --------------------------------------------------------------------------

  describe('fetchQueryAnalytics', () => {
    /** @description Should call the correct analytics endpoint with no query string */
    it('should call the queries analytics endpoint without params', async () => {
      const { fetchQueryAnalytics } = await importModule()

      await fetchQueryAnalytics()

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/admin/dashboard/analytics/queries'
      )
    })

    /** @description Should include both date params in the analytics URL */
    it('should include date range params in query string', async () => {
      const { fetchQueryAnalytics } = await importModule()

      await fetchQueryAnalytics('2024-06-01', '2024-06-30')

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/admin/dashboard/analytics/queries?startDate=2024-06-01&endDate=2024-06-30'
      )
    })
  })

  // --------------------------------------------------------------------------
  // fetchFeedbackAnalytics
  // --------------------------------------------------------------------------

  describe('fetchFeedbackAnalytics', () => {
    /** @description Should call the correct feedback endpoint with no query string */
    it('should call the feedback analytics endpoint without params', async () => {
      const { fetchFeedbackAnalytics } = await importModule()

      await fetchFeedbackAnalytics()

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/admin/dashboard/analytics/feedback'
      )
    })

    /** @description Should include both date params in the feedback URL */
    it('should include date range params in query string', async () => {
      const { fetchFeedbackAnalytics } = await importModule()

      await fetchFeedbackAnalytics('2024-03-01', '2024-03-31')

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/admin/dashboard/analytics/feedback?startDate=2024-03-01&endDate=2024-03-31'
      )
    })

    /** @description Should propagate errors from apiFetch */
    it('should propagate errors from apiFetch', async () => {
      mockApiFetch.mockRejectedValueOnce(new Error('Network error'))
      const { fetchFeedbackAnalytics } = await importModule()

      await expect(fetchFeedbackAnalytics()).rejects.toThrow('Network error')
    })
  })
})
