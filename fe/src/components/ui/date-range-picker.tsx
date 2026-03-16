/**
 * @fileoverview Date range picker with presets dropdown.
 * Replaces antd DatePicker.RangePicker.
 * @module components/ui/date-range-picker
 */
import { useTranslation } from 'react-i18next'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** @description A preset date range option with display label and date tuple */
export interface DateRangePreset {
  label: string
  value: [Date, Date]
}

/** @description Configuration props for the DateRangePicker component */
interface DateRangePickerProps {
  /** Start date value */
  startDate: Date | undefined
  /** End date value */
  endDate: Date | undefined
  /** Called when either date changes */
  onChange: (start: Date | undefined, end: Date | undefined) => void
  /** Optional preset buttons */
  presets?: DateRangePreset[]
  /** Start placeholder */
  startPlaceholder?: string
  /** End placeholder */
  endPlaceholder?: string
  className?: string
}

/**
 * @description Two date pickers with optional presets dropdown, replacing Ant Design's DatePicker.RangePicker
 * @param {DateRangePickerProps} props - Range picker configuration including start/end dates and presets
 * @returns {JSX.Element} Rendered date range picker with start, end, and optional presets
 */
export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  presets,
  startPlaceholder,
  endPlaceholder,
  className,
}: DateRangePickerProps) {
  const { t } = useTranslation()

  // Apply a preset's date range when selected from the dropdown
  const handlePresetChange = (presetLabel: string) => {
    const preset = presets?.find((p) => p.label === presetLabel)
    if (preset) {
      onChange(preset.value[0], preset.value[1])
    }
  }

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <DatePicker
        value={startDate}
        onChange={(date) => onChange(date, endDate)}
        placeholder={startPlaceholder ?? t('common.startDate')}
        disabledDates={(d) => (endDate ? d > endDate : false)}
        dateFormat="yyyy-MM-dd"
      />
      <span className="text-muted-foreground text-sm">–</span>
      <DatePicker
        value={endDate}
        onChange={(date) => onChange(startDate, date)}
        placeholder={endPlaceholder ?? t('common.endDate')}
        disabledDates={(d) => (startDate ? d < startDate : false)}
        dateFormat="yyyy-MM-dd"
      />
      {presets && presets.length > 0 && (
        <Select onValueChange={handlePresetChange}>
          <SelectTrigger className="w-auto min-w-[120px]">
            <SelectValue placeholder={t('dashboard.presets.select', 'Preset')} />
          </SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <SelectItem key={p.label} value={p.label}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
