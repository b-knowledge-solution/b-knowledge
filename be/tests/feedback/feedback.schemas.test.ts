/**
 * @fileoverview Unit tests for feedback Zod validation schemas.
 * Tests createFeedbackSchema, listFeedbackQuerySchema, and feedbackStatsQuerySchema.
 */

import { describe, it, expect } from 'vitest'
import {
  createFeedbackSchema,
  listFeedbackQuerySchema,
  feedbackStatsQuerySchema,
} from '../../src/modules/feedback/schemas/feedback.schemas.js'

describe('Feedback Schemas', () => {
  describe('createFeedbackSchema', () => {
    const validPayload = {
      source: 'chat',
      source_id: 'conv-123',
      thumbup: true,
      query: 'What is RAG?',
      answer: 'RAG stands for Retrieval-Augmented Generation.',
    }

    it('should accept valid chat feedback', () => {
      const result = createFeedbackSchema.safeParse(validPayload)
      expect(result.success).toBe(true)
    })

    it('should accept valid search feedback', () => {
      const result = createFeedbackSchema.safeParse({ ...validPayload, source: 'search' })
      expect(result.success).toBe(true)
    })

    it('should accept valid agent feedback', () => {
      // Agent source must be accepted after extending the enum
      const result = createFeedbackSchema.safeParse({ ...validPayload, source: 'agent' })
      expect(result.success).toBe(true)
    })

    it('should reject invalid source value', () => {
      // 'email' is not a valid feedback source
      const result = createFeedbackSchema.safeParse({ ...validPayload, source: 'email' })
      expect(result.success).toBe(false)
    })

    it('should reject empty query', () => {
      const result = createFeedbackSchema.safeParse({ ...validPayload, query: '' })
      expect(result.success).toBe(false)
    })

    it('should reject empty answer', () => {
      const result = createFeedbackSchema.safeParse({ ...validPayload, answer: '' })
      expect(result.success).toBe(false)
    })

    it('should accept optional comment', () => {
      const result = createFeedbackSchema.safeParse({
        ...validPayload,
        comment: 'The answer was helpful',
      })
      expect(result.success).toBe(true)
    })

    it('should reject comment exceeding 2000 chars', () => {
      const result = createFeedbackSchema.safeParse({
        ...validPayload,
        comment: 'x'.repeat(2001),
      })
      expect(result.success).toBe(false)
    })

    it('should accept optional chunks_used array', () => {
      const result = createFeedbackSchema.safeParse({
        ...validPayload,
        chunks_used: [{ chunk_id: 'c1', doc_id: 'd1', score: 0.95 }],
      })
      expect(result.success).toBe(true)
    })

    it('should accept optional trace_id', () => {
      const result = createFeedbackSchema.safeParse({
        ...validPayload,
        trace_id: 'trace-abc-123',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('listFeedbackQuerySchema', () => {
    it('should parse with defaults when no params provided', () => {
      const result = listFeedbackQuerySchema.safeParse({})
      expect(result.success).toBe(true)
      if (result.success) {
        // Default page is 1, default limit is 20
        expect(result.data.page).toBe(1)
        expect(result.data.limit).toBe(20)
        expect(result.data.source).toBeUndefined()
        expect(result.data.thumbup).toBeUndefined()
      }
    })

    it('should parse source filter', () => {
      const result = listFeedbackQuerySchema.safeParse({ source: 'agent' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.source).toBe('agent')
      }
    })

    it('should transform thumbup string to boolean', () => {
      // 'true' string should transform to boolean true
      const trueResult = listFeedbackQuerySchema.safeParse({ thumbup: 'true' })
      expect(trueResult.success).toBe(true)
      if (trueResult.success) {
        expect(trueResult.data.thumbup).toBe(true)
      }

      // 'false' string should transform to boolean false
      const falseResult = listFeedbackQuerySchema.safeParse({ thumbup: 'false' })
      expect(falseResult.success).toBe(true)
      if (falseResult.success) {
        expect(falseResult.data.thumbup).toBe(false)
      }
    })

    it('should parse page and limit as numbers', () => {
      const result = listFeedbackQuerySchema.safeParse({ page: '3', limit: '50' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(3)
        expect(result.data.limit).toBe(50)
      }
    })

    it('should accept date range filters', () => {
      const result = listFeedbackQuerySchema.safeParse({
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('feedbackStatsQuerySchema', () => {
    it('should parse with no params', () => {
      const result = feedbackStatsQuerySchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('should accept date range params', () => {
      const result = feedbackStatsQuerySchema.safeParse({
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.startDate).toBe('2026-01-01')
        expect(result.data.endDate).toBe('2026-03-31')
      }
    })
  })
})
