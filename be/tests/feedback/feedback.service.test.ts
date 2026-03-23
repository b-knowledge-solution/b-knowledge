/**
 * @fileoverview Unit tests for feedback service.
 *
 * Tests feedback creation and source-based querying with mocked database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mock objects so they are available before module imports
const mockAnswerFeedbackModel = vi.hoisted(() => ({
  create: vi.fn(),
  findBySource: vi.fn(),
  findAll: vi.fn(),
  findById: vi.fn(),
}))

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))

// Mock ModelFactory to return our mock model
vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    answerFeedback: mockAnswerFeedbackModel,
  },
}))

// Mock logger to suppress output during tests
vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: mockLog,
}))

describe('FeedbackService', () => {
  let feedbackService: any

  beforeEach(async () => {
    vi.clearAllMocks()
    // Re-import the module to get a fresh service instance with mocks applied
    const module = await import('../../src/modules/feedback/services/feedback.service.js')
    feedbackService = module.feedbackService
  })

  describe('createFeedback', () => {
    /**
     * @description Should delegate to model create with all provided fields
     */
    it('should create a feedback record and return it', async () => {
      const feedbackData = {
        source: 'chat' as const,
        source_id: 'conv-123',
        message_id: 'msg-456',
        user_id: 'user-1',
        thumbup: true,
        comment: 'Great answer!',
        query: 'What is AI?',
        answer: 'AI is artificial intelligence.',
        chunks_used: [{ chunk_id: 'c1', doc_id: 'd1', score: 0.95 }],
        trace_id: 'trace-789',
        tenant_id: 'default',
      }

      const createdRecord = { id: 'fb-1', ...feedbackData, created_at: new Date() }
      mockAnswerFeedbackModel.create.mockResolvedValue(createdRecord)

      const result = await feedbackService.createFeedback(feedbackData)

      // Verify the model was called with the exact data
      expect(mockAnswerFeedbackModel.create).toHaveBeenCalledWith(feedbackData)
      expect(result).toEqual(createdRecord)
    })

    /**
     * @description Should log creation details including source, source_id, and thumbup
     */
    it('should log feedback creation metadata', async () => {
      const feedbackData = {
        source: 'search' as const,
        source_id: 'search-app-1',
        thumbup: false,
        query: 'test query',
        answer: 'test answer',
      }

      mockAnswerFeedbackModel.create.mockResolvedValue({ id: 'fb-2', ...feedbackData })

      await feedbackService.createFeedback(feedbackData)

      // Verify logger was called with source context
      expect(mockLog.info).toHaveBeenCalledWith(
        'Creating answer feedback',
        expect.objectContaining({
          source: 'search',
          source_id: 'search-app-1',
          thumbup: false,
        })
      )
    })

    /**
     * @description Should propagate database errors to the caller
     */
    it('should propagate errors from the model layer', async () => {
      mockAnswerFeedbackModel.create.mockRejectedValue(new Error('DB insert failed'))

      await expect(
        feedbackService.createFeedback({
          source: 'chat',
          source_id: 'conv-1',
          thumbup: true,
          query: 'q',
          answer: 'a',
        })
      ).rejects.toThrow('DB insert failed')
    })

    /**
     * @description Should handle minimal required fields (no optional fields)
     */
    it('should handle feedback with only required fields', async () => {
      const minimalData = {
        source: 'chat' as const,
        source_id: 'conv-1',
        thumbup: false,
        query: 'Why?',
        answer: 'Because.',
      }

      mockAnswerFeedbackModel.create.mockResolvedValue({ id: 'fb-3', ...minimalData })

      const result = await feedbackService.createFeedback(minimalData)

      expect(mockAnswerFeedbackModel.create).toHaveBeenCalledWith(minimalData)
      expect(result.id).toBe('fb-3')
    })
  })

  describe('getFeedbackBySource', () => {
    /**
     * @description Should return feedback records for a chat source
     */
    it('should return feedback records for a chat conversation', async () => {
      const mockRecords = [
        { id: 'fb-1', source: 'chat', source_id: 'conv-1', thumbup: true, created_at: new Date() },
        { id: 'fb-2', source: 'chat', source_id: 'conv-1', thumbup: false, created_at: new Date() },
      ]

      mockAnswerFeedbackModel.findBySource.mockResolvedValue(mockRecords)

      const result = await feedbackService.getFeedbackBySource('chat', 'conv-1')

      // Verify correct source and sourceId are passed to the model
      expect(mockAnswerFeedbackModel.findBySource).toHaveBeenCalledWith('chat', 'conv-1')
      expect(result).toEqual(mockRecords)
      expect(result).toHaveLength(2)
    })

    /**
     * @description Should return feedback records for a search source
     */
    it('should return feedback records for a search app', async () => {
      const mockRecords = [
        { id: 'fb-3', source: 'search', source_id: 'search-1', thumbup: true },
      ]

      mockAnswerFeedbackModel.findBySource.mockResolvedValue(mockRecords)

      const result = await feedbackService.getFeedbackBySource('search', 'search-1')

      expect(mockAnswerFeedbackModel.findBySource).toHaveBeenCalledWith('search', 'search-1')
      expect(result).toHaveLength(1)
    })

    /**
     * @description Should return an empty array when no feedback exists
     */
    it('should return empty array when no feedback exists for the source', async () => {
      mockAnswerFeedbackModel.findBySource.mockResolvedValue([])

      const result = await feedbackService.getFeedbackBySource('chat', 'non-existent')

      expect(result).toEqual([])
    })

    /**
     * @description Should propagate database errors to the caller
     */
    it('should propagate errors from the model layer', async () => {
      mockAnswerFeedbackModel.findBySource.mockRejectedValue(new Error('DB query failed'))

      await expect(
        feedbackService.getFeedbackBySource('chat', 'conv-1')
      ).rejects.toThrow('DB query failed')
    })
  })
})
