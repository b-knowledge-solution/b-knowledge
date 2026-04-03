/**
 * @fileoverview Hook for managing audit filters via URL search params.
 * Replaces AuditFilterContext with URL-driven state for bookmarkable,
 * shareable filter configurations.
 * @module features/audit/hooks/useAuditFilters
 */
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AuditFilters } from '../types/audit.types'
import { DEFAULT_AUDIT_FILTERS } from '../types/audit.types'

// ============================================================================
// URL Param Keys
// ============================================================================

/** Map of filter keys to their URL search param names */
const PARAM_KEYS: Record<keyof AuditFilters, string> = {
  search: 'search',
  action: 'action',
  resourceType: 'resourceType',
  startDate: 'startDate',
  endDate: 'endDate',
}

// ============================================================================
// Return Type
// ============================================================================

/**
 * @description Return type for the useAuditFilters hook.
 */
export interface UseAuditFiltersReturn {
  /** Current filter state derived from URL params */
  filters: AuditFilters
  /** Update a single filter field (writes to URL) */
  setFilter: (key: keyof AuditFilters, value: string) => void
  /** Reset all filters to defaults (clears URL params) */
  clearFilters: () => void
  /** Whether the filter panel is visible */
  showFilters: boolean
  /** Toggle filter panel visibility */
  toggleFilters: () => void
  /** Whether any filter has a non-empty value */
  hasActiveFilters: boolean
}

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Hook that reads/writes audit filter state from URL search params.
 * Filter panel visibility is kept in local state since it is UI-only.
 *
 * @returns {UseAuditFiltersReturn} Filter state and handlers.
 */
export function useAuditFilters(): UseAuditFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)

  // Derive filter values from current URL search params
  const filters: AuditFilters = {
    search: searchParams.get(PARAM_KEYS.search) || DEFAULT_AUDIT_FILTERS.search,
    action: searchParams.get(PARAM_KEYS.action) || DEFAULT_AUDIT_FILTERS.action,
    resourceType: searchParams.get(PARAM_KEYS.resourceType) || DEFAULT_AUDIT_FILTERS.resourceType,
    startDate: searchParams.get(PARAM_KEYS.startDate) || DEFAULT_AUDIT_FILTERS.startDate,
    endDate: searchParams.get(PARAM_KEYS.endDate) || DEFAULT_AUDIT_FILTERS.endDate,
  }

  /**
   * Update a single filter key in URL search params.
   * Removes the param when value is empty to keep the URL clean.
   * @param key - The filter field to update.
   * @param value - The new value.
   */
  const setFilter = (key: keyof AuditFilters, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value) {
        // Set the param when a value is provided
        next.set(PARAM_KEYS[key], value)
      } else {
        // Remove the param when clearing a filter
        next.delete(PARAM_KEYS[key])
      }
      // Reset to page 1 when filters change
      next.delete('page')
      return next
    }, { replace: true })
  }

  /**
   * Clear all filter params from the URL.
   */
  const clearFilters = () => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      // Remove every filter param
      Object.values(PARAM_KEYS).forEach(param => next.delete(param))
      // Reset pagination
      next.delete('page')
      return next
    }, { replace: true })
  }

  /** Toggle the filter panel open/closed */
  const toggleFilters = () => {
    setShowFilters(prev => !prev)
  }

  // Derived: true when any filter has a non-empty value
  const hasActiveFilters = Object.values(filters).some(v => v !== '')

  return {
    filters,
    setFilter,
    clearFilters,
    showFilters,
    toggleFilters,
    hasActiveFilters,
  }
}
