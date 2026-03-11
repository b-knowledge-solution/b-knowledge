/**
 * @fileoverview Modal showing active and completed converter jobs for a version.
 *
 * @module features/datasets/components/ConverterJobsModal
 */

import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import type { ConverterJob } from '../types'

// ============================================================================
// Types
// ============================================================================

interface ConverterJobsModalProps {
  /** @description Whether the modal is visible */
  open: boolean
  /** @description Callback to close the modal */
  onClose: () => void
  /** @description List of converter jobs */
  jobs: ConverterJob[]
  /** @description Whether jobs are loading */
  loading: boolean
  /** @description Callback to refresh jobs */
  onRefresh: () => void
}

// ============================================================================
// Helpers
// ============================================================================

/** @description Map job status to badge variant */
const JOB_STATUS_CONFIG: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  pending: { variant: 'secondary', className: '' },
  converting: { variant: 'outline', className: 'border-blue-300 text-blue-600 dark:border-blue-600 dark:text-blue-400 animate-pulse' },
  finished: { variant: 'default', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  failed: { variant: 'destructive', className: '' },
}

// ============================================================================
// Component
// ============================================================================

/**
 * Modal displaying converter jobs with status and progress.
 *
 * @param {ConverterJobsModalProps} props - Component props
 * @returns {JSX.Element} The rendered modal
 */
const ConverterJobsModal = ({ open, onClose, jobs, loading, onRefresh }: ConverterJobsModalProps) => {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{t('versions.converterJobs')}</DialogTitle>
            <Button variant="ghost" size="icon" onClick={onRefresh} className="h-8 w-8">
              <RefreshCw size={14} />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-3 max-h-[400px] overflow-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size={32} />
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              {t('versions.noJobs')}
            </p>
          ) : (
            jobs.map((job) => {
              const config = JOB_STATUS_CONFIG[job.status] ?? { variant: 'secondary' as const, className: '' }
              const progress = job.file_count > 0
                ? Math.round(((job.finished_count + job.failed_count) / job.file_count) * 100)
                : 0

              return (
                <div
                  key={job.id}
                  className="p-3 rounded-lg border bg-card text-card-foreground space-y-2"
                >
                  {/* Job header */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {t('versions.jobId')}: {job.id.slice(0, 8)}...
                    </span>
                    <Badge variant={config.variant} className={config.className}>
                      {t(`versions.jobStatus.${job.status}`)}
                    </Badge>
                  </div>

                  {/* Progress */}
                  <div className="flex items-center gap-2">
                    <Progress value={progress} className="flex-1 h-2" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {job.finished_count}/{job.file_count}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {job.failed_count > 0 && (
                      <span className="text-destructive">
                        {t('versions.failedCount', { count: job.failed_count })}
                      </span>
                    )}
                    <span>
                      {new Date(job.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ConverterJobsModal
