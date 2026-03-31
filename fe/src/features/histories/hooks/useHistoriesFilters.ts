/**
 * @fileoverview Filter and search state management hook for admin histories.
 * Includes email, sourceName, and feedbackFilter fields not present in user-level history.
 *
 * @module features/histories/hooks/useHistoriesFilters
 */
import { useState } from 'react'
import type { FilterState } from '../types/histories.types'

/** Default empty filter state with feedbackFilter defaulting to 'all'. */
const EMPTY_FILTERS: FilterState = { email: '', startDate: '', endDate: '', sourceName: '', feedbackFilter: 'all' }

/**
 * Return type for useHistoriesFilters hook.
 */
export interface UseHistoriesFiltersReturn {
  searchQuery: string
  setSearchQuery: (value: string) => void
  executedSearchQuery: string
  filters: FilterState
  tempFilters: FilterState
  setTempFilters: (filters: FilterState) => void
  isFilterDialogOpen: boolean
  setIsFilterDialogOpen: (open: boolean) => void
  isFiltered: boolean
  handleSearch: (e: React.FormEvent) => void
  openFilterDialog: () => void
  handleApplyFilters: () => void
  handleResetFilters: () => void
}

/**
 * @description Manages search query, filter dialog, and filter state for admin histories.
 * Includes feedbackFilter for filtering sessions by feedback status.
 * @returns {UseHistoriesFiltersReturn} Filter state and handlers.
 */
export const useHistoriesFilters = (): UseHistoriesFiltersReturn => {
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [executedSearchQuery, setExecutedSearchQuery] = useState('')

  // Filter state
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [tempFilters, setTempFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false)

  // Derived: any filter active (including non-default feedbackFilter)
  const isFiltered = !!(
    filters.email ||
    filters.startDate ||
    filters.endDate ||
    filters.sourceName ||
    (filters.feedbackFilter && filters.feedbackFilter !== 'all')
  )

  /** Submit search — copy searchQuery to executedSearchQuery. */
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setExecutedSearchQuery(searchQuery)
  }

  /** Open filter dialog, sync temp filters from current filters. */
  const openFilterDialog = () => {
    setTempFilters(filters)
    setIsFilterDialogOpen(true)
  }

  /** Apply temp filters to actual filters and close dialog. */
  const handleApplyFilters = () => {
    setFilters(tempFilters)
    setIsFilterDialogOpen(false)
  }

  /** Reset all filters and close dialog. */
  const handleResetFilters = () => {
    setTempFilters(EMPTY_FILTERS)
    setFilters(EMPTY_FILTERS)
  }

  return {
    searchQuery,
    setSearchQuery,
    executedSearchQuery,
    filters,
    tempFilters,
    setTempFilters,
    isFilterDialogOpen,
    setIsFilterDialogOpen,
    isFiltered,
    handleSearch,
    openFilterDialog,
    handleApplyFilters,
    handleResetFilters,
  }
}
