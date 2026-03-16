/**
 * @fileoverview Process log dialog for displaying document parse status and details.
 * Modeled after RAGflow's process-log-modal.tsx.
 *
 * @module features/datasets/components/ProcessLogDialog
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from 'react-i18next'
import type { Document } from '../types'

// ============================================================================
// Types
// ============================================================================

/** Props for ProcessLogDialog */
interface ProcessLogDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** The document to display process info for */
  document: Document | null
}

// ============================================================================
// Helpers
// ============================================================================

/** Map run/progress to human-readable status */
function getParseStatus(doc: Document): {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
} {
  if (doc.run === '1') return { label: 'Parsing', variant: 'default' }
  if (doc.run === '2') return { label: 'Cancelled', variant: 'secondary' }
  if (doc.progress === 1) return { label: 'Completed', variant: 'outline' }
  if (doc.progress === -1) return { label: 'Failed', variant: 'destructive' }
  if (doc.progress > 0 && doc.progress < 1) return { label: 'In Progress', variant: 'default' }
  return { label: 'Pending', variant: 'secondary' }
}

/** Format seconds to human-readable duration */
function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '-'
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}m ${secs}s`
}

/** Format document date from RAGflow fields */
function formatDocDate(doc: Document): string {
  const raw = doc.create_time || doc.create_date || doc.created_at
  if (!raw) return '-'
  const d = typeof raw === 'number' ? new Date(raw) : new Date(raw)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

/** Format file size */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/** Render progress message with [ERROR] lines highlighted */
function renderProgressMsg(msg: string) {
  if (!msg) return null
  // Remove duplicate newlines
  const cleaned = msg.replace(/(\n)\1+/g, '$1')
  return cleaned.split('\n').map((line, i) => {
    const isError = line.includes('[ERROR]')
    return (
      <span key={i} className={isError ? 'text-red-500 dark:text-red-400' : ''}>
        {line}
        {'\n'}
      </span>
    )
  })
}

// ============================================================================
// Component
// ============================================================================

/**
 * Dialog showing document parse status and processing details.
 *
 * @param open - Whether dialog is visible
 * @param onClose - Close callback
 * @param document - Document to display info for
 */
const ProcessLogDialog = ({ open, onClose, document: doc }: ProcessLogDialogProps) => {
  const { t } = useTranslation()

  if (!doc) return null

  const status = getParseStatus(doc)

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t('datasets.processLog')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {/* File Name */}
            <div>
              <p className="text-sm text-muted-foreground">{t('datasets.fileName')}</p>
              <p className="text-sm font-medium truncate" title={doc.name}>{doc.name}</p>
            </div>

            {/* Status */}
            <div>
              <p className="text-sm text-muted-foreground">{t('datasets.status')}</p>
              <Badge variant={status.variant} className="mt-0.5">{status.label}</Badge>
            </div>

            {/* Parser */}
            <div>
              <p className="text-sm text-muted-foreground">{t('datasets.parser')}</p>
              <p className="text-sm font-medium capitalize">{doc.parser_id || 'naive'}</p>
            </div>

            {/* Duration */}
            <div>
              <p className="text-sm text-muted-foreground">{t('datasets.duration')}</p>
              <p className="text-sm font-medium">{formatDuration(doc.process_duration)}</p>
            </div>

            {/* Size */}
            <div>
              <p className="text-sm text-muted-foreground">{t('datasets.size')}</p>
              <p className="text-sm font-medium">{formatSize(doc.size)}</p>
            </div>

            {/* Created */}
            <div>
              <p className="text-sm text-muted-foreground">{t('datasets.createdDate')}</p>
              <p className="text-sm font-medium">{formatDocDate(doc)}</p>
            </div>

            {/* Progress */}
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground">{t('datasets.progress')}</p>
              <p className="text-sm font-medium">
                {doc.progress != null ? `${Math.round(doc.progress * 100)}%` : '-'}
              </p>
            </div>
          </div>

          {/* Progress Message / Log */}
          {doc.progress_msg && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t('datasets.progressMsg')}</p>
              <div className="max-h-[250px] overflow-y-auto rounded-md bg-muted p-3 text-xs font-mono whitespace-pre-wrap">
                {renderProgressMsg(doc.progress_msg)}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ProcessLogDialog
