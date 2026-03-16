
/**
 * Zod validation schemas for chat embed token endpoints.
 * @module schemas/chat-embed
 */
import { z } from 'zod'

/**
 * Schema for creating a new embed token.
 */
export const createEmbedTokenSchema = z.object({
  /** Human-readable name for the token */
  name: z.string().min(1, 'Name is required').max(128),
  /** Optional expiration date (ISO 8601 string) */
  expires_at: z.string().datetime().nullable().optional(),
})

/**
 * Schema for dialog ID path parameter on embed token routes.
 */
export const embedDialogIdParamSchema = z.object({
  id: z.string().uuid('Invalid dialog ID'),
})

/**
 * Schema for token ID path parameter on revoke route.
 */
export const embedTokenIdParamSchema = z.object({
  tokenId: z.string().uuid('Invalid token ID'),
})

/**
 * Schema for embed token path parameter on public routes.
 */
export const embedTokenParamSchema = z.object({
  token: z.string().length(64, 'Invalid embed token'),
})

/**
 * Schema for embed chat completion request body.
 */
export const embedCompletionSchema = z.object({
  /** The user message content */
  content: z.string().min(1, 'Message content is required').max(32000),
  /** Session ID for continuing a conversation (optional, creates new if omitted) */
  session_id: z.string().uuid().optional(),
})

/**
 * Schema for creating an anonymous session via embed endpoint.
 */
export const embedCreateSessionSchema = z.object({
  /** Optional display name for the session */
  name: z.string().max(256).optional(),
})
