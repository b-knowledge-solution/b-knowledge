/**
 * @fileoverview String Transform node configuration form.
 * Provides controls for string split and merge operations with
 * configurable delimiters and Jinja2 template support.
 *
 * @module features/agents/components/canvas/forms/StringTransformForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { NodeFormProps } from './types'

/**
 * @description Internal state shape for StringTransform form fields
 */
interface StringTransformConfig {
  method: 'split' | 'merge'
  split_ref: string
  delimiters: string[]
  script: string
}

/** @description Default configuration for a new StringTransform node */
const DEFAULTS: StringTransformConfig = {
  method: 'split',
  split_ref: '',
  delimiters: [','],
  script: '',
}

/**
 * @description Configuration form for the String Transform operator node.
 *   Split mode: splits a string variable by delimiter(s) into an array.
 *   Merge mode: combines multiple variables using a Jinja2 template script,
 *   joining array values with the first delimiter.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} String Transform node configuration form
 */
export function StringTransformForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<StringTransformConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<StringTransformConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<StringTransformConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof StringTransformConfig>(field: K, value: StringTransformConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  return (
    <div className="space-y-4">
      {/* Method selector */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.stringTransform.method', 'Method')}</Label>
        <Select
          value={state.method}
          onValueChange={(v: string) => updateField('method', v as StringTransformConfig['method'])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="split">{t('agents.forms.stringTransform.split', 'Split')}</SelectItem>
            <SelectItem value="merge">{t('agents.forms.stringTransform.merge', 'Merge')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Delimiters (comma-separated list) */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.stringTransform.delimiters', 'Delimiters')}</Label>
        <Input
          value={state.delimiters.join(', ')}
          onChange={(e) => {
            // Parse delimiter list; each entry is a single delimiter character or string
            const delims = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
            updateField('delimiters', delims.length > 0 ? delims : [','])
          }}
          placeholder=", | ; | \\n"
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.stringTransform.delimitersHint', 'Comma-separated list of delimiters. Split uses all; merge uses the first.')}
        </p>
      </div>

      {/* Split-specific: variable reference to the string to split */}
      {state.method === 'split' && (
        <div className="space-y-1.5">
          <Label>{t('agents.forms.stringTransform.splitRef', 'String Variable')}</Label>
          <Input
            value={state.split_ref}
            onChange={(e) => updateField('split_ref', e.target.value)}
            placeholder={t('agents.forms.stringTransform.splitRefPlaceholder', 'component@output_string')}
          />
          <p className="text-xs text-muted-foreground">
            {t('agents.forms.stringTransform.splitRefHint', 'Variable reference to the string to split into an array')}
          </p>
        </div>
      )}

      {/* Merge-specific: Jinja2 template script */}
      {state.method === 'merge' && (
        <div className="space-y-1.5">
          <Label>{t('agents.forms.stringTransform.script', 'Merge Template')}</Label>
          <Textarea
            value={state.script}
            onChange={(e) => updateField('script', e.target.value)}
            placeholder={t('agents.forms.stringTransform.scriptPlaceholder', 'Hello {name}, your results: {results}')}
            className="font-mono text-xs min-h-[100px]"
          />
          <p className="text-xs text-muted-foreground">
            {t('agents.forms.stringTransform.scriptHint', 'Use {variable} syntax or Jinja2 template expressions to combine variables')}
          </p>
        </div>
      )}
    </div>
  )
}
