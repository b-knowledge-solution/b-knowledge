/**
 * @fileoverview Type definitions for the dataset search feature.
 * @module features/ai/types/search.types
 */

// ============================================================================
// Search Result Types
// ============================================================================

/**
 * @description A single search result chunk.
 */
export interface SearchResult {
  /** Chunk unique identifier */
  chunk_id: string
  /** Chunk text content */
  content: string
  /** Content with highlight markers */
  content_with_weight: string
  /** Parent document identifier */
  doc_id: string
  /** Document file name */
  doc_name: string
  /** Page number(s) in the document */
  page_num: number | number[]
  /** Position(s) within the page */
  position: number | number[]
  /** Highlighted content with matching terms marked */
  highlight?: string | null
  /** Relevance score (0-1) */
  score: number
  /** Dataset identifier the chunk belongs to */
  dataset_id: string
  /** Dataset display name */
  dataset_name?: string
  /** File type / extension */
  file_type?: string
  /** Positions for PDF highlighting */
  positions?: number[][]
  /** Image ID for image-type chunks */
  img_id?: string
  /** Direct image URL for image-type chunks */
  image_url?: string
}

// ============================================================================
// Search Filter Types
// ============================================================================

/**
 * @description Filters applied to a search query.
 */
export interface SearchFilters {
  /** Dataset IDs to limit search scope */
  dataset_ids?: string[]
  /** File type filter (e.g. 'pdf', 'docx') */
  file_types?: string[]
  /** Search method: hybrid, semantic, or full-text */
  search_method?: 'hybrid' | 'semantic' | 'fulltext'
  /** Minimum similarity threshold (0-1) */
  similarity_threshold?: number
  /** Maximum number of results */
  top_k?: number
  /** Weight for vector similarity vs keyword (0-1) */
  vector_similarity_weight?: number
  /** Pagination: current page */
  page?: number
  /** Pagination: results per page */
  page_size?: number
  /** Metadata tag filter conditions for OpenSearch buildMetadataFilters() */
  metadata_filter?: {
    logic: 'and' | 'or'
    conditions: Array<{
      name: string
      comparison_operator: 'is' | 'eq' | 'is_not' | 'contains' | 'gt' | 'lt' | 'range'
      value: string
    }>
  } | undefined
  /** Restrict retrieval to specific document IDs */
  doc_ids?: string[]
}

// ============================================================================
// Search Response Types
// ============================================================================

/**
 * @description Response from the search API.
 */
export interface SearchResponse {
  /** Array of search results */
  results: SearchResult[]
  /** AI-generated summary of search results */
  summary?: string
  /** Total number of matching results */
  total: number
}

// ============================================================================
// Mind Map Types
// ============================================================================

/**
 * @description A node in the mind map tree structure.
 */
export interface MindMapNode {
  /** Display label for this node */
  label: string
  /** Optional child nodes */
  children?: MindMapNode[]
}

// ============================================================================
// Search App Types
// ============================================================================

/**
 * @description A search application configuration.
 */
export interface SearchApp {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** Optional description */
  description?: string | undefined
  /** Emoji avatar icon for the search app */
  avatar?: string | null
  /** Custom message shown when search returns no results */
  empty_response?: string | null
  /** Dataset IDs linked to this search app */
  dataset_ids: string[]
  /** Whether the search app is publicly accessible to all users */
  is_public?: boolean | undefined
  /** Display name of the user who created this search app */
  created_by?: string | undefined
  /** Search configuration settings */
  search_config: SearchAppConfig
  /** ISO timestamp of creation */
  created_at: string
  /** ISO timestamp of last update */
  updated_at: string
}

/**
 * @description Public embed app configuration returned by the embed config endpoint.
 */
export interface EmbedAppConfig {
  /** Display name of the search app */
  name: string
  /** Optional description */
  description?: string | null
  /** Emoji avatar icon for the search app */
  avatar?: string | null
  /** Custom message shown when search returns no results */
  empty_response?: string | null
  /** Search configuration settings */
  search_config: SearchAppConfig
}

/**
 * @description LLM settings for search summary generation.
 */
