/**
 * @fileoverview Sync status panel showing last sync info and manual trigger.
 *
 * @module features/projects/components/SyncStatusPanel
 */

import { useTranslation } from 'react-i18next'
import { Button, Tag, Descriptions } from 'antd'
import { Play, Clock } from 'lucide-react'
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
   * Map status to tag color.
   *
   * @param status - Sync config status
   * @returns Ant Design tag color
   */
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'green'
      case 'syncing': return 'processing'
      case 'error': return 'error'
      default: return 'default'
    }
  }

  return (
    <div className="space-y-4">
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label={t('projectManagement.sync.sourceType')}>
          <Tag>{config.source_type}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t('common.status')}>
          <Tag color={getStatusColor(config.status)}>{config.status}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t('projectManagement.sync.lastSynced')}>
          <span className="flex items-center gap-1">
            <Clock size={14} className="text-slate-400" />
            {config.last_synced_at
              ? new Date(config.last_synced_at).toLocaleString()
              : t('projectManagement.sync.neverSynced')}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label={t('projectManagement.sync.schedule.title')}>
          <code className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
            {config.sync_schedule || '—'}
          </code>
        </Descriptions.Item>
      </Descriptions>

      {/* Manual sync trigger */}
      <div className="flex justify-end">
        <Button
          type="primary"
          icon={<Play size={16} />}
          onClick={onTriggerSync}
          loading={triggering}
        >
          {t('projectManagement.sync.triggerNow')}
        </Button>
      </div>
    </div>
  )
}

export default SyncStatusPanel
