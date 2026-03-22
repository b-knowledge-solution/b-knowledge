/**
 * @fileoverview Iteration node configuration form.
 * Provides controls for specifying the collection input reference
 * and iterator variable name for iterating over arrays.
 *
 * @module features/agents/components/canvas/forms/IterationForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { NodeFormProps } from './types'

/**
 * @description Internal state shape for Iteration form fields
 */
interface IterationConfig {
  items_ref: string
  variable: string
}

/** @description Default configuration for a new Iteration node */
const DEFAULTS: IterationConfig = {
  items_ref: '',
  variable: 'item',
}

/**
 * @description Configuration form for the Iteration operator node.
 *   Iterates over an array variable, executing the child IterationItem body
 *   once for each element. Requires a variable reference to an array and
 *   an iterator variable name accessible by downstream nodes in the body.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Iteration node configuration form
 */
export function IterationForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<IterationConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<IterationConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<IterationConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof IterationConfig>(field: K, value: IterationConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  return (
    <div className="space-y-4">
      {/* Collection input variable reference */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.iteration.itemsRef', 'Collection Variable')}</Label>
        <Input
          value={state.items_ref}
          onChange={(e) => updateField('items_ref', e.target.value)}
          placeholder={t('agents.forms.iteration.itemsRefPlaceholder', 'e.g. component_id@output_name')}
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.iteration.itemsRefHint', 'Reference to an array variable to iterate over')}
        </p>
      </div>

      {/* Iterator variable name */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.iteration.variable', 'Iterator Variable Name')}</Label>
        <Input
          value={state.variable}
          onChange={(e) => updateField('variable', e.target.value)}
          placeholder="item"
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.iteration.variableHint', 'Name used by child nodes to reference the current element')}
        </p>
      </div>
    </div>
  )
}
