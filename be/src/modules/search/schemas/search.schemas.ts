
/**
 * Zod validation schemas for the search module.
 * @module schemas/search
 */
import { z } from 'zod'

/**
 * Schema for creating a new search app.
 */
export const createSearchAppSchema = z.object({
  /** Display name for the search app */
  name: z.string().min(1, 'Name is required').max(128),
  /** Description of the search app */
  description: z.string().optional(),
  /** Array of dataset IDs to search across */
  dataset_ids: z.array(z.string().uuid()).min(1, 'At least one dataset ID is required'),
  /** Optional search configuration */
  search_config: z.record(z.unknown()).optional(),
  /** Whether the search app is publicly accessible */
  is_public: z.boolean().optional(),
})

/**
 * Schema for updating an existing search app.
 */
export const updateSearchAppSchema = z.object({
  /** Display name */
  name: z.string().min(1).max(128).optional(),
  /** Description */
  description: z.string().optional(),
  /** Array of dataset IDs */
  dataset_ids: z.array(z.string().uuid()).optional(),
  /** Search configuration */
  search_config: z.record(z.unknown()).optional(),
  /** Whether the search app is publicly accessible */
  is_public: z.boolean().optional(),
})

/**
 * Schema for executing a search query.
 */
export const executeSearchSchema = z.object({
  /** The search query string */
  query: z.string().min(1, 'Query is required'),
  /** Maximum number of results to return */
  top_k: z.number().int().min(1).max(100).optional().default(10),
  /** Search method: full_text, semantic, or hybrid */
  method: z.enum(['full_text', 'semantic', 'hybrid']).optional().default('full_text'),
  /** Minimum similarity threshold for semantic results */
  similarity_threshold: z.number().min(0).max(1).optional().default(0),
})

/**
 * Schema for the ask search endpoint (SSE streaming AI summary).
 */
export const askSearchSchema = z.object({
  /** The search query string */
  query: z.string().min(1),
  /** Maximum number of results to return */
  top_k: z.number().int().min(1).max(100).optional(),
  /** Search method */
  method: z.enum(['full_text', 'semantic', 'hybrid']).optional(),
  /** Minimum similarity threshold */
  similarity_threshold: z.number().min(0).max(1).optional(),
  /** Vector similarity weight for hybrid search */
  vector_similarity_weight: z.number().min(0).max(1).optional(),
})

/**
 * Schema for the related questions endpoint.
 */
export const relatedQuestionsSchema = z.object({
  /** The user query to generate related questions from */
  query: z.string().min(1),
})

/**
 * Schema for the mindmap generation endpoint.
 */
export const mindmapSchema = z.object({
  /** The search query string */
  query: z.string().min(1),
  /** Maximum number of chunks to use for mindmap generation */
  top_k: z.number().int().min(1).max(100).optional(),
  /** Search method */
  method: z.enum(['full_text', 'semantic', 'hybrid']).optional(),
  /** Minimum similarity threshold */
  similarity_threshold: z.number().min(0).max(1).optional(),
})

/**
 * Schema for setting search app access control entries.
 * Validates the array of user/team access grants.
 */
export const searchAppAccessSchema = z.object({
  /** Array of access entries to assign to the search app */
  entries: z.array(
    z.object({
      /** Type of entity being granted access */
      entity_type: z.enum(['user', 'team']),
      /** UUID of the user or team */
      entity_id: z.string().uuid(),
    })
  ),
})

/**
 * Schema for search app UUID path param.
 */
export const searchAppIdParamSchema = z.object({
  id: z.string().uuid('Invalid search app ID'),
})
