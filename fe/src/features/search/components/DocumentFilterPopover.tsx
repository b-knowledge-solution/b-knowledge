/**
 * @fileoverview Document filter popover for filtering search results by document.
 * @module features/ai/components/DocumentFilterPopover
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Filter } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

/** @description Document aggregation entry from search results */
interface DocAgg {
  doc_id: string
  doc_name: string
  count: number
}

/** @description Props for the DocumentFilterPopover component */
interface DocumentFilterPopoverProps {
  /** Document aggregation data from search results */
  docAggs: DocAgg[]
  /** Currently selected document IDs */
  selectedDocIds: string[]
  /** Callback when selection changes */
  onSelectionChange: (ids: string[]) => void
  /** Optional CSS class name */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description A popover component that allows users to filter search results
 * by selecting specific documents via checkboxes. Includes search, select all,
 * and clear all functionality.
 *
 * @param {DocumentFilterPopoverProps} props - Component properties
 * @returns {JSX.Element} The rendered document filter popover
 */
function DocumentFilterPopover({
  docAggs,
  selectedDocIds,
  onSelectionChange,
  className,
}: DocumentFilterPopoverProps) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')

  // Filter documents by search query
  const filteredDocs = docAggs.filter((doc) =>
    doc.doc_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Determine selected count for badge display
  const selectedCount = selectedDocIds.length
  const totalCount = docAggs.length

  /**
   * @description Toggle a document ID in the selection.
   * @param {string} docId - The document ID to toggle
   */
  const handleToggle = (docId: string) => {
    if (selectedDocIds.includes(docId)) {
      onSelectionChange(selectedDocIds.filter((id) => id !== docId))
    } else {
      onSelectionChange([...selectedDocIds, docId])
    }
  }

  /**
   * @description Select all documents.
   */
  const handleSelectAll = () => {
    onSelectionChange(docAggs.map((doc) => doc.doc_id))
  }

  /**
   * @description Clear all selected documents.
   */
  const handleClearAll = () => {
    onSelectionChange([])
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5 h-8', className)}
        >
          <Filter className="h-3.5 w-3.5" />
          {t('search.filterByDocument')}
          {/* Show count badge when filtering is active */}
          {selectedCount > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
              {t('search.filesSelected', { count: selectedCount, total: totalCount })}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-3" align="start">
        {/* Search input */}
        <Input
          placeholder={t('search.searchDocuments')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 text-sm mb-2"
        />

        {/* Select all / Clear all buttons */}
        <div className="flex items-center justify-between mb-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={handleSelectAll}
          >
            {t('search.selectAll')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={handleClearAll}
          >
            {t('search.clearAll')}
          </Button>
        </div>

        {/* Document checkbox list */}
        <div className="max-h-60 overflow-y-auto space-y-1">
          {filteredDocs.map((doc) => {
            const isChecked = selectedDocIds.includes(doc.doc_id)
            return (
              <label
                key={doc.doc_id}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm',
                  'hover:bg-accent hover:text-accent-foreground transition-colors',
                  isChecked && 'bg-accent/50'
                )}
              >
                {/* Native checkbox styled with Tailwind */}
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleToggle(doc.doc_id)}
                  className="h-4 w-4 rounded border-border accent-primary shrink-0"
                />
                {/* Document name (truncated) */}
                <span className="truncate flex-1 text-foreground">
                  {doc.doc_name}
                </span>
                {/* Chunk count */}
                <span className="text-xs text-muted-foreground shrink-0">
                  ({doc.count})
                </span>
              </label>
            )
          })}

          {/* Empty state when search yields no results */}
          {filteredDocs.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">
              {t('search.noResults')}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default DocumentFilterPopover
