/**
 * @fileoverview Unit tests for the AnswerFeedbackModel.
 *
 * Tests custom query methods (findBySource, findByUser) with mocked Knex.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist the mock Knex builder chain
const mockKnexChain = vi.hoisted(() => ({
  where: vi.fn(),
  orderBy: vi.fn(),
  insert: vi.fn(),
  returning: vi.fn(),
  first: vi.fn(),
  select: vi.fn(),
}))

// Create a callable knex mock that returns the chain and supports chaining
const mockKnex = vi.hoisted(() => {
  const knexFn = vi.fn(() => mockKnexChain) as any
  return knexFn
})

// Mock the Knex database module
vi.mock('../../src/shared/db/knex.js', () => ({
  db: mockKnex,
}))

// Mock logger
vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('AnswerFeedbackModel', () => {
  let AnswerFeedbackModel: any

  beforeEach(async () => {
    vi.clearAllMocks()

    // Re-set the knex callable mock after clearAllMocks resets it
    mockKnex.mockImplementation(() => mockKnexChain)

    // Configure mock chain: where() and orderBy() return the chain for chaining
    mockKnexChain.where.mockReturnValue(mockKnexChain)
    mockKnexChain.orderBy.mockReturnValue(mockKnexChain)
    mockKnexChain.select.mockReturnValue(mockKnexChain)

    // Re-import to get fresh class definition with mocks applied
    const module = await import('../../src/modules/feedback/models/answer-feedback.model.js')
    AnswerFeedbackModel = module.AnswerFeedbackModel
  })

  describe('findBySource', () => {
    /**
     * @description Should query the answer_feedback table filtering by source and source_id, ordered by created_at desc
     */
    it('should query by source and source_id with descending order', async () => {
      const mockRecords = [
        { id: 'fb-1', source: 'chat', source_id: 'conv-1', thumbup: true },
        { id: 'fb-2', source: 'chat', source_id: 'conv-1', thumbup: false },
      ]

      // orderBy is the terminal call, so it resolves with data
      mockKnexChain.orderBy.mockResolvedValue(mockRecords)

      const model = new AnswerFeedbackModel()
      const result = await model.findBySource('chat', 'conv-1')

      // Verify knex was called with the correct table name
      expect(mockKnex).toHaveBeenCalledWith('answer_feedback')
      // Verify where clause matches source and source_id
      expect(mockKnexChain.where).toHaveBeenCalledWith({
        source: 'chat',
        source_id: 'conv-1',
      })
      // Verify ordering by created_at descending for newest-first
      expect(mockKnexChain.orderBy).toHaveBeenCalledWith('created_at', 'desc')
      expect(result).toEqual(mockRecords)
    })

    /**
     * @description Should return empty array when no records match the source filter
     */
    it('should return empty array when no records match', async () => {
      mockKnexChain.orderBy.mockResolvedValue([])

      const model = new AnswerFeedbackModel()
      const result = await model.findBySource('search', 'non-existent')

      expect(result).toEqual([])
    })

    /**
     * @description Should handle search source type correctly
     */
    it('should handle search source type', async () => {
      mockKnexChain.orderBy.mockResolvedValue([
        { id: 'fb-3', source: 'search', source_id: 'search-1' },
      ])

      const model = new AnswerFeedbackModel()
      await model.findBySource('search', 'search-1')

      expect(mockKnexChain.where).toHaveBeenCalledWith({
        source: 'search',
        source_id: 'search-1',
      })
    })
  })

  describe('findByUser', () => {
    /**
     * @description Should query by user_id and return results ordered by created_at desc
     */
    it('should query by user_id with descending order', async () => {
      const mockRecords = [
        { id: 'fb-4', user_id: 'user-1', thumbup: true },
      ]

      mockKnexChain.orderBy.mockResolvedValue(mockRecords)

      const model = new AnswerFeedbackModel()
      const result = await model.findByUser('user-1')

      // Verify where clause filters by user_id
      expect(mockKnexChain.where).toHaveBeenCalledWith({ user_id: 'user-1' })
      // Verify ordering by created_at descending
      expect(mockKnexChain.orderBy).toHaveBeenCalledWith('created_at', 'desc')
      expect(result).toEqual(mockRecords)
    })

    /**
     * @description Should return empty array when user has no feedback records
     */
    it('should return empty array when user has no feedback', async () => {
      mockKnexChain.orderBy.mockResolvedValue([])

      const model = new AnswerFeedbackModel()
      const result = await model.findByUser('user-no-feedback')

      expect(result).toEqual([])
    })
  })

  describe('tableName', () => {
    /**
     * @description Should use 'answer_feedback' as the table name
     */
    it('should be set to answer_feedback', () => {
      const model = new AnswerFeedbackModel()
      // Access protected tableName via any cast
      expect((model as any).tableName).toBe('answer_feedback')
    })
  })
})
