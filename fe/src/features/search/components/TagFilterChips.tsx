/**
 * @fileoverview Tag filter chips for search results.
 * Displays available metadata tag keys as clickable chips below the search bar.
 * Clicking a chip opens a popover to select values; active filters are shown
 * as secondary badges with remove buttons.
 *
 * Active filters are converted to metadata_filter conditions and passed
 * to the search API for OpenSearch query filtering via buildMetadataFilters().
 *
 * @module features/search/components/TagFilterChips
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useTagAggregations } from '@/features/datasets/api/datasetQueries'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the TagFilterChips component.
 */
interface TagFilterChipsProps {
  /** Optional dataset IDs to scope tag aggregation */
  datasetIds?: string[]
  /** Currently active tag filters as key-value pairs */
  activeFilters: Record<string, string>
  /** Callback when filters change */
  onFilterChange: (filters: Record<string, string>) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Inline tag filter chips rendered below the search bar.
 * Discovers available tags via aggregation API, shows inactive tags as outline
 * badges and active tags as secondary badges with key:value and remove button.
 *
 * Chip height is 28px (h-7) per UI-SPEC.
 *
 * @param {TagFilterChipsProps} props - Component properties
 * @returns {JSX.Element} Rendered tag filter chips
 */
const TagFilterChips: React.FC<TagFilterChipsProps> = ({
  datasetIds,
  activeFilters,
  onFilterChange,
}) => {
  const { t } = useTranslation()
  const { data: tags, isLoading } = useTagAggregations(datasetIds)

  // Track which popover is currently open by tag key
  const [openPopover, setOpenPopover] = useState<string | null>(null)

  /**
   * @description Activate a filter by selecting a value for a tag key.
   * @param {string} key - Tag key
   * @param {string} value - Selected tag value
   */
  const selectFilter = (key: string, value: string) => {
    onFilterChange({ ...activeFilters, [key]: value })
    setOpenPopover(null)
  }

  /**
   * @description Remove an active filter by key.
   * @param {string} key - Tag key to remove
   */
  const removeFilter = (key: string) => {
    const next = { ...activeFilters }
    delete next[key]
    onFilterChange(next)
  }

  /**
   * @description Clear all active filters.
   */
  const clearAll = () => {
    onFilterChange({})
  }

  // Hide chips gracefully when aggregation fails or no tags available
  if (!isLoading && (!tags || tags.length === 0)) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Loading state */}
      {isLoading && <Spinner size={16} />}

      {/* Render chips for each tag key */}
      {tags?.map((tag) => {
        const isActive = tag.key in activeFilters

        // Active chip — shows key:value with remove button
        if (isActive) {
          return (
            <Badge
              key={tag.key}
              variant="secondary"
              className="h-7 gap-1 pr-1 cursor-default"
            >
              {tag.key}: {activeFilters[tag.key]}
              <button
                onClick={() => removeFilter(tag.key)}
                className="ml-0.5 hover:text-destructive"
                aria-label={t('search.clearFilters', 'Clear filter')}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )
        }

        // Inactive chip — outline badge that opens a popover with values
        return (
          <Popover
            key={tag.key}
            open={openPopover === tag.key}
            onOpenChange={(open: boolean) => setOpenPopover(open ? tag.key : null)}
          >
            <PopoverTrigger asChild>
              <Badge
                variant="outline"
                className="h-7 cursor-pointer hover:bg-accent/10 transition-colors"
              >
                {tag.key}
              </Badge>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              {tag.values.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">
                  {t('common.noData')}
                </p>
              ) : (
                <div className="flex flex-col gap-0.5 max-h-48 overflow-auto">
                  {tag.values.map((value) => (
                    <button
                      key={value}
                      onClick={() => selectFilter(tag.key, value)}
                      className="text-left text-sm px-2 py-1.5 rounded hover:bg-accent/10 transition-colors"
                    >
                      {value}
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        )
      })}

      {/* Clear all button — shown when at least one filter is active */}
      {Object.keys(activeFilters).length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={clearAll}
        >
          {t('search.clearFilters', 'Clear filters')}
        </Button>
      )}
    </div>
  )
}

export default TagFilterChips
