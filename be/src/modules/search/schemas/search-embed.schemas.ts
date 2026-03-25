/**
 * @fileoverview Zod validation schemas for search embed/widget endpoints.
 * @module schemas/search-embed
 */
import { z } from 'zod'
import { hexIdWith } from '@/shared/utils/uuid.js'
import { metadataFilterSchema } from './search.schemas.js'

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
  id: hexIdWith('Invalid search app ID'),
})

/**
 * @description Validates the token UUID path parameter for revocation
 */
export const embedTokenIdParamSchema = z.object({
  tokenId: hexIdWith('Invalid token ID'),
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

/**
 * @description Validates request for the public embed search endpoint (non-streaming)
 */
export const embedSearchSchema = z.object({
  body: z.object({
    /** The search query string */
    query: z.string().min(1, 'Query is required'),
    /** Maximum number of results */
    top_k: z.number().int().min(1).max(100).optional(),
    /** Search method */
    method: z.enum(['full_text', 'semantic', 'hybrid']).optional(),
    /** Minimum similarity threshold */
    similarity_threshold: z.number().min(0).max(1).optional(),
    /** Vector similarity weight for hybrid search */
    vector_similarity_weight: z.number().min(0).max(1).optional(),
    /** Runtime metadata filter to narrow retrieval results */
    metadata_filter: metadataFilterSchema,
    /** Page number (1-indexed) */
    page: z.number().int().min(1).optional().default(1),
    /** Number of results per page */
    page_size: z.number().int().min(1).max(50).optional().default(10),
  }),
  params: z.object({
    /** 64-character embed token */
    token: z.string().length(64),
  }),
})

/**
 * @description Validates request for the public embed related questions endpoint
 */
export const embedRelatedQuestionsSchema = z.object({
  body: z.object({
    /** The user query to generate related questions from */
    query: z.string().min(1, 'Query is required'),
  }),
  params: z.object({
    /** 64-character embed token */
    token: z.string().length(64),
  }),
})

/**
 * @description Validates request for the public embed mindmap generation endpoint
 */
export const embedMindmapSchema = z.object({
  body: z.object({
    /** The search query string */
    query: z.string().min(1, 'Query is required'),
    /** Maximum number of chunks to use for mindmap generation */
    top_k: z.number().int().min(1).max(100).optional(),
    /** Search method */
    method: z.enum(['full_text', 'semantic', 'hybrid']).optional(),
    /** Minimum similarity threshold */
    similarity_threshold: z.number().min(0).max(1).optional(),
    /** Vector similarity weight for hybrid search */
    vector_similarity_weight: z.number().min(0).max(1).optional(),
    /** Runtime metadata filter to narrow retrieval results */
    metadata_filter: metadataFilterSchema,
  }),
  params: z.object({
    /** 64-character embed token */
    token: z.string().length(64),
  }),
})
