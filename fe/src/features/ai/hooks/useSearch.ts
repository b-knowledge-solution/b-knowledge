/**
 * @fileoverview Hook for dataset search functionality.
 * @module features/ai/hooks/useSearch
 */

import { useState, useCallback } from 'react'
import { searchApi } from '../api/searchApi'
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
 * @returns Search state and control functions
 */
export function useSearch(): UseSearchReturn {
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [totalResults, setTotalResults] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [lastQuery, setLastQuery] = useState('')

  /**
   * Execute a search query with optional filters.
   * @param query - Search query text
   * @param filters - Optional search filters
   */
  const search = useCallback(async (query: string, filters?: SearchFilters) => {
    // Guard: require non-empty query
    if (!query.trim()) return

    setIsSearching(true)
    setError(null)
    setLastQuery(query)

    try {
      // If specific dataset IDs are provided, search within the first one
      // Otherwise use the global search endpoint
      let response
      if (filters?.dataset_ids && filters.dataset_ids.length === 1) {
        response = await searchApi.search(query, filters.dataset_ids[0]!, filters)
      } else {
        response = await searchApi.searchAll(query, filters)
      }

      setResults(response.results)
      setSummary(response.summary || null)
      setTotalResults(response.total)
    } catch (err: any) {
      setError(err.message || 'Search failed')
      setResults([])
      setSummary(null)
      setTotalResults(0)
    } finally {
      setIsSearching(false)
    }
  }, [])

  /**
   * Clear all search results and reset state.
   */
  const clearResults = useCallback(() => {
    setResults([])
    setSummary(null)
    setTotalResults(0)
    setError(null)
    setLastQuery('')
  }, [])

  return {
    results,
    isSearching,
    summary,
    totalResults,
    search,
    clearResults,
    error,
    lastQuery,
  }
}
