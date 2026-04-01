/**
 * @fileoverview Document list panel for a selected version.
 *
 * Fetches and displays documents from the RAGFlow dataset associated
 * with the selected version. Shows file name, size, type, and parsing status.
 * Includes upload buttons that open file/folder upload modals.
 *
 * @module features/projects/components/DocumentListPanel
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, FileSpreadsheet, FileImage, File, UploadCloud, FolderUp, Trash2, Layers, RefreshCw, Play, Square, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { useConfirm } from '@/components/ConfirmDialog'
import { globalMessage } from '@/app/App'
import {
  getVersionDocuments, deleteVersionDocuments, requeueVersionDocuments,
  parseVersionDocuments, syncVersionParserStatus,
  parseVersionSingleDocument, bulkParseVersionDocuments,
  type VersionDocument,
} from '../api/projectApi'
import { ProcessLogDialog } from '../../datasets'

import { useConverterSocket } from '../../system/hooks/useConverterSocket'
import UploadFilesModal from './UploadFilesModal'
import UploadFolderModal from './UploadFolderModal'

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format bytes into a human-readable size string.
 * @param bytes - File size in bytes
 * @returns Formatted size string (e.g. "1.5 MB")
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/**
 * Get a file type icon based on file extension.
 * @param name - File name
 * @returns Lucide icon component
 */
const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return <FileText size={14} className="text-blue-500" />
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet size={14} className="text-green-500" />
  if (['ppt', 'pptx'].includes(ext)) return <FileImage size={14} className="text-orange-500" />
  return <File size={14} className="text-gray-400" />
}

/**
 * Map document pipeline status to Badge variant and label.
 * @param run - Document run status string
 * @param t - Translation function
 * @returns Object with variant and label
 */
const getStatusBadge = (run: string, t: (key: string) => string): { variant: 'secondary' | 'info' | 'destructive' | 'warning' | 'success' | 'default'; label: string } => {
  const statusMap: Record<string, { variant: 'secondary' | 'info' | 'destructive' | 'warning' | 'success' | 'default'; label: string }> = {
    // Local pipeline statuses
    local: { variant: 'secondary', label: t('projectManagement.documents.statusLocal') },
    converted: { variant: 'info', label: t('projectManagement.documents.statusConverted') },
    imported: { variant: 'info', label: t('projectManagement.documents.statusImported') },
    failed: { variant: 'destructive', label: t('projectManagement.documents.statusFailed') },
    // RAGFlow parsing statuses
    UNSTART: { variant: 'secondary', label: t('projectManagement.documents.statusPending') },
    RUNNING: { variant: 'info', label: t('projectManagement.documents.statusParsing') },
    CANCEL: { variant: 'warning', label: t('projectManagement.documents.statusCancelled') },
    DONE: { variant: 'success', label: t('projectManagement.documents.statusParsed') },
    FAIL: { variant: 'destructive', label: t('projectManagement.documents.statusFailed') },
  }
  return statusMap[run] || { variant: 'secondary', label: run }
}


// ============================================================================
// Types
// ============================================================================

interface DocumentListPanelProps {
  /** Project ID */
  projectId: string
  /** Category ID */
  categoryId: string
  /** Selected version ID */
  versionId: string
  /** RAG dataset UUID linked to this version (for direct parse/log API calls) */
  datasetId?: string
  /** Display label for the selected version */
  versionLabel?: string
  /** Trigger counter — increment to force a refresh (e.g. after upload) */
  refreshKey?: number
  /** Callback to open the jobs modal */
  onShowJobs?: () => void
  /** Number of active jobs for badge display */
  activeJobCount?: number
}

// ============================================================================
// Component
// ============================================================================

/**
 * Panel showing documents for a selected version with search, upload buttons, and pagination.
 *
 * @param {DocumentListPanelProps} props - Component props
 * @returns {JSX.Element} The rendered document list panel
 */
