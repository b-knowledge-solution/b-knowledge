/**
 * @fileoverview Zod validation schemas for search embed/widget endpoints.
 * @module schemas/search-embed
 */
import { z } from 'zod'

/**
 * Schema for creating a new embed token for a search app.
 */
export const createEmbedTokenSchema = z.object({
  /** Human-readable label for the token */
  name: z.string().min(1, 'Token name is required').max(128),
  /** Optional ISO date string for token expiration */
  expires_at: z.string().datetime().nullable().optional(),
})

/**
 * Schema for the search app ID path parameter.
 */
export const embedAppIdParamSchema = z.object({
  id: z.string().uuid('Invalid search app ID'),
})

/**
 * Schema for the token ID path parameter (for revoke).
 */
export const embedTokenIdParamSchema = z.object({
  tokenId: z.string().uuid('Invalid token ID'),
})

/**
 * Schema for the embed token path parameter (public endpoints).
 */
export const embedTokenParamSchema = z.object({
  token: z.string().length(64, 'Invalid token format'),
})

/**
 * Schema for the public embed search ask endpoint.
 */
export const embedAskSchema = z.object({
  /** The search query string */
  query: z.string().min(1, 'Query is required'),
  /** Maximum number of results */
  top_k: z.number().int().min(1).max(100).optional(),
  /** Search method */
  method: z.enum(['full_text', 'semantic', 'hybrid']).optional(),
  /** Minimum similarity threshold */
  similarity_threshold: z.number().min(0).max(1).optional(),
})
