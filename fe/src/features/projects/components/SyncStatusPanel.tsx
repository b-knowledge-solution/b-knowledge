/**
 * @fileoverview Sync status panel showing last sync info and manual trigger.
 *
 * @module features/projects/components/SyncStatusPanel
 */

import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Play, Clock, Loader2 } from 'lucide-react'
import type { ProjectSyncConfig } from '../api/projectApi'

// ============================================================================
// Types
// ============================================================================

interface SyncStatusPanelProps {
  /** The sync config */
  config: ProjectSyncConfig | null
  /** Handler to trigger manual sync */
  onTriggerSync: () => Promise<void>
  /** Whether a sync is being triggered */
  triggering: boolean
}

// ============================================================================
// Component
// ============================================================================

/**
 * Displays sync status info and manual trigger button.
 *
 * @param props - Component props
 * @returns React element
 */
const SyncStatusPanel = ({
  config,
  onTriggerSync,
  triggering,
}: SyncStatusPanelProps) => {
  const { t } = useTranslation()

  if (!config) {
    return (
      <div className="text-center text-slate-500 dark:text-slate-400 py-8">
        {t('projectManagement.sync.noConfig')}
      </div>
    )
  }

  /**
   * Map status to badge variant.
   *
   * @param status - Sync config status
   * @returns Badge variant string
   */
  const getStatusVariant = (status: string): 'success' | 'info' | 'destructive' | 'secondary' => {
    switch (status) {
      case 'active': return 'success'
      case 'syncing': return 'info'
      case 'error': return 'destructive'
      default: return 'secondary'
    }
  }

  return (
    <div className="space-y-4">
      {/* Descriptions-style definition list */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm border rounded-md p-4 dark:border-slate-700">
        <dt className="font-medium text-slate-600 dark:text-slate-400">
          {t('projectManagement.sync.sourceType')}
        </dt>
        <dd>
          <Badge variant="secondary">{config.source_type}</Badge>
        </dd>

        <dt className="font-medium text-slate-600 dark:text-slate-400">
          {t('common.status')}
        </dt>
        <dd>
          <Badge variant={getStatusVariant(config.status)}>{config.status}</Badge>
        </dd>

        <dt className="font-medium text-slate-600 dark:text-slate-400">
          {t('projectManagement.sync.lastSynced')}
        </dt>
        <dd>
          <span className="flex items-center gap-1">
            <Clock size={14} className="text-slate-400" />
            {config.last_synced_at
              ? new Date(config.last_synced_at).toLocaleString()
              : t('projectManagement.sync.neverSynced')}
          </span>
        </dd>

        <dt className="font-medium text-slate-600 dark:text-slate-400">
          {t('projectManagement.sync.schedule.title')}
        </dt>
        <dd>
          <code className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
            {config.sync_schedule || '\u2014'}
          </code>
        </dd>
      </dl>

      {/* Manual sync trigger */}
      <div className="flex justify-end">
        <Button onClick={onTriggerSync} disabled={triggering}>
          {triggering ? (
            <Loader2 size={16} className="mr-2 animate-spin" />
          ) : (
            <Play size={16} className="mr-2" />
          )}
          {t('projectManagement.sync.triggerNow')}
        </Button>
      </div>
    </div>
  )
}

export default SyncStatusPanel