const DocumentListPanel = ({ projectId, categoryId, versionId, datasetId, versionLabel, refreshKey, onShowJobs, activeJobCount }: DocumentListPanelProps) => {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const [documents, setDocuments] = useState<VersionDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // Upload modal state
  const [uploadFilesOpen, setUploadFilesOpen] = useState(false)
  const [uploadFolderOpen, setUploadFolderOpen] = useState(false)

  // Process log dialog state
  const [processLogOpen, setProcessLogOpen] = useState(false)
  const [processLogDoc, setProcessLogDoc] = useState<VersionDocument | null>(null)

  /** Counter to trigger refresh after upload */
  const [localRefreshKey, setLocalRefreshKey] = useState(0)

  /** Selected row keys for multi-delete */
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  /** Loading state for delete operation */
  const [deleting, setDeleting] = useState(false)
  /** Loading state for requeue operation */
  const [requeueing, setRequeueing] = useState(false)
  /** Loading state for parse operation */
  const [parsing, setParsing] = useState(false)
  /** Loading state for parser status sync operation */
  const [syncing, setSyncing] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20

  /** Fetch documents for the selected version */
  const fetchDocuments = async () => {
    setLoading(true)
    try {
      const docs = await getVersionDocuments(projectId, categoryId, versionId, {
        page: 1,
        page_size: 100,
        ...(searchKeyword ? { keywords: searchKeyword } : {}),
      })
      setDocuments(docs || [])
    } catch (err) {
      console.error('Failed to load documents:', err)
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }

  // Fetch on mount, version change, or refresh trigger
  useEffect(() => {
    fetchDocuments()
  }, [projectId, categoryId, versionId, searchKeyword, refreshKey, localRefreshKey])

  // Real-time updates via WebSocket — refresh documents to pick up status changes
  useConverterSocket({
    onFileUpdate: () => fetchDocuments(),
    onJobUpdate: () => fetchDocuments(),
  })

  // Polling fallback — auto-refresh every 5s while documents are in-progress
  // This ensures status updates even if WebSocket is not connected
  useEffect(() => {
    const hasInProgress = documents.some(
      (doc) => doc.run === 'local' || doc.run === 'converted',
    )
    if (!hasInProgress || documents.length === 0) return

    const interval = setInterval(() => {
      fetchDocuments()
    }, 5000)

    return () => clearInterval(interval)
  }, [documents, projectId, categoryId, versionId, searchKeyword])

  /** Callback after upload completes */
  const handleUploadComplete = () => {
    setLocalRefreshKey((k) => k + 1)
  }

  /** Delete selected documents after confirmation */
  const handleDeleteSelected = async () => {
    if (selectedRowKeys.length === 0) return

    // Check if any imported documents are selected for the warning message
    const hasImported = documents.some(
      (doc) => selectedRowKeys.includes(doc.id) && doc.run === 'imported',
    )

    // Prompt confirmation before deleting
    const confirmed = await confirm({
      title: t('common.delete'),
      message: hasImported
        ? `${t('projectManagement.documents.deleteConfirm', { count: selectedRowKeys.length })}\n${t('projectManagement.documents.deleteConfirmRagflow')}`
        : t('projectManagement.documents.deleteConfirm', { count: selectedRowKeys.length }),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return

    setDeleting(true)
    try {
      const result = await deleteVersionDocuments(projectId, categoryId, versionId, selectedRowKeys)
      const deletedCount = result.deleted?.length ?? selectedRowKeys.length
      globalMessage.success(t('projectManagement.documents.deleteSuccess', { count: deletedCount }))
      setSelectedRowKeys([])
      setLocalRefreshKey((k) => k + 1)
    } catch (err) {
      globalMessage.error(t('projectManagement.documents.deleteError'))
    } finally {
      setDeleting(false)
    }
  }

  /** Re-queue selected local files for conversion */
  const handleRetryParse = async () => {
    if (selectedRowKeys.length === 0) return
    setRequeueing(true)
    try {
      const result = await requeueVersionDocuments(projectId, categoryId, versionId, selectedRowKeys)
      const queuedCount = result.queued?.length ?? 0
      globalMessage.success(t('projectManagement.documents.retryParseSuccess', { count: queuedCount }))
      setSelectedRowKeys([])
      setLocalRefreshKey((k) => k + 1)
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setRequeueing(false)
    }
  }

  /** Start parsing selected imported documents in RAGFlow */
  const handleStartParse = async () => {
    if (selectedRowKeys.length === 0) return
    setParsing(true)
    try {
      const result = await parseVersionDocuments(projectId, categoryId, versionId, selectedRowKeys)
      const parsedCount = result.parsed?.length ?? 0
      globalMessage.success(t('projectManagement.documents.startParseSuccess', { count: parsedCount }))
      setSelectedRowKeys([])
      setLocalRefreshKey((k) => k + 1)
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setParsing(false)
    }
  }

  /** Check if any selected files are local-only (eligible for retry) */
  const hasLocalSelected = selectedRowKeys.length > 0 && documents.some(
    (doc) => selectedRowKeys.includes(doc.id) && doc.run === 'local',
  )

  /** Check if any selected files are imported (eligible for parsing) */
  const hasImportedSelected = selectedRowKeys.length > 0 && documents.some(
    (doc) => selectedRowKeys.includes(doc.id) && doc.run === 'imported',
  )

  /**
   * Check if any doc in the list is in a parse-trackable state.
   * Shows the Sync Parser Status button when relevant.
   */
  const hasParseableStatus = documents.some(
    (doc) => doc.run === 'imported' || doc.run === 'UNSTART' || doc.run === 'RUNNING',
  )

  /** Sync live parser status from RAGFlow on demand */
  const handleSyncParserStatus = async () => {
    setSyncing(true)
    try {
      await syncVersionParserStatus(projectId, categoryId, versionId)
      // Refresh the local document list to pick up updated statuses
      await fetchDocuments()
      globalMessage.success(t('projectManagement.documents.syncParserSuccess'))
    } catch (err) {
      globalMessage.error(t('projectManagement.documents.syncParserError'))
    } finally {
      setSyncing(false)
    }
  }

  /**
   * @description Parse a single document — calls the RAG parse endpoint directly
   * @param {string} docId - Document UUID
   */
  const handleParseSingle = async (docId: string) => {
    if (!datasetId) {
      globalMessage.error('Dataset ID not available')
      return
    }
    try {
      await parseVersionSingleDocument(datasetId, docId)
      globalMessage.success(t('projectManagement.documents.parseSuccess'))
      await fetchDocuments()
    } catch {
      globalMessage.error(t('projectManagement.documents.parseError'))
    }
  }

  /**
   * @description Stop parsing a single document — calls bulk parse with run=2
   * @param {string} docId - Document UUID
   */
  const handleStopParseSingle = async (docId: string) => {
    if (!datasetId) return
    try {
      await bulkParseVersionDocuments(datasetId, [docId], 2)
      globalMessage.success(t('projectManagement.documents.stopParseSuccess'))
      await fetchDocuments()
    } catch {
      globalMessage.error(t('projectManagement.documents.parseError'))
    }
  }

  /**
   * @description Open the process log dialog for a document
   * @param {VersionDocument} doc - Document to show logs for
   */
  const handleShowProcessLog = (doc: VersionDocument) => {
    setProcessLogDoc(doc)
    setProcessLogOpen(true)
  }

  /** Handle search input submission */
  const handleSearch = () => {
    setSearchKeyword(searchInput)
    setCurrentPage(1)
  }

  /** Toggle row selection for a single document */
  const toggleRowSelection = (docId: string) => {
    setSelectedRowKeys((prev) =>
      prev.includes(docId)
        ? prev.filter((k) => k !== docId)
        : [...prev, docId]
    )
  }

  /** Toggle all rows selection */
  const toggleAllRows = () => {
    if (selectedRowKeys.length === documents.length) {
      setSelectedRowKeys([])
    } else {
      setSelectedRowKeys(documents.map((d) => d.id))
    }
  }

  // Paginate documents locally
  const totalPages = Math.ceil(documents.length / pageSize)
  const paginatedDocuments = documents.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="mt-4">
      {/* Header: title + actions */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          {t('projectManagement.documents.title')}
          {versionLabel && (
            <Badge variant="info" className="text-xs">{versionLabel}</Badge>
          )}
          {!loading && documents.length > 0 && (
            <span className="text-xs font-normal text-gray-400">
              ({documents.length} {t('projectManagement.documents.totalFiles')})
            </span>
          )}
        </h4>
        <div className="flex items-center gap-2">
          {/* Bulk action buttons -- visible when rows are selected */}
          {selectedRowKeys.length > 0 && (
            <>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleting}
                onClick={handleDeleteSelected}
              >
                {deleting ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Trash2 size={14} className="mr-1" />}
                {t('projectManagement.documents.deleteSelected', { count: selectedRowKeys.length })}
              </Button>
              {hasLocalSelected && (
                <Button
                  size="sm"
                  disabled={requeueing}
                  onClick={handleRetryParse}
                >
                  {requeueing ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RefreshCw size={14} className="mr-1" />}
                  {t('projectManagement.documents.retryParse')}
                </Button>
              )}
              {hasImportedSelected && (
                <Button
                  size="sm"
                  disabled={parsing}
                  onClick={handleStartParse}
                >
                  {parsing ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Play size={14} className="mr-1" />}
                  {t('projectManagement.documents.startParse')}
                </Button>
              )}
            </>
          )}

          {/* Search input */}
          <div className="relative w-[200px]">
            <Input
              placeholder={t('projectManagement.documents.search')}
              className="h-8 pr-8 text-sm"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
            />
            <button
              onClick={handleSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <Search size={14} />
            </button>
          </div>

          {/* Upload buttons */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" onClick={() => setUploadFilesOpen(true)}>
                  <UploadCloud size={14} className="mr-1" />
                  {t('projectManagement.documents.uploadFiles')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('projectManagement.documents.uploadFiles')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" onClick={() => setUploadFolderOpen(true)}>
                  <FolderUp size={14} className="mr-1" />
                  {t('projectManagement.documents.folderUpload')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('projectManagement.documents.folderUpload')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Jobs button with badge */}
          {onShowJobs && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="relative" onClick={onShowJobs}>
                    <Layers size={14} className="mr-1" />
                    {t('converter.panel.title')}
                    {(activeJobCount ?? 0) > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                        {activeJobCount}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('converter.panel.title')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Sync parser status button */}
          {hasParseableStatus && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" disabled={syncing} onClick={handleSyncParserStatus}>
                    {syncing ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RefreshCw size={14} className="mr-1" />}
                    {t('projectManagement.documents.syncParserStatus')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('projectManagement.documents.syncParserStatus')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Document table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : documents.length === 0 ? (
        <EmptyState description={t('projectManagement.documents.noDocumentsHint')} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                    checked={selectedRowKeys.length === documents.length && documents.length > 0}
                    onChange={toggleAllRows}
                  />
                </TableHead>
                <TableHead>{t('projectManagement.documents.name')}</TableHead>
                <TableHead className="w-[100px]">{t('projectManagement.documents.size')}</TableHead>
                <TableHead className="w-[160px]">{t('projectManagement.documents.status')}</TableHead>
                <TableHead className="w-[80px]">{t('projectManagement.documents.chunks')}</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedDocuments.map((doc) => {
                const status = getStatusBadge(doc.run, t)
                // Determine if document is actively parsing (run='1' or 'RUNNING')
                const isParsing = doc.run === '1' || doc.run === 'RUNNING'
                // Determine if document can be parsed (idle, imported, or completed/failed states)
                const canParse = !isParsing && doc.run !== 'local' && doc.run !== 'converted'
                return (
                  <TableRow key={doc.id} className="group" data-state={selectedRowKeys.includes(doc.id) ? 'selected' : undefined}>
                    {/* Checkbox */}
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                        checked={selectedRowKeys.includes(doc.id)}
                        onChange={() => toggleRowSelection(doc.id)}
                      />
                    </TableCell>

                    {/* File name with icon */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getFileIcon(doc.name)}
                        <span className="truncate" title={doc.name}>{doc.name}</span>
                      </div>
                    </TableCell>

                    {/* File size */}
                    <TableCell>
                      <span className="text-gray-500 dark:text-gray-400 text-xs">{formatFileSize(doc.size)}</span>
                    </TableCell>

                    {/* Status badge — clickable to open process log + inline progress bar */}
                    <TableCell>
                      <div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => handleShowProcessLog(doc)}
                                className="cursor-pointer hover:opacity-80 transition-opacity"
                              >
                                <Badge variant={status.variant}>
                                  {status.label}
                                  {isParsing && doc.progress > 0 && doc.progress < 1 && ` ${Math.round(doc.progress * 100)}%`}
                                </Badge>
                              </button>
                            </TooltipTrigger>
                            {doc.progress_msg && (
                              <TooltipContent className="max-w-[300px]">{doc.progress_msg}</TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                        {/* Inline progress bar for actively parsing documents */}
                        {isParsing && doc.progress > 0 && doc.progress < 1 && (
                          <Progress value={Math.round(doc.progress * 100)} className="mt-1 h-1.5" />
                        )}
                      </div>
                    </TableCell>

                    {/* Chunk count */}
                    <TableCell>
                      <span className="text-gray-500 dark:text-gray-400 text-xs">{doc.chunk_count ?? '-'}</span>
                    </TableCell>

                    {/* Parse / Stop action button */}
                    <TableCell>
                      {datasetId && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isParsing ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => handleStopParseSingle(doc.id)}
                                  >
                                    <Square size={14} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('projectManagement.documents.stopParse')}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : canParse ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleParseSingle(doc.id)}
                                  >
                                    <Play size={14} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('projectManagement.documents.parse')}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {/* Pagination below table */}
          {totalPages > 1 && (
            <div className="flex justify-end mt-4">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </>
      )}

      {/* Upload modals */}
      <UploadFilesModal
        open={uploadFilesOpen}
        projectId={projectId}
        categoryId={categoryId}
        versionId={versionId}
        onClose={() => setUploadFilesOpen(false)}
        onUploadComplete={handleUploadComplete}
      />
      <UploadFolderModal
        open={uploadFolderOpen}
        projectId={projectId}
        categoryId={categoryId}
        versionId={versionId}
        onClose={() => setUploadFolderOpen(false)}
        onUploadComplete={handleUploadComplete}
      />

      {/* Process log dialog — shows parse status and progress details */}
      <ProcessLogDialog
        open={processLogOpen}
        onClose={() => { setProcessLogOpen(false); setProcessLogDoc(null) }}
        document={processLogDoc ? {
          id: processLogDoc.id,
          dataset_id: datasetId || '',
          name: processLogDoc.name,
          size: processLogDoc.size,
          status: processLogDoc.status,
          progress: processLogDoc.progress,
          progress_msg: processLogDoc.progress_msg,
          chunk_count: processLogDoc.chunk_count,
          token_count: processLogDoc.token_count,
          created_at: '',
          updated_at: '',
          run: processLogDoc.run,
          create_time: processLogDoc.create_time,
        } : null}
      />
    </div>
  )
}

export default DocumentListPanel
