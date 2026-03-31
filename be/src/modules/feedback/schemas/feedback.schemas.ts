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
  /** Feedback source: chat conversation, search app, or agent run */
  source: z.enum(['chat', 'search', 'agent']),
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
 * @description Schema for listing feedback records with filters and pagination.
 * Used by GET /api/feedback for admin listing.
 */
export const listFeedbackQuerySchema = z.object({
  /** Filter by feedback source type */
  source: z.enum(['chat', 'search', 'agent']).optional(),
  /** Filter by thumbup value: 'true' for positive, 'false' for negative */
  thumbup: z.string().optional().transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
  /** ISO date string for range start */
  startDate: z.string().optional(),
  /** ISO date string for range end */
  endDate: z.string().optional(),
  /** Page number (1-indexed) */
  page: z.string().default('1').transform(Number),
  /** Items per page */
  limit: z.string().default('20').transform(Number),
})

/**
 * @description Schema for feedback stats query parameters.
 * Used by GET /api/feedback/stats for admin analytics.
 */
export const feedbackStatsQuerySchema = z.object({
  /** ISO date string for range start */
  startDate: z.string().optional(),
  /** ISO date string for range end */
  endDate: z.string().optional(),
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
