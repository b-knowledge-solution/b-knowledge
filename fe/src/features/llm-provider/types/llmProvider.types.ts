/**
 * @fileoverview TypeScript types for the LLM Provider feature.
 * @module features/llm-provider/types/llmProvider.types
 */

// ============================================================================
// Domain Model
// ============================================================================

/**
 * Represents an LLM model provider configuration.
 * @description Maps to the `model_providers` table in the database.
 */
export interface ModelProvider {
  /** Unique identifier */
  id: string
  /** Provider factory name (e.g., "OpenAI", "Anthropic") */
  factory_name: string
  /** Model type — "chat" for conversational, "embedding" for vector models */
  model_type: string
  /** Specific model name (e.g., "gpt-4o", "text-embedding-3-small") */
  model_name: string
  /** API key (masked as "***" in GET responses) */
  api_key?: string | null
  /** Custom endpoint URL for the provider */
  api_base?: string | null
  /** Maximum token limit for this model */
  max_tokens?: number | null
  /** Whether this chat model supports vision (image understanding) */
  vision?: boolean
  /** Provider status — "active" or "deleted" */
  status: string
  /** Whether this is the default provider for its model type */
  is_default: boolean
  /** Whether this provider is system-managed (via LOCAL_EMBEDDING_MODEL env var) */
  is_system?: boolean
  /** User who created this record */
  created_by?: string | null
  /** User who last updated this record */
  updated_by?: string | null
  /** ISO timestamp of creation */
  created_at: string
  /** ISO timestamp of last update */
  updated_at: string
}

// ============================================================================
// Model Type Constants
// ============================================================================

/** All supported model types. Vision-capable chat models get a paired `image2text` row. */
export const MODEL_TYPES = ['chat', 'embedding', 'image2text', 'speech2text', 'rerank', 'tts'] as const

/** Union type for all supported model types */
export type ModelType = typeof MODEL_TYPES[number]

// ============================================================================
// Factory Preset Types
// ============================================================================

/**
 * A single model within a factory preset.
 * @description Defines a pre-configured model with its type and token limit.
 */
export interface PresetModel {
  /** Model identifier (e.g., "gpt-4o") */
  model_name: string
  /** Model type category */
  model_type: string
  /** Maximum token limit, or null if unlimited/unknown */
  max_tokens: number | null
  /** Whether this model supports vision (only relevant for chat type) */
  vision?: boolean
}

/**
 * Factory preset configuration returned by the API.
 * @description Represents a provider factory with its available models.
 */
export interface FactoryPreset {
  /** Factory name (e.g., "OpenAI", "Anthropic") */
  name: string
  /** Comma-separated tags describing the factory */
  tags: string
  /** Pre-defined models available for this factory */
  models: PresetModel[]
}

// ============================================================================
// DTOs
// ============================================================================

/**
 * Data transfer object for creating a new provider.
 * @description Omits server-managed fields (id, timestamps, audit fields).
 */
export interface CreateProviderDTO {
  factory_name: string
  model_type: string
  model_name: string
  api_key?: string | null
  api_base?: string | null
  max_tokens?: number | null
  is_default?: boolean
  vision?: boolean
}

/**
 * Data transfer object for updating an existing provider.
 * @description All fields are optional — only changed fields should be sent.
 */
export interface UpdateProviderDTO {
  factory_name?: string
  model_type?: string
  model_name?: string
  api_key?: string | null
  api_base?: string | null
  max_tokens?: number | null
  is_default?: boolean
  vision?: boolean
}

