/**
 * @fileoverview Code execution node configuration form.
 * Provides language selection, code editor (monospace textarea),
 * timeout, input variable mapping, and output variable name.
 *
 * @module features/agents/components/canvas/forms/CodeForm
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
 * @description Supported programming languages for code execution
 */
type CodeLanguage = 'python' | 'javascript' | 'bash'

/**
 * @description Internal state shape for Code form fields
 */
interface CodeConfig {
  language: CodeLanguage
  code: string
  timeout: number
  input_variables: string[]
  output_variable: string
}

/** @description Default configuration for a new Code node */
const DEFAULTS: CodeConfig = {
  language: 'python',
  code: '',
  timeout: 30,
  input_variables: [],
  output_variable: 'result',
}

/**
 * @description Configuration form for the Code execution operator node.
 *   Allows selecting a language, editing code in a monospace textarea,
 *   setting execution timeout, mapping input variables, and naming the output.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Code node configuration form
 */
export function CodeForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config
  const [state, setState] = useState<CodeConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<CodeConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<CodeConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof CodeConfig>(field: K, value: CodeConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  /**
   * @description Adds a new empty input variable entry
   */
  const addInputVariable = () => {
    updateField('input_variables', [...state.input_variables, ''])
  }

  /**
   * @description Updates an input variable at the given index
   */
  const updateInputVariable = (index: number, value: string) => {
    const next = state.input_variables.map((v, i) => (i === index ? value : v))
    updateField('input_variables', next)
  }

  /**
   * @description Removes an input variable at the given index
   */
  const removeInputVariable = (index: number) => {
    const next = state.input_variables.filter((_, i) => i !== index)
    updateField('input_variables', next)
  }

  return (
    <div className="space-y-4">
      {/* Language selector */}
      <div className="space-y-1.5">
        <Label>{t('agents.code.language', 'Language')}</Label>
        <Select
          value={state.language}
          onValueChange={(v: string) => updateField('language', v as CodeLanguage)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="python">Python</SelectItem>
            <SelectItem value="javascript">JavaScript</SelectItem>
            <SelectItem value="bash">Bash</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Code editor (monospace textarea) */}
      <div className="space-y-1.5">
        <Label>{t('agents.code.code', 'Code')}</Label>
        <Textarea
          value={state.code}
          onChange={(e) => updateField('code', e.target.value)}
          placeholder={t('agents.code.codePlaceholder', 'Enter your code here...')}
          className="font-mono text-xs min-h-[200px]"
        />
      </div>

      {/* Timeout input */}
      <div className="space-y-1.5">
        <Label>{t('agents.code.timeout', 'Timeout (seconds)')}</Label>
        <Input
          type="number"
          value={state.timeout}
          onChange={(e) => updateField('timeout', Math.max(1, Number(e.target.value) || 30))}
          min={1}
          max={300}
        />
      </div>

      {/* Input variable mapping */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('agents.code.inputVariables', 'Input Variables')}</Label>
          <Button variant="ghost" size="sm" onClick={addInputVariable}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('common.add', 'Add')}
          </Button>
        </div>

        {state.input_variables.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t('agents.code.noInputVariables', 'No input variables. Add variables to pass data to the code.')}
          </p>
        )}

        {state.input_variables.map((v, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              value={v}
              onChange={(e) => updateInputVariable(idx, e.target.value)}
              placeholder={t('agents.code.variableName', 'Variable name')}
              className="flex-1 text-sm"
            />
            <Button variant="ghost" size="icon" onClick={() => removeInputVariable(idx)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      {/* Output variable name */}
      <div className="space-y-1.5">
        <Label>{t('agents.code.outputVariable', 'Output Variable')}</Label>
        <Input
          value={state.output_variable}
          onChange={(e) => updateField('output_variable', e.target.value)}
          placeholder={t('agents.code.outputVariablePlaceholder', 'result')}
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.code.outputVariableHint', 'Variable name for downstream nodes to reference')}
        </p>
      </div>
    </div>
  )
}
