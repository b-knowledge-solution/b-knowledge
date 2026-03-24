
/**
 * Zod validation schemas for chat embed token endpoints.
 * @module schemas/chat-embed
 */
import { z } from 'zod'
import { hexId, hexIdWith } from '@/shared/utils/uuid.js'

/**
 * @description Schema for creating a new embed token.
 * Validates token name and optional ISO 8601 expiration date.
 */
export const createEmbedTokenSchema = z.object({
  /** Human-readable name for the token */
  name: z.string().min(1, 'Name is required').max(128),
  /** Optional expiration date (ISO 8601 string) */
  expires_at: z.string().datetime().nullable().optional(),
})

/**
 * @description Schema for dialog ID path parameter on embed token routes.
 */
export const embedDialogIdParamSchema = z.object({
  id: hexIdWith('Invalid dialog ID'),
})

/**
 * @description Schema for token ID path parameter on revoke route.
 */
export const embedTokenIdParamSchema = z.object({
  tokenId: hexIdWith('Invalid token ID'),
})

/**
 * @description Schema for embed token path parameter on public routes.
 * Tokens are exactly 64 characters long.
 */
export const embedTokenParamSchema = z.object({
  token: z.string().length(64, 'Invalid embed token'),
})

/**
 * @description Schema for embed chat completion request body.
 * Validates message content and optional session ID for continuation.
 */
export const embedCompletionSchema = z.object({
  /** The user message content */
  content: z.string().min(1, 'Message content is required').max(32000),
  /** Session ID for continuing a conversation (optional, creates new if omitted) */
  session_id: hexId.optional(),
})

/**
 * @description Schema for creating an anonymous session via embed endpoint.
 */
export const embedCreateSessionSchema = z.object({
  /** Optional display name for the session */
  name: z.string().max(256).optional(),
})
