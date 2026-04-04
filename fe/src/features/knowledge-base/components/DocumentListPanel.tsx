/**
 * @fileoverview Document list panel for a selected version — full feature parity with DatasetDetailPage.
 *
 * Features: parse/stop per-document, inline progress bar, parser badge, enable/disable toggle,
 * change parser dialog, process log dialog, inline delete, bulk parse/cancel/delete,
 * chunk navigation, search, pagination, real-time WebSocket + polling updates.
 *
 * @module features/knowledge-base/components/DocumentListPanel
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FileText, FileSpreadsheet, FileImage, File, UploadCloud, FolderUp,
  Trash2, Layers, RefreshCw, Play, Square, Loader2, Search,
  Settings2, XCircle, Tags,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { useConfirm } from '@/components/ConfirmDialog'
import { globalMessage } from '@/lib/globalMessage'
import {
  getVersionDocuments, deleteVersionDocuments, requeueVersionDocuments,
  parseVersionDocuments, syncVersionParserStatus,
  parseVersionSingleDocument, bulkParseVersionDocuments,
  toggleVersionDocumentAvailability, changeVersionDocumentParser,
  deleteVersionSingleDocument,
  type VersionDocument,
} from '../api/knowledgeBaseApi'
import { ProcessLogDialog, ChangeParserDialog, MetadataManageDialog } from '../../datasets'
import type { Document } from '../../datasets'

import { useConverterSocket } from '../../system/hooks/useConverterSocket'
import UploadFilesModal from './UploadFilesModal'
import UploadFolderModal from './UploadFolderModal'

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Format bytes into a human-readable size string
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size string (e.g. "1.5 MB")
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/**
 * @description Get a file type icon based on file extension
 * @param {string} name - File name
 * @returns {JSX.Element} Lucide icon component
 */
const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return <FileText size={14} className="text-blue-500" />
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet size={14} className="text-green-500" />
  if (['ppt', 'pptx'].includes(ext)) return <FileImage size={14} className="text-orange-500" />
  return <File size={14} className="text-gray-400" />
}

/**
 * @description Map document pipeline status to Badge variant and label
 * @param {VersionDocument} doc - Document to evaluate
 * @param {Function} t - Translation function
 * @returns {{ variant: string; label: string }} Badge display properties
 */
const getStatusBadge = (doc: VersionDocument, t: (key: string) => string): { variant: 'secondary' | 'info' | 'destructive' | 'warning' | 'success' | 'default'; label: string } => {
  const run = doc.run
  // RAGFlow run field takes precedence
  if (run === '1') return { variant: 'info', label: t('knowledgeBase.documents.statusParsing') }
  if (run === '2') return { variant: 'warning', label: t('knowledgeBase.documents.statusCancelled') }
  // Check progress for completed/failed states
  if (doc.progress === 1) return { variant: 'success', label: t('knowledgeBase.documents.statusParsed') }
  if (doc.progress === -1) return { variant: 'destructive', label: t('knowledgeBase.documents.statusFailed') }
  if (doc.progress > 0 && doc.progress < 1) return { variant: 'info', label: t('knowledgeBase.documents.statusParsing') }

  // Local pipeline statuses
  const statusMap: Record<string, { variant: 'secondary' | 'info' | 'destructive' | 'warning' | 'success' | 'default'; label: string }> = {
    local: { variant: 'secondary', label: t('knowledgeBase.documents.statusLocal') },
    converted: { variant: 'info', label: t('knowledgeBase.documents.statusConverted') },
    imported: { variant: 'info', label: t('knowledgeBase.documents.statusImported') },
    failed: { variant: 'destructive', label: t('knowledgeBase.documents.statusFailed') },
    UNSTART: { variant: 'secondary', label: t('knowledgeBase.documents.statusPending') },
    RUNNING: { variant: 'info', label: t('knowledgeBase.documents.statusParsing') },
    CANCEL: { variant: 'warning', label: t('knowledgeBase.documents.statusCancelled') },
    DONE: { variant: 'success', label: t('knowledgeBase.documents.statusParsed') },
    FAIL: { variant: 'destructive', label: t('knowledgeBase.documents.statusFailed') },
  }
  return statusMap[run] || { variant: 'secondary', label: run || t('knowledgeBase.documents.statusPending') }
}

