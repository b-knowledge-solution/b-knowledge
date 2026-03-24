/**
 * @fileoverview Barrel file for the Histories feature.
 * Exposes pages, query hooks, and UI hooks for external consumption.
 * @module features/histories
 */

// Pages
export { default as HistoriesPage } from './pages/HistoriesPage'

// Query hooks (TanStack Query)
export { useHistoriesData } from './api/historiesQueries'
export type { UseHistoriesDataReturn } from './api/historiesQueries'

// UI hooks
export { useHistoriesFilters } from './hooks/useHistoriesFilters'
