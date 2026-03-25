/**
 * @fileoverview Type definitions for the dataset chat feature.
 * @module features/chat/types/chat.types
 */

import type { MetadataFilter, MetadataFilterCondition } from '@/components/metadata-filter/metadata-filter.types'
export type { MetadataFilter, MetadataFilterCondition }

// ============================================================================
// Chat Message Types
// ============================================================================

/**
 * @description A single chat message in a conversation.
 */
export interface ChatMessage {
  /** Unique message identifier */
  id: string
  /** Role of the message sender */
  role: 'user' | 'assistant'
  /** Message text content (may contain markdown) */
  content: string
  /** ISO timestamp of when the message was sent */
  timestamp: string
  /** Optional document references attached to the assistant message */
  reference?: ChatReference | undefined
  /** Optional user feedback on the assistant message */
  feedback?: { thumbup: boolean; text?: string } | undefined
}

// ============================================================================
// Reference / Citation Types
// ============================================================================

/**
 * @description References returned alongside an assistant answer.
 */
export interface ChatReference {
  /** Individual document chunks that were retrieved */
  chunks: ChatChunk[]
  /** Aggregated document-level summary */
  doc_aggs: DocAggregate[]
}

/**
 * @description A single retrieved document chunk.
 */
export interface ChatChunk {
  /** Chunk unique identifier */
  chunk_id: string
  /** Chunk text content (may include weight markers) */
  content_with_weight: string
  /** Parent document identifier */
  doc_id: string
  /** Document file name keyword */
  docnm_kwd: string
  /** Page number within the document */
  page_num_int: number
  /** Position index within the page */
  position_int: number
  /** Position arrays for PDF highlighting: [[page, x1, x2, y1, y2], ...] */
  positions?: number[][] | undefined
  /** Relevance score (0-1) */
  score?: number
  /** Image ID for chunks containing extracted images (format: "bucket-objectName") */
  img_id?: string | undefined
  /** Knowledge base ID this chunk belongs to */
  kb_id?: string | undefined
}

/**
 * @description Aggregated counts per document.
 */
export interface DocAggregate {
  /** Document identifier */
  doc_id: string
  /** Human-readable document name */
  doc_name: string
  /** Number of chunks retrieved from this document */
  count: number
}

// ============================================================================
// Prompt Variable Types
// ============================================================================

/**
 * @description A custom prompt variable defined by admin for template substitution.
 * Variables use {key} placeholders in the system prompt.
 */
export interface PromptVariable {
  /** Variable key in code format (e.g. "language", "audience") */
  key: string
  /** Human-readable description of the variable */
  description?: string | undefined
  /** Whether this variable is optional (user does not need to fill it) */
  optional: boolean
  /** Default value used when user does not provide one */
  default_value?: string | undefined
}

// ============================================================================
// Conversation Types
// ============================================================================

/**
 * @description A conversation session containing messages.
 */
export interface Conversation {
  /** Conversation unique identifier */
  id: string
  /** Parent dialog identifier */
  dialog_id: string
  /** Display name of the conversation */
  name: string
  /** Array of messages in this conversation */
  messages: ChatMessage[]
  /** ISO timestamp of creation */
  created_at: string
  /** ISO timestamp of last update */
  updated_at: string
}

// ============================================================================
// Chat Assistant Types
// ============================================================================

/**
 * @description LLM sampling parameters for a chat assistant.
 */
export interface ChatLlmSetting {
  /** LLM temperature (0-2) */
  temperature?: number | undefined
  /** Whether temperature is enabled */
  temperatureEnabled?: boolean | undefined
  /** Nucleus sampling parameter (0-1) */
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
  /** Maximum output length */
  max_tokens?: number | undefined
  /** Whether max_tokens is enabled */
  maxTokensEnabled?: boolean | undefined
}

/**
 * @description Prompt and retrieval configuration for an assistant.
 */
