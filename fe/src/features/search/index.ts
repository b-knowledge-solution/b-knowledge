/**
 * @fileoverview Barrel file for the Search feature.
 * Exports pages, types, hooks, and components for external consumption.
 * @module features/search
 */

// Pages
export { default as SearchPage } from './pages/SearchPage'
export { default as SearchAppManagementPage } from './pages/SearchAppManagementPage'

// Components
export { default as SearchBar } from './components/SearchBar'
export { default as SearchResults } from './components/SearchResults'
export { default as SearchResultCard } from './components/SearchResultCard'
export { default as SearchFilters } from './components/SearchFilters'
export { default as SearchAppAccessDialog } from './components/SearchAppAccessDialog'
export { default as SearchAppConfig } from './components/SearchAppConfig'

// Query hooks (TanStack Query)
export { useSearch } from './api/searchQueries'

// Hooks (UI/streaming)
export { useSearchStream } from './hooks/useSearchStream'

// Types
export type {
  SearchResult,
  SearchFilters as SearchFiltersType,
  SearchResponse,
  SearchApp,
  SearchAppAccessEntry,
  CreateSearchAppPayload,
} from './types/search.types'
