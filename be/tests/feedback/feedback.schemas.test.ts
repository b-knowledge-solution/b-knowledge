/**
 * @fileoverview Unit tests for feedback Zod validation schemas.
 *
 * Tests both createFeedbackSchema and searchFeedbackSchema with valid
 * inputs, invalid inputs, and edge cases.
 */

import { describe, it, expect } from 'vitest'
import {
  createFeedbackSchema,
  searchFeedbackSchema,
} from '../../src/modules/feedback/schemas/feedback.schemas.js'

describe('createFeedbackSchema', () => {
  /**
   * @description Should accept a fully-populated valid feedback payload
   */
  it('should accept valid complete feedback data', () => {
    const validData = {
      source: 'chat',
      source_id: 'conv-123',
      message_id: 'msg-456',
      thumbup: true,
      comment: 'Helpful answer',
      query: 'What is AI?',
      answer: 'AI stands for artificial intelligence.',
      chunks_used: [{ chunk_id: 'c1', doc_id: 'd1', score: 0.95 }],
      trace_id: 'trace-abc',
    }

    const result = createFeedbackSchema.safeParse(validData)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.source).toBe('chat')
      expect(result.data.thumbup).toBe(true)
    }
  })

  /**
   * @description Should accept feedback with only required fields
   */
  it('should accept minimal valid feedback (required fields only)', () => {
    const minimalData = {
      source: 'search',
      source_id: 'search-app-1',
      thumbup: false,
      query: 'How does it work?',
      answer: 'It works by processing data.',
    }

    const result = createFeedbackSchema.safeParse(minimalData)

    expect(result.success).toBe(true)
  })

  /**
   * @description Should accept 'chat' and 'search' as valid source values
   */
  it('should accept both chat and search source types', () => {
    const baseData = {
      source_id: 'id-1',
      thumbup: true,
      query: 'q',
      answer: 'a',
    }

    // Both source types should pass validation
    const chatResult = createFeedbackSchema.safeParse({ ...baseData, source: 'chat' })
    const searchResult = createFeedbackSchema.safeParse({ ...baseData, source: 'search' })

    expect(chatResult.success).toBe(true)
    expect(searchResult.success).toBe(true)
  })

  /**
   * @description Should reject invalid source types that are not 'chat' or 'search'
   */
  it('should reject invalid source type', () => {
    const invalidData = {
      source: 'email',
      source_id: 'id-1',
      thumbup: true,
      query: 'q',
      answer: 'a',
    }

    const result = createFeedbackSchema.safeParse(invalidData)

    expect(result.success).toBe(false)
  })

  /**
   * @description Should reject missing required fields
   */
  it('should reject when source_id is missing', () => {
    const result = createFeedbackSchema.safeParse({
      source: 'chat',
      thumbup: true,
      query: 'q',
      answer: 'a',
    })

    expect(result.success).toBe(false)
  })

  /**
   * @description Should reject empty string for source_id (min length 1)
   */
  it('should reject empty source_id', () => {
    const result = createFeedbackSchema.safeParse({
      source: 'chat',
      source_id: '',
      thumbup: true,
      query: 'q',
      answer: 'a',
    })

    expect(result.success).toBe(false)
  })

  /**
   * @description Should reject empty query string (min length 1)
   */
  it('should reject empty query', () => {
    const result = createFeedbackSchema.safeParse({
      source: 'chat',
      source_id: 'id-1',
      thumbup: true,
      query: '',
      answer: 'a',
    })

    expect(result.success).toBe(false)
  })

  /**
   * @description Should reject empty answer string (min length 1)
   */
  it('should reject empty answer', () => {
    const result = createFeedbackSchema.safeParse({
      source: 'chat',
      source_id: 'id-1',
      thumbup: true,
      query: 'q',
      answer: '',
    })

    expect(result.success).toBe(false)
  })

  /**
   * @description Should reject when thumbup is not a boolean
   */
  it('should reject non-boolean thumbup', () => {
    const result = createFeedbackSchema.safeParse({
      source: 'chat',
      source_id: 'id-1',
      thumbup: 'yes',
      query: 'q',
      answer: 'a',
    })

    expect(result.success).toBe(false)
  })

  /**
   * @description Should reject comments exceeding the 2000 character limit
   */
  it('should reject comment exceeding 2000 characters', () => {
    const result = createFeedbackSchema.safeParse({
      source: 'chat',
      source_id: 'id-1',
      thumbup: true,
      query: 'q',
      answer: 'a',
      comment: 'x'.repeat(2001),
    })

    expect(result.success).toBe(false)
  })

  /**
   * @description Should accept comment at exactly 2000 characters (boundary)
   */
  it('should accept comment at exactly 2000 characters', () => {
    const result = createFeedbackSchema.safeParse({
      source: 'chat',
      source_id: 'id-1',
      thumbup: true,
      query: 'q',
      answer: 'a',
      comment: 'x'.repeat(2000),
    })

    expect(result.success).toBe(true)
  })

  /**
   * @description Should validate chunks_used array structure
   */
  it('should reject chunks_used with invalid structure', () => {
    const result = createFeedbackSchema.safeParse({
      source: 'chat',
      source_id: 'id-1',
      thumbup: true,
      query: 'q',
      answer: 'a',
      chunks_used: [{ chunk_id: 'c1' }], // missing doc_id and score
    })

    expect(result.success).toBe(false)
  })

  /**
   * @description Should accept valid chunks_used with all required chunk fields
   */
  it('should accept valid chunks_used array', () => {
    const result = createFeedbackSchema.safeParse({
      source: 'chat',
      source_id: 'id-1',
      thumbup: true,
      query: 'q',
      answer: 'a',
      chunks_used: [
        { chunk_id: 'c1', doc_id: 'd1', score: 0.9 },
        { chunk_id: 'c2', doc_id: 'd2', score: 0.8 },
      ],
    })

    expect(result.success).toBe(true)
  })

  /**
   * @description Should accept empty chunks_used array
   */
  it('should accept empty chunks_used array', () => {
    const result = createFeedbackSchema.safeParse({
      source: 'chat',
      source_id: 'id-1',
      thumbup: true,
      query: 'q',
      answer: 'a',
      chunks_used: [],
    })

    expect(result.success).toBe(true)
  })

  /**
   * @description Should reject score as non-number in chunks_used
   */
  it('should reject non-number score in chunks_used', () => {
    const result = createFeedbackSchema.safeParse({
      source: 'chat',
      source_id: 'id-1',
      thumbup: true,
      query: 'q',
      answer: 'a',
      chunks_used: [{ chunk_id: 'c1', doc_id: 'd1', score: 'high' }],
    })

    expect(result.success).toBe(false)
  })

  /**
   * @description Should reject missing source field entirely
   */
  it('should reject when source field is missing', () => {
    const result = createFeedbackSchema.safeParse({
      source_id: 'id-1',
      thumbup: true,
      query: 'q',
      answer: 'a',
    })

    expect(result.success).toBe(false)
  })
})

