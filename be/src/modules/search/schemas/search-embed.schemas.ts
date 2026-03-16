/**
 * @fileoverview Zod validation schemas for search embed/widget endpoints.
 * @module schemas/search-embed
 */
import { z } from 'zod'

/**
 * @description Validates request body for creating a new embed token for a search app
 */
export const createEmbedTokenSchema = z.object({
  /** Human-readable label for the token */
  name: z.string().min(1, 'Token name is required').max(128),
  /** Optional ISO date string for token expiration */
  expires_at: z.string().datetime().nullable().optional(),
})

/**
 * @description Validates the search app UUID path parameter
 */
export const embedAppIdParamSchema = z.object({
  id: z.string().uuid('Invalid search app ID'),
})

/**
 * @description Validates the token UUID path parameter for revocation
 */
export const embedTokenIdParamSchema = z.object({
  tokenId: z.string().uuid('Invalid token ID'),
})

/**
 * @description Validates the 64-character embed token path parameter for public endpoints
 */
export const embedTokenParamSchema = z.object({
  token: z.string().length(64, 'Invalid token format'),
})

/**
 * @description Validates request body for the public embed search ask endpoint
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