export interface PromptConfig {
  /** System-level instruction */
  system?: string | undefined
  /** Welcome message displayed at start (string or per-locale map) */
  prologue?: string | Record<string, string> | undefined
  /** Number of top documents to retrieve */
  top_n?: number | undefined
  /** Number of top keywords / reranker input size */
  top_k?: number | undefined
  /** LLM sampling parameters */
  llm_setting?: ChatLlmSetting | undefined
  /** Custom prompt variables for template substitution */
  variables?: PromptVariable[] | undefined
  /** Enable multi-turn query refinement */
  refine_multiturn?: boolean | undefined
  /** Enable cross-language query expansion (comma-separated codes) */
  cross_languages?: string | undefined
  /** Enable keyword extraction from query */
  keyword?: boolean | undefined
  /** Include source citations in response */
  quote?: boolean | undefined
  /** Response when no relevant content found (string or per-locale map) */
  empty_response?: string | Record<string, string> | undefined
  /** Enable table of contents enhancement */
  toc_enhance?: boolean | undefined
  /** Tavily API key for web search */
  tavily_api_key?: string | undefined
  /** Enable knowledge graph retrieval */
  use_kg?: boolean | undefined
  /** Rerank model provider ID */
  rerank_id?: string | undefined
  /** Enable reasoning / deep thinking mode */
  reasoning?: boolean | undefined
  /** Allow cross-dataset search using RBAC-accessible datasets */
  allow_rbac_datasets?: boolean | undefined
  /** Enable text-to-speech */
  tts?: boolean | undefined
  /** Chat language preference */
  language?: string | undefined
  /** Similarity threshold for chunk retrieval (0-1) */
  similarity_threshold?: number | undefined
  /** Weight for vector search vs keyword search (0-1) */
  vector_similarity_weight?: number | undefined
  /** Metadata filter for document filtering */
  metadata_filter?: MetadataFilter | undefined
}

/**
 * @description A chat assistant configuration.
 */
export interface ChatAssistant {
  /** Assistant unique identifier */
  id: string
  /** Display name */
  name: string
  /** Optional description */
  description?: string | undefined
  /** Knowledge base IDs linked to this assistant */
  kb_ids: string[]
  /** LLM model identifier */
  llm_id?: string | undefined
  /** Whether the assistant is publicly accessible to all users */
  is_public?: boolean | undefined
  /** Display name of the user who created this assistant */
  created_by?: string | undefined
  /** Prompt and retrieval configuration */
  prompt_config: PromptConfig
  /** ISO timestamp of creation */
  created_at: string
  /** ISO timestamp of last update */
  updated_at: string
}

// ============================================================================
// API Payload Types
// ============================================================================

/**
 * @description Payload for creating a new assistant.
 */
export interface CreateAssistantPayload {
  name: string
  description?: string | undefined
  kb_ids: string[]
  llm_id?: string | undefined
  /** Whether the assistant is publicly accessible to all users */
  is_public?: boolean | undefined
  prompt_config?: Partial<PromptConfig> | undefined
}

// ============================================================================
// Assistant Access Control Types
// ============================================================================

/**
 * @description An access entry linking a user or team to an assistant.
 */
export interface ChatAssistantAccessEntry {
  /** Type of entity granted access */
  entity_type: 'user' | 'team'
  /** Unique identifier of the user or team */
  entity_id: string
  /** Human-readable display name */
  display_name?: string | undefined
}

/**
 * @description Payload for creating a new conversation.
 */
export interface CreateConversationPayload {
  dialog_id: string
  name?: string
}

/**
 * @description Options for sending a chat message.
 */
export interface SendMessageOptions {
  /** Custom variable values for template substitution */
  variables?: Record<string, string> | undefined
  /** Enable deep thinking / reasoning mode */
  reasoning?: boolean | undefined
  /** Enable internet search via web search API */
  useInternet?: boolean | undefined
  /** File attachment IDs from chat file uploads */
  file_ids?: string[] | undefined
}

/**
 * @description Payload for sending a chat message.
 */
export interface SendMessagePayload {
  /** The user question */
  content: string
  /** Conversation identifier */
  conversation_id: string
  /** Dialog identifier */
  dialog_id: string
  /** Custom variable values for template substitution */
  variables?: Record<string, string> | undefined
  /** Enable deep thinking / reasoning mode */
  reasoning?: boolean | undefined
  /** Enable internet search via web search API */
  use_internet?: boolean | undefined
}

// ============================================================================
// Deep Research SSE Event Types
// ============================================================================

/**
 * @description Structured SSE event for Deep Research pipeline status updates.
 * These events provide sub-query progress, budget warnings, and exhaustion signals
 * during the recursive deep research process.
 */
export interface DeepResearchEvent {
  /** Type of deep research sub-event */
  subEvent: 'subquery_start' | 'subquery_result' | 'budget_warning' | 'budget_exhausted' | 'info'
  /** The sub-query text being researched */
  query?: string | undefined
  /** Current recursion depth */
  depth?: number | undefined
  /** Sub-query index (1-based) within current depth */
  index?: number | undefined
  /** Total sub-queries at this depth */
  total?: number | undefined
  /** Number of chunks found for this sub-query */
  chunks?: number | undefined
  /** Human-readable status message */
  message?: string | undefined
  /** Tokens consumed so far */
  tokensUsed?: number | undefined
  /** Maximum token budget */
  tokensMax?: number | undefined
  /** LLM calls consumed so far */
  callsUsed?: number | undefined
  /** Maximum LLM call budget */
  callsMax?: number | undefined
  /** Number of completed sub-queries (for budget_exhausted) */
  completed?: number | undefined
}
