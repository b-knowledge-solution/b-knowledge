/**
 * @fileoverview Job Management Modal — shows converter jobs for a specific
 * project version with Active/History tabs, force-start confirm dialog,
 * and optional auto-parse after upload finishes.
 *
 * @module features/projects/components/JobManagementModal
 */

import React, { useState, useEffect, useRef } from 'react'
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
  Play,
  AlertTriangle,
} from 'lucide-react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { globalMessage } from '@/app/App'

import {
  getConverterJobs,
  getVersionJobFiles,
  triggerManualConversion,
  parseVersionDocuments,
  type VersionJob,
  type FileTrackingRecord,
  type ConversionJobStatus,
} from '../../system/api/converterApi'

// ============================================================================
// Types
// ============================================================================

interface JobManagementModalProps {
  /** Whether the modal is visible */
  open: boolean
  /** Close handler */
  onClose: () => void
  /** Current project ID */
  projectId: string
  /** Current category ID */
  categoryId: string
  /** Current version ID */
  versionId: string
  /** Version label for display */
  versionLabel?: string
}

// ============================================================================
// Helpers
// ============================================================================

/** Map status to badge variant */
const statusVariant = (status: ConversionJobStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  const map: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pending: 'secondary',
    waiting: 'outline',
    converting: 'default',
    finished: 'default',
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
  if (!iso) return '\u2014'
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

  // Show spinner while loading
  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
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
                <FileText size={14} className="text-gray-400 dark:text-gray-500 shrink-0" />
                <span className="text-xs truncate">{file.fileName}</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant(file.status)} className="text-xs">
                <StatusIcon status={file.status} />
                <span className="ml-1">{t(`converter.status.${file.status}`)}</span>
              </Badge>
            </TableCell>
            <TableCell>
              {file.error ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-destructive truncate block max-w-[200px]">{file.error}</span>
                    </TooltipTrigger>
                    <TooltipContent><p className="max-w-xs text-xs">{file.error}</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <span className="text-xs text-muted-foreground">{'\u2014'}</span>
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
 * JobManagementModal — shows version-level jobs with Active/History tabs,
 * a Force Start button (with confirm dialog), and an optional auto-parse
 * checkbox that triggers RAGFlow parsing after all files are uploaded.
 */
const JobManagementModal = ({
  open,
  onClose,
  projectId,
  categoryId,
  versionId,
  versionLabel,
}: JobManagementModalProps) => {
  const { t } = useTranslation()
  const [jobs, setJobs] = useState<VersionJob[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])
  const [forceStarting, setForceStarting] = useState(false)
  const [parsing, setParsing] = useState(false)

  // ── Confirm dialog state ────────────────────────────────────────────────
  const [confirmVisible, setConfirmVisible] = useState(false)
  /** Whether to trigger RAGFlow parse after upload completes */
  const [autoParseAfterUpload, setAutoParseAfterUpload] = useState(false)

  // Track if we're waiting to auto-parse after job finishes
  const pendingAutoParseRef = useRef(false)
  // Stable ref so the interval can always call the latest triggerParseAll
  // without needing it as a useEffect dependency (avoids missing-dep lint)
  const triggerParseAllRef = useRef<((jobs: VersionJob[]) => Promise<void>) | null>(null)

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
      return result.jobs
    } catch (err: unknown) {
      console.error('Failed to fetch version jobs:', err)
      return []
    } finally {
      setLoading(false)
    }
  }

  // Fetch on open + auto-refresh while modal is open
  useEffect(() => {
    if (!open) return
    fetchJobs()
    const timer = setInterval(async () => {
      const latestJobs = await fetchJobs(true)

      // ── Auto-parse trigger ─────────────────────────────────────────────
      // If user requested auto-parse and all jobs are now finished/failed
      if (pendingAutoParseRef.current && latestJobs.length > 0) {
        const allDone = latestJobs.every(
          (j) => j.status === 'finished' || j.status === 'failed',
        )
        if (allDone) {
          pendingAutoParseRef.current = false
          // Use the stable ref to avoid missing-dep warning
          triggerParseAllRef.current?.(latestJobs)
        }
      }
    }, 10000)
    return () => clearInterval(timer)
  }, [open, projectId, categoryId, versionId])

  // ── Parse All Finished Files ───────────────────────────────────────────

  /**
   * Collects file names from all finished jobs and triggers RAGFlow parsing.
   * @param latestJobs - Current jobs (fetched right before calling)
   */
  const triggerParseAll = async (latestJobs: VersionJob[]) => {
    setParsing(true)
    try {
      // Gather all file names from finished jobs
      const fileNamesSet = new Set<string>()
      for (const job of latestJobs) {
        if (job.status === 'finished') {
          const res = await getVersionJobFiles(job.id)
          for (const f of res.files) {
            if (f.status === 'finished') fileNamesSet.add(f.fileName)
          }
        }
      }
      const fileNames = Array.from(fileNamesSet)
      if (fileNames.length === 0) {
        globalMessage.warning(t('converter.panel.autoParseNoFiles'))
        return
      }

      const result = await parseVersionDocuments(projectId, categoryId, versionId, fileNames)
      globalMessage.success(
        t('converter.panel.autoParseSuccess', { count: result.triggered ?? fileNames.length }),
      )
    } catch (err) {
      globalMessage.error(t('converter.panel.autoParseError'))
      console.error('Auto-parse failed:', err)
    } finally {
      setParsing(false)
    }
  }

  // Keep the ref in sync so the interval callback always uses latest version
  useEffect(() => {
    triggerParseAllRef.current = triggerParseAll
  })

  // ── Force Start Handler ────────────────────────────────────────────────

  /**
   * Triggered when user clicks OK in the confirm dialog.
   * Starts conversion; if auto-parse checkbox is checked, sets the pending flag.
   */
  const handleConfirmForceStart = async () => {
    setConfirmVisible(false)
    setForceStarting(true)
    try {
      const result = await triggerManualConversion()
      globalMessage.success(result.message || t('converter.panel.forceStartSuccess'))

      // If user checked "parse after finish", set the pending flag.
      // The refresh interval will detect when all jobs are done and call triggerParseAll.
      if (autoParseAfterUpload) {
        pendingAutoParseRef.current = true
        globalMessage.info(t('converter.panel.autoParseScheduled'))
      }

      // Refresh after a short delay to show new status
      setTimeout(() => fetchJobs(), 1500)
    } catch (err) {
      globalMessage.error(t('converter.panel.forceStartError'))
    } finally {
      setForceStarting(false)
    }
  }

  // ── Split jobs into active and history ─────────────────────────────────

  const activeJobs = jobs.filter(
    (j) => j.status === 'pending' || j.status === 'waiting' || j.status === 'converting',
  )
  const historyJobs = jobs.filter(
    (j) => j.status === 'finished' || j.status === 'failed',
  )

  // Force Start: enabled only when >=1 pending job and no waiting/converting
  const hasPending = jobs.some((j) => j.status === 'pending')
  const hasActive = jobs.some((j) => j.status === 'waiting' || j.status === 'converting')
  const forceStartDisabled = !hasPending || hasActive

  // ── Shared table render ────────────────────────────────────────────────

  /**
   * Renders the jobs table for a given data set.
   * @param data - Array of VersionJob to render
   */
  const renderJobTable = (data: VersionJob[]) => {
    // Show loading spinner when fetching
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      )
    }

    if (data.length === 0) {
      return (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          {t('common.noData', 'No data')}
        </div>
      )
    }

    return (
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
          {data.map((job) => {
            const isExpanded = expandedRowKeys.includes(job.id)
            const { fileCount, finishedCount, failedCount } = job
            const doneCount = finishedCount + failedCount
            const percent = fileCount > 0 ? Math.round((doneCount / fileCount) * 100) : 0

            return (
              <React.Fragment key={job.id}>
                <TableRow>
                  {/* Expand toggle */}
                  <TableCell className="px-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => setExpandedRowKeys(isExpanded ? [] : [job.id])}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </Button>
                  </TableCell>
                  {/* Status */}
                  <TableCell>
                    <Badge variant={statusVariant(job.status)}>
                      <StatusIcon status={job.status} />
                      <span className="ml-1">{t(`converter.status.${job.status}`)}</span>
                    </Badge>
                  </TableCell>
                  {/* File progress */}
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <Progress value={percent} className={`h-2 flex-1 ${failedCount > 0 ? '[&>div]:bg-destructive' : ''}`} />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{doneCount}/{fileCount}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {finishedCount > 0 && <span className="text-green-600">{finishedCount} &#10003;</span>}
                        {failedCount > 0 && <span className="text-red-500 ml-1">{failedCount} &#10007;</span>}
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
                {/* Expanded row with file details */}
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={5} className="bg-muted/50 p-2">
                      <FileExpandRow jobId={job.id} />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            )
          })}
        </TableBody>
      </Table>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Main modal ─────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
        <DialogContent className="max-w-[70%] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              <span className="font-semibold">{t('converter.panel.title')}</span>
              {versionLabel && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {'\u2014'} {versionLabel}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Action bar */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setConfirmVisible(true)}
                disabled={forceStartDisabled || forceStarting || parsing}
              >
                {(forceStarting || parsing) && <Loader2 size={14} className="animate-spin mr-1" />}
                <Play size={14} className="mr-1" />
                {parsing
                  ? t('converter.panel.parsing')
                  : t('converter.panel.forceStart')}
              </Button>
              {pendingAutoParseRef.current && (
                <span className="text-xs text-muted-foreground">
                  {t('converter.panel.waitingToAutoparse')}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchJobs()}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>

          {/* Tabs for Active / History */}
          <Tabs defaultValue="active" className="flex-1 overflow-hidden flex flex-col">
            <TabsList>
              <TabsTrigger value="active" className="gap-1">
                {t('converter.panel.activeJobs')}
                {activeJobs.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-xs">
                    {activeJobs.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history">
                {t('converter.panel.jobHistory')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="flex-1 overflow-auto">
              {renderJobTable(activeJobs)}
            </TabsContent>
            <TabsContent value="history" className="flex-1 overflow-auto">
              {renderJobTable(historyJobs)}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ── Confirm dialog ─────────────────────────────────────────────── */}
      <Dialog open={confirmVisible} onOpenChange={(v: boolean) => { if (!v) setConfirmVisible(false) }}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-orange-500" />
              {t('converter.panel.forceStartConfirmTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-1">
            {/* Warning alert */}
            <div className="rounded-md border border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 p-3 text-sm text-yellow-800 dark:text-yellow-200">
              {t('converter.panel.forceStartConfirmMessage')}
            </div>

            {/* Auto-parse checkbox */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoParseAfterUpload}
                  onChange={(e) => setAutoParseAfterUpload(e.target.checked)}
                  className="rounded mt-0.5"
                />
                <div>
                  <div className="font-medium text-sm">
                    {t('converter.panel.autoParseLabel')}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {t('converter.panel.autoParseDesc')}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmVisible(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleConfirmForceStart}>
              {t('converter.panel.forceStart')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default JobManagementModal
