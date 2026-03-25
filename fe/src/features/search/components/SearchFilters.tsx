/**
 * @fileoverview Search filter panel with dataset selection, file types, and parameters.
 * @module features/ai/components/SearchFilters
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { searchApi } from '../api/searchApi'
import type { SearchFilters as SearchFiltersType } from '../types/search.types'

// ============================================================================
// Props
// ============================================================================

/** @description Props for the SearchFilters component */
interface SearchFiltersProps {
  /** Current filter values */
  filters: SearchFiltersType
  /** Callback when filters change */
  onFiltersChange: (filters: SearchFiltersType) => void
  /** Whether dataset and file-type scope filters should be shown */
  showScopeFilters?: boolean
  /** Whether the panel is visible */
  visible?: boolean
  /** Callback to toggle panel visibility */
  onToggle?: () => void
  /** Optional CSS class name */
  className?: string
}

// ============================================================================
// Constants
// ============================================================================

const FILE_TYPES = ['pdf', 'docx', 'xlsx', 'txt', 'md', 'csv', 'pptx']
const SEARCH_METHODS = ['hybrid', 'semantic', 'fulltext'] as const

// ============================================================================
// Component
// ============================================================================

/**
 * @description Filter panel for refining search results.
 * Includes dataset selection, file type checkboxes, search method,
 * and similarity threshold slider.
 *
 * @param {SearchFiltersProps} props - Component properties
 * @returns {JSX.Element} The rendered filter panel
 */
function SearchFilters({
  filters,
  onFiltersChange,
  showScopeFilters = true,
  visible = true,
  onToggle,
  className,
}: SearchFiltersProps) {
  const { t } = useTranslation()
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([])

  // Fetch available datasets on mount
  useEffect(() => {
    searchApi.listDatasets().then(setDatasets).catch(console.error)
  }, [])

  /**
   * Toggle a dataset in the filter.
   * @param datasetId - Dataset ID to toggle
   */
  const toggleDataset = (datasetId: string) => {
    const current = filters.dataset_ids || []
    const updated = current.includes(datasetId)
      ? current.filter((id) => id !== datasetId)
      : [...current, datasetId]
    onFiltersChange({ ...filters, dataset_ids: updated })
  }

  /**
   * Toggle a file type in the filter.
   * @param fileType - File type to toggle
   */
  const toggleFileType = (fileType: string) => {
    const current = filters.file_types || []
    const updated = current.includes(fileType)
      ? current.filter((ft) => ft !== fileType)
      : [...current, fileType]
    onFiltersChange({ ...filters, file_types: updated })
  }

  /**
   * Clear all filters.
   */
  const clearFilters = () => {
    onFiltersChange({})
  }

  // Count active filters
  const activeCount =
    (showScopeFilters ? (filters.dataset_ids?.length || 0) : 0) +
    (showScopeFilters ? (filters.file_types?.length || 0) : 0) +
    (filters.search_method ? 1 : 0) +
    (filters.similarity_threshold !== undefined ? 1 : 0) +
    (filters.vector_similarity_weight !== undefined ? 1 : 0) +
    (filters.top_k !== undefined ? 1 : 0)

  if (!visible) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onToggle}
        className="gap-1.5"
      >
        <Filter className="h-4 w-4" />
        {t('search.filters')}
        {activeCount > 0 && (
          <Badge variant="default" className="h-5 w-5 p-0 justify-center text-[10px]">
            {activeCount}
          </Badge>
        )}
      </Button>
    )
  }

  return (
    <div className={cn('w-64 border-r bg-muted/30 p-4 space-y-5 overflow-y-auto', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Filter className="h-4 w-4" />
          {t('search.filters')}
        </h3>
        <div className="flex items-center gap-1">
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-7">
              {t('common.reset')}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showScopeFilters && (
        <>
          {/* Dataset selection */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">{t('search.datasets')}</Label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {datasets.map((ds) => (
                <label
                  key={ds.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs"
                >
                  <input
                    type="checkbox"
                    checked={filters.dataset_ids?.includes(ds.id) || false}
                    onChange={() => toggleDataset(ds.id)}
                    className="rounded border-input"
                  />
                  <span className="truncate">{ds.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* File type checkboxes */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">{t('search.fileTypes')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {FILE_TYPES.map((ft) => (
                <Badge
                  key={ft}
                  variant={filters.file_types?.includes(ft) ? 'default' : 'outline'}
                  className="cursor-pointer text-xs"
                  onClick={() => toggleFileType(ft)}
                >
                  .{ft}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Search method */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">{t('search.searchMethod')}</Label>
        <div className="space-y-1">
          {SEARCH_METHODS.map((method) => (
            <label
              key={method}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs"
            >
              <input
                type="radio"
                name="searchMethod"
                checked={filters.search_method === method}
                onChange={() => onFiltersChange({ ...filters, search_method: method })}
                className="border-input"
              />
              <span>{t(`search.method.${method}`)}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Similarity threshold */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">{t('search.similarityThreshold')}</Label>
          <span className="text-xs text-muted-foreground">
            {((filters.similarity_threshold ?? 0.5) * 100).toFixed(0)}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={filters.similarity_threshold ?? 0.5}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              similarity_threshold: parseFloat(e.target.value),
            })
          }
          className="w-full accent-primary"
        />
      </div>

      {/* Top K results */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">{t('search.topK')}</Label>
          <span className="text-xs text-muted-foreground">
            {filters.top_k ?? 10}
          </span>
        </div>
        <input
          type="range"
          min="1"
          max="100"
          step="1"
          value={filters.top_k ?? 10}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              top_k: parseInt(e.target.value, 10),
            })
          }
          className="w-full accent-primary"
        />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>1</span>
          <span>100</span>
        </div>
      </div>

      {/* Vector similarity weight (only shown for hybrid method) */}
      {(!filters.search_method || filters.search_method === 'hybrid') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">{t('search.vectorWeight')}</Label>
            <span className="text-xs text-muted-foreground">
              {((filters.vector_similarity_weight ?? 0.5) * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={filters.vector_similarity_weight ?? 0.5}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                vector_similarity_weight: parseFloat(e.target.value),
              })
            }
            className="w-full accent-primary"
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{t('search.keyword')}</span>
            <span>{t('search.semantic')}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default SearchFilters
