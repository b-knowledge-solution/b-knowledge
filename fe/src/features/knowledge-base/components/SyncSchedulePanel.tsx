/**
 * @fileoverview Sync schedule configuration panel.
 *
 * Provides preset schedules and custom cron expression input.
 *
 * @module features/knowledge-base/components/SyncSchedulePanel
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Save, Loader2 } from 'lucide-react'
import { globalMessage } from '@/app/App'

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
 * @description Panel for configuring sync schedule with preset options and custom cron expression
 * @param {SyncSchedulePanelProps} props - Current schedule and save handler
 * @returns {JSX.Element} Rendered schedule configuration panel
 */
const SyncSchedulePanel = ({ schedule, onSave, saving }: SyncSchedulePanelProps) => {
  const { t } = useTranslation()

  // Determine if current schedule is a preset
  const isPreset = PRESETS.some((p) => p.value !== 'custom' && p.value === schedule)
  const [selectedPreset, setSelectedPreset] = useState(
    isPreset ? schedule! : schedule ? 'custom' : '0 0 * * *',
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
      globalMessage.success(t('knowledgeBase.sync.scheduleUpdated'))
    } catch (err) {
      globalMessage.error(String(err))
    }
  }

  return (
    <div className="space-y-4">
      <RadioGroup
        value={selectedPreset}
        onValueChange={(value: string) => setSelectedPreset(value)}
        className="flex flex-col gap-2"
      >
        {PRESETS.map((preset) => (
          <div key={preset.value} className="flex items-center space-x-2">
            <RadioGroupItem value={preset.value} id={`schedule-${preset.value}`} />
            <Label htmlFor={`schedule-${preset.value}`} className="cursor-pointer">
              {t(preset.labelKey)}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {/* Custom cron input */}
      {selectedPreset === 'custom' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            {t('knowledgeBase.sync.schedule.cronExpression')}
          </label>
          <Input
            value={customCron}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomCron(e.target.value)}
            placeholder={t('knowledgeBase.sync.schedule.cronPlaceholder')}
            className="font-mono"
          />
        </div>
      )}

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

export default SyncSchedulePanel
