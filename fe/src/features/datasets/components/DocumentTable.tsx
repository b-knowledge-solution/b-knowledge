/**
 * @fileoverview Document table component with checkbox multi-select, bulk actions,
 * inline parse status, enabled toggle, and process log dialog.
 *
 * Modeled after RAGflow's dataset-table.tsx with bulk operations.
 *
 * @module features/datasets/components/DocumentTable
 */

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Play, Trash2, XCircle, Settings2, Globe, MoreHorizontal, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/Checkbox'
import ProcessLogDialog from './ProcessLogDialog'
import UploadNewVersionDialog from './UploadNewVersionDialog'
import type { Document } from '../types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the DocumentTable component.
 */
interface DocumentTableProps {
  /** Dataset ID for building document detail navigation URLs */
  datasetId: string
  /** Array of documents to display */
  documents: Document[]
  /** Whether documents are currently loading */
  loading: boolean
  /** Whether the current user has admin privileges */
  isAdmin: boolean
  /** Callback to trigger parsing for a single document */
  onParse: (docId: string) => void
  /** Callback to delete a single document */
  onDelete: (docId: string) => void

  /** Optional callback to toggle document availability */
  onToggleAvailability?: (docId: string, enabled: boolean) => void
  /** Optional callback for bulk parse/cancel operations */
  onBulkParse?: (docIds: string[], run?: number) => void
  /** Optional callback for bulk delete operations */
  onBulkDelete?: (docIds: string[]) => void
  /** Optional callback to change a document's parser */
  onChangeParser?: (doc: Document) => void
}

// ============================================================================
// Helpers
// ============================================================================

/** Format file size to human-readable string */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/** Format a raw timestamp (number or string) as a localized date string */
function formatDate(raw: number | string | undefined | null): string {
  if (!raw) return '-'
  const d = typeof raw === 'number' ? new Date(raw) : new Date(raw)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString()
}

/** Format document creation date from RAGFlow fields */
function formatDocDate(doc: Document): string {
  return formatDate(doc.create_time || doc.create_date || doc.created_at)
}

/** Format document update date — falls back to creation date if never updated */
function formatDocUpdateDate(doc: Document): string {
  return formatDate(doc.update_date || doc.update_time || doc.updated_at || doc.create_time || doc.create_date)
}

/**
 * @description Map document run/progress fields to status badge label and variant.
 * Uses RAGflow run field first, then progress value, then string status fallback.
 * @param {Document} doc - Document to evaluate
 * @returns {{ label: string; variant: string }} Badge display properties
 */
