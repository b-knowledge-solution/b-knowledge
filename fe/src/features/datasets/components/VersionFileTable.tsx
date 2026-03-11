/**
 * @fileoverview Table component for displaying version files with status badges.
 * Shows file name, size, status, and actions for each file in a version.
 *
 * @module features/datasets/components/VersionFileTable
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, RefreshCw, Play, Cog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import ConversionStatusBadge from './ConversionStatusBadge'
import type { VersionFile } from '../types'

// ============================================================================
// Types
// ============================================================================

interface VersionFileTableProps {
  /** @description List of files to display */
  files: VersionFile[]
  /** @description Whether the file list is loading */
  loading: boolean
  /** @description Whether the user has admin permissions */
  isAdmin: boolean
  /** @description Callback to delete selected files */
  onDelete: (fileIds: string[]) => void
  /** @description Callback to start file conversion */
  onConvert: () => void
  /** @description Callback to start parsing */
  onParse: () => void
  /** @description Callback to sync file status */
  onSyncStatus: () => void
  /** @description Callback to re-queue failed files */
  onRequeue: () => void
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format bytes to a human-readable string.
 * @param bytes - File size in bytes
 * @returns Formatted size string
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// ============================================================================
// Component
// ============================================================================

/**
 * Table displaying version files with status badges and batch actions.
 *
 * @param {VersionFileTableProps} props - Component props
 * @returns {JSX.Element} The rendered file table
 */
const VersionFileTable = ({
  files,
  loading,
  isAdmin,
  onDelete,
  onConvert,
  onParse,
  onSyncStatus,
  onRequeue,
}: VersionFileTableProps) => {
  const { t } = useTranslation()
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  /** Toggle selection of a single file */
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  /** Toggle select all */
  const toggleSelectAll = () => {
    if (selectedIds.length === files.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(files.map((f) => f.id))
    }
  }

  /** Check if there are pending files to convert */
  const hasPendingFiles = files.some((f) => f.status === 'pending')

  /** Check if there are imported files to parse */
  const hasImportedFiles = files.some((f) => f.status === 'imported')

  /** Check if there are failed files to re-queue */
  const hasFailedFiles = files.some((f) => f.status === 'failed')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={48} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Action bar */}
      {isAdmin && files.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Batch delete */}
          {selectedIds.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { onDelete(selectedIds); setSelectedIds([]) }}
            >
              <Trash2 size={14} className="mr-1" />
              {t('versions.deleteSelected', { count: selectedIds.length })}
            </Button>
          )}

          {/* Convert pending files */}
          {hasPendingFiles && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={onConvert}>
                    <Cog size={14} className="mr-1" />
                    {t('versions.convert')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('versions.convertTooltip')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Parse imported files */}
          {hasImportedFiles && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={onParse}>
                    <Play size={14} className="mr-1" />
                    {t('versions.parse')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('versions.parseTooltip')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Re-queue failed files */}
          {hasFailedFiles && (
            <Button variant="outline" size="sm" onClick={onRequeue}>
              <RefreshCw size={14} className="mr-1" />
              {t('versions.requeue')}
            </Button>
          )}

          {/* Sync status */}
          <Button variant="ghost" size="sm" onClick={onSyncStatus}>
            <RefreshCw size={14} className="mr-1" />
            {t('versions.syncStatus')}
          </Button>
        </div>
      )}

      {/* File table */}
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && (
                <TableHead className="w-[40px]">
                  <input
                    type="checkbox"
                    checked={files.length > 0 && selectedIds.length === files.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-border"
                  />
                </TableHead>
              )}
              <TableHead>{t('versions.fileName')}</TableHead>
              <TableHead className="w-[100px]">{t('versions.fileSize')}</TableHead>
              <TableHead className="w-[140px]">{t('versions.fileStatus')}</TableHead>
              <TableHead className="w-[80px] text-right">{t('datasets.chunks')}</TableHead>
              <TableHead className="w-[140px]">{t('versions.fileUpdated')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isAdmin ? 6 : 5}
                  className="text-center py-8 text-muted-foreground"
                >
                  {t('versions.noFiles')}
                </TableCell>
              </TableRow>
            ) : (
              files.map((file) => (
                <TableRow key={file.id}>
                  {isAdmin && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(file.id)}
                        onChange={() => toggleSelect(file.id)}
                        className="h-4 w-4 rounded border-border"
                      />
                    </TableCell>
                  )}
                  <TableCell className="max-w-[300px]">
                    <span className="font-medium truncate block" title={file.file_name}>
                      {file.file_name}
                    </span>
                    {file.error && (
                      <span className="text-xs text-destructive block truncate" title={file.error}>
                        {file.error}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatFileSize(file.file_size)}
                  </TableCell>
                  <TableCell>
                    <ConversionStatusBadge status={file.status} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-xs">
                    {file.chunk_count ?? '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(file.updated_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export default VersionFileTable
