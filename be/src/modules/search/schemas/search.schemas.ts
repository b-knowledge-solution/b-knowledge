
/**
 * Zod validation schemas for the search module.
 * @module schemas/search
 */
import { z } from 'zod'
import { hexId, hexIdWith } from '@/shared/utils/uuid.js'

/**
 * @description Shared LLM settings sub-schema for search app configuration
 */
const llmSettingSchema = z.object({
  /** LLM temperature for response randomness */
  temperature: z.number().min(0).max(2).optional(),
  /** Whether temperature is enabled */
  temperatureEnabled: z.boolean().optional(),
  /** Top-p nucleus sampling parameter */
  top_p: z.number().min(0).max(1).optional(),
  /** Whether top_p is enabled */
  topPEnabled: z.boolean().optional(),
  /** Penalty for frequent tokens */
  frequency_penalty: z.number().min(0).max(1).optional(),
  /** Whether frequency_penalty is enabled */
  frequencyPenaltyEnabled: z.boolean().optional(),
  /** Penalty for repeated tokens */
  presence_penalty: z.number().min(0).max(1).optional(),
  /** Whether presence_penalty is enabled */
  presencePenaltyEnabled: z.boolean().optional(),
  /** Maximum tokens for LLM response */
  max_tokens: z.number().int().min(1).max(128000).optional(),
  /** Whether max_tokens is enabled */
  maxTokensEnabled: z.boolean().optional(),
}).optional()

/**
 * @description Metadata filter condition sub-schema for OpenSearch bool query filtering
 */
const metadataConditionSchema = z.object({
  /** Field name to filter on */
  name: z.string().min(1),
  /** Comparison operator */
  comparison_operator: z.enum(['is', 'eq', 'is_not', 'contains', 'gt', 'lt', 'range']),
  /** Filter value (string, number, or array for range) */
  value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
})

/**
 * @description Metadata filter schema with logic combinator (and/or) and conditions array
 */
export const metadataFilterSchema = z.object({
  /** Logic combinator for conditions */
  logic: z.enum(['and', 'or']).default('and'),
  /** Array of filter conditions (max 10) */
  conditions: z.array(metadataConditionSchema).max(10),
}).optional()

/**
 * @description Search configuration sub-schema with LLM, reranking, and retrieval settings
 */
const searchConfigSchema = z.record(z.unknown()).and(
  z.object({
    /** Default search method for app searches */
    search_method: z.enum(['full_text', 'semantic', 'hybrid']).optional(),
    /** Default top_k for app searches */
    top_k: z.number().int().min(1).max(100).optional(),
    /** Default similarity threshold */
    similarity_threshold: z.number().min(0).max(1).optional(),
    /** Default vector similarity weight for hybrid retrieval */
    vector_similarity_weight: z.number().min(0).max(1).optional(),
    /** LLM provider ID for summary generation */
    llm_id: z.string().max(128).optional(),
    /** LLM parameter overrides */
    llm_setting: llmSettingSchema,
    /** Toggle AI summary on/off for search results */
    enable_summary: z.boolean().optional(),
    /** Comma-separated target languages for cross-language query expansion */
    cross_languages: z.string().max(256).optional(),
    /** Rerank model ID for post-retrieval reranking */
    rerank_id: z.string().max(128).optional(),
    /** Top K input size for reranker (0-2048) */
    rerank_top_k: z.number().int().min(0).max(2048).optional(),
    /** Enable keyword extraction from query before retrieval */
    keyword: z.boolean().optional(),
    /** Highlight matching terms in results */
    highlight: z.boolean().optional(),
    /** Enable knowledge graph retrieval */
    use_kg: z.boolean().optional(),
    /** Enable web search via Tavily */
    web_search: z.boolean().optional(),
    /** Tavily API key for web search */
    tavily_api_key: z.string().optional(),
    /** Enable related question generation */
    enable_related_questions: z.boolean().optional(),
    /** Enable mind map generation */
    enable_mindmap: z.boolean().optional(),
    /** Metadata filter for OpenSearch bool query conditions */
    metadata_filter: metadataFilterSchema,
  }).partial()
).optional()

/**
 * @description Shared validation rules for search app configuration combinations.
 * @param {z.RefinementCtx} ctx - Zod refinement context
 * @param {Record<string, unknown> | undefined} searchConfig - Search config payload
 */
function validateSearchConfig(
  ctx: z.RefinementCtx,
  searchConfig?: Record<string, unknown>,
): void {
  if (!searchConfig) return

  if (searchConfig.enable_summary === true && !searchConfig.llm_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['search_config', 'llm_id'],
      message: 'LLM model is required when AI summary is enabled',
    })
  }

  if (searchConfig.web_search === true && !searchConfig.tavily_api_key) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['search_config', 'tavily_api_key'],
      message: 'Tavily API key is required when web search is enabled',
    })
  }
}

/**
 * @description Validates request body for creating a new search app
 */
export const createSearchAppSchema = z.object({
  /** Display name for the search app */
  name: z.string().min(1, 'Name is required').max(128),
  /** Description of the search app */
  description: z.string().optional(),
  /** Emoji avatar icon for the search app (max 64 chars) */
  avatar: z.string().max(64).optional(),
  /** Custom message shown when search returns no results */
  empty_response: z.string().optional(),
  /** Array of dataset IDs to search across */
  dataset_ids: z.array(hexId).min(1, 'At least one dataset ID is required'),
  /** Optional search configuration with LLM settings */
  search_config: searchConfigSchema,
  /** Whether the search app is publicly accessible */
  is_public: z.boolean().optional(),
}).superRefine((data, ctx) => {
  validateSearchConfig(ctx, data.search_config as Record<string, unknown> | undefined)
})

