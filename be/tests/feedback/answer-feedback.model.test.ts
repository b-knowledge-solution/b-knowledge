/**
 * @fileoverview Unit tests for AnswerFeedbackModel.
 * Tests findPaginated, countBySource, and getTopFlaggedSessions with mocked Knex.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * @description Creates a chainable mock query builder where every method returns the builder itself.
 * @returns A mock query builder with all chainable methods
 */
function createChainableBuilder() {
  const builder: Record<string, any> = {}
  const chainMethods = [
    'where', 'select', 'count', 'sum', 'groupBy', 'groupByRaw',
    'havingRaw', 'orderBy', 'limit', 'offset', 'first',
  ]
  chainMethods.forEach(method => {
    builder[method] = vi.fn().mockImplementation(() => builder)
  })
  // modify calls the callback with the builder itself, then returns the builder
  builder.modify = vi.fn().mockImplementation((fn: Function) => {
    fn(builder)
    return builder
  })
  builder.clone = vi.fn().mockImplementation(() => createChainableBuilder())
  return builder
}

let mockQueryBuilder = createChainableBuilder()

const mockDb: any = vi.hoisted(() => {
  const fn = vi.fn()
  fn.raw = vi.fn((sql: string) => sql)
  return fn
})

vi.mock('../../src/shared/db/knex.js', () => ({
  db: mockDb,
}))

vi.mock('../../src/shared/models/types.js', () => ({}))

describe('AnswerFeedbackModel', () => {
  let model: any

  beforeEach(async () => {
    vi.clearAllMocks()
    // Create fresh builder for each test
    mockQueryBuilder = createChainableBuilder()
    mockDb.mockReturnValue(mockQueryBuilder)

    const mod = await import('../../src/modules/feedback/models/answer-feedback.model.js')
    model = new mod.AnswerFeedbackModel()
  })

  describe('findBySource', () => {
    it('should query by source and source_id for agent', async () => {
      // Simulate returning an array from the terminal orderBy call
      mockQueryBuilder.orderBy.mockResolvedValueOnce([
        { id: '1', source: 'agent', source_id: 'run-1', thumbup: true },
      ])

      const result = await model.findBySource('agent', 'run-1')

      // Verify the query was built correctly
      expect(mockDb).toHaveBeenCalledWith('answer_feedback')
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ source: 'agent', source_id: 'run-1' })
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc')
      expect(result).toHaveLength(1)
    })
  })

  describe('findPaginated', () => {
    it('should apply source filter and return paginated results', async () => {
      // Create separate builders for count and data queries via clone
      const countBuilder = createChainableBuilder()
      countBuilder.first.mockResolvedValueOnce({ count: '5' })

      const dataBuilder = createChainableBuilder()
      dataBuilder.offset.mockResolvedValueOnce([
        { id: '1', source: 'chat', thumbup: true },
      ])

      // First clone returns count builder, second returns data builder
      mockQueryBuilder.clone
        .mockReturnValueOnce(countBuilder)
        .mockReturnValueOnce(dataBuilder)

      const result = await model.findPaginated({
        tenantId: 'tenant-1',
        source: 'chat',
        page: 1,
        limit: 20,
      })

      // Should have called where with tenant_id and source on the base builder
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('tenant_id', 'tenant-1')
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('source', 'chat')
      expect(result.total).toBe(5)
      expect(result.data).toHaveLength(1)
    })

    it('should apply thumbup filter when provided', async () => {
      const countBuilder = createChainableBuilder()
      countBuilder.first.mockResolvedValueOnce({ count: '3' })

      const dataBuilder = createChainableBuilder()
      dataBuilder.offset.mockResolvedValueOnce([])

      mockQueryBuilder.clone
        .mockReturnValueOnce(countBuilder)
        .mockReturnValueOnce(dataBuilder)

      await model.findPaginated({
        tenantId: 'tenant-1',
        thumbup: false,
        page: 1,
        limit: 20,
      })

      // Should filter by thumbup = false (negative feedback)
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('thumbup', false)
    })

    it('should calculate correct offset for pagination', async () => {
      const countBuilder = createChainableBuilder()
      countBuilder.first.mockResolvedValueOnce({ count: '100' })

      const dataBuilder = createChainableBuilder()
      dataBuilder.offset.mockResolvedValueOnce([])

      mockQueryBuilder.clone
        .mockReturnValueOnce(countBuilder)
        .mockReturnValueOnce(dataBuilder)

      await model.findPaginated({
        tenantId: 'tenant-1',
        page: 3,
        limit: 25,
      })

      // Page 3 with limit 25 should offset by 50
      expect(dataBuilder.offset).toHaveBeenCalledWith(50)
      expect(dataBuilder.limit).toHaveBeenCalledWith(25)
    })
  })

  describe('countBySource', () => {
    it('should return counts for chat, search, and agent', async () => {
      // Mock the terminal groupBy call to resolve with source rows
      mockQueryBuilder.groupBy.mockResolvedValueOnce([
        { source: 'chat', count: '10' },
        { source: 'search', count: '5' },
        { source: 'agent', count: '3' },
      ])

      const result = await model.countBySource('tenant-1')

      expect(result).toEqual({ chat: 10, search: 5, agent: 3 })
    })

    it('should return zero for missing sources', async () => {
      // Only chat has feedback
      mockQueryBuilder.groupBy.mockResolvedValueOnce([
        { source: 'chat', count: '7' },
      ])

      const result = await model.countBySource('tenant-1')

      expect(result).toEqual({ chat: 7, search: 0, agent: 0 })
    })

    it('should apply date range filters when provided', async () => {
      mockQueryBuilder.groupBy.mockResolvedValueOnce([])

      await model.countBySource('tenant-1', '2026-01-01', '2026-03-31')

      // Should have applied date range where clauses
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('created_at', '>=', '2026-01-01')
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('created_at', '<=', '2026-03-31 23:59:59')
    })
  })

  describe('getTopFlaggedSessions', () => {
    it('should return sessions ordered by negative feedback count', async () => {
      // Mock the terminal limit call to resolve with session rows
      mockQueryBuilder.limit.mockResolvedValueOnce([
        { source: 'chat', source_id: 'conv-1', negative_count: '5', total_count: '10' },
        { source: 'agent', source_id: 'run-1', negative_count: '3', total_count: '4' },
      ])

      const result = await model.getTopFlaggedSessions('tenant-1', 10)

      expect(result).toHaveLength(2)
      expect(result[0].negative_count).toBe(5)
      expect(result[0].total_count).toBe(10)
      expect(result[1].source).toBe('agent')
    })
  })
})
