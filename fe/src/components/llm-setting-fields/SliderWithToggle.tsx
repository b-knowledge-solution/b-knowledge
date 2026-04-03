/**
 * @fileoverview A slider control with an optional enabled/disabled toggle switch.
 * Used for LLM parameters like temperature, top_p, frequency_penalty, etc.
 * @module components/llm-setting-fields/SliderWithToggle
 */
import { Switch } from '@/components/ui/switch'

/**
 * @description Props for the SliderWithToggle component.
 */
export interface SliderWithToggleProps {
  /** Display label */
  label: string
  /** Optional tooltip text */
  tooltip?: string
  /** Current numeric value */
  value: number
  /** Whether the parameter is active */
  enabled: boolean
  /** Called when the slider value changes */
  onValueChange: (value: number) => void
  /** Called when the toggle is flipped */
  onEnabledChange: (enabled: boolean) => void
  /** Minimum slider value */
  min: number
  /** Maximum slider value */
  max: number
  /** Slider step increment */
  step: number
}

/**
 * @description A labeled slider with a toggle switch and numeric display.
 * When disabled, the slider and number input are grayed out and non-interactive.
 * @param {SliderWithToggleProps} props - Slider configuration
 * @returns {JSX.Element} Rendered slider row with toggle
 */
export function SliderWithToggle({
  label,
  tooltip,
  value,
  enabled,
  onValueChange,
  onEnabledChange,
  min,
  max,
  step,
}: SliderWithToggleProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Toggle switch to enable/disable the parameter */}
          <Switch
            checked={enabled}
            onCheckedChange={onEnabledChange}
            className="h-4 w-7 data-[state=checked]:bg-primary"
            aria-label={`Toggle ${label}`}
          />
          <label className="text-sm font-medium text-foreground" title={tooltip}>
            {label}
          </label>
        </div>
        {/* Display current value */}
        <span className="text-sm tabular-nums text-muted-foreground">
          {value}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {/* Range slider */}
        <input
          type="range"
          role="slider"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={!enabled}
          onChange={(e) => onValueChange(Number(e.target.value))}
          aria-label={label}
          className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
        />
        {/* Number input for precise entry */}
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={!enabled}
          onChange={(e) => {
            const v = Number(e.target.value)
            // Clamp value to valid range
            if (v >= min && v <= max) onValueChange(v)
          }}
          aria-label={`${label} value`}
          className="w-16 rounded border bg-background px-2 py-0.5 text-sm tabular-nums disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800"
        />
      </div>
    </div>
  )
}