/** @description Format a raw timestamp to localized date string */
const formatDate = (raw: number | string | undefined | null): string => {
  if (!raw) return '-'
  const d = typeof raw === 'number' ? new Date(raw) : new Date(raw)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString()
}

/** @description Format update date, falling back through available date fields */
const formatDocUpdateDate = (doc: VersionDocument): string =>
  formatDate(doc.update_date || doc.update_time || doc.updated_at || doc.create_time || doc.create_date)

/**
 * @description Convert a VersionDocument to the datasets Document type for reuse in dialogs
 * @param {VersionDocument} doc - Version document to convert
 * @param {string} datasetId - RAG dataset UUID
 * @returns {Document} Converted document matching datasets type
 */
const toDatasetDocument = (doc: VersionDocument, datasetId: string): Document => {
  // Build a Document-compatible object from VersionDocument fields
  // Use explicit undefined checks to satisfy exactOptionalPropertyTypes
  const result: Document = {
    id: doc.id,
    dataset_id: datasetId,
    name: doc.name,
    size: doc.size,
    status: doc.status,
    progress: doc.progress,
    chunk_count: doc.chunk_num ?? doc.chunk_count ?? 0,
    token_count: doc.token_num ?? doc.token_count ?? 0,
    created_at: doc.created_at || '',
    updated_at: doc.updated_at || '',
  }
  // Only set optional fields when they have actual values
  if (doc.type) result.type = doc.type
  if (doc.progress_msg) result.progress_msg = doc.progress_msg
  if (doc.run) result.run = doc.run
  if (doc.parser_id) result.parser_id = doc.parser_id
  if (doc.process_duration) result.process_duration = doc.process_duration
  if (doc.create_time) result.create_time = doc.create_time
  if (doc.create_date) result.create_date = doc.create_date
  if (doc.source_type === 'local' || doc.source_type === 'web_crawl') result.source_type = doc.source_type
  if (doc.source_url) result.source_url = doc.source_url
  return result
}

// ============================================================================
// Types
// ============================================================================

