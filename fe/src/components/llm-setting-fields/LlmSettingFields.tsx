/**
 * @fileoverview Shared LLM parameter settings with preset selector and per-parameter toggles.
 * Used in both Chat and Search configuration dialogs.
 * @module components/llm-setting-fields/LlmSettingFields
 */
import { useTranslation } from 'react-i18next'
import { SliderWithToggle } from './SliderWithToggle'
import { LLM_PRESETS, detectPreset, type PresetName } from './llm-presets'

/** All configurable parameter names */
type ParamField = 'temperature' | 'top_p' | 'frequency_penalty' | 'presence_penalty' | 'max_tokens'

/**
 * @description Value shape for the LLM setting fields.
 */
export interface LlmSettingValue {
  /** LLM temperature (0-2) */
  temperature?: number
  /** Whether temperature is enabled */
  temperatureEnabled?: boolean
  /** Nucleus sampling parameter (0-1) */
  top_p?: number
  /** Whether top_p is enabled */
  topPEnabled?: boolean
  /** Penalty for frequent tokens (0-1) */
  frequency_penalty?: number
  /** Whether frequency_penalty is enabled */
  frequencyPenaltyEnabled?: boolean
  /** Penalty for repeated tokens (0-1) */
  presence_penalty?: number
  /** Whether presence_penalty is enabled */
  presencePenaltyEnabled?: boolean
  /** Maximum output length */
  max_tokens?: number
  /** Whether max_tokens is enabled */
  maxTokensEnabled?: boolean
}

/**
 * @description Props for LlmSettingFields component.
 */
interface LlmSettingFieldsProps {
  /** Current parameter values */
  value: LlmSettingValue
  /** Called when any value changes */
  onChange: (value: LlmSettingValue) => void
  /** Which fields to show (defaults to all 5) */
  showFields?: ParamField[]
}

/** Parameter definitions: label key, min, max, step, enabledKey */
const PARAMS: Record<ParamField, { labelKey: string; min: number; max: number; step: number; enabledKey: keyof LlmSettingValue }> = {
  temperature:       { labelKey: 'llmSettings.temperature',      min: 0, max: 2,      step: 0.01, enabledKey: 'temperatureEnabled' },
  top_p:             { labelKey: 'llmSettings.topP',             min: 0, max: 1,      step: 0.01, enabledKey: 'topPEnabled' },
  frequency_penalty: { labelKey: 'llmSettings.frequencyPenalty', min: 0, max: 1,      step: 0.01, enabledKey: 'frequencyPenaltyEnabled' },
  presence_penalty:  { labelKey: 'llmSettings.presencePenalty',  min: 0, max: 1,      step: 0.01, enabledKey: 'presencePenaltyEnabled' },
  max_tokens:        { labelKey: 'llmSettings.maxTokens',        min: 1, max: 128000, step: 1,    enabledKey: 'maxTokensEnabled' },
}

/**
 * @description Renders LLM sampling parameter controls with preset selector and per-parameter toggles.
 * Matches RAGFlow's chat-model-settings layout: preset dropdown + 5 toggle-enabled sliders.
 * @param {LlmSettingFieldsProps} props - Component props
 * @returns {JSX.Element} Rendered LLM settings panel
 */
export function LlmSettingFields({ value, onChange, showFields }: LlmSettingFieldsProps) {
  const { t } = useTranslation()
  const visibleFields = showFields ?? (['temperature', 'top_p', 'frequency_penalty', 'presence_penalty', 'max_tokens'] as ParamField[])

  // Detect which preset currently matches
  const currentPreset = detectPreset({
    temperature: value.temperature,
    top_p: value.top_p,
    frequency_penalty: value.frequency_penalty,
    presence_penalty: value.presence_penalty,
    max_tokens: value.max_tokens,
  })

  /**
   * Apply a preset -- sets all parameter values and enables all toggles.
   */
  const handlePresetChange = (preset: PresetName) => {
    // Custom preset means manual control, no auto-apply
    if (preset === 'custom') return
    const p = LLM_PRESETS[preset]
    onChange({
      ...value,
      temperature: p.temperature, temperatureEnabled: true,
      top_p: p.top_p, topPEnabled: true,
      frequency_penalty: p.frequency_penalty, frequencyPenaltyEnabled: true,
      presence_penalty: p.presence_penalty, presencePenaltyEnabled: true,
      max_tokens: p.max_tokens, maxTokensEnabled: true,
    })
  }

  return (
    <div className="space-y-3">
      {/* Preset selector */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{t('llmSettings.preset')}</label>
        <select
          value={currentPreset}
          onChange={(e) => handlePresetChange(e.target.value as PresetName)}
          className="rounded border bg-background px-2 py-1 text-sm dark:border-gray-600"
        >
          <option value="precise">{t('llmSettings.precise')}</option>
          <option value="balance">{t('llmSettings.balance')}</option>
          <option value="creative">{t('llmSettings.creative')}</option>
          <option value="custom">{t('llmSettings.custom')}</option>
        </select>
      </div>

      {/* Parameter sliders with toggles */}
      {visibleFields.map((field) => {
        const def = PARAMS[field]
        return (
          <SliderWithToggle
            key={field}
            label={t(def.labelKey)}
            value={value[field] ?? def.min}
            enabled={Boolean(value[def.enabledKey])}
            onValueChange={(v) => onChange({ ...value, [field]: v })}
            onEnabledChange={(e) => onChange({ ...value, [def.enabledKey]: e })}
            min={def.min}
            max={def.max}
            step={def.step}
          />
        )
      })}
    </div>
  )
}
