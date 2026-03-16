/**
 * @fileoverview Sync schedule configuration panel.
 *
 * Provides preset schedules and custom cron expression input.
 *
 * @module features/projects/components/SyncSchedulePanel
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Radio, Input, Button, message } from 'antd'
import { Save } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface SyncSchedulePanelProps {
  /** Current schedule value (cron expression or preset) */
  schedule: string | null
  /** Save handler */
  onSave: (schedule: string) => Promise<void>
  /** Whether saving is in progress */
  saving: boolean
}

/** Preset schedule options. */
const PRESETS = [
  { value: '0 */6 * * *', labelKey: 'projectManagement.sync.schedule.every6h' },
  { value: '0 0 * * *', labelKey: 'projectManagement.sync.schedule.daily' },
  { value: '0 0 * * 1', labelKey: 'projectManagement.sync.schedule.weekly' },
  { value: 'custom', labelKey: 'projectManagement.sync.schedule.custom' },
]

// ============================================================================
// Component
// ============================================================================

/**
 * Panel for configuring sync schedule.
 *
 * @param props - Component props
 * @returns React element
 */
const SyncSchedulePanel = ({ schedule, onSave, saving }: SyncSchedulePanelProps) => {
  const { t } = useTranslation()

  // Determine if current schedule is a preset
  const isPreset = PRESETS.some((p) => p.value !== 'custom' && p.value === schedule)
  const [selectedPreset, setSelectedPreset] = useState(
    isPreset ? schedule : schedule ? 'custom' : '0 0 * * *',
  )
  const [customCron, setCustomCron] = useState(
    !isPreset && schedule ? schedule : '',
  )

  /**
   * Handle save.
   */
  const handleSave = async () => {
    const value = selectedPreset === 'custom' ? customCron : (selectedPreset || '0 0 * * *')
    try {
      await onSave(value)
      message.success(t('projectManagement.sync.scheduleUpdated'))
    } catch (err) {
      message.error(String(err))
    }
  }

  return (
    <div className="space-y-4">
      <Radio.Group
        value={selectedPreset}
        onChange={(e: { target: { value: string } }) => setSelectedPreset(e.target.value)}
        className="flex flex-col gap-2"
      >
        {PRESETS.map((preset) => (
          <Radio key={preset.value} value={preset.value}>
            {t(preset.labelKey)}
          </Radio>
        ))}
      </Radio.Group>

      {/* Custom cron input */}
      {selectedPreset === 'custom' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            {t('projectManagement.sync.schedule.cronExpression')}
          </label>
          <Input
            value={customCron}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomCron(e.target.value)}
            placeholder={t('projectManagement.sync.schedule.cronPlaceholder')}
            className="font-mono"
          />
        </div>
      )}

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

export default SyncSchedulePanel
