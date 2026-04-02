/**
 * @fileoverview Searchable, filterable, paginated table for memory pool messages.
 * Displays extracted memory items with type badges, status indicators, and
 * per-row actions (forget, delete). Uses debounced keyword search.
 *
 * @module features/memory/components/MemoryMessageTable
 */

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Trash2, EyeOff } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

import { useMemoryMessages, useForgetMemoryMessage, useDeleteMemoryMessage } from '../api/memoryQueries'
import { MemoryType } from '../types/memory.types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the MemoryMessageTable component
 */
interface MemoryMessageTableProps {
  /** Memory pool UUID to list messages for */
  memoryId: string
  /** Tenant UUID for context */
  tenantId: string
}

// ============================================================================
// Constants
// ============================================================================

/** @description Page size options for the message table */
const PAGE_SIZES = [10, 20, 50] as const

/** @description Memory type filter options with bitmask values */
const TYPE_FILTER_OPTIONS = [
  { value: '0', labelKey: 'memory.allTypes' },
  { value: String(MemoryType.RAW), labelKey: 'memory.raw' },
  { value: String(MemoryType.SEMANTIC), labelKey: 'memory.semantic' },
  { value: String(MemoryType.EPISODIC), labelKey: 'memory.episodic' },
  { value: String(MemoryType.PROCEDURAL), labelKey: 'memory.procedural' },
] as const

/**
 * @description Maps memory type bitmask values to badge color classes
 */
const TYPE_BADGE_STYLES: Record<number, string> = {
  [MemoryType.RAW]: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  [MemoryType.SEMANTIC]: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  [MemoryType.EPISODIC]: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  [MemoryType.PROCEDURAL]: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
}

/**
 * @description Maps memory type bitmask values to human-readable i18n keys
 */
