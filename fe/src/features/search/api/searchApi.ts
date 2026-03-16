/**
 * @fileoverview API functions for the dataset search feature.
 * @module features/ai/api/searchApi
 */

import { api } from '@/lib/api'
import type {
  SearchFilters,
  SearchResponse,
  SearchApp,
  SearchAppAccessEntry,
  CreateSearchAppPayload,
  RetrievalTestResponse,
} from '../types/search.types'

/** Base URL for RAG search endpoints */
const BASE_URL = '/api/rag'

export const searchApi = {
  /**
   * Search across datasets using the RAG search endpoint.
   * @param query - Search query text
   * @param datasetId - Dataset to search within
   * @param filters - Optional search filters
   * @returns Search response with results and optional summary
   */
  search: async (
    query: string,
    datasetId: string,
    filters?: SearchFilters,
  ): Promise<SearchResponse> => {
    return api.post<SearchResponse>(`${BASE_URL}/datasets/${datasetId}/search`, {
      query,
      ...filters,
    })
  },

  /**
   * Search across multiple datasets.
   * @param query - Search query text
   * @param filters - Search filters including dataset_ids
   * @returns Search response with results and optional summary
   */
  searchAll: async (
    query: string,
    filters?: SearchFilters,
  ): Promise<SearchResponse> => {
    return api.post<SearchResponse>(`${BASE_URL}/search`, {
      query,
      ...filters,
    })
  },

  /**
   * List available datasets for search scope selection.
   * @returns Array of datasets with id and name
   */
  listDatasets: async (): Promise<{ id: string; name: string; description?: string }[]> => {
    return api.get<{ id: string; name: string; description?: string }[]>(`${BASE_URL}/datasets`)
  },

  /**
   * Send a search query with SSE streaming for AI answer generation.
   * Returns the raw Response for the caller to consume as a ReadableStream.
   * @param searchAppId - Search application ID
   * @param query - Search query text
   * @param filters - Optional search filters
   * @returns Raw fetch Response with SSE body
   */
  askSearch: async (
    searchAppId: string,
    query: string,
    filters?: SearchFilters,
    signal?: AbortSignal,
  ): Promise<Response> => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || ''
    const url = `${apiBase}/api/search/apps/${searchAppId}/ask`

    // Use raw fetch for streaming support
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
   * Fetch related search questions for a given query.
   * @param searchAppId - Search application ID
   * @param query - Search query text
   * @returns Array of related questions
   */
  fetchRelatedQuestions: async (
    searchAppId: string,
    query: string,
  ): Promise<{ questions: string[] }> => {
    return api.post<{ questions: string[] }>(
      `/api/search/apps/${searchAppId}/related-questions`,
      { query },
    )
  },

  // ============================================================================
  // Search App CRUD
  // ============================================================================

  /**
   * List search apps with server-side pagination, search, and sorting.
   * @param params - Optional pagination and filter parameters
   * @returns Paginated response with data array and total count
   */
  listSearchApps: async (params?: {
    page?: number | undefined
    page_size?: number | undefined
    search?: string | undefined
    sort_by?: 'created_at' | 'name' | undefined
    sort_order?: 'asc' | 'desc' | undefined
  }): Promise<{ data: SearchApp[]; total: number }> => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.page_size) searchParams.set('page_size', String(params.page_size))
    if (params?.search) searchParams.set('search', params.search)
    if (params?.sort_by) searchParams.set('sort_by', params.sort_by)
    if (params?.sort_order) searchParams.set('sort_order', params.sort_order)
    const qs = searchParams.toString()
    return api.get<{ data: SearchApp[]; total: number }>(`/api/search/apps${qs ? `?${qs}` : ''}`)
  },

  /**
   * Create a new search app.
   * @param data - Search app creation payload
   * @returns The created search app
   */
  createSearchApp: async (data: CreateSearchAppPayload): Promise<SearchApp> => {
    return api.post<SearchApp>('/api/search/apps', data)
  },

  /**
   * Update an existing search app.
   * @param id - Search app identifier
   * @param data - Partial search app data to update
   * @returns The updated search app
   */
  updateSearchApp: async (id: string, data: Partial<CreateSearchAppPayload>): Promise<SearchApp> => {
    return api.put<SearchApp>(`/api/search/apps/${id}`, data)
  },

  /**
   * Delete a search app by ID.
   * @param id - Search app identifier
   */
  deleteSearchApp: async (id: string): Promise<void> => {
    return api.delete<void>(`/api/search/apps/${id}`)
  },

  // ============================================================================
  // Search App Access Control
  // ============================================================================

  /**
   * Get access entries (users and teams) for a search app.
   * @param appId - Search app identifier
   * @returns Array of access entries
   */
  getSearchAppAccess: async (appId: string): Promise<SearchAppAccessEntry[]> => {
    return api.get<SearchAppAccessEntry[]>(`/api/search/apps/${appId}/access`)
  },

  /**
   * Set access entries (users and teams) for a search app.
   * @param appId - Search app identifier
   * @param entries - Array of access entries to assign
   * @returns Updated access entries
   */
  setSearchAppAccess: async (appId: string, entries: SearchAppAccessEntry[]): Promise<SearchAppAccessEntry[]> => {
    return api.put<SearchAppAccessEntry[]>(`/api/search/apps/${appId}/access`, { entries })
  },

  /**
   * Fetch mind map data for a given query.
   * @param searchAppId - Search application ID
   * @param query - Search query text
   * @returns Mind map structure
   */
  fetchMindMap: async (
    searchAppId: string,
    query: string,
  ): Promise<{ mindmap: any }> => {
    return api.post<{ mindmap: any }>(
      `/api/search/apps/${searchAppId}/mindmap`,
      { query },
    )
  },

  // ============================================================================
  // Retrieval Test
  // ============================================================================

  /**
   * Run a retrieval test against a search app (dry-run, no LLM summary).
   * @param appId - Search application ID
   * @param query - Test query text
   * @param options - Optional retrieval parameters
   * @returns Paginated retrieval test results
   */
  retrievalTest: async (
    appId: string,
    query: string,
    options?: {
      top_k?: number
      similarity_threshold?: number
      vector_similarity_weight?: number
      search_method?: string
      doc_ids?: string[]
      page?: number
      page_size?: number
    },
  ): Promise<RetrievalTestResponse> => {
    return api.post<RetrievalTestResponse>(
      `/api/search/apps/${appId}/retrieval-test`,
      { query, ...options },
    )
  },
}
