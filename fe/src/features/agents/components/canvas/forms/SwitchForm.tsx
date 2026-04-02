/**
 * @fileoverview Conditional switch node configuration form.
 * Provides a dynamic list of condition rows (field, operator, value)
 * and a default branch label for the switch node.
 *
 * @module features/agents/components/canvas/forms/SwitchForm
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
 * @description Supported comparison operators for switch conditions
 */
type ConditionOperator = 'equals' | 'contains' | 'greater_than' | 'less_than' | 'regex'

/**
 * @description Single condition row in the switch node
 */
interface ConditionRow {
  field: string
  operator: ConditionOperator
  value: string
}

/**
 * @description Internal state shape for Switch form fields
 */
interface SwitchConfig {
  conditions: ConditionRow[]
  default_branch: string
}

/** @description Default configuration for a new Switch node */
const DEFAULTS: SwitchConfig = {
  conditions: [],
  default_branch: 'default',
}

/**
 * @description Configuration form for the conditional Switch operator node.
 *   Allows adding/removing condition rows with field name, comparison operator,
 *   and value. Includes a default branch label for unmatched conditions.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Switch node configuration form
 */
export function SwitchForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config
  const [state, setState] = useState<SwitchConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<SwitchConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<SwitchConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof SwitchConfig>(field: K, value: SwitchConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  /**
   * @description Adds a new empty condition row
   */
  const addCondition = () => {
    const next = [...state.conditions, { field: '', operator: 'equals' as ConditionOperator, value: '' }]
    updateField('conditions', next)
  }

  /**
   * @description Updates a specific condition at the given index
   */
  const updateCondition = (index: number, partial: Partial<ConditionRow>) => {
    const next = state.conditions.map((c, i) => (i === index ? { ...c, ...partial } : c))
    updateField('conditions', next)
  }

  /**
   * @description Removes the condition at the given index
   */
  const removeCondition = (index: number) => {
    const next = state.conditions.filter((_, i) => i !== index)
    updateField('conditions', next)
  }

  return (
    <div className="space-y-4">
      {/* Condition list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('agents.switch.conditions', 'Conditions')}</Label>
          <Button variant="ghost" size="sm" onClick={addCondition}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('common.add', 'Add')}
          </Button>
        </div>

        {state.conditions.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t('agents.switch.noConditions', 'No conditions defined. Add conditions to create branches.')}
          </p>
        )}

        {state.conditions.map((condition, idx) => (
          <div key={idx} className="space-y-2 p-2 border rounded-md bg-muted/30">
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              {t('agents.switch.conditionLabel', 'Condition')} {idx + 1}
              <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => removeCondition(idx)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {/* Field name */}
              <Input
                value={condition.field}
                onChange={(e) => updateCondition(idx, { field: e.target.value })}
                placeholder={t('agents.switch.field', 'Field')}
                className="flex-1 text-sm"
              />
              {/* Operator */}
              <Select
                value={condition.operator}
                onValueChange={(v: string) => updateCondition(idx, { operator: v as ConditionOperator })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">{t('agents.switch.equals', 'Equals')}</SelectItem>
                  <SelectItem value="contains">{t('agents.switch.contains', 'Contains')}</SelectItem>
                  <SelectItem value="greater_than">{t('agents.switch.greaterThan', 'Greater Than')}</SelectItem>
                  <SelectItem value="less_than">{t('agents.switch.lessThan', 'Less Than')}</SelectItem>
                  <SelectItem value="regex">{t('agents.switch.regex', 'Regex')}</SelectItem>
                </SelectContent>
              </Select>
              {/* Value */}
              <Input
                value={condition.value}
                onChange={(e) => updateCondition(idx, { value: e.target.value })}
                placeholder={t('agents.switch.value', 'Value')}
                className="flex-1 text-sm"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Default branch label */}
      <div className="space-y-1.5">
        <Label>{t('agents.switch.defaultBranch', 'Default Branch')}</Label>
        <Input
          value={state.default_branch}
          onChange={(e) => updateField('default_branch', e.target.value)}
          placeholder={t('agents.switch.defaultBranchPlaceholder', 'default')}
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.switch.defaultBranchHint', 'Branch taken when no conditions match')}
        </p>
      </div>
    </div>
  )
}