const TYPE_LABEL_KEYS: Record<number, string> = {
  [MemoryType.RAW]: 'memory.raw',
  [MemoryType.SEMANTIC]: 'memory.semantic',
  [MemoryType.EPISODIC]: 'memory.episodic',
  [MemoryType.PROCEDURAL]: 'memory.procedural',
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Format ISO date string to a relative time display (e.g., "2h ago")
 * @param {string} dateStr - ISO 8601 date string
 * @returns {string} Relative time string
 */
function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date

  // Convert to appropriate unit
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

/**
 * @description Truncate text to a max length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLen - Maximum character count
 * @returns {string} Truncated text
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '...'
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Searchable memory message table with keyword filter, type filter,
 * pagination, and per-row forget/delete actions. Uses debounced search input.
 * @param {MemoryMessageTableProps} props - Memory pool ID and tenant ID
 * @returns {JSX.Element} Rendered message table with toolbar and pagination
 */
export function MemoryMessageTable({ memoryId }: MemoryMessageTableProps) {
  const { t } = useTranslation()

  // Pagination and filter state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(20)
  const [keyword, setKeyword] = useState('')
  const [debouncedKeyword, setDebouncedKeyword] = useState('')
  const [messageType, setMessageType] = useState(0)

  // Confirmation dialog state for delete action
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Debounce keyword input at 300ms
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setDebouncedKeyword(keyword)
      // Reset to page 1 when search changes
      setPage(1)
    }, 300)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [keyword])

  // Data fetching with current filter/pagination params
  const { data, isLoading } = useMemoryMessages(memoryId, {
    page,
    page_size: pageSize,
    ...(debouncedKeyword ? { keyword: debouncedKeyword } : {}),
    ...(messageType > 0 ? { message_type: messageType } : {}),
  })

  const forgetMutation = useForgetMemoryMessage()
  const deleteMutation = useDeleteMemoryMessage()

  const messages = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // --------------------------------------------------------------------------
  // Actions
  // --------------------------------------------------------------------------

  /**
   * @description Mark a message as forgotten via API
   * @param {string} messageId - Message UUID to forget
   */
  const handleForget = (messageId: string) => {
    forgetMutation.mutate({ id: memoryId, messageId })
  }

  /**
   * @description Confirm and delete a message via API
   */
  const handleDeleteConfirm = () => {
    if (!deletingId) return
    deleteMutation.mutate(
      { id: memoryId, messageId: deletingId },
      { onSettled: () => setDeletingId(null) }
    )
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Toolbar: search + type filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Keyword search with debounce */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('memory.search')}
            className="pl-9 dark:bg-slate-800 dark:border-slate-700"
          />
        </div>

        {/* Type filter dropdown */}
        <Select
          value={String(messageType)}
          onValueChange={(val: string) => {
            setMessageType(Number(val))
            setPage(1)
          }}
        >
          <SelectTrigger className="w-40 dark:bg-slate-800 dark:border-slate-700">
            <SelectValue placeholder={t('memory.filterType')} />
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Message table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">
            {t('memory.noMessages')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('memory.noMessagesHint')}
          </p>
        </div>
      ) : (
        <TooltipProvider>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">{t('memory.content')}</TableHead>
                <TableHead className="w-[12%]">{t('memory.type')}</TableHead>
                <TableHead className="w-[12%]">{t('memory.status')}</TableHead>
                <TableHead className="w-[16%]">{t('memory.createdAt')}</TableHead>
                <TableHead className="w-[12%] text-right">{t('memory.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((msg) => {
                // Determine if the message has been forgotten
                const isForgotten = !!msg.forget_at
                const typeStyle = TYPE_BADGE_STYLES[msg.message_type] ?? TYPE_BADGE_STYLES[MemoryType.RAW]!
                const typeLabelKey = TYPE_LABEL_KEYS[msg.message_type] ?? 'memory.raw'

                return (
                  <TableRow key={msg.message_id}>
                    {/* Content cell with tooltip for full text */}
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm text-slate-700 dark:text-slate-300 cursor-default">
                            {truncate(msg.content, 200)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-md">
                          <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>

                    {/* Type badge with color */}
                    <TableCell>
                      <Badge variant="secondary" className={`text-xs ${typeStyle}`}>
                        {t(typeLabelKey)}
                      </Badge>
                    </TableCell>

                    {/* Status indicator */}
                    <TableCell>
                      {isForgotten ? (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {t('memory.forgotten')}
                        </span>
                      ) : (
                        <span className="text-xs text-green-600 dark:text-green-400">
                          {t('memory.active')}
                        </span>
                      )}
                    </TableCell>

                    {/* Created at (relative time) */}
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-slate-500 dark:text-slate-400 cursor-default">
                            {formatRelativeTime(msg.created_at)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">{new Date(msg.created_at).toLocaleString()}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>

                    {/* Actions: forget + delete */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Forget button - only show for active messages */}
                        {!isForgotten && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleForget(msg.message_id)}
                                disabled={forgetMutation.isPending}
                              >
                                <EyeOff size={14} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('memory.forget')}</TooltipContent>
                          </Tooltip>
                        )}

                        {/* Delete button */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                              onClick={() => setDeletingId(msg.message_id)}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('memory.delete')}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TooltipProvider>
      )}

      {/* Pagination controls */}
      {total > 0 && (
        <div className="flex items-center justify-between pt-2">
          {/* Page size selector */}
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span>{t('common.show', { defaultValue: 'Show' })}</span>
            <Select
              value={String(pageSize)}
              onValueChange={(val: string) => {
                setPageSize(Number(val))
                setPage(1)
              }}
            >
              <SelectTrigger className="w-20 h-8 dark:bg-slate-800 dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>{total} {t('common.total', { defaultValue: 'total' })}</span>
          </div>

          {/* Page navigation */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              {t('common.previous', { defaultValue: 'Previous' })}
            </Button>
            <span className="px-3 text-sm text-slate-600 dark:text-slate-400">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              {t('common.next', { defaultValue: 'Next' })}
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deletingId} onOpenChange={(open: boolean) => { if (!open) setDeletingId(null) }}>
        <DialogContent className="dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle>{t('memory.delete')}</DialogTitle>
            <DialogDescription>{t('memory.deleteMessageConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              {t('memory.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
