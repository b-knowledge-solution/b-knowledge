/**
 * @fileoverview Zod validation schemas for trace module endpoints.
 *
 * Provides request body validation for trace submission, feedback,
 * and history collection endpoints.
 *
 * @module modules/trace/schemas
 */
import { z } from 'zod'

/**
 * Schema for trace submission requests.
 * @description Validates the body of POST /api/external/trace/submit.
 */
export const submitTraceSchema = z.object({
  /** User email address */
  email: z.string().email(),
  /** Message content */
  message: z.string().min(1),
  /** Share ID linking to a knowledge base source */
  share_id: z.string().optional(),
  /** Role of the message author */
  role: z.enum(['user', 'assistant']).optional(),
  /** LLM response text */
  response: z.string().optional(),
  /** Arbitrary metadata */
  metadata: z.record(z.unknown()).optional(),
})

/**
 * Schema for trace feedback requests.
 * @description Validates the body of POST /api/external/trace/feedback.
 */
export const submitFeedbackSchema = z.object({
  /** Trace ID to attach feedback to */
  traceId: z.string().optional(),
  /** Alternative message ID */
  messageId: z.string().optional(),
  /** Feedback value (numeric score) */
  value: z.number().optional(),
  /** Feedback score (alternative to value) */
  score: z.number().optional(),
  /** Optional comment */
  comment: z.string().optional(),
})

/**
 * Schema for chat history collection requests.
 * @description Validates the body of POST /api/external/history/chat.
 */
export const collectChatHistorySchema = z.object({
  /** External session identifier */
  session_id: z.string().min(1),
  /** Share ID of the knowledge base source */
  share_id: z.string().optional(),
  /** User email */
  user_email: z.string().optional(),
  /** User prompt text */
  user_prompt: z.string().min(1),
  /** LLM response text */
  llm_response: z.string().min(1),
  /** Citation references */
  citations: z.array(z.unknown()).optional(),
})

/**
 * Schema for search history collection requests.
 * @description Validates the body of POST /api/external/history/search.
 */
export const collectSearchHistorySchema = z.object({
  /** External session identifier */
  session_id: z.string().optional(),
  /** Share ID of the knowledge base source */
  share_id: z.string().optional(),
  /** User email */
  user_email: z.string().optional(),
  /** Search query text */
  search_input: z.string().min(1),
  /** AI-generated summary */
  ai_summary: z.string().optional(),
  /** Array of file results */
  file_results: z.array(z.unknown()).optional(),
})
