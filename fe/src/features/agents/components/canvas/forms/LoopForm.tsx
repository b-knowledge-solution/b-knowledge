/**
 * @fileoverview Loop node configuration form.
 * Provides controls for loop variables, termination conditions,
 * and maximum iteration count.
 *
 * @module features/agents/components/canvas/forms/LoopForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { NodeFormProps } from './types'

/**
 * @description Loop variable definition with initialization mode
 */
interface LoopVariable {
  variable: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  input_mode: 'constant' | 'variable' | 'initial'
  value: string
}

/**
 * @description Internal state shape for Loop form fields
 */
interface LoopConfig {
  loop_variables: LoopVariable[]
  loop_termination_condition: string
  maximum_loop_count: number
}

/** @description Default configuration for a new Loop node */
const DEFAULTS: LoopConfig = {
  loop_variables: [],
  loop_termination_condition: '',
  maximum_loop_count: 10,
}

/**
 * @description Configuration form for the Loop operator node.
 *   Allows defining loop variables with initialization modes (constant, variable
 *   reference, or type default), a termination condition expression, and a
 *   maximum iteration safeguard to prevent infinite loops.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Loop node configuration form
 */
export function LoopForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<LoopConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<LoopConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<LoopConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof LoopConfig>(field: K, value: LoopConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  /**
   * @description Adds a new loop variable definition
   */
  const addVariable = () => {
    const next: LoopVariable[] = [
      ...state.loop_variables,
      { variable: '', type: 'string', input_mode: 'initial', value: '' },
    ]
    updateField('loop_variables', next)
  }

  /**
   * @description Updates a specific loop variable at the given index
   */
  const updateVariable = (index: number, partial: Partial<LoopVariable>) => {
    const next = state.loop_variables.map((v, i) => (i === index ? { ...v, ...partial } : v))
    updateField('loop_variables', next)
  }

  /**
   * @description Removes the loop variable at the given index
   */
  const removeVariable = (index: number) => {
    const next = state.loop_variables.filter((_, i) => i !== index)
    updateField('loop_variables', next)
  }

  return (
    <div className="space-y-4">
      {/* Maximum loop count safeguard */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.loop.maxIterations', 'Max Iterations')}</Label>
        <Input
          type="number"
          value={state.maximum_loop_count}
          onChange={(e) => updateField('maximum_loop_count', Math.max(1, Number(e.target.value) || 10))}
          min={1}
          max={1000}
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.loop.maxIterationsHint', 'Safety limit to prevent infinite loops')}
        </p>
      </div>

      {/* Termination condition expression */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.loop.breakCondition', 'Break Condition')}</Label>
        <Input
          value={state.loop_termination_condition}
          onChange={(e) => updateField('loop_termination_condition', e.target.value)}
          placeholder={t('agents.forms.loop.breakConditionPlaceholder', 'e.g. result == "done"')}
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.loop.breakConditionHint', 'Expression evaluated each iteration; loop exits when true')}
        </p>
      </div>

      {/* Loop variable definitions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('agents.forms.loop.variables', 'Loop Variables')}</Label>
          <Button variant="ghost" size="sm" onClick={addVariable}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('common.add', 'Add')}
          </Button>
        </div>

        {state.loop_variables.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t('agents.forms.loop.noVariables', 'No loop variables. Add variables to track state across iterations.')}
          </p>
        )}

        {state.loop_variables.map((v, idx) => (
          <div key={idx} className="space-y-2 p-2 border rounded-md bg-muted/30">
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              {t('agents.forms.loop.variableLabel', 'Variable')} {idx + 1}
              <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => removeVariable(idx)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {/* Variable name */}
              <Input
                value={v.variable}
                onChange={(e) => updateVariable(idx, { variable: e.target.value })}
                placeholder={t('agents.forms.loop.varName', 'Name')}
                className="flex-1 text-sm"
              />
              {/* Variable type */}
              <Select
                value={v.type}
                onValueChange={(val: string) => updateVariable(idx, { type: val as LoopVariable['type'] })}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="string">String</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                  <SelectItem value="object">Object</SelectItem>
                  <SelectItem value="array">Array</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              {/* Initialization mode */}
              <Select
                value={v.input_mode}
                onValueChange={(val: string) => updateVariable(idx, { input_mode: val as LoopVariable['input_mode'] })}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="constant">{t('agents.forms.loop.constant', 'Constant')}</SelectItem>
                  <SelectItem value="variable">{t('agents.forms.loop.variableRef', 'Variable')}</SelectItem>
                  <SelectItem value="initial">{t('agents.forms.loop.typeDefault', 'Type Default')}</SelectItem>
                </SelectContent>
              </Select>
              {/* Value (hidden when mode is 'initial' since it uses type default) */}
              {v.input_mode !== 'initial' && (
                <Input
                  value={v.value}
                  onChange={(e) => updateVariable(idx, { value: e.target.value })}
                  placeholder={v.input_mode === 'variable' ? 'component.output' : 'Initial value'}
                  className="flex-1 text-sm"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
