/**
 * @fileoverview Sync source selector and connection config panel.
 *
 * Used in the Sync tab of datasync projects.
 *
 * @module features/projects/components/SyncConfigPanel
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Select as AntSelect, Button, message } from 'antd'
import { Save } from 'lucide-react'
import type { ProjectSyncConfig, SyncSourceType } from '../api/projectService'
import SyncConnectionFields from './SyncConnectionFields'

// ============================================================================
// Types
// ============================================================================

interface SyncConfigPanelProps {
  /** Existing sync config (null for new) */
  config: ProjectSyncConfig | null
  /** Save handler */
  onSave: (data: {
    source_type: SyncSourceType
    connection_config: Record<string, unknown>
  }) => Promise<void>
  /** Whether saving is in progress */
  saving: boolean
}

// ============================================================================
// Component
// ============================================================================

/**
 * Panel for configuring sync source connection.
 *
 * @param props - Component props
 * @returns React element
 */
const SyncConfigPanel = ({ config, onSave, saving }: SyncConfigPanelProps) => {
  const { t } = useTranslation()
  const [sourceType, setSourceType] = useState<SyncSourceType>(
    config?.source_type || 'sharepoint',
  )
  const [connectionConfig, setConnectionConfig] = useState<Record<string, unknown>>(
    (config?.connection_config as Record<string, unknown>) || {},
  )

  /**
   * Handle save button click.
   */
  const handleSave = async () => {
    try {
      await onSave({ source_type: sourceType, connection_config: connectionConfig })
      message.success(t('projectManagement.sync.saveSuccess'))
    } catch (err) {
      message.error(String(err))
    }
  }

  return (
    <div className="space-y-4">
      {/* Source type selector */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          {t('projectManagement.sync.sourceType')}
        </label>
        <AntSelect
          value={sourceType}
          onChange={(v: SyncSourceType) => {
            setSourceType(v)
            setConnectionConfig({})
          }}
          className="w-full"
          options={[
            { value: 'sharepoint', label: 'SharePoint' },
            { value: 'jira', label: 'JIRA' },
            { value: 'confluence', label: 'Confluence' },
            { value: 'gitlab', label: 'GitLab' },
            { value: 'github', label: 'GitHub' },
          ]}
        />
      </div>

      {/* Connection fields */}
      <SyncConnectionFields
        sourceType={sourceType}
        config={connectionConfig}
        onChange={setConnectionConfig}
      />

      {/* Save button */}
      <div className="flex justify-end pt-2">
        <Button
          type="primary"
          icon={<Save size={16} />}
          onClick={handleSave}
          loading={saving}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}

export default SyncConfigPanel
