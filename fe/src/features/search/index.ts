/**
 * @fileoverview Barrel file for the Search feature.
 * Exports pages, types, hooks, and components for external consumption.
 * @module features/search
 */

// Pages
export { default as SearchPage } from './pages/SearchPage'
export { default as SearchAppManagementPage } from './pages/SearchAppManagementPage'
export { SearchSharePage } from './pages/SearchSharePage'

// Components
export { default as SearchBar } from './components/SearchBar'
export { default as SearchResults } from './components/SearchResults'
export { default as SearchResultCard } from './components/SearchResultCard'
export { default as SearchFilters } from './components/SearchFilters'
export { SearchHighlight } from './components/SearchHighlight'
export { default as SearchAppAccessDialog } from './components/SearchAppAccessDialog'
export { default as SearchAppConfig } from './components/SearchAppConfig'
export { SearchCrossLanguage } from './components/SearchCrossLanguage'
export { SearchRetrievalTest } from './components/SearchRetrievalTest'

// API (embed)
export { searchEmbedApi } from './api/searchEmbedApi'

// Query hooks (TanStack Query)
export { useSearch, useSearchApps, useAccessibleSearchApps } from './api/searchQueries'

// Hooks (UI/streaming)
export { useSearchStream } from './hooks/useSearchStream'

// Types
export type {
  SearchResult,
  SearchFilters as SearchFiltersType,
  SearchResponse,
  SearchApp,
  SearchAppConfig as SearchAppConfigType,
  SearchAppAccessEntry,
  CreateSearchAppPayload,
  SearchLlmSetting,
  RetrievalTestChunk,
  RetrievalTestResponse,
} from './types/search.types'
