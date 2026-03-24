/**
 * @fileoverview Process Log Modal — displays structured RAG worker logs for a document.
 * Adapted from RAGFlow's process-log-modal with B-Knowledge conventions.
 *
 * @module features/datasets/components/ProcessLogModal
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import {
  FileText, Clock, Hash, HardDrive, Activity,
  CheckCircle2, XCircle, Loader2,
} from 'lucide-react'
import { useDocumentLogs } from '../api/datasetQueries'
import type { ProcessLogTask } from '../types'

/**
 * @description Props for the ProcessLogModal component.
 */
interface ProcessLogModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Callback to close the modal */
  onClose: () => void
  /** Dataset UUID containing the document */
  datasetId: string
  /** Document UUID to show logs for, null when closed */
  docId: string | null
}

/**
 * @description Format file size to human-readable string.
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g. "1.5 MB")
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * @description Get status badge variant and label.
 * @param status - Task status string
 * @returns Object with variant and label
 */
function getStatusBadge(status: string) {
  switch (status) {
    case 'done':
      return { variant: 'default' as const, label: 'Done', icon: CheckCircle2, className: 'bg-green-600' }
    case 'failed':
      return { variant: 'destructive' as const, label: 'Failed', icon: XCircle, className: '' }
    case 'running':
      return { variant: 'secondary' as const, label: 'Running', icon: Loader2, className: 'bg-blue-600 text-white' }
    default:
      return { variant: 'outline' as const, label: status, icon: Activity, className: '' }
  }
}

/**
 * @description Render log text with error highlighting.
 * Lines containing [ERROR] or error keywords are highlighted in red.
 * @param text - Raw log text
 * @returns JSX elements with formatted log lines
 */
function renderLogText(text: string) {
  if (!text) return null

  return text.split('\n').map((line, idx) => {
    const isError = /\[ERROR\]|error|exception|traceback/i.test(line)
    return (
      <div
        key={idx}
        className={`font-mono text-xs leading-5 ${isError ? 'text-red-500 font-semibold' : 'text-muted-foreground'}`}
      >
        {line || '\u00A0'}
      </div>
    )
  })
}

/**
 * @description Process Log Modal component.
 * Shows document info grid, task history list, and detailed log messages
 * with error line highlighting. Only fetches data when the modal is open.
 *
 * @param {ProcessLogModalProps} props - Component properties
 * @returns {JSX.Element} Rendered process log modal
 */
const ProcessLogModal: React.FC<ProcessLogModalProps> = ({
  open,
  onClose,
  datasetId,
  docId,
}) => {
  const { t } = useTranslation()
  const { data, isLoading } = useDocumentLogs(
    open ? datasetId : undefined,
    open && docId ? docId : undefined,
  )

  const doc = data?.document
  const tasks = data?.tasks || []

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('datasets.processLog')}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size={32} />
          </div>
        ) : !doc ? (
          <div className="text-center py-12 text-muted-foreground">
            {t('datasets.noLogsFound')}
          </div>
        ) : (
          <div className="flex-1 overflow-auto pr-4">
            {/* Document info grid */}
            <div className="grid grid-cols-2 gap-3 mb-6 p-4 rounded-lg border bg-muted/30">
              <InfoItem icon={FileText} label={t('datasets.fileName')} value={doc.name} />
              <InfoItem icon={Hash} label={t('datasets.fileType')} value={doc.suffix?.toUpperCase() || doc.type} />
              <InfoItem icon={HardDrive} label={t('datasets.fileSize')} value={formatSize(doc.size)} />
              <InfoItem icon={Activity} label={t('datasets.status')}>
                <StatusBadge status={doc.run === '1' ? 'running' : doc.progress === 1 ? 'done' : doc.progress === -1 ? 'failed' : 'pending'} />
              </InfoItem>
              <InfoItem icon={Hash} label={t('datasets.chunks')} value={String(doc.chunk_num)} />
              <InfoItem icon={Hash} label={t('datasets.tokens')} value={String(doc.token_num)} />
              {doc.create_date && (
                <InfoItem icon={Clock} label={t('datasets.uploadDate')} value={doc.create_date} />
              )}
            </div>

            {/* Task list */}
            {tasks.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">
                  {t('datasets.taskHistory')} ({tasks.length})
                </h3>
                {tasks.map((task: ProcessLogTask) => (
                  <TaskLogCard key={task.task_id} task={task} />
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * @description Info item component for the document info grid.
 */
function InfoItem({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: React.ElementType
  label: string
  value?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        {children || <div className="text-sm font-medium truncate">{value}</div>}
      </div>
    </div>
  )
}

/**
 * @description Status badge with icon.
 */
function StatusBadge({ status }: { status: string }) {
  const { variant, label, icon: Icon, className } = getStatusBadge(status)
  return (
    <Badge variant={variant} className={`gap-1 ${className}`}>
      <Icon className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {label}
    </Badge>
  )
}

/**
 * @description Card displaying a single task log entry.
 */
function TaskLogCard({ task }: { task: ProcessLogTask }) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      {/* Task header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {task.task_type}
          </Badge>
          <StatusBadge status={task.status} />
        </div>
        <div className="text-xs text-muted-foreground">
          {task.task_id.slice(0, 8)}...
        </div>
      </div>

      {/* Task details */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {task.begin_at && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {task.begin_at}
          </span>
        )}
        {task.process_duration > 0 && (
          <span>{task.process_duration.toFixed(1)}s</span>
        )}
        {task.status === 'running' && (
          <span>{Math.round(task.progress * 100)}%</span>
        )}
      </div>

      {/* Log messages */}
      {task.progress_msg && (
        <div className="mt-2 p-2 rounded bg-muted/50 max-h-40 overflow-auto">
          {renderLogText(task.progress_msg)}
        </div>
      )}
    </div>
  )
}

export default ProcessLogModal
