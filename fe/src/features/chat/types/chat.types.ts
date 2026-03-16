/**
 * @fileoverview Type definitions for the dataset chat feature.
 * @module features/chat/types/chat.types
 */

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
 * @description Prompt configuration for an assistant.
 */
export interface PromptConfig {
  /** System-level instruction */
  system?: string | undefined
  /** Welcome message displayed at start */
  prologue?: string | undefined
  /** Number of top documents to retrieve */
  top_n?: number | undefined
  /** Number of top keywords */
  top_k?: number | undefined
  /** LLM temperature (0-1) */
  temperature?: number | undefined
  /** Maximum tokens for the response */
  max_tokens?: number | undefined
  /** Custom prompt variables for template substitution */
  variables?: PromptVariable[] | undefined
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
