/**
 * @fileoverview API functions for the search embed/share feature.
 * These endpoints are used by the standalone SearchSharePage (iframe embed)
 * and do not require authentication — they use embed tokens instead.
 * @module features/search/api/searchEmbedApi
 */

import { api } from '@/lib/api'
import type {
  EmbedAppConfig,
  SearchResult,
} from '../types/search.types'

/** Base URL for search embed endpoints */
const BASE = '/api/search/embed'

/**
 * @description API client for search app embed (public, token-authenticated) endpoints.
 * Used by SearchSharePage to load config, stream answers, and paginate results.
 */
export const searchEmbedApi = {
  /**
   * @description Fetch the embed app configuration for a given token.
   * Returns app name, description, avatar, and search config.
   * @param {string} token - Embed token string
   * @returns {Promise<EmbedAppConfig>} Public embed app configuration
   */
  async getConfig(token: string): Promise<EmbedAppConfig> {
    return api.get<EmbedAppConfig>(`${BASE}/${token}/config`)
  },

  /**
   * @description Send a streaming search query via SSE using an embed token.
   * Returns the raw Response for the caller to consume as a ReadableStream.
   * Uses fetch() directly (not apiClient) since we need the raw Response for SSE.
   * @param {string} token - Embed token string
   * @param {string} query - Search query text
   * @param {Record<string, unknown>} filters - Search filters
   * @param {AbortSignal} [signal] - Optional abort signal to cancel the request
   * @returns {Promise<Response>} Raw fetch Response with SSE body
   */
  async askSearch(
    token: string,
    query: string,
    filters: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Response> {
    const apiBase = import.meta.env.VITE_API_BASE_URL || ''
    const url = `${apiBase}${BASE}/${token}/ask`

    // Use raw fetch for streaming support — apiClient parses JSON which breaks SSE
    return fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ query, ...filters }),
      ...(signal ? { signal } : {}),
    })
  },

  /**
   * @description Execute a non-streaming paginated search query using an embed token.
   * Used for page 2+ results after the initial streaming search.
   * @param {string} token - Embed token string
   * @param {string} query - Search query text
   * @param {Record<string, unknown>} options - Search and pagination options
   * @returns {Promise<{ chunks: SearchResult[]; total: number; doc_aggs?: Array<{ doc_id: string; doc_name: string; count: number }> }>} Search results
   */
  async search(
    token: string,
    query: string,
    options: Record<string, unknown>,
  ): Promise<{
    chunks: SearchResult[]
    total: number
    doc_aggs?: Array<{ doc_id: string; doc_name: string; count: number }>
  }> {
    return api.post(`${BASE}/${token}/search`, { query, ...options })
  },

  /**
   * @description Fetch related question suggestions for a given query.
   * @param {string} token - Embed token string
   * @param {string} query - Search query text
   * @returns {Promise<string[]>} Array of related question strings
   */
  async fetchRelatedQuestions(token: string, query: string): Promise<string[]> {
    const result = await api.post<{ questions: string[] }>(
      `${BASE}/${token}/related-questions`,
      { query },
    )
    return result.questions
  },

  /**
   * @description Fetch mind map data for a given query.
   * @param {string} token - Embed token string
   * @param {string} query - Search query text
   * @returns {Promise<{ mindmap: unknown }>} Mind map structure
   */
  async fetchMindMap(token: string, query: string): Promise<{ mindmap: unknown }> {
    return api.post<{ mindmap: unknown }>(
      `${BASE}/${token}/mindmap`,
      { query },
    )
  },
}
