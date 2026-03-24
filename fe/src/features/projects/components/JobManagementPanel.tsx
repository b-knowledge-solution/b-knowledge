/**
 * @fileoverview Job Management Panel — shows converter jobs for a specific
 * project version, with inline file tracking expand.
 *
 * Displayed within the DocumentsTab when a category version is selected.
 * Fetches version-level jobs filtered by versionId and shows file progress.
 *
 * @module features/projects/components/JobManagementPanel
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
  Layers,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

import {
  getConverterJobs,
  getVersionJobFiles,
  type VersionJob,
  type FileTrackingRecord,
  type ConversionJobStatus,
} from '../../system/api/converterApi'
import { useConverterSocket } from '../../system/hooks/useConverterSocket'

// ============================================================================
// Types
// ============================================================================

interface JobManagementPanelProps {
  /** Current project ID */
  projectId: string
  /** Current category ID */
  categoryId: string
  /** Current version ID */
  versionId: string
}

// ============================================================================
// Helpers
// ============================================================================

/** Map status to Badge variant */
const statusVariant = (status: ConversionJobStatus): 'secondary' | 'warning' | 'info' | 'success' | 'destructive' => {
  const map: Record<string, 'secondary' | 'warning' | 'info' | 'success' | 'destructive'> = {
    pending: 'secondary',
    waiting: 'warning',
    converting: 'info',
    finished: 'success',
    failed: 'destructive',
  }
  return map[status] || 'secondary'
}

/** Map status to icon */
const StatusIcon = ({ status }: { status: ConversionJobStatus }) => {
  switch (status) {
    case 'finished':
      return <CheckCircle size={14} className="text-green-500" />
    case 'failed':
      return <XCircle size={14} className="text-red-500" />
    case 'converting':
      return <Loader2 size={14} className="text-blue-500 animate-spin" />
    case 'waiting':
      return <Clock size={14} className="text-orange-400" />
    default:
      return <Clock size={14} className="text-gray-400" />
  }
}

/** Format ISO date string */
const formatDate = (iso: string): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ============================================================================
// FileExpandRow
// ============================================================================

/**
 * Renders per-file tracking records for a version job.
 */
