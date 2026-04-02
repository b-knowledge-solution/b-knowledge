/**
 * @fileoverview LLM Generate node configuration form.
 * Provides controls for model selection, prompt editing, and generation parameters
 * (temperature, top-p, max tokens, frequency penalty, message passthrough).
 *
 * @module features/agents/components/canvas/forms/GenerateForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { NodeFormProps } from './types'

/**
 * @description Internal state shape for Generate form fields
 */
interface GenerateConfig {
  model: string
  system_prompt: string
  temperature: number
  top_p: number
  max_tokens: number
  frequency_penalty: number
  message_passthrough: boolean
}

/** @description Default configuration for a new Generate node */
const DEFAULTS: GenerateConfig = {
  model: '',
  system_prompt: '',
  temperature: 0.7,
  top_p: 1.0,
  max_tokens: 2048,
  frequency_penalty: 0,
  message_passthrough: false,
}

/**
 * @description Configuration form for the LLM Generate operator node.
 *   Provides model selection, system prompt editing, and fine-grained control
 *   over generation parameters (temperature, top-p, max tokens, frequency penalty).
 *   Updates are propagated to the canvas store on every field change.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Generate node configuration form
 */
export function GenerateForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<GenerateConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<GenerateConfig>),
  }))

  // Re-sync local state when config prop changes (e.g. undo/redo)
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<GenerateConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   * @param {keyof GenerateConfig} field - Field name to update
   * @param {GenerateConfig[keyof GenerateConfig]} value - New value
   */
  const updateField = <K extends keyof GenerateConfig>(field: K, value: GenerateConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  return (
    <div className="space-y-4">
      {/* LLM Model selector */}
      <div className="space-y-1.5">
        <Label>{t('agents.generate.model', 'Model')}</Label>
        <Select value={state.model} onValueChange={(v: string) => updateField('model', v)}>
          <SelectTrigger>
            <SelectValue placeholder={t('agents.generate.selectModel', 'Select model')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gpt-4o">GPT-4o</SelectItem>
            <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
            <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
            <SelectItem value="claude-3-opus">Claude 3 Opus</SelectItem>
            <SelectItem value="claude-3-sonnet">Claude 3 Sonnet</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* System prompt */}
      <div className="space-y-1.5">
        <Label>{t('agents.generate.systemPrompt', 'System Prompt')}</Label>
        <Textarea
          value={state.system_prompt}
          onChange={(e) => updateField('system_prompt', e.target.value)}
          placeholder={t('agents.generate.systemPromptPlaceholder', 'Enter system instructions...')}
          className="min-h-[100px]"
        />
      </div>

      {/* Temperature slider */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>{t('agents.generate.temperature', 'Temperature')}</Label>
          <span className="text-xs text-muted-foreground">{state.temperature.toFixed(1)}</span>
        </div>
        <Slider
          value={[state.temperature]}
          onValueChange={([v]: number[]) => updateField('temperature', v!)}
          min={0}
          max={2}
          step={0.1}
        />
      </div>

      {/* Top-P slider */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>{t('agents.generate.topP', 'Top P')}</Label>
          <span className="text-xs text-muted-foreground">{state.top_p.toFixed(2)}</span>
        </div>
        <Slider
          value={[state.top_p]}
          onValueChange={([v]: number[]) => updateField('top_p', v!)}
          min={0}
          max={1}
          step={0.05}
        />
      </div>

      {/* Max tokens input */}
      <div className="space-y-1.5">
        <Label>{t('agents.generate.maxTokens', 'Max Tokens')}</Label>
        <Input
          type="number"
          value={state.max_tokens}
          onChange={(e) => updateField('max_tokens', Number(e.target.value) || 2048)}
          min={1}
          max={128000}
        />
      </div>

      {/* Frequency penalty slider */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>{t('agents.generate.frequencyPenalty', 'Frequency Penalty')}</Label>
          <span className="text-xs text-muted-foreground">{state.frequency_penalty.toFixed(1)}</span>
        </div>
        <Slider
          value={[state.frequency_penalty]}
          onValueChange={([v]: number[]) => updateField('frequency_penalty', v!)}
          min={-2}
          max={2}
          step={0.1}
        />
      </div>

      {/* Message passthrough toggle */}
      <div className="flex items-center justify-between">
        <Label>{t('agents.generate.messagePassthrough', 'Message Passthrough')}</Label>
        <Switch
          checked={state.message_passthrough}
          onCheckedChange={(v: boolean) => updateField('message_passthrough', v)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t('agents.generate.messagePassthroughHint', 'Pass upstream node output as user message')}
      </p>
    </div>
  )
}
