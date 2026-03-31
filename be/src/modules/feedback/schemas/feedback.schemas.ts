/**
 * @fileoverview Zod validation schemas for the feedback module.
 * @module schemas/feedback
 */
import { z } from 'zod'

/**
 * @description Schema for creating answer feedback.
 * Validates source, identifiers, thumbs up/down, and optional context fields.
 */
export const createFeedbackSchema = z.object({
  /** Feedback source: chat conversation or search app */
  source: z.enum(['chat', 'search']),
  /** conversation_id (chat) or search_app_id (search) */
  source_id: z.string().min(1, 'Source ID is required'),
  /** Chat message ID; optional, only for chat feedback */
  message_id: z.string().optional(),
  /** Thumbs up (true) or thumbs down (false) */
  thumbup: z.boolean(),
  /** Optional text comment from the user */
  comment: z.string().max(2000).optional(),
  /** The original query that produced the answer */
  query: z.string().min(1, 'Query is required'),
  /** The answer text that was evaluated */
  answer: z.string().min(1, 'Answer is required'),
  /** Array of chunk references used in retrieval */
  chunks_used: z.array(z.object({
    chunk_id: z.string(),
    doc_id: z.string(),
    score: z.number(),
  })).optional(),
  /** Langfuse trace ID for observability linking */
  trace_id: z.string().optional(),
})

/**
 * @description Schema for search-specific feedback (used by search module).
 * Simpler than the general schema since source is always 'search'.
 */
export const searchFeedbackSchema = z.object({
  /** Thumbs up (true) or thumbs down (false) */
  thumbup: z.boolean(),
  /** Optional text comment from the user */
  comment: z.string().max(2000).optional(),
  /** The original query that produced the answer */
  query: z.string().min(1, 'Query is required'),
  /** The answer text that was evaluated */
  answer: z.string().min(1, 'Answer is required'),
  /** Array of chunk references used in retrieval */
  chunks_used: z.array(z.object({
    chunk_id: z.string(),
    doc_id: z.string(),
    score: z.number(),
  })).optional(),
  /** Langfuse trace ID for observability linking */
  trace_id: z.string().optional(),
})