const FileExpandRow = ({ jobId }: { jobId: string }) => {
  const { t } = useTranslation()
  const [files, setFiles] = useState<FileTrackingRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getVersionJobFiles(jobId)
      .then((res) => {
        if (!cancelled) setFiles(res.files)
      })
      .catch((err: unknown) => {
        console.error('Failed to load job files:', err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [jobId])

  // Show spinner while loading file records
  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size={20} />
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('converter.files.fileName')}</TableHead>
          <TableHead className="w-[110px]">{t('converter.files.status')}</TableHead>
          <TableHead>{t('converter.files.error')}</TableHead>
          <TableHead className="w-[140px]">{t('converter.files.updatedAt')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.map((file) => (
          <TableRow key={file.id}>
            <TableCell>
              <div className="flex items-center gap-1">
                <FileText size={14} className="text-gray-400 shrink-0" />
                <span className="text-xs truncate">{file.fileName}</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant(file.status)} className="text-xs">
                <span className="flex items-center gap-1">
                  <StatusIcon status={file.status} />
                  {t(`converter.status.${file.status}`)}
                </span>
              </Badge>
            </TableCell>
            <TableCell>
              {file.error ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-destructive truncate block max-w-[200px]">{file.error}</span>
                    </TooltipTrigger>
                    <TooltipContent>{file.error}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              <span className="text-xs">{formatDate(file.updatedAt)}</span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Collapsible panel showing version-level conversion jobs with inline file tracking expand.
 * Includes WebSocket real-time updates and 30s polling fallback.
 * @param {JobManagementPanelProps} props - Project, category, and version IDs for job filtering
 * @returns {JSX.Element | null} Rendered job panel or null when no jobs exist
 */
const JobManagementPanel = ({
  projectId,
  categoryId,
  versionId,
}: JobManagementPanelProps) => {
  const { t } = useTranslation()
  const [jobs, setJobs] = useState<VersionJob[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState(false)

  // ── Data Fetching ──────────────────────────────────────────────────────

  const fetchJobs = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const result = await getConverterJobs({
        projectId,
        categoryId,
        versionId,
        page: 1,
        pageSize: 100,
      })
      setJobs(result.jobs)
    } catch (err: unknown) {
      console.error('Failed to fetch version jobs:', err)
    } finally {
      setLoading(false)
    }
  }

  // Initial fetch + auto-refresh every 30s (fallback)
  useEffect(() => {
    fetchJobs()
    const timer = setInterval(() => fetchJobs(true), 30000)
    return () => clearInterval(timer)
  }, [projectId, categoryId, versionId])

  // Real-time updates via WebSocket — triggers silent refetch
  useConverterSocket({
    onFileUpdate: () => fetchJobs(true),
    onJobUpdate: () => fetchJobs(true),
  })

  // ── Panel Header ───────────────────────────────────────────────────────

  /** Count active (pending/processing) jobs */
  const activeCount = jobs.filter(
    (j) => j.status === 'pending' || j.status === 'waiting' || j.status === 'converting',
  ).length

  // ── Render ─────────────────────────────────────────────────────────────

  if (jobs.length === 0 && !loading) return null

  return (
    <div className="converter-job-panel border rounded-lg">
      {/* Collapsible header */}
      <button
        type="button"
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-t-lg"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          <Layers size={16} className="text-gray-500" />
          <span className="text-sm font-semibold">
            {t('converter.panel.title')}
          </span>
          {activeCount > 0 && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0">
              {activeCount}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation()
            fetchJobs()
          }}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </Button>
      </button>

      {/* Collapsible content */}
      {!collapsed && (
        <div className="px-2 pb-2">
          {loading && jobs.length === 0 ? (
            <div className="flex justify-center py-4">
              <Spinner size={20} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="w-[120px]">{t('converter.jobs.status')}</TableHead>
                  <TableHead className="w-[200px]">{t('converter.jobs.files')}</TableHead>
                  <TableHead className="w-[140px]">{t('converter.jobs.createdAt')}</TableHead>
                  <TableHead className="w-[140px]">{t('converter.jobs.updatedAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const isExpanded = expandedRowKeys.includes(job.id)
                  const { fileCount, finishedCount, failedCount } = job
                  const doneCount = finishedCount + failedCount
                  const percent = fileCount > 0 ? Math.round((doneCount / fileCount) * 100) : 0

                  return (
                    <>
                      <TableRow key={job.id}>
                        {/* Expand toggle */}
                        <TableCell className="w-8 p-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() =>
                              setExpandedRowKeys(isExpanded ? [] : [job.id])
                            }
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </Button>
                        </TableCell>
                        {/* Status */}
                        <TableCell>
                          <Badge variant={statusVariant(job.status)}>
                            <span className="flex items-center gap-1">
                              <StatusIcon status={job.status} />
                              {t(`converter.status.${job.status}`)}
                            </span>
                          </Badge>
                        </TableCell>
                        {/* File progress */}
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <Progress
                                value={percent}
                                className={`h-2 flex-1 ${failedCount > 0 ? '[&>div]:bg-destructive' : ''}`}
                              />
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {doneCount}/{fileCount}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {finishedCount > 0 && <span className="text-green-600">{finishedCount} ✓</span>}
                              {failedCount > 0 && <span className="text-red-500 ml-1">{failedCount} ✗</span>}
                            </span>
                          </div>
                        </TableCell>
                        {/* Created at */}
                        <TableCell>
                          <span className="text-xs">{formatDate(job.createdAt)}</span>
                        </TableCell>
                        {/* Updated at */}
                        <TableCell>
                          <span className="text-xs">{formatDate(job.updatedAt)}</span>
                        </TableCell>
                      </TableRow>
                      {/* Expanded file tracking row */}
                      {isExpanded && (
                        <TableRow key={`${job.id}-expand`}>
                          <TableCell colSpan={5} className="p-0 bg-muted/30">
                            <div className="pl-8 py-2">
                              <FileExpandRow jobId={job.id} />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  )
}

export default JobManagementPanel
