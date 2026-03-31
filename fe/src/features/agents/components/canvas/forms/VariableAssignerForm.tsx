/**
 * @fileoverview Variable Assigner node configuration form.
 * Provides controls for defining variable assignment operations
 * such as overwrite, set, append, extend, clear, and arithmetic.
 *
 * @module features/agents/components/canvas/forms/VariableAssignerForm
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
 * @description Supported assignment operators matching the RAGFlow backend
 */
type AssignOperator =
  | 'overwrite' | 'clear' | 'set'
  | 'append' | 'extend'
  | 'remove_first' | 'remove_last'
  | '+=' | '-=' | '*=' | '/='

/**
 * @description Single variable assignment row
 */
interface AssignmentRow {
  variable: string
  operator: AssignOperator
  parameter: string
}

/**
 * @description Internal state shape for VariableAssigner form fields
 */
interface VariableAssignerConfig {
  variables: AssignmentRow[]
}

/** @description Default configuration for a new VariableAssigner node */
const DEFAULTS: VariableAssignerConfig = {
  variables: [],
}

/**
 * @description Configuration form for the Variable Assigner operator node.
 *   Allows defining a list of variable assignment operations. Each row specifies
 *   a target variable, an operator (overwrite, set, append, extend, arithmetic,
 *   clear, remove), and a parameter (value or variable reference). Operations
 *   execute sequentially at runtime.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Variable Assigner node configuration form
 */
export function VariableAssignerForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<VariableAssignerConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<VariableAssignerConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<VariableAssignerConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof VariableAssignerConfig>(field: K, value: VariableAssignerConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  /**
   * @description Adds a new assignment row
   */
  const addAssignment = () => {
    const next: AssignmentRow[] = [
      ...state.variables,
      { variable: '', operator: 'set', parameter: '' },
    ]
    updateField('variables', next)
  }

  /**
   * @description Updates a specific assignment at the given index
   */
  const updateAssignment = (index: number, partial: Partial<AssignmentRow>) => {
    const next = state.variables.map((v, i) => (i === index ? { ...v, ...partial } : v))
    updateField('variables', next)
  }

  /**
   * @description Removes the assignment at the given index
   */
  const removeAssignment = (index: number) => {
    const next = state.variables.filter((_, i) => i !== index)
    updateField('variables', next)
  }

  // Operators that do not require a parameter value
  const noParamOperators: AssignOperator[] = ['clear', 'remove_first', 'remove_last']

  return (
    <div className="space-y-4">
      {/* Assignment rows */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('agents.forms.variableAssigner.assignments', 'Assignments')}</Label>
          <Button variant="ghost" size="sm" onClick={addAssignment}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('common.add', 'Add')}
          </Button>
        </div>

        {state.variables.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t('agents.forms.variableAssigner.noAssignments', 'No assignments. Add operations to modify canvas variables.')}
          </p>
        )}

        {state.variables.map((row, idx) => (
          <div key={idx} className="space-y-2 p-2 border rounded-md bg-muted/30">
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              {t('agents.forms.variableAssigner.operationLabel', 'Operation')} {idx + 1}
              <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => removeAssignment(idx)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
            {/* Target variable reference */}
            <Input
              value={row.variable}
              onChange={(e) => updateAssignment(idx, { variable: e.target.value })}
              placeholder={t('agents.forms.variableAssigner.targetVariable', 'Target variable (e.g. loop@counter)')}
              className="text-sm"
            />
            <div className="flex items-center gap-2">
              {/* Operator selector */}
              <Select
                value={row.operator}
                onValueChange={(v: string) => updateAssignment(idx, { operator: v as AssignOperator })}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="set">Set</SelectItem>
                  <SelectItem value="overwrite">Overwrite</SelectItem>
                  <SelectItem value="clear">Clear</SelectItem>
                  <SelectItem value="append">Append</SelectItem>
                  <SelectItem value="extend">Extend</SelectItem>
                  <SelectItem value="remove_first">Remove First</SelectItem>
                  <SelectItem value="remove_last">Remove Last</SelectItem>
                  <SelectItem value="+=">+= (Add)</SelectItem>
                  <SelectItem value="-=">-= (Subtract)</SelectItem>
                  <SelectItem value="*=">*= (Multiply)</SelectItem>
                  <SelectItem value="/=">/= (Divide)</SelectItem>
                </SelectContent>
              </Select>
              {/* Parameter value (hidden for operators that don't need it) */}
              {!noParamOperators.includes(row.operator) && (
                <Input
                  value={row.parameter}
                  onChange={(e) => updateAssignment(idx, { parameter: e.target.value })}
                  placeholder={t('agents.forms.variableAssigner.parameter', 'Value or variable ref')}
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
