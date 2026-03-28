/**
 * @fileoverview Dialog showing sync history/logs for a connector.
 * Displays status, document counts, timestamps, and messages
 * for each sync operation.
 *
 * @module features/datasets/components/ConnectorSyncLogsDialog
 */

import { useTranslation } from 'react-i18next'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { useSyncLogs } from '../api/connectorQueries'

// ============================================================================
// Types
// ============================================================================

/** @description Props for the ConnectorSyncLogsDialog component */
interface ConnectorSyncLogsDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Close handler */
  onClose: () => void
  /** Connector UUID to show logs for */
  connectorId: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Dialog displaying sync operation history for a connector.
 * Shows status badges, document counts, timestamps, and progress messages.
 * @param {ConnectorSyncLogsDialogProps} props - Dialog state and connector ID
 * @returns {JSX.Element} Rendered sync logs dialog
 */
const ConnectorSyncLogsDialog = ({
  open,
  onClose,
  connectorId,
}: ConnectorSyncLogsDialogProps) => {
  const { t } = useTranslation()
  const { data: logs = [], isLoading } = useSyncLogs(connectorId, { limit: 20 })

  /** Get badge styling based on sync status */
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{t('datasets.connectors.syncCompleted')}</Badge>
      case 'failed':
        return <Badge variant="destructive">{t('datasets.connectors.syncFailed')}</Badge>
      case 'running':
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{t('datasets.connectors.syncRunning')}</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('datasets.connectors.syncLogsTitle')}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size={24} />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {t('datasets.connectors.noSyncLogs')}
          </p>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="border rounded-lg p-3 dark:border-slate-700"
              >
                <div className="flex items-center justify-between mb-1">
                  {getStatusBadge(log.status)}
                  <span className="text-xs text-muted-foreground">
                    {log.started_at ? new Date(log.started_at).toLocaleString() : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                  <span>
                    {t('datasets.connectors.docsSynced')}: {log.docs_synced}
                  </span>
                  <span>
                    {t('datasets.connectors.docsFailed')}: {log.docs_failed}
                  </span>
                  {log.progress > 0 && log.progress < 100 && (
                    <span>
                      {t('datasets.connectors.progress')}: {log.progress}%
                    </span>
                  )}
                </div>
                {log.message && (
                  <p className="text-xs text-muted-foreground mt-1 truncate" title={log.message}>
                    {log.message}
                  </p>
                )}
                {log.finished_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('datasets.connectors.finishedAt')}: {new Date(log.finished_at).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default ConnectorSyncLogsDialog