function getStatusBadge(doc: Document): {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
} {
  // Use RAGflow run field if available
  if (doc.run === '1') return { label: 'Parsing', variant: 'default' }
  if (doc.run === '2') return { label: 'Cancelled', variant: 'secondary' }
  if (doc.progress === 1) return { label: 'Completed', variant: 'outline' }
  if (doc.progress === -1) return { label: 'Failed', variant: 'destructive' }
  if (doc.progress > 0 && doc.progress < 1) return { label: 'In Progress', variant: 'default' }
  // Fallback to string status
  if (doc.status === 'completed') return { label: 'Completed', variant: 'outline' }
  if (doc.status === 'failed') return { label: 'Failed', variant: 'destructive' }
  if (doc.status === 'parsing') return { label: 'Parsing', variant: 'default' }
  return { label: 'Pending', variant: 'secondary' }
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Document table with checkbox multi-select, bulk actions bar,
 * inline parse status with progress bars, enabled toggle, and process log dialog.
 *
 * @param {DocumentTableProps} props - Component properties
 * @returns {JSX.Element} Rendered document table with bulk action controls
 */
const DocumentTable: React.FC<DocumentTableProps> = ({
  datasetId,
  documents,
  loading,
  isAdmin,
  onParse,
  onDelete,
  onToggleAvailability,
  onBulkParse,
  onBulkDelete,
  onChangeParser,
}) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [logDocument, setLogDocument] = useState<Document | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  // Version upload dialog state — tracks which document triggered the dialog
  const [versionDoc, setVersionDoc] = useState<Document | null>(null)

  // Derived selection state
  const allSelected = documents.length > 0 && selectedIds.size === documents.length
  const hasSelection = selectedIds.size > 0

  /** Select or deselect all documents in the table */
  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(documents.map((d) => d.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  /** Toggle selection for a single document row */
  const toggleRow = (docId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(docId)
      } else {
        next.delete(docId)
      }
      return next
    })
  }

  const selectedArray = Array.from(selectedIds)

  // Show log dialog for a document
  const showLog = (doc: Document) => {
    setLogDocument(doc)
    setLogOpen(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={48} />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Bulk Action Bar */}
      {hasSelection && isAdmin && (
        <div className="flex items-center gap-3 rounded-md bg-muted/50 dark:bg-slate-800/50 px-4 py-2 border border-border">
          <span className="text-sm text-muted-foreground">
            {t('datasets.selectedCount', { count: selectedIds.size })}
          </span>
          <div className="flex gap-2 ml-auto">
            {onBulkParse && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { onBulkParse(selectedArray, 1); setSelectedIds(new Set()) }}
                >
                  <Play size={14} className="mr-1" />
                  {t('datasets.parseSelected')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { onBulkParse(selectedArray, 2); setSelectedIds(new Set()) }}
                >
                  <XCircle size={14} className="mr-1" />
                  {t('datasets.cancelSelected')}
                </Button>
              </>
            )}
            {onBulkDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { onBulkDelete(selectedArray); setSelectedIds(new Set()) }}
              >
                <Trash2 size={14} className="mr-1" />
                {t('datasets.deleteSelected')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && (
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </TableHead>
              )}
              <TableHead>{t('datasets.docName')}</TableHead>
              <TableHead className="w-[100px]">{t('datasets.docSize')}</TableHead>
              <TableHead className="w-[100px]">{t('datasets.parser')}</TableHead>
              <TableHead className="w-[140px]">{t('datasets.docStatus')}</TableHead>
              {isAdmin && <TableHead className="w-[80px]">{t('datasets.enabled')}</TableHead>}
              <TableHead className="w-[100px] text-right">{t('datasets.chunkCount')}</TableHead>
              <TableHead className="w-[140px]">{t('datasets.docUploadDate')}</TableHead>
              <TableHead className="w-[140px]">{t('datasets.docUpdateDate')}</TableHead>
              {isAdmin && <TableHead className="w-[100px]">{t('common.actions')}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 10 : 7} className="text-center py-8 text-muted-foreground">
                  {t('common.noData')}
                </TableCell>
              </TableRow>
            ) : documents.map((doc) => {
              const status = getStatusBadge(doc)
              const isEnabled = doc.status === '1' || doc.status === 'completed'
              const isSelected = selectedIds.has(doc.id)

              return (
                <TableRow key={doc.id} className="group" data-state={isSelected ? 'selected' : undefined}>
                  {/* Checkbox */}
                  {isAdmin && (
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onChange={(checked) => toggleRow(doc.id, checked)}
                      />
                    </TableCell>
                  )}

                  {/* Name — show Globe icon for web-crawled documents */}
                  <TableCell className="max-w-[300px]">
                    <div className="flex items-center gap-1.5">
                      {doc.source_type === 'web_crawl' && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Globe size={14} className="flex-shrink-0 text-blue-500" />
                            </TooltipTrigger>
                            <TooltipContent>{doc.source_url || 'Web crawl'}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="font-medium truncate block cursor-pointer text-primary hover:underline transition-colors"
                              onClick={() => navigate(`/data-studio/datasets/${datasetId}/documents/${doc.id}/chunks`)}
                            >
                              {doc.name}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{doc.name}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>

                  {/* Size */}
                  <TableCell>{formatFileSize(doc.size)}</TableCell>

                  {/* Parser */}
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-xs">
                      {doc.parser_id === 'naive' ? 'General' : doc.parser_id || 'General'}
                    </Badge>
                  </TableCell>

                  {/* Status (clickable → opens log dialog) */}
                  <TableCell>
                    <button
                      className="text-left cursor-pointer"
                      onClick={() => showLog(doc)}
                    >
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {doc.run === '1' && doc.progress > 0 && doc.progress < 1 && (
                        <Progress value={Math.round(doc.progress * 100)} className="mt-1 h-1.5" />
                      )}
                    </button>
                  </TableCell>

                  {/* Enabled toggle */}
                  {isAdmin && (
                    <TableCell>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked: boolean) => {
                          onToggleAvailability?.(doc.id, checked)
                        }}
                      />
                    </TableCell>
                  )}

                  {/* Chunk count */}
                  <TableCell className="text-right">{doc.chunk_num ?? doc.chunk_count ?? 0}</TableCell>

                  {/* Upload date */}
                  <TableCell>{formatDocDate(doc)}</TableCell>

                  {/* Update date */}
                  <TableCell>{formatDocUpdateDate(doc)}</TableCell>

                  {/* Actions */}
                  {isAdmin && (
                    <TableCell>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">

                        {/* Change Parser button — disabled while parsing */}
                        {onChangeParser && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => onChangeParser(doc)}
                                  disabled={doc.run === '1'}
                                >
                                  <Settings2 size={14} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('datasets.changeParser')}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onParse(doc.id)}>
                                <Play size={14} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('datasets.parse')}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(doc.id)}>
                                <Trash2 size={14} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('common.delete')}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        {/* Kebab menu with additional actions */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal size={14} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setVersionDoc(doc)}>
                              <Upload size={14} className="mr-2" />
                              {t('datasets.uploadNewVersion')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Process Log Dialog */}
      <ProcessLogDialog
        open={logOpen}
        onClose={() => setLogOpen(false)}
        document={logDocument}
      />

      {/* Upload New Version Dialog */}
      {versionDoc && (
        <UploadNewVersionDialog
          datasetId={datasetId}
          datasetName={versionDoc.name}
          open={!!versionDoc}
          onOpenChange={(open) => { if (!open) setVersionDoc(null) }}
        />
      )}
    </div>
  )
}

export default DocumentTable
