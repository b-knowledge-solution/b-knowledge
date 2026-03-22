/**
 * @fileoverview Rewrite node configuration form.
 * Provides controls for LLM-powered query/text rewriting with
 * a customizable prompt template and model selection.
 *
 * @module features/agents/components/canvas/forms/RewriteForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { NodeFormProps } from './types'

/**
 * @description Internal state shape for Rewrite form fields
 */
interface RewriteConfig {
  model: string
  prompt_template: string
  temperature: number
  max_tokens: number
  message_history_window_size: number
}

/** @description Default configuration for a new Rewrite node */
const DEFAULTS: RewriteConfig = {
  model: '',
  prompt_template: 'Rewrite the following query to improve retrieval quality:\n\n{query}',
  temperature: 0.3,
  max_tokens: 1024,
  message_history_window_size: 1,
}

/**
 * @description Configuration form for the Rewrite operator node.
 *   Uses an LLM to rewrite or rephrase input text (typically a user query)
 *   to improve downstream retrieval quality. The prompt template supports
 *   {variable} interpolation for dynamic content.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Rewrite node configuration form
 */
export function RewriteForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<RewriteConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<RewriteConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<RewriteConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof RewriteConfig>(field: K, value: RewriteConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  return (
    <div className="space-y-4">
      {/* LLM Model selector */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.rewrite.model', 'Model')}</Label>
        <Select value={state.model} onValueChange={(v: string) => updateField('model', v)}>
          <SelectTrigger>
            <SelectValue placeholder={t('agents.forms.rewrite.selectModel', 'Select model')} />
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

      {/* Rewrite prompt template */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.rewrite.promptTemplate', 'Prompt Template')}</Label>
        <Textarea
          value={state.prompt_template}
          onChange={(e) => updateField('prompt_template', e.target.value)}
          placeholder={t('agents.forms.rewrite.promptTemplatePlaceholder', 'Rewrite the following query...')}
          className="min-h-[120px]"
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.rewrite.promptTemplateHint', 'Use {query} or other {variable} references. The LLM output replaces the original text.')}
        </p>
      </div>

      {/* Temperature slider */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>{t('agents.forms.rewrite.temperature', 'Temperature')}</Label>
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

      {/* Max tokens input */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.rewrite.maxTokens', 'Max Tokens')}</Label>
        <Input
          type="number"
          value={state.max_tokens}
          onChange={(e) => updateField('max_tokens', Number(e.target.value) || 1024)}
          min={1}
          max={32000}
        />
      </div>

      {/* Message history window */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.rewrite.historyWindow', 'Message History Window')}</Label>
        <Input
          type="number"
          value={state.message_history_window_size}
          onChange={(e) => updateField('message_history_window_size', Math.max(1, Number(e.target.value) || 1))}
          min={1}
          max={50}
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.rewrite.historyWindowHint', 'Number of recent messages to include as context for rewriting')}
        </p>
      </div>
    </div>
  )
}