describe('searchFeedbackSchema', () => {
  /**
   * @description Should accept a fully-populated valid search feedback payload
   */
  it('should accept valid complete search feedback data', () => {
    const validData = {
      thumbup: true,
      comment: 'Good result',
      query: 'How to use search?',
      answer: 'Use the search bar.',
      chunks_used: [{ chunk_id: 'c1', doc_id: 'd1', score: 0.85 }],
      trace_id: 'trace-xyz',
    }

    const result = searchFeedbackSchema.safeParse(validData)

    expect(result.success).toBe(true)
  })

  /**
   * @description Should accept search feedback with only required fields
   */
  it('should accept minimal valid search feedback', () => {
    const result = searchFeedbackSchema.safeParse({
      thumbup: false,
      query: 'test',
      answer: 'result',
    })

    expect(result.success).toBe(true)
  })

  /**
   * @description Should reject missing required thumbup field
   */
  it('should reject missing thumbup', () => {
    const result = searchFeedbackSchema.safeParse({
      query: 'test',
      answer: 'result',
    })

    expect(result.success).toBe(false)
  })

  /**
   * @description Should reject missing query field
   */
  it('should reject missing query', () => {
    const result = searchFeedbackSchema.safeParse({
      thumbup: true,
      answer: 'result',
    })

    expect(result.success).toBe(false)
  })

  /**
   * @description Should reject comment exceeding 2000 characters
   */
  it('should reject comment exceeding 2000 characters', () => {
    const result = searchFeedbackSchema.safeParse({
      thumbup: true,
      query: 'q',
      answer: 'a',
      comment: 'y'.repeat(2001),
    })

    expect(result.success).toBe(false)
  })

  /**
   * @description Should not require source or source_id (search-specific schema)
   */
  it('should not require source or source_id fields', () => {
    // searchFeedbackSchema intentionally omits source/source_id
    const result = searchFeedbackSchema.safeParse({
      thumbup: true,
      query: 'q',
      answer: 'a',
    })

    expect(result.success).toBe(true)
  })
})
