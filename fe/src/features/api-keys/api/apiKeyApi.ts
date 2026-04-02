/**
 * @fileoverview Raw HTTP calls for the API Keys feature.
 *   Wraps backend endpoints at /api/external/api-keys.
 * @module features/api-keys/api/apiKeyApi
 */

import { api } from '@/lib/api'
import type {
  ApiKey,
  ApiKeyCreateResponse,
  CreateApiKeyDto,
  UpdateApiKeyDto,
} from '../types/apiKey.types'

export const apiKeyApi = {
  /**
   * @description Fetch all API keys for the authenticated user
   * @returns {Promise<ApiKey[]>} Array of API key records (without key_hash)
   */
  list: async (): Promise<ApiKey[]> =>
    api.get<ApiKey[]>('/api/external/api-keys'),

  /**
   * @description Create a new API key. The response includes the one-time plaintext key.
   * @param {CreateApiKeyDto} data - Name, scopes, and optional expiration
   * @returns {Promise<ApiKeyCreateResponse>} Created key record with plaintext_key
   */
  create: async (data: CreateApiKeyDto): Promise<ApiKeyCreateResponse> =>
    api.post<ApiKeyCreateResponse>('/api/external/api-keys', data),

  /**
   * @description Update an API key's mutable fields
   * @param {string} id - UUID of the API key
   * @param {UpdateApiKeyDto} data - Fields to update
   * @returns {Promise<ApiKey>} Updated key record
   */
  update: async (id: string, data: UpdateApiKeyDto): Promise<ApiKey> =>
    api.patch<ApiKey>(`/api/external/api-keys/${id}`, data),

  /**
   * @description Permanently delete an API key
   * @param {string} id - UUID of the API key
   * @returns {Promise<void>}
   */
  remove: async (id: string): Promise<void> =>
    api.delete(`/api/external/api-keys/${id}`),
}
