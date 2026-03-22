/**
 * @fileoverview Type definitions for the API Keys feature.
 * @module features/api-keys/types
 */

/**
 * @description Shape of an API key record returned from the backend.
 *   Note: key_hash is never returned; plaintext_key is only present on creation.
 */
export interface ApiKey {
  id: string
  user_id: string
  name: string
  key_prefix: string
  scopes: string[]
  is_active: boolean
  last_used_at: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

/**
 * @description Response from the create API key endpoint.
 *   Includes the one-time plaintext key that must be copied immediately.
 */
export interface ApiKeyCreateResponse extends ApiKey {
  plaintext_key: string
}

/**
 * @description Payload for creating a new API key
 */
export interface CreateApiKeyDto {
  name: string
  scopes: string[]
  expires_at?: string | null
}

/**
 * @description Payload for updating an API key
 */
export interface UpdateApiKeyDto {
  name?: string
  scopes?: string[]
  is_active?: boolean
}

/**
 * @description Available API key scopes
 */
export const API_KEY_SCOPES = ['chat', 'search', 'retrieval'] as const
export type ApiKeyScope = typeof API_KEY_SCOPES[number]
