/**
 * @fileoverview Fill Up (user input) node configuration form.
 * Provides controls for the user fill-up form that pauses the workflow
 * to collect user input, with optional tips and file upload support.
 *
 * @module features/agents/components/canvas/forms/FillUpForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import type { NodeFormProps } from './types'

/**
 * @description Internal state shape for FillUp form fields
 */
interface FillUpConfig {
  enable_tips: boolean
  tips: string
  layout_recognize: string
}

/** @description Default configuration for a new FillUp node */
const DEFAULTS: FillUpConfig = {
  enable_tips: true,
  tips: 'Please fill up the form',
  layout_recognize: '',
}

/**
 * @description Configuration form for the Fill Up (user input) operator node.
 *   Pauses the agent workflow to request user input. Displays an optional
 *   tips message (with {variable} interpolation) and can accept file uploads
 *   with configurable layout recognition for document parsing.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Fill Up node configuration form
 */
export function FillUpForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<FillUpConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<FillUpConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<FillUpConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof FillUpConfig>(field: K, value: FillUpConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  return (
    <div className="space-y-4">
      {/* Enable tips toggle */}
      <div className="flex items-center justify-between">
        <Label>{t('agents.forms.fillUp.enableTips', 'Show Tips Message')}</Label>
        <Switch
          checked={state.enable_tips}
          onCheckedChange={(v: boolean) => updateField('enable_tips', v)}
        />
      </div>

      {/* Tips message with variable interpolation */}
      {state.enable_tips && (
        <div className="space-y-1.5">
          <Label>{t('agents.forms.fillUp.tips', 'Tips Message')}</Label>
          <Textarea
            value={state.tips}
            onChange={(e) => updateField('tips', e.target.value)}
            placeholder={t('agents.forms.fillUp.tipsPlaceholder', 'Instructions for the user...')}
            className="min-h-[80px]"
          />
          <p className="text-xs text-muted-foreground">
            {t('agents.forms.fillUp.tipsHint', 'Message shown to the user. Use {variable} for dynamic content.')}
          </p>
        </div>
      )}

      {/* Layout recognition setting for file uploads */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.fillUp.layoutRecognize', 'Layout Recognition')}</Label>
        <Input
          value={state.layout_recognize}
          onChange={(e) => updateField('layout_recognize', e.target.value)}
          placeholder={t('agents.forms.fillUp.layoutRecognizePlaceholder', 'Optional layout model for file parsing')}
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.fillUp.layoutRecognizeHint', 'Layout recognition model for uploaded document parsing (leave empty to skip)')}
        </p>
      </div>
    </div>
  )
}
