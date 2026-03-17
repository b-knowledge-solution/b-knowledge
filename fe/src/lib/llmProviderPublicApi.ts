/**
 * @fileoverview Public API for listing available model providers.
 * Used by config dialogs (chat, search) to populate model dropdowns.
 * @module lib/llmProviderPublicApi
 */
import { api } from '@/lib/api'

/**
 * @description A lightweight model provider record (no sensitive fields).
 */
export interface PublicModelProvider {
  /** Provider unique identifier */
  id: string
  /** Factory / vendor name (e.g. 'openai', 'ollama') */
  factory_name: string
  /** Model type: chat, embedding, rerank, tts, speech2text */
  model_type: string
  /** Model name within the factory */
  model_name: string
  /** Maximum token limit for the model (null if unknown) */
  max_tokens: number | null
  /** Whether this is the default model for its type */
  is_default: boolean
  /** Whether the model supports vision input */
  vision?: boolean
}

/**
 * @description Fetch active model providers, optionally filtered by type.
 * @param {string} [type] - Filter by model_type: 'chat', 'embedding', 'rerank', 'tts', 'speech2text'
 * @returns {Promise<PublicModelProvider[]>} List of matching providers
 */
export function listModels(type?: string): Promise<PublicModelProvider[]> {
  // Build query string with optional type filter
  const params = type ? `?type=${encodeURIComponent(type)}` : ''
  return api.get<PublicModelProvider[]>(`/api/models${params}`)
}
