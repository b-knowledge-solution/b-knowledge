/**
 * @fileoverview Reusable multi-select picker for knowledge bases (datasets + knowledge bases).
 * Renders a Popover with searchable, grouped checkbox list and selected chips.
 * @module components/knowledge-base-picker/KnowledgeBasePicker
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X, Database, FolderKanban, ChevronsUpDown } from 'lucide-react'

import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'

// ============================================================================
// Types
// ============================================================================

/**
 * @description A single item in the knowledge base picker.
 */
export interface KnowledgeBaseItem {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** Source type: dataset or knowledgeBase */
  type: 'dataset' | 'knowledgeBase'
  /** Optional document count for context */
  docCount?: number | undefined
}

/**
 * @description Props for the KnowledgeBasePicker component.
 */
interface KnowledgeBasePickerProps {
  /** Currently selected IDs */
  value: string[]
  /** Callback when selection changes */
  onChange: (ids: string[]) => void
  /** Dataset items to display */
  datasets: KnowledgeBaseItem[]
  /** Knowledge base items to display */
  knowledgeBases: KnowledgeBaseItem[]
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Multi-select knowledge base picker with Popover dropdown.
 * Groups items into "Datasets" and "Knowledge Bases" sections, each with type badges.
 * Shows selected items as removable chips below the trigger.
 *
 * @param {KnowledgeBasePickerProps} props - Component properties
 * @returns {JSX.Element} The rendered picker
 */
export function KnowledgeBasePicker({
  value,
  onChange,
  datasets,
  knowledgeBases,
}: KnowledgeBasePickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // All items combined for lookup
  const allItems = [...datasets, ...knowledgeBases]

  // Filter items by search query
  const query = search.toLowerCase().trim()
  const filteredDatasets = query
    ? datasets.filter((d) => d.name.toLowerCase().includes(query))
    : datasets
  const filteredKnowledgeBases = query
    ? knowledgeBases.filter((kb) => kb.name.toLowerCase().includes(query))
    : knowledgeBases

  const hasResults = filteredDatasets.length > 0 || filteredKnowledgeBases.length > 0

  /**
   * @description Toggle an item in the selection list.
   * @param id - Item ID to toggle
   */
  const toggleItem = (id: string) => {
    onChange(
      value.includes(id)
        ? value.filter((v) => v !== id)
        : [...value, id],
    )
  }

  /**
   * @description Remove an item from the selection.
   * @param id - Item ID to remove
   */
  const removeItem = (id: string) => {
    onChange(value.filter((v) => v !== id))
  }

  // Resolve selected items for chip display
  const selectedItems = value
    .map((id) => allItems.find((item) => item.id === id))
    .filter(Boolean) as KnowledgeBaseItem[]

  return (
    <div className="space-y-2">
      {/* Popover trigger + dropdown */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center justify-between w-full h-9 px-3 text-sm rounded-md border bg-background hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring dark:border-gray-600 text-left"
          >
            <span className="text-muted-foreground truncate">
              {value.length > 0
                ? t('kbPicker.selected', { count: value.length })
                : t('kbPicker.selectKnowledgeBases')}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          sideOffset={4}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b dark:border-gray-700">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('kbPicker.searchPlaceholder')}
              className="flex-1 h-7 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          {/* Scrollable item list */}
          <div className="max-h-[280px] overflow-y-auto py-1">
            {!hasResults ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {t('kbPicker.noResults')}
              </p>
            ) : (
              <>
                {/* Datasets group */}
                {filteredDatasets.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                      {t('kbPicker.datasets')}
                    </div>
                    {filteredDatasets.map((item) => (
                      <KbItemRow
                        key={item.id}
                        item={item}
                        checked={value.includes(item.id)}
                        onToggle={toggleItem}
                      />
                    ))}
                  </div>
                )}

                {/* Knowledge Bases group */}
                {filteredKnowledgeBases.length > 0 && (
                  <div>
                    {/* Separator if both groups present */}
                    {filteredDatasets.length > 0 && (
                      <div className="my-1 border-t dark:border-gray-700" />
                    )}
                    <div className="px-3 py-1.5 text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                      {t('kbPicker.knowledgeBases')}
                    </div>
                    {filteredKnowledgeBases.map((item) => (
                      <KbItemRow
                        key={item.id}
                        item={item}
                        checked={value.includes(item.id)}
                        onToggle={toggleItem}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Selected chips */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map((item) => (
            <Badge
              key={item.id}
              variant="secondary"
              className="flex items-center gap-1 pr-1 text-xs font-normal"
            >
              {item.type === 'dataset' ? (
                <Database className="h-3 w-3" />
              ) : (
                <FolderKanban className="h-3 w-3" />
              )}
              <span className="max-w-[120px] truncate">{item.name}</span>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="ml-0.5 h-4 w-4 rounded-full inline-flex items-center justify-center hover:bg-muted-foreground/20 transition-colors"
                aria-label={`Remove ${item.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Internal Sub-components
// ============================================================================

/**
 * @description A single row in the KB picker dropdown.
 */
function KbItemRow({
  item,
  checked,
  onToggle,
}: {
  item: KnowledgeBaseItem
  checked: boolean
  onToggle: (id: string) => void
}) {
  const { t } = useTranslation()

  return (
    <label
      className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted cursor-pointer transition-colors text-sm"
    >
      <Checkbox
        checked={checked}
        onCheckedChange={() => onToggle(item.id)}
      />
      {/* Icon */}
      {item.type === 'dataset' ? (
        <Database className="h-3.5 w-3.5 text-blue-500 shrink-0" />
      ) : (
        <FolderKanban className="h-3.5 w-3.5 text-amber-500 shrink-0" />
      )}
      {/* Name + doc count */}
      <div className="flex-1 min-w-0">
        <span className="truncate block">{item.name}</span>
      </div>
      {/* Type badge */}
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0 shrink-0"
      >
        {item.type === 'dataset'
          ? t('kbPicker.dataset')
          : t('kbPicker.project')}
      </Badge>
      {/* Doc count */}
      {item.docCount !== undefined && item.docCount > 0 && (
        <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
          {t('kbPicker.docs', { count: item.docCount })}
        </span>
      )}
    </label>
  )
}

export default KnowledgeBasePicker
