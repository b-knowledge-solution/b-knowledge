/**
 * @fileoverview API client for the embeddable search widget.
 * Uses the dual-mode widget auth client (internal session or external token).
 *
 * @module features/search-widget/searchWidgetApi
 */

import { createWidgetApiClient, type WidgetApiConfig } from '@/lib/widgetAuth'

/**
 * @description Search app info returned by the embed /info endpoint.
 */
export interface SearchWidgetAppInfo {
  /** Display name of the search app */
  name: string
  /** Optional description */
  description?: string
}

/**
 * @description A single search result chunk returned by the widget API.
 */
export interface SearchWidgetChunk {
  /** Chunk unique identifier */
  chunk_id: string
  /** Text content of the chunk */
  text: string
  /** Parent document identifier */
  doc_id: string
  /** Document file name */
  doc_name: string
  /** Relevance score */
  score: number
}

/**
 * @description Creates a search widget API client with dual-mode auth support.
 * @param {WidgetApiConfig} config - Widget configuration (token for external, empty for internal)
 * @returns {object} API methods for the search widget (getInfo, askSearch)
 */
export function createSearchWidgetApi(config: WidgetApiConfig) {
  const client = createWidgetApiClient('search', config)

  return {
    /** The auth mode being used */
    mode: client.mode,

    /**
     * Get search app info (name, description).
     * @param appId - App ID (required for internal mode, ignored for external)
     */
    getInfo: (appId?: string) =>
      client.get<SearchWidgetAppInfo>('info', appId),

    /**
     * Stream an AI-generated search answer via SSE.
     * @param query - Search query string
     * @param options - Optional search parameters
     * @param appId - App ID (required for internal mode)
     * @returns Raw Response for SSE consumption
     */
    askSearch: (
      query: string,
      options?: {
        top_k?: number
        method?: string
        similarity_threshold?: number
      },
      appId?: string,
    ) =>
      client.postStream('ask', { query, ...options }, appId),
  }
}