interface DocumentListPanelProps {
  /** Knowledge Base ID */
  knowledgeBaseId: string
  /** Category ID */
  categoryId: string
  /** Selected version ID */
  versionId: string
  /** RAG dataset UUID linked to this version (for direct parse/log/toggle API calls) */
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
 * @description Panel showing documents for a selected version with full dataset-detail parity.
 * Includes: parse/stop buttons, progress bars, parser badges, enable/disable toggle,
 * change parser dialog, process log, inline delete, bulk operations, chunk navigation.
 *
 * @param {DocumentListPanelProps} props - Component props
 * @returns {JSX.Element} The rendered document list panel
 */
const DocumentListPanel = ({ knowledgeBaseId, categoryId, versionId, datasetId, versionLabel, refreshKey, onShowJobs, activeJobCount }: DocumentListPanelProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
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

  // Change parser dialog state
  const [changeParserDoc, setChangeParserDoc] = useState<VersionDocument | null>(null)

  // Bulk metadata dialog state
  const [bulkMetadataOpen, setBulkMetadataOpen] = useState(false)

  /** Counter to trigger refresh after upload */
  const [localRefreshKey, setLocalRefreshKey] = useState(0)

  /** Selected row keys for multi-select operations */
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

  // ── Data Fetching ──────────────────────────────────────────────────────

  /** Fetch documents for the selected version */
  const fetchDocuments = async () => {
    setLoading(true)
    try {
      const docs = await getVersionDocuments(knowledgeBaseId, categoryId, versionId, {
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
  }, [knowledgeBaseId, categoryId, versionId, searchKeyword, refreshKey, localRefreshKey])

  // Real-time updates via WebSocket — refresh documents to pick up status changes
  useConverterSocket({
    onFileUpdate: () => fetchDocuments(),
    onJobUpdate: () => fetchDocuments(),
  })

  // Polling fallback — auto-refresh every 5s while documents are in-progress
  useEffect(() => {
    const hasInProgress = documents.some(
      (doc) => doc.run === '1' || doc.run === 'local' || doc.run === 'converted' || doc.run === 'RUNNING'
        || (doc.progress > 0 && doc.progress < 1),
    )
    if (!hasInProgress || documents.length === 0) return

    const interval = setInterval(() => fetchDocuments(), 5000)
    return () => clearInterval(interval)
  }, [documents, knowledgeBaseId, categoryId, versionId, searchKeyword])

  // ── Handlers ───────────────────────────────────────────────────────────

  /** Callback after upload completes */
  const handleUploadComplete = () => setLocalRefreshKey((k) => k + 1)

  /**
   * @description Resolve selected doc IDs to file names for project-specific APIs.
   * The projects controller expects file names, not UUIDs.
   */
  const selectedFileNames = (): string[] =>
    documents.filter((d) => selectedRowKeys.includes(d.id)).map((d) => d.name)

  /** Delete selected documents after confirmation */
  const handleDeleteSelected = async () => {
    if (selectedRowKeys.length === 0) return
    const hasImported = documents.some(
      (doc) => selectedRowKeys.includes(doc.id) && doc.run === 'imported',
    )
    const confirmed = await confirm({
      title: t('common.delete'),
      message: hasImported
        ? `${t('knowledgeBase.documents.deleteConfirm', { count: selectedRowKeys.length })}\n${t('knowledgeBase.documents.deleteConfirmRagflow')}`
        : t('knowledgeBase.documents.deleteConfirm', { count: selectedRowKeys.length }),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return

    setDeleting(true)
    try {
      // Project delete endpoint expects file names, not doc IDs
      const result = await deleteVersionDocuments(knowledgeBaseId, categoryId, versionId, selectedFileNames())
      const deletedCount = result.deleted?.length ?? selectedRowKeys.length
      globalMessage.success(t('knowledgeBase.documents.deleteSuccess', { count: deletedCount }))
      setSelectedRowKeys([])
      setLocalRefreshKey((k) => k + 1)
    } catch {
      globalMessage.error(t('knowledgeBase.documents.deleteError'))
    } finally {
      setDeleting(false)
    }
  }

  /** Re-queue selected local files for conversion */
  const handleRetryParse = async () => {
    if (selectedRowKeys.length === 0) return
    setRequeueing(true)
    try {
      // Project requeue endpoint expects file names
      const result = await requeueVersionDocuments(knowledgeBaseId, categoryId, versionId, selectedFileNames())
      const queuedCount = result.queued?.length ?? 0
      globalMessage.success(t('knowledgeBase.documents.retryParseSuccess', { count: queuedCount }))
      setSelectedRowKeys([])
      setLocalRefreshKey((k) => k + 1)
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setRequeueing(false)
    }
  }

  /** Start parsing selected imported documents */
  const handleStartParse = async () => {
    if (selectedRowKeys.length === 0) return
    setParsing(true)
    try {
      // Project parse endpoint expects file names
      const result = await parseVersionDocuments(knowledgeBaseId, categoryId, versionId, selectedFileNames())
      const parsedCount = result.parsed?.length ?? 0
      globalMessage.success(t('knowledgeBase.documents.startParseSuccess', { count: parsedCount }))
      setSelectedRowKeys([])
      setLocalRefreshKey((k) => k + 1)
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setParsing(false)
    }
  }

  /** Bulk cancel parsing for selected documents */
  const handleBulkCancel = async () => {
    if (!datasetId || selectedRowKeys.length === 0) return
    try {
      await bulkParseVersionDocuments(datasetId, selectedRowKeys, 2)
      globalMessage.success(t('knowledgeBase.documents.stopParseSuccess'))
      setSelectedRowKeys([])
      await fetchDocuments()
    } catch {
      globalMessage.error(t('knowledgeBase.documents.parseError'))
    }
  }

  /** Parse a single document — calls the RAG parse endpoint directly */
  const handleParseSingle = async (docId: string) => {
    if (!datasetId) {
      globalMessage.error('Dataset ID not available')
      return
    }
    try {
      await parseVersionSingleDocument(datasetId, docId)
      globalMessage.success(t('knowledgeBase.documents.parseSuccess'))
      await fetchDocuments()
    } catch {
      globalMessage.error(t('knowledgeBase.documents.parseError'))
    }
  }

  /** Stop parsing a single document */
  const handleStopParseSingle = async (docId: string) => {
    if (!datasetId) return
    try {
      await bulkParseVersionDocuments(datasetId, [docId], 2)
      globalMessage.success(t('knowledgeBase.documents.stopParseSuccess'))
      await fetchDocuments()
    } catch {
      globalMessage.error(t('knowledgeBase.documents.parseError'))
    }
  }

  /** Toggle document availability (enabled/disabled) */
  const handleToggleAvailability = async (docId: string, enabled: boolean) => {
    if (!datasetId) return
    try {
      await toggleVersionDocumentAvailability(datasetId, docId, enabled)
      await fetchDocuments()
    } catch {
      globalMessage.error('Failed to toggle document availability')
    }
  }

  /** Delete a single document inline */
  const handleDeleteSingle = async (docId: string) => {
    if (!datasetId) return
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('knowledgeBase.documents.deleteConfirm', { count: 1 }),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return
    try {
      await deleteVersionSingleDocument(datasetId, docId)
      globalMessage.success(t('knowledgeBase.documents.deleteSuccess', { count: 1 }))
      await fetchDocuments()
    } catch {
      globalMessage.error(t('knowledgeBase.documents.deleteError'))
    }
  }

  /** Loading state for parser change */
  const [changingParser, setChangingParser] = useState(false)

  /** Handle parser change from the ChangeParserDialog */
  const handleChangeParser = async (docId: string, parserId: string, parserConfig?: Record<string, unknown>) => {
    if (!datasetId) return
    setChangingParser(true)
    try {
      await changeVersionDocumentParser(datasetId, docId, {
        parser_id: parserId,
        ...(parserConfig ? { parser_config: parserConfig } : {}),
      })
      setChangeParserDoc(null)
      await fetchDocuments()
    } catch {
      globalMessage.error(t('knowledgeBase.documents.parseError'))
    } finally {
      setChangingParser(false)
    }
  }

  /** Open the process log dialog for a document */
  const handleShowProcessLog = (doc: VersionDocument) => {
    setProcessLogDoc(doc)
    setProcessLogOpen(true)
  }

  /** Sync live parser status from RAGFlow on demand */
  const handleSyncParserStatus = async () => {
    setSyncing(true)
    try {
      await syncVersionParserStatus(knowledgeBaseId, categoryId, versionId)
      await fetchDocuments()
      globalMessage.success(t('knowledgeBase.documents.syncParserSuccess'))
    } catch {
      globalMessage.error(t('knowledgeBase.documents.syncParserError'))
    } finally {
      setSyncing(false)
    }
  }

  /** Handle search input submission */
  const handleSearch = () => {
    setSearchKeyword(searchInput)
    setCurrentPage(1)
  }

  /** Toggle row selection for a single document */
  const toggleRowSelection = (docId: string) => {
    setSelectedRowKeys((prev) =>
      prev.includes(docId) ? prev.filter((k) => k !== docId) : [...prev, docId]
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

  // ── Derived State ──────────────────────────────────────────────────────

  const hasLocalSelected = selectedRowKeys.length > 0 && documents.some(
    (doc) => selectedRowKeys.includes(doc.id) && doc.run === 'local',
  )
  const hasImportedSelected = selectedRowKeys.length > 0 && documents.some(
    (doc) => selectedRowKeys.includes(doc.id) && doc.run === 'imported',
  )
  const hasParsableSelected = selectedRowKeys.length > 0 && documents.some(
    (doc) => selectedRowKeys.includes(doc.id) && doc.run !== '1' && doc.run !== 'RUNNING',
  )
  const hasParseableStatus = documents.some(
    (doc) => doc.run === 'imported' || doc.run === 'UNSTART' || doc.run === 'RUNNING'
      || doc.run === '1' || (doc.progress > 0 && doc.progress < 1),
  )

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
          {t('knowledgeBase.documents.title')}
          {versionLabel && (
            <Badge variant="info" className="text-xs">{versionLabel}</Badge>
          )}
          {!loading && documents.length > 0 && (
            <span className="text-xs font-normal text-gray-400">
              ({documents.length} {t('knowledgeBase.documents.totalFiles')})
            </span>
          )}
        </h4>
        <div className="flex items-center gap-2">
          {/* Bulk action buttons — visible when rows are selected */}
          {selectedRowKeys.length > 0 && (
            <>
              <Button variant="destructive" size="sm" disabled={deleting} onClick={handleDeleteSelected}>
                {deleting ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Trash2 size={14} className="mr-1" />}
                {t('knowledgeBase.documents.deleteSelected', { count: selectedRowKeys.length })}
              </Button>
              {hasLocalSelected && (
                <Button size="sm" disabled={requeueing} onClick={handleRetryParse}>
                  {requeueing ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RefreshCw size={14} className="mr-1" />}
                  {t('knowledgeBase.documents.retryParse')}
                </Button>
              )}
              {hasImportedSelected && (
                <Button size="sm" disabled={parsing} onClick={handleStartParse}>
                  {parsing ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Play size={14} className="mr-1" />}
                  {t('knowledgeBase.documents.startParse')}
                </Button>
              )}
              {/* Bulk cancel parsing for selected documents */}
              {datasetId && hasParsableSelected && (
                <Button variant="outline" size="sm" onClick={handleBulkCancel}>
                  <XCircle size={14} className="mr-1" />
                  {t('knowledgeBase.documents.stopParse')}
                </Button>
              )}
              {/* Edit Tags — opens MetadataManageDialog in bulk mode */}
              {datasetId && (
                <Button variant="outline" size="sm" onClick={() => setBulkMetadataOpen(true)}>
                  <Tags size={14} className="mr-1" />
                  {t('datasets.editTags', 'Edit Tags')}
                </Button>
              )}
            </>
          )}

          {/* Search input */}
          <div className="relative w-[200px]">
            <Input
              placeholder={t('knowledgeBase.documents.search')}
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
                  {t('knowledgeBase.documents.uploadFiles')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('knowledgeBase.documents.uploadFiles')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" onClick={() => setUploadFolderOpen(true)}>
                  <FolderUp size={14} className="mr-1" />
                  {t('knowledgeBase.documents.folderUpload')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('knowledgeBase.documents.folderUpload')}</TooltipContent>
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
                    {t('knowledgeBase.documents.syncParserStatus')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('knowledgeBase.documents.syncParserStatus')}</TooltipContent>
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
        <EmptyState description={t('knowledgeBase.documents.noDocumentsHint')} />
      ) : (
        <>
          <div className="overflow-auto">
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
                  <TableHead>{t('knowledgeBase.documents.name')}</TableHead>
                  <TableHead className="w-[100px]">{t('knowledgeBase.documents.size')}</TableHead>
                  <TableHead className="w-[100px]">{t('knowledgeBase.documents.parser')}</TableHead>
                  <TableHead className="w-[160px]">{t('knowledgeBase.documents.status')}</TableHead>
                  {datasetId && <TableHead className="w-[70px]">{t('datasets.enabled', 'Enabled')}</TableHead>}
                  <TableHead className="w-[80px] text-right">{t('knowledgeBase.documents.chunks')}</TableHead>
                  <TableHead className="w-[110px]">{t('knowledgeBase.documents.updatedAt')}</TableHead>
                  {datasetId && <TableHead className="w-[100px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDocuments.map((doc) => {
                  const status = getStatusBadge(doc, t)
                  const isParsing = doc.run === '1' || doc.run === 'RUNNING' || (doc.progress > 0 && doc.progress < 1)
                  const canParse = !isParsing && doc.run !== 'local' && doc.run !== 'converted'
                  // Document is enabled when status is '1' (RAGFlow convention) or 'completed'
                  const isEnabled = doc.status === '1' || doc.status === 'completed'
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

                      {/* File name with icon — clickable to navigate to chunk detail */}
                      <TableCell className="max-w-[300px]">
                        <div className="flex items-center gap-2">
                          {getFileIcon(doc.name)}
                          {datasetId ? (
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
                          ) : (
                            <span className="truncate" title={doc.name}>{doc.name}</span>
                          )}
                        </div>
                      </TableCell>

                      {/* File size */}
                      <TableCell>
                        <span className="text-gray-500 dark:text-gray-400 text-xs">{formatFileSize(doc.size)}</span>
                      </TableCell>

                      {/* Parser badge */}
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">
                          {doc.parser_id === 'naive' ? 'General' : doc.parser_id || 'General'}
                        </Badge>
                      </TableCell>

                      {/* Status badge — clickable to open process log + inline progress bar */}
                      <TableCell>
                        <div>
                          <button
                            onClick={() => handleShowProcessLog(doc)}
                            className="text-left cursor-pointer hover:opacity-80 transition-opacity"
                          >
                            <Badge variant={status.variant}>
                              {status.label}
                              {isParsing && doc.progress > 0 && doc.progress < 1 && ` ${Math.round(doc.progress * 100)}%`}
                            </Badge>
                          </button>
                          {/* Inline progress bar for actively parsing documents */}
                          {isParsing && doc.progress > 0 && doc.progress < 1 && (
                            <Progress value={Math.round(doc.progress * 100)} className="mt-1 h-1.5" />
                          )}
                        </div>
                      </TableCell>

                      {/* Enabled toggle */}
                      {datasetId && (
                        <TableCell>
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={(checked: boolean) => handleToggleAvailability(doc.id, checked)}
                          />
                        </TableCell>
                      )}

                      {/* Chunk count */}
                      <TableCell className="text-right">
                        <span className="text-gray-500 dark:text-gray-400 text-xs">
                          {doc.chunk_num ?? doc.chunk_count ?? 0}
                        </span>
                      </TableCell>

                      {/* Update date */}
                      <TableCell>
                        <span className="text-gray-500 dark:text-gray-400 text-xs">{formatDocUpdateDate(doc)}</span>
                      </TableCell>

                      {/* Action buttons — change parser, parse/stop, delete */}
                      {datasetId && (
                        <TableCell>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* Change Parser */}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setChangeParserDoc(doc)}
                                    disabled={isParsing}
                                  >
                                    <Settings2 size={14} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('datasets.changeParser', 'Change Parser')}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            {/* Parse / Stop */}
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
                                  <TooltipContent>{t('knowledgeBase.documents.stopParse')}</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : canParse ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleParseSingle(doc.id)}>
                                      <Play size={14} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t('knowledgeBase.documents.parse')}</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : null}

                            {/* Delete */}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteSingle(doc.id)}
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('common.delete')}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

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
        knowledgeBaseId={knowledgeBaseId}
        categoryId={categoryId}
        versionId={versionId}
        onClose={() => setUploadFilesOpen(false)}
        onUploadComplete={handleUploadComplete}
      />
      <UploadFolderModal
        open={uploadFolderOpen}
        knowledgeBaseId={knowledgeBaseId}
        categoryId={categoryId}
        versionId={versionId}
        onClose={() => setUploadFolderOpen(false)}
        onUploadComplete={handleUploadComplete}
      />

      {/* Process log dialog — shows parse status, progress details, and error log */}
      <ProcessLogDialog
        open={processLogOpen}
        onClose={() => { setProcessLogOpen(false); setProcessLogDoc(null) }}
        document={processLogDoc && datasetId ? toDatasetDocument(processLogDoc, datasetId) : null}
      />

      {/* Bulk metadata dialog — edits metadata_tags for selected documents */}
      {datasetId && (
        <MetadataManageDialog
          open={bulkMetadataOpen}
          onClose={() => { setBulkMetadataOpen(false); setSelectedRowKeys([]) }}
          datasetId={datasetId}
          datasetIds={selectedRowKeys}
        />
      )}

      {/* Change parser dialog — reused from datasets feature */}
      {changeParserDoc && datasetId && (
        <ChangeParserDialog
          open={!!changeParserDoc}
          onClose={() => setChangeParserDoc(null)}
          document={toDatasetDocument(changeParserDoc, datasetId)}
          submitting={changingParser}
          onConfirm={handleChangeParser}
        />
      )}
    </div>
  )
}

export default DocumentListPanel