/**
 * @description Validates request body for updating an existing search app
 */
export const updateSearchAppSchema = z.object({
  /** Display name */
  name: z.string().min(1).max(128).optional(),
  /** Description */
  description: z.string().optional(),
  /** Emoji avatar icon for the search app (max 64 chars) */
  avatar: z.string().max(64).optional(),
  /** Custom message shown when search returns no results */
  empty_response: z.string().optional(),
  /** Array of dataset IDs */
  dataset_ids: z.array(hexId).optional(),
  /** Search configuration with LLM settings */
  search_config: searchConfigSchema,
  /** Whether the search app is publicly accessible */
  is_public: z.boolean().optional(),
}).superRefine((data, ctx) => {
  validateSearchConfig(ctx, data.search_config as Record<string, unknown> | undefined)
})

/**
 * @description Validates request body for executing a search query with pagination
 */
export const executeSearchSchema = z.object({
  /** The search query string */
  query: z.string().min(1, 'Query is required'),
  /** Maximum number of results to retrieve before pagination */
  top_k: z.number().int().min(1).max(100).optional().default(10),
  /** Search method: full_text, semantic, or hybrid */
  method: z.enum(['full_text', 'semantic', 'hybrid']).optional().default('full_text'),
  /** Minimum similarity threshold for semantic results */
  similarity_threshold: z.number().min(0).max(1).optional().default(0),
  /** Vector similarity weight for hybrid search (0 = full text, 1 = full semantic) */
  vector_similarity_weight: z.number().min(0).max(1).optional(),
  /** Optional document IDs to scope the search to */
  doc_ids: z.array(z.string()).optional(),
  /** Runtime metadata filter to narrow retrieval results */
  metadata_filter: metadataFilterSchema,
  /** Page number (1-indexed) */
  page: z.number().int().min(1).optional().default(1),
  /** Number of results per page */
  page_size: z.number().int().min(1).max(50).optional().default(10),
})

/**
 * @description Validates request body for the ask search endpoint (SSE streaming AI summary)
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
  /** Optional document IDs to scope the search to */
  doc_ids: z.array(z.string()).optional(),
  /** Runtime metadata filter to narrow retrieval results */
  metadata_filter: metadataFilterSchema,
})

/**
 * @description Validates request body for the related questions generation endpoint
 */
export const relatedQuestionsSchema = z.object({
  /** The user query to generate related questions from */
  query: z.string().min(1),
})

/**
 * @description Validates request body for the mindmap generation endpoint
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
  /** Vector similarity weight for hybrid search */
  vector_similarity_weight: z.number().min(0).max(1).optional(),
  /** Optional document IDs to scope the search to */
  doc_ids: z.array(z.string()).optional(),
  /** Runtime metadata filter to narrow retrieval results */
  metadata_filter: metadataFilterSchema,
})

/**
 * @description Validates request body for setting search app access control entries (user/team grants)
 */
export const searchAppAccessSchema = z.object({
  /** Array of access entries to assign to the search app */
  entries: z.array(
    z.object({
      /** Type of entity being granted access */
      entity_type: z.enum(['user', 'team']),
      /** UUID of the user or team */
      entity_id: hexId,
    })
  ),
})

/**
 * @description Validates request body for retrieval testing (dry-run without LLM summary)
 */
export const retrievalTestSchema = z.object({
  /** The search query string */
  query: z.string().min(1),
  /** Maximum number of chunks to retrieve */
  top_k: z.number().int().min(1).max(100).optional().default(30),
  /** Minimum similarity threshold for semantic results */
  similarity_threshold: z.number().min(0).max(1).optional().default(0),
  /** Vector similarity weight for hybrid search */
  vector_similarity_weight: z.number().min(0).max(1).optional().default(0.3),
  /** Search method */
  search_method: z.enum(['full_text', 'semantic', 'hybrid']).optional().default('hybrid'),
  /** Optional document ID filter */
  doc_ids: z.array(z.string()).optional(),
  /** Runtime metadata filter to narrow retrieval results */
  metadata_filter: metadataFilterSchema,
  /** Page number (1-indexed) */
  page: z.number().int().min(1).optional().default(1),
  /** Number of results per page */
  page_size: z.number().int().min(1).max(50).optional().default(10),
})

/**
 * @description Validates query parameters for listing search apps with pagination, search, and sorting
 */
export const listSearchAppsSchema = z.object({
  /** Page number (1-indexed) */
  page: z.coerce.number().int().min(1).default(1),
  /** Number of items per page */
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  /** Search term to filter by name or description */
  search: z.string().optional(),
  /** Field to sort results by */
  sort_by: z.enum(['created_at', 'name']).default('created_at'),
  /** Sort direction */
  sort_order: z.enum(['asc', 'desc']).default('desc'),
})

/**
 * @description Validates the search app UUID path parameter
 */
export const searchAppIdParamSchema = z.object({
  id: hexIdWith('Invalid search app ID'),
})
