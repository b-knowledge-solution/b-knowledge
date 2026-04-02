/**
 * @fileoverview Raw HTTP API calls for the memory feature.
 * Provides typed functions for memory pool CRUD, message listing, search,
 * and message lifecycle operations (forget, delete).
 * No React hooks here -- those live in memoryQueries.ts.
 *
 * @module features/memory/api/memoryApi
 */

import { api } from '@/lib/api'
import type {
  Memory,
  MemoryMessage,
  MemorySearchResult,
  CreateMemoryDto,
  UpdateMemoryDto,
} from '../types/memory.types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Paginated response for memory messages
 */
interface MemoryMessageListResponse {
  items: MemoryMessage[]
  total: number
}

/**
 * @description Query parameters for listing memory messages
 */
interface ListMemoryMessagesParams {
  page?: number
  page_size?: number
  keyword?: string
  message_type?: number
}

// ============================================================================
// Memory API
// ============================================================================

/**
 * @description Raw HTTP API calls for memory pool management including CRUD,
 * message operations, and semantic search
 */
export const memoryApi = {
  // --------------------------------------------------------------------------
  // Pool CRUD
  // --------------------------------------------------------------------------

  /**
   * @description List all memory pools for the current tenant
   * @returns {Promise<Memory[]>} Array of memory pool records
   */
  getMemories: () =>
    api.get<Memory[]>('/api/memory'),

  /**
   * @description Fetch a single memory pool by its UUID
   * @param {string} id - Memory pool UUID
   * @returns {Promise<Memory>} Memory pool record
   */
  getMemory: (id: string) =>
    api.get<Memory>(`/api/memory/${id}`),

  /**
   * @description Create a new memory pool with name and optional configuration
   * @param {CreateMemoryDto} data - Memory pool creation payload
   * @returns {Promise<Memory>} Created memory pool record
   */
  createMemory: (data: CreateMemoryDto) =>
    api.post<Memory>('/api/memory', data),

  /**
   * @description Update an existing memory pool's configuration
   * @param {string} id - Memory pool UUID
   * @param {UpdateMemoryDto} data - Fields to update
   * @returns {Promise<Memory>} Updated memory pool record
   */
  updateMemory: (id: string, data: UpdateMemoryDto) =>
    api.put<Memory>(`/api/memory/${id}`, data),

  /**
   * @description Permanently delete a memory pool and all its stored messages
   * @param {string} id - Memory pool UUID
   * @returns {Promise<void>}
   */
  deleteMemory: (id: string) =>
    api.delete(`/api/memory/${id}`),

  // --------------------------------------------------------------------------
  // Messages
  // --------------------------------------------------------------------------

  /**
   * @description List messages stored in a memory pool with pagination and filtering
   * @param {string} id - Memory pool UUID
   * @param {ListMemoryMessagesParams} [params] - Pagination and filter parameters
   * @returns {Promise<MemoryMessageListResponse>} Paginated message list with total count
   */
  getMemoryMessages: (id: string, params?: ListMemoryMessagesParams) => {
    // Build query string from optional filter parameters
    const qs = new URLSearchParams()
    if (params?.page) qs.set('page', String(params.page))
    if (params?.page_size) qs.set('page_size', String(params.page_size))
    if (params?.keyword) qs.set('keyword', params.keyword)
    if (params?.message_type) qs.set('message_type', String(params.message_type))
    const query = qs.toString()
    return api.get<MemoryMessageListResponse>(
      `/api/memory/${id}/messages${query ? '?' + query : ''}`
    )
  },

  /**
   * @description Search memory messages using semantic similarity
   * @param {string} id - Memory pool UUID
   * @param {string} query - Natural language search query
   * @param {number} [topK] - Maximum number of results to return
   * @returns {Promise<MemorySearchResult[]>} Ranked search results with relevance scores
   */
  searchMemoryMessages: (id: string, query: string, topK?: number) =>
    api.post<MemorySearchResult[]>(`/api/memory/${id}/search`, {
      query,
      ...(topK !== undefined ? { top_k: topK } : {}),
    }),

  /**
   * @description Permanently delete a single message from a memory pool
   * @param {string} id - Memory pool UUID
   * @param {string} messageId - Message UUID to delete
   * @returns {Promise<void>}
   */
  deleteMemoryMessage: (id: string, messageId: string) =>
    api.delete(`/api/memory/${id}/messages/${messageId}`),

  /**
   * @description Mark a memory message as forgotten (soft-delete with forget_at timestamp)
   * @param {string} id - Memory pool UUID
   * @param {string} messageId - Message UUID to forget
   * @returns {Promise<void>}
   */
  forgetMemoryMessage: (id: string, messageId: string) =>
    api.put(`/api/memory/${id}/messages/${messageId}/forget`),

  // --------------------------------------------------------------------------
  // Import
  // --------------------------------------------------------------------------

  /**
   * @description Import chat history from an existing conversation into a memory pool
   * @param {string} memoryId - Memory pool UUID to import into
   * @param {string} sessionId - Chat conversation session ID to import from
   * @returns {Promise<{ imported: number }>} Count of imported memory messages
   */
  importChatHistory: (memoryId: string, sessionId: string) =>
    api.post<{ imported: number }>(`/api/memory/${memoryId}/import`, {
      session_id: sessionId,
    }),

  /**
   * @description List available chat conversations for import selection
   * @returns {Promise<Array<{ id: string; name: string; created_at: string }>>} Chat sessions
   */
  getChatSessions: () =>
    api.get<Array<{ id: string; name: string; created_at: string }>>('/api/chat/conversations'),
}
