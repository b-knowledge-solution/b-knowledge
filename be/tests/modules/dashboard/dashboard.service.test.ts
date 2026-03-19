/**
 * @fileoverview Unit tests for the dashboard service.
 *
 * Tests aggregate statistics calculation, query analytics, feedback analytics,
 * and error handling with mocked Knex database queries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted mocks declared before vi.mock calls
const { mockDb, mockConfig } = vi.hoisted(() => {
  const dbFn: any = vi.fn()
  dbFn.raw = vi.fn().mockResolvedValue({ rows: [] })
  return {
    mockDb: dbFn,
    mockConfig: {
      langfuse: {
        baseUrl: 'https://langfuse.example.com',
      },
    },
  }
})

vi.mock('@/shared/db/knex.js', () => ({
  db: mockDb,
}))

vi.mock('@/shared/config/index.js', () => ({
  config: mockConfig,
}))

// Static import after mocks are registered
import { dashboardService } from '../../../src/modules/dashboard/dashboard.service.js'

/**
 * @description Creates a chainable Knex query builder mock.
 * All builder methods return `this` for chaining. The `first` and `then`
 * behaviors can be customized per test.
 * @param {object} overrides - Override default mock implementations
 * @returns {object} Mock query builder with chainable methods
 */
function createBuilder(overrides: Record<string, any> = {}): any {
  const builder: any = {
    count: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    distinct: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    whereNotNull: vi.fn().mockReturnThis(),
    whereNot: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    groupByRaw: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    avg: vi.fn().mockReturnThis(),
    modify: vi.fn().mockImplementation(function (this: any, fn: any) { fn(this); return this }),
    first: vi.fn().mockResolvedValue({ count: '0' }),
    toQuery: vi.fn().mockReturnValue('SELECT 1'),
    // When awaited directly (for array queries), resolve as empty array
    then: vi.fn().mockImplementation((resolve: any) => resolve([])),
    ...overrides,
  }
  return builder
}

describe('DashboardService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfig.langfuse.baseUrl = 'https://langfuse.example.com'
  })

  describe('getLangfuseTraceUrl', () => {
    it('should construct a valid Langfuse trace URL', () => {
      const url = dashboardService.getLangfuseTraceUrl('trace-123')

      expect(url).toBe('https://langfuse.example.com/trace/trace-123')
    })

    it('should strip trailing slash from base URL', () => {
      mockConfig.langfuse.baseUrl = 'https://langfuse.example.com/'

      const url = dashboardService.getLangfuseTraceUrl('trace-456')

      expect(url).toBe('https://langfuse.example.com/trace/trace-456')
    })
  })

  describe('getStats', () => {
    it('should return zero-value stats when all queries return empty results', async () => {
      const builder = createBuilder()
      mockDb.mockReturnValue(builder)
      mockDb.raw = vi.fn().mockResolvedValue({ rows: [] })

      const stats = await dashboardService.getStats()

      expect(stats.totalSessions).toBe(0)
      expect(stats.totalMessages).toBe(0)
      expect(stats.uniqueUsers).toBe(0)
      expect(stats.avgMessagesPerSession).toBe(0)
      expect(stats.activityTrend).toEqual([])
      expect(stats.topUsers).toEqual([])
      expect(stats.usageBreakdown).toEqual({
        chatSessions: 0,
        searchSessions: 0,
      })
    })

    it('should calculate avgMessagesPerSession correctly', async () => {
      let callIndex = 0
      const builder = createBuilder({
        // Return different counts for each .first() call:
        // 0: chat sessions=5, 1: search sessions=5, 2: chat messages=30, 3: search records=20
        first: vi.fn().mockImplementation(() => {
          const idx = callIndex++
          if (idx === 0) return Promise.resolve({ count: '5' })
          if (idx === 1) return Promise.resolve({ count: '5' })
          if (idx === 2) return Promise.resolve({ count: '30' })
          if (idx === 3) return Promise.resolve({ count: '20' })
          return Promise.resolve({ count: '0' })
        }),
      })

      mockDb.mockReturnValue(builder)
      mockDb.raw = vi.fn().mockResolvedValue({ rows: [] })

      const stats = await dashboardService.getStats()

      // 50 messages / 10 sessions = 5.0
      expect(stats.totalSessions).toBe(10)
      expect(stats.totalMessages).toBe(50)
      expect(stats.avgMessagesPerSession).toBe(5)
    })

    it('should merge unique users from chat and search sources', async () => {
      let thenCallIndex = 0
      const builder = createBuilder({
        first: vi.fn().mockResolvedValue({ count: '0' }),
        then: vi.fn().mockImplementation((resolve: any) => {
          const idx = thenCallIndex++
          // Distinct email queries return overlapping user sets
          if (idx === 0) return resolve([{ user_email: 'alice@test.com' }, { user_email: 'bob@test.com' }])
          if (idx === 1) return resolve([{ user_email: 'bob@test.com' }, { user_email: 'carol@test.com' }])
          return resolve([])
        }),
      })

      mockDb.mockReturnValue(builder)
      mockDb.raw = vi.fn().mockResolvedValue({ rows: [] })

      const stats = await dashboardService.getStats()

      // alice, bob (deduplicated), carol = 3 unique users
      expect(stats.uniqueUsers).toBe(3)
    })
  })

  describe('getQueryAnalytics', () => {
    it('should return zero-value analytics when no data exists', async () => {
      const builder = createBuilder({
        first: vi.fn().mockResolvedValue({ count: '0', avg: '0' }),
      })

      mockDb.mockReturnValue(builder)

      const analytics = await dashboardService.getQueryAnalytics('tenant-1')

      expect(analytics.totalQueries).toBe(0)
      expect(analytics.avgResponseTime).toBe(0)
      expect(analytics.failedRate).toBe(0)
      expect(analytics.lowConfRate).toBe(0)
      expect(analytics.topQueries).toEqual([])
      expect(analytics.trend).toEqual([])
    })
  })

  describe('getFeedbackAnalytics', () => {
    it('should return zero-value feedback analytics when no data exists', async () => {
      const builder = createBuilder({
        first: vi.fn().mockResolvedValue({ count: '0' }),
      })

      mockDb.mockReturnValue(builder)
      mockDb.raw = vi.fn().mockResolvedValue({ rows: [] })

      const analytics = await dashboardService.getFeedbackAnalytics('tenant-1')

      expect(analytics.totalFeedback).toBe(0)
      expect(analytics.satisfactionRate).toBe(0)
      expect(analytics.zeroResultRate).toBe(0)
      expect(analytics.worstDatasets).toEqual([])
      expect(analytics.trend).toEqual([])
      expect(analytics.negativeFeedback).toEqual([])
    })
  })
})
