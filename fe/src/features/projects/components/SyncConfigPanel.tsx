/**
 * @fileoverview Sync source selector and connection config panel.
 *
 * Used in the Sync tab of datasync projects.
 *
 * @module features/projects/components/SyncConfigPanel
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Save, Loader2 } from 'lucide-react'
import { globalMessage } from '@/app/App'
import type { ProjectSyncConfig, SyncSourceType } from '../api/projectApi'
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
// Source type options
// ============================================================================

const SOURCE_TYPE_OPTIONS: { value: SyncSourceType; label: string }[] = [
  { value: 'sharepoint', label: 'SharePoint' },
  { value: 'jira', label: 'JIRA' },
  { value: 'confluence', label: 'Confluence' },
  { value: 'gitlab', label: 'GitLab' },
  { value: 'github', label: 'GitHub' },
]

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
      globalMessage.success(t('projectManagement.sync.saveSuccess'))
    } catch (err) {
      globalMessage.error(String(err))
    }
  }

  return (
    <div className="space-y-4">
      {/* Source type selector */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          {t('projectManagement.sync.sourceType')}
        </label>
        <Select
          value={sourceType}
          onValueChange={(v: string) => {
            // Reset connection config when source type changes
            setSourceType(v as SyncSourceType)
            setConnectionConfig({})
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Connection fields */}
      <SyncConnectionFields
        sourceType={sourceType}
        config={connectionConfig}
        onChange={setConnectionConfig}
      />

      {/* Save button */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 size={16} className="mr-2 animate-spin" />
          ) : (
            <Save size={16} className="mr-2" />
          )}
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}

export default SyncConfigPanel
