/**
 * @fileoverview TanStack Query hooks for the search feature.
 * Extracts query/mutation logic from the former useSearch hook.
 * @module features/search/api/searchQueries
 */

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { searchApi } from './searchApi'
import type { SearchResult, SearchFilters } from '../types/search.types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Return type for the useSearch hook.
 */
export interface UseSearchReturn {
  /** Array of search results */
  results: SearchResult[]
  /** Whether a search is in progress */
  isSearching: boolean
  /** AI-generated summary of results */
  summary: string | null
  /** Total count of matching results */
  totalResults: number
  /** Execute a search query */
  search: (query: string, filters?: SearchFilters) => void
  /** Clear all results */
  clearResults: () => void
  /** Current error message */
  error: string | null
  /** The last query that was searched */
  lastQuery: string
}

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Hook to perform searches across datasets.
 * Uses useMutation since search is user-triggered, not auto-fetched.
 * @returns {UseSearchReturn} Search state and control functions
 */
export function useSearch(): UseSearchReturn {
  // Track the last query for display purposes
  const [lastQuery, setLastQuery] = useState('')

  // Mutation for executing search requests
  const mutation = useMutation({
    mutationFn: async ({ query, filters }: { query: string; filters?: SearchFilters }) => {
      // If specific dataset IDs are provided, search within the first one
      // Otherwise use the global search endpoint
      if (filters?.dataset_ids && filters.dataset_ids.length === 1) {
        return searchApi.search(query, filters.dataset_ids[0]!, filters)
      }
      return searchApi.searchAll(query, filters)
    },
  })

  /**
   * @description Execute a search query with optional filters.
   * @param query - Search query text
   * @param filters - Optional search filters
   */
  const search = (query: string, filters?: SearchFilters) => {
    // Guard: require non-empty query
    if (!query.trim()) return

    // Track the query text locally
    setLastQuery(query)

    // Trigger the mutation
    mutation.mutate({ query, ...(filters ? { filters } : {}) })
  }

  /**
   * @description Clear all search results and reset state.
   */
  const clearResults = () => {
    mutation.reset()
    setLastQuery('')
  }

  return {
    results: mutation.data?.results ?? [],
    isSearching: mutation.isPending,
    summary: mutation.data?.summary ?? null,
    totalResults: mutation.data?.total ?? 0,
    search,
    clearResults,
    error: mutation.error?.message ?? null,
    lastQuery,
  }
}
