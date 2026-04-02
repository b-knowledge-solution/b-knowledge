/**
 * @fileoverview Cron parsing scheduler settings component.
 * Allows admins to configure an automatic parsing schedule for queued documents.
 * Fetches and saves configuration via the parsing scheduler system config API.
 *
 * @module features/system/components/CronSchedulerSettings
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, Save } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { queryKeys } from '@/lib/queryKeys'
import { datasetApi } from '@/features/datasets/api/datasetApi'

// ============================================================================
// Preset schedules
// ============================================================================

/** Common cron schedule presets for quick selection */
const CRON_PRESETS = [
  { label: 'Weekdays 10 PM', value: '0 22 * * 1-5' },
  { label: 'Daily midnight', value: '0 0 * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Sundays 2 AM', value: '0 2 * * 0' },
  { label: 'Custom', value: 'custom' },
] as const

// ============================================================================
// Component
// ============================================================================

/**
 * @description Cron scheduler settings panel for configuring automatic document
 * parsing schedules. Displays an enable/disable switch, cron expression input,
 * and preset schedule selector. Saves to the system config API.
 *
 * @returns {JSX.Element} Rendered cron scheduler settings card
 */
const CronSchedulerSettings: React.FC = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Fetch current scheduler config
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.parsingScheduler.config(),
    queryFn: () => datasetApi.getParsingScheduler(),
  })

  // Local state synced from server data
  const [enabled, setEnabled] = useState(false)
  const [schedule, setSchedule] = useState('0 0 * * *')
  const [selectedPreset, setSelectedPreset] = useState<string>('0 0 * * *')

  // Sync local state when server data loads
  useEffect(() => {
    if (data) {
      setEnabled(data.enabled)
      setSchedule(data.schedule)
      // Check if the schedule matches a known preset
      const matchingPreset = CRON_PRESETS.find((p) => p.value === data.schedule)
      setSelectedPreset(matchingPreset ? matchingPreset.value : 'custom')
    }
  }, [data])

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (payload: { schedule: string; enabled: boolean }) =>
      datasetApi.updateParsingScheduler(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.parsingScheduler.config() })
    },
  })

  /**
   * @description Handle preset selection — updates cron expression from preset.
   * @param {string} value - Preset value or 'custom'
   */
  const handlePresetChange = (value: string) => {
    setSelectedPreset(value)
    // Only update the schedule input for non-custom presets
    if (value !== 'custom') {
      setSchedule(value)
    }
  }

  /**
   * @description Save the scheduler configuration to the server.
   */
  const handleSave = () => {
    saveMutation.mutate({ schedule, enabled })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size={24} />
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-muted-foreground" />
        <div>
          <h3 className="font-medium text-sm">
            {t('systemTools.parsingSchedule', 'Parsing Schedule')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t(
              'systemTools.parsingScheduleDesc',
              'Automatically parse queued documents on a schedule. Useful for off-hours processing.',
            )}
          </p>
        </div>
      </div>

      {/* Enable/disable toggle */}
      <div className="flex items-center gap-3">
        <Label className="text-sm">{t('common.status', 'Status')}</Label>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
        <span className="text-xs text-muted-foreground">
          {enabled ? t('common.on', 'ON') : t('common.off', 'OFF')}
        </span>
      </div>

      {/* Preset selector */}
      <div className="space-y-1.5">
        <Label className="text-sm">{t('common.select', 'Preset')}</Label>
        <Select value={selectedPreset} onValueChange={handlePresetChange}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CRON_PRESETS.map((preset) => (
              <SelectItem key={preset.value} value={preset.value}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cron expression input — always visible for custom editing */}
      <div className="space-y-1.5">
        <Label className="text-sm">Cron Expression</Label>
        <Input
          value={schedule}
          onChange={(e) => {
            setSchedule(e.target.value)
            setSelectedPreset('custom')
          }}
          placeholder="0 0 * * *"
          className="h-8 font-mono text-sm"
        />
      </div>

      {/* Save button */}
      <Button
        size="sm"
        onClick={handleSave}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? (
          <Spinner size={14} className="mr-1" />
        ) : (
          <Save className="h-4 w-4 mr-1" />
        )}
        {t('common.save', 'Save')}
      </Button>
    </div>
  )
}

export default CronSchedulerSettings
