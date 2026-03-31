/**
 * @fileoverview Begin (start) node configuration form.
 * Configures the agent's entry point: input type, variable definitions,
 * and welcome message.
 *
 * @module features/agents/components/canvas/forms/BeginForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
 * @description Variable definition for agent workflow parameterization
 */
interface VariableDef {
  name: string
  type: 'string' | 'number' | 'boolean' | 'json'
  default_value: string
}

/**
 * @description Internal state shape for Begin form fields
 */
interface BeginConfig {
  input_type: 'text' | 'file' | 'json'
  variables: VariableDef[]
  welcome_message: string
}

/** @description Default configuration for a new Begin node */
const DEFAULTS: BeginConfig = {
  input_type: 'text',
  variables: [],
  welcome_message: '',
}

/**
 * @description Configuration form for the Begin (start) operator node.
 *   Allows configuring the agent entry point: input type selection,
 *   dynamic variable definitions (name, type, default), and welcome message.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Begin node configuration form
 */
export function BeginForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config
  const [state, setState] = useState<BeginConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<BeginConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<BeginConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof BeginConfig>(field: K, value: BeginConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  /**
   * @description Adds a new empty variable definition to the list
   */
  const addVariable = () => {
    const next = [...state.variables, { name: '', type: 'string' as const, default_value: '' }]
    updateField('variables', next)
  }

  /**
   * @description Updates a specific variable at the given index
   */
  const updateVariable = (index: number, partial: Partial<VariableDef>) => {
    const next = state.variables.map((v, i) => (i === index ? { ...v, ...partial } : v))
    updateField('variables', next)
  }

  /**
   * @description Removes the variable at the given index
   */
  const removeVariable = (index: number) => {
    const next = state.variables.filter((_, i) => i !== index)
    updateField('variables', next)
  }

  return (
    <div className="space-y-4">
      {/* Input type selector */}
      <div className="space-y-1.5">
        <Label>{t('agents.begin.inputType', 'Input Type')}</Label>
        <Select
          value={state.input_type}
          onValueChange={(v: string) => updateField('input_type', v as BeginConfig['input_type'])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">{t('agents.begin.text', 'Text')}</SelectItem>
            <SelectItem value="file">{t('agents.begin.file', 'File')}</SelectItem>
            <SelectItem value="json">{t('agents.begin.json', 'JSON')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Variable definitions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('agents.begin.variables', 'Variables')}</Label>
          <Button variant="ghost" size="sm" onClick={addVariable}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('common.add', 'Add')}
          </Button>
        </div>

        {state.variables.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t('agents.begin.noVariables', 'No variables defined. Add variables to parameterize the workflow.')}
          </p>
        )}

        {state.variables.map((v, idx) => (
          <div key={idx} className="flex items-start gap-2 p-2 border rounded-md bg-muted/30">
            {/* Variable name */}
            <Input
              value={v.name}
              onChange={(e) => updateVariable(idx, { name: e.target.value })}
              placeholder={t('agents.begin.varName', 'Name')}
              className="flex-1 text-sm"
            />
            {/* Variable type */}
            <Select
              value={v.type}
              onValueChange={(val: string) => updateVariable(idx, { type: val as VariableDef['type'] })}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">String</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
            {/* Default value */}
            <Input
              value={v.default_value}
              onChange={(e) => updateVariable(idx, { default_value: e.target.value })}
              placeholder={t('agents.begin.defaultValue', 'Default')}
              className="flex-1 text-sm"
            />
            {/* Remove button */}
            <Button variant="ghost" size="icon" onClick={() => removeVariable(idx)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      {/* Welcome message */}
      <div className="space-y-1.5">
        <Label>{t('agents.begin.welcomeMessage', 'Welcome Message')}</Label>
        <Textarea
          value={state.welcome_message}
          onChange={(e) => updateField('welcome_message', e.target.value)}
          placeholder={t('agents.begin.welcomeMessagePlaceholder', 'Message shown when the agent starts...')}
          className="min-h-[80px]"
        />
      </div>
    </div>
  )
}
