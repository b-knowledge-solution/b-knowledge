/**
 * @fileoverview Memory pool card component for the memory list grid.
 * Displays pool metadata (name, storage type, memory types, extraction mode)
 * with edit/delete actions via kebab dropdown menu.
 *
 * @module features/memory/components/MemoryCard
 */

import { useTranslation } from 'react-i18next'
import { MoreVertical, Pencil, Trash2, Brain } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { Memory } from '../types/memory.types'
import { MemoryType, hasMemoryType } from '../types/memory.types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the MemoryCard component
 */
interface MemoryCardProps {
  /** Memory pool record to display */
  memory: Memory
  /** Callback when edit action is triggered */
  onEdit: (m: Memory) => void
  /** Callback when delete action is triggered */
  onDelete: (m: Memory) => void
}

// ============================================================================
// Constants
// ============================================================================

/**
 * @description Memory type labels mapped to their bitmask values for display as chips
 */
const MEMORY_TYPE_ENTRIES = [
  { value: MemoryType.RAW, labelKey: 'memory.raw' },
  { value: MemoryType.SEMANTIC, labelKey: 'memory.semantic' },
  { value: MemoryType.EPISODIC, labelKey: 'memory.episodic' },
  { value: MemoryType.PROCEDURAL, labelKey: 'memory.procedural' },
] as const

// ============================================================================
// Component
// ============================================================================

/**
 * @description Card component for memory pool list items displaying name, storage type badge,
 * memory type chips, extraction mode, and a kebab dropdown with edit and delete actions.
 * @param {MemoryCardProps} props - Memory pool data and action callbacks
 * @returns {JSX.Element} Rendered memory pool card
 */
export function MemoryCard({ memory, onEdit, onDelete }: MemoryCardProps) {
  const { t } = useTranslation()

  // Determine which memory types are enabled via bitmask
  const enabledTypes = MEMORY_TYPE_ENTRIES.filter(
    (entry) => hasMemoryType(memory.memory_type, entry.value)
  )

  return (
    <Card className="border-l-4 border-l-indigo-500 hover:shadow-md transition-shadow dark:bg-slate-800 dark:border-slate-700">
      <CardContent className="p-4">
        {/* Header row: avatar + name + kebab menu */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Brain icon as default avatar */}
            <div className="shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <Brain size={16} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {memory.name}
            </h3>
          </div>

          {/* Kebab dropdown menu - stop propagation to avoid card click */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0">
                <MoreVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => onEdit(memory)}>
                <Pencil size={14} className="mr-2" />
                {t('memory.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(memory)}
                className="text-red-600 dark:text-red-400"
              >
                <Trash2 size={14} className="mr-2" />
                {t('memory.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description (truncated to 2 lines) */}
        {memory.description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">
            {memory.description}
          </p>
        )}

        {/* Badges row: storage type, extraction mode, scope */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <Badge variant="outline" className="text-xs">
            {t(`memory.${memory.storage_type}`)}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {t(`memory.${memory.extraction_mode}`)}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {t(`memory.scope${memory.scope_type.charAt(0).toUpperCase() + memory.scope_type.slice(1)}`)}
          </Badge>
        </div>

        {/* Memory type chips - show which types are enabled */}
        <div className="flex flex-wrap gap-1">
          {enabledTypes.map((entry) => (
            <span
              key={entry.value}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
            >
              {t(entry.labelKey)}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