export interface SearchLlmSetting {
  /** Temperature for LLM generation (0-2) */
  temperature?: number | undefined
  /** Whether temperature is enabled */
  temperatureEnabled?: boolean | undefined
  /** Top-p sampling parameter (0-1) */
  top_p?: number | undefined
  /** Whether top_p is enabled */
  topPEnabled?: boolean | undefined
  /** Penalty for frequent tokens (0-1) */
  frequency_penalty?: number | undefined
  /** Whether frequency_penalty is enabled */
  frequencyPenaltyEnabled?: boolean | undefined
  /** Penalty for repeated tokens (0-1) */
  presence_penalty?: number | undefined
  /** Whether presence_penalty is enabled */
  presencePenaltyEnabled?: boolean | undefined
  /** Maximum tokens for LLM response */
  max_tokens?: number | undefined
  /** Whether max_tokens is enabled */
  maxTokensEnabled?: boolean | undefined
}

/**
 * @description Search configuration for a search app.
 */
export interface SearchAppConfig {
  /** Minimum similarity threshold (0-1) */
  similarity_threshold?: number | undefined
  /** Maximum number of results */
  top_k?: number | undefined
  /** Search method: hybrid, semantic, or full-text */
  search_method?: 'hybrid' | 'semantic' | 'fulltext' | undefined
  /** Weight for vector similarity vs keyword (0-1) */
  vector_similarity_weight?: number | undefined
  /** Rerank model identifier */
  rerank_id?: string | undefined
  /** Top K input size for reranker (0-2048) */
  rerank_top_k?: number | undefined
  /** Metadata filter for document filtering */
  metadata_filter?: import('@/components/metadata-filter/metadata-filter.types').MetadataFilter | undefined
  /** LLM model identifier for summary generation */
  llm_id?: string | undefined
  /** LLM generation settings */
  llm_setting?: SearchLlmSetting | undefined
  /** Comma-separated language codes for cross-language search */
  cross_languages?: string | undefined
  /** Enable keyword extraction from query */
  keyword?: boolean | undefined
  /** Highlight matching terms in results */
  highlight?: boolean | undefined
  /** Enable knowledge graph retrieval */
  use_kg?: boolean | undefined
  /** Enable web search augmentation */
  web_search?: boolean | undefined
  /** Tavily API key for web search */
  tavily_api_key?: string | undefined
  /** Enable AI summary generation */
  enable_summary?: boolean | undefined
  /** Enable related question suggestions */
  enable_related_questions?: boolean | undefined
  /** Enable mind map generation */
  enable_mindmap?: boolean | undefined
}

/**
 * @description A single retrieval test result chunk.
 */
export interface RetrievalTestChunk {
  /** Chunk unique identifier */
  chunk_id: string
  /** Chunk text content */
  content: string
  /** Parent document identifier */
  doc_id: string
  /** Document file name */
  doc_name: string
  /** Page number(s) in the document */
  page_num: number | number[]
  /** Relevance score (0-1) */
  score: number
  /** Dataset identifier */
  dataset_id?: string
}

/**
 * @description Response from the retrieval test endpoint.
 */
export interface RetrievalTestResponse {
  /** Retrieved chunks */
  chunks: RetrievalTestChunk[]
  /** Total number of matching chunks */
  total: number
  /** Current page number */
  page: number
  /** Page size */
  page_size: number
  /** Document aggregation counts */
  doc_aggs?: Array<{ doc_id: string; doc_name: string; count: number }>
}

/**
 * @description Payload for creating or updating a search app.
 */
export interface CreateSearchAppPayload {
  name: string
  description?: string | undefined
  /** Emoji avatar icon for the search app */
  avatar?: string | undefined
  /** Custom message shown when search returns no results */
  empty_response?: string | undefined
  dataset_ids: string[]
  is_public?: boolean | undefined
  search_config?: SearchAppConfig | undefined
}

/**
 * @description An access entry linking a user or team to a search app.
 */
export interface SearchAppAccessEntry {
  /** Type of entity granted access */
  entity_type: 'user' | 'team'
  /** Unique identifier of the user or team */
  entity_id: string
  /** Human-readable display name */
  display_name?: string | undefined
}

// ============================================================================
// Search Stream State
// ============================================================================

/**
 * @description State shape for streaming search with SSE.
 */
export interface SearchStreamState {
  /** Accumulated answer from delta tokens */
  answer: string
  /** Retrieved search result chunks */
  chunks: SearchResult[]
  /** Related follow-up questions */
  relatedQuestions: string[]
  /** Whether the SSE stream is active */
  isStreaming: boolean
  /** Current pipeline status (retrieving, generating, etc.) */
  pipelineStatus: string
  /** Error message if any */
  error: string | null
  /** Document aggregation counts */
  docAggs: Array<{ doc_id: string; doc_name: string; count: number }>
}
