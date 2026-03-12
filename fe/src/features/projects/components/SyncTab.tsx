/**
 * @fileoverview Main sync tab for datasync project detail.
 *
 * Contains sub-tabs for connection config, schedule, and status.
 *
 * @module features/projects/components/SyncTab
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, Spin, message } from 'antd'
import { Settings, Clock, Activity } from 'lucide-react'
import {
  getSyncConfigs,
  createSyncConfig,
  updateSyncConfig,
  triggerSync,
  type ProjectSyncConfig,
  type SyncSourceType,
} from '../api/projectService'
import SyncConfigPanel from './SyncConfigPanel'
import SyncSchedulePanel from './SyncSchedulePanel'
import SyncStatusPanel from './SyncStatusPanel'

// ============================================================================
// Types
// ============================================================================

interface SyncTabProps {
  /** Current project ID */
  projectId: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * Sync tab with sub-tabs for config, schedule, and status.
 *
 * @param props - Component props
 * @returns React element
 */
const SyncTab = ({ projectId }: SyncTabProps) => {
  const { t } = useTranslation()
  const [configs, setConfigs] = useState<ProjectSyncConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [triggering, setTriggering] = useState(false)

  /** Active config (first one — one config per project for now) */
  const activeConfig = configs.length > 0 ? configs[0] : null

  /**
   * Fetch sync configs for the project.
   */
  const fetchConfigs = async () => {
    try {
      setLoading(true)
      const data = await getSyncConfigs(projectId)
      setConfigs(data)
    } catch (err) {
      console.error('Failed to load sync configs:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConfigs()
  }, [projectId])

  /**
   * Save connection config (create or update).
   */
  const handleSaveConfig = async (data: {
    source_type: SyncSourceType
    connection_config: Record<string, unknown>
  }) => {
    setSaving(true)
    try {
      if (activeConfig) {
        await updateSyncConfig(projectId, activeConfig.id, data)
      } else {
        await createSyncConfig(projectId, data)
      }
      await fetchConfigs()
    } finally {
      setSaving(false)
    }
  }

  /**
   * Save schedule.
   */
  const handleSaveSchedule = async (schedule: string) => {
    if (!activeConfig) return
    setSaving(true)
    try {
      await updateSyncConfig(projectId, activeConfig.id, { sync_schedule: schedule })
      await fetchConfigs()
    } finally {
      setSaving(false)
    }
  }

  /**
   * Trigger a manual sync.
   */
  const handleTriggerSync = async () => {
    if (!activeConfig) return
    setTriggering(true)
    try {
      await triggerSync(projectId, activeConfig.id)
      message.success(t('projectManagement.sync.triggerSuccess'))
      await fetchConfigs()
    } catch (err) {
      message.error(String(err))
    } finally {
      setTriggering(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spin />
      </div>
    )
  }

  return (
    <Tabs
      defaultActiveKey="connection"
      items={[
        {
          key: 'connection',
          label: (
            <span className="flex items-center gap-2">
              <Settings size={16} />
              {t('projectManagement.sync.connection')}
            </span>
          ),
          children: (
            <SyncConfigPanel
              config={activeConfig ?? null}
              onSave={handleSaveConfig}
              saving={saving}
            />
          ),
        },
        {
          key: 'schedule',
          label: (
            <span className="flex items-center gap-2">
              <Clock size={16} />
              {t('projectManagement.sync.schedule.title')}
            </span>
          ),
          children: (
            <SyncSchedulePanel
              schedule={activeConfig?.sync_schedule || null}
              onSave={handleSaveSchedule}
              saving={saving}
            />
          ),
        },
        {
          key: 'status',
          label: (
            <span className="flex items-center gap-2">
              <Activity size={16} />
              {t('projectManagement.sync.status')}
            </span>
          ),
          children: (
            <SyncStatusPanel
              config={activeConfig ?? null}
              onTriggerSync={handleTriggerSync}
              triggering={triggering}
            />
          ),
        },
      ]}
    />
  )
}

export default SyncTab
