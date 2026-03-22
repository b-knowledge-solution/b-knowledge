/**
 * @fileoverview Agent With Tools node configuration form.
 * Provides controls for LLM model selection, system prompt, tool
 * configuration, max rounds, and structured output schema.
 *
 * @module features/agents/components/canvas/forms/AgentWithToolsForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
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
 * @description Tool definition for the agent's tool list
 */
interface ToolEntry {
  component_name: string
  name: string
  enabled: boolean
}

/**
 * @description Internal state shape for AgentWithTools form fields
 */
interface AgentWithToolsConfig {
  model: string
  system_prompt: string
  temperature: number
  max_tokens: number
  tools: ToolEntry[]
  max_rounds: number
  cite: boolean
  description: string
}

/** @description Default configuration for a new AgentWithTools node */
const DEFAULTS: AgentWithToolsConfig = {
  model: '',
  system_prompt: '',
  temperature: 0.7,
  max_tokens: 4096,
  tools: [],
  max_rounds: 5,
  cite: false,
  description: '',
}

/**
 * @description Configuration form for the Agent With Tools operator node.
 *   A ReAct-style agent that iteratively selects and calls tools to solve tasks.
 *   Configurable LLM model, system prompt, temperature, tool list, maximum
 *   reasoning rounds, and optional citation generation from retrieval results.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Agent With Tools node configuration form
 */
export function AgentWithToolsForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<AgentWithToolsConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<AgentWithToolsConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<AgentWithToolsConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof AgentWithToolsConfig>(field: K, value: AgentWithToolsConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  /**
   * @description Adds a new tool entry
   */
  const addTool = () => {
    const next: ToolEntry[] = [
      ...state.tools,
      { component_name: '', name: '', enabled: true },
    ]
    updateField('tools', next)
  }

  /**
   * @description Updates a tool entry at the given index
   */
  const updateTool = (index: number, partial: Partial<ToolEntry>) => {
    const next = state.tools.map((t, i) => (i === index ? { ...t, ...partial } : t))
    updateField('tools', next)
  }

  /**
   * @description Removes a tool entry at the given index
   */
  const removeTool = (index: number) => {
    const next = state.tools.filter((_, i) => i !== index)
    updateField('tools', next)
  }

  return (
    <div className="space-y-4">
      {/* LLM Model selector */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.agentWithTools.model', 'Model')}</Label>
        <Select value={state.model} onValueChange={(v: string) => updateField('model', v)}>
          <SelectTrigger>
            <SelectValue placeholder={t('agents.forms.agentWithTools.selectModel', 'Select model')} />
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

      {/* Agent description */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.agentWithTools.description', 'Agent Description')}</Label>
        <Input
          value={state.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder={t('agents.forms.agentWithTools.descriptionPlaceholder', 'Describe what this agent does...')}
        />
      </div>

      {/* System prompt */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.agentWithTools.systemPrompt', 'System Prompt')}</Label>
        <Textarea
          value={state.system_prompt}
          onChange={(e) => updateField('system_prompt', e.target.value)}
          placeholder={t('agents.forms.agentWithTools.systemPromptPlaceholder', 'Instructions for the agent...')}
          className="min-h-[100px]"
        />
      </div>

      {/* Temperature slider */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>{t('agents.forms.agentWithTools.temperature', 'Temperature')}</Label>
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
        <Label>{t('agents.forms.agentWithTools.maxTokens', 'Max Tokens')}</Label>
        <Input
          type="number"
          value={state.max_tokens}
          onChange={(e) => updateField('max_tokens', Number(e.target.value) || 4096)}
          min={1}
          max={128000}
        />
      </div>

      {/* Max reasoning rounds */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.agentWithTools.maxRounds', 'Max Rounds')}</Label>
        <Input
          type="number"
          value={state.max_rounds}
          onChange={(e) => updateField('max_rounds', Math.max(1, Number(e.target.value) || 5))}
          min={1}
          max={50}
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.agentWithTools.maxRoundsHint', 'Maximum tool-call reasoning cycles before forcing a final answer')}
        </p>
      </div>

      {/* Citation toggle */}
      <div className="flex items-center justify-between">
        <Label>{t('agents.forms.agentWithTools.cite', 'Enable Citations')}</Label>
        <Switch
          checked={state.cite}
          onCheckedChange={(v: boolean) => updateField('cite', v)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t('agents.forms.agentWithTools.citeHint', 'Generate citations from retrieval results in the final answer')}
      </p>

      {/* Tool definitions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('agents.forms.agentWithTools.tools', 'Tools')}</Label>
          <Button variant="ghost" size="sm" onClick={addTool}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('common.add', 'Add')}
          </Button>
        </div>

        {state.tools.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t('agents.forms.agentWithTools.noTools', 'No tools configured. Add tools for the agent to use.')}
          </p>
        )}

        {state.tools.map((tool, idx) => (
          <div key={idx} className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
            {/* Tool enable/disable toggle */}
            <Switch
              checked={tool.enabled}
              onCheckedChange={(v: boolean) => updateTool(idx, { enabled: v })}
              className="shrink-0"
            />
            {/* Tool component name */}
            <Input
              value={tool.component_name}
              onChange={(e) => updateTool(idx, { component_name: e.target.value })}
              placeholder={t('agents.forms.agentWithTools.toolComponent', 'Component')}
              className="flex-1 text-sm"
            />
            {/* Tool display name */}
            <Input
              value={tool.name}
              onChange={(e) => updateTool(idx, { name: e.target.value })}
              placeholder={t('agents.forms.agentWithTools.toolName', 'Display name')}
              className="flex-1 text-sm"
            />
            <Button variant="ghost" size="icon" onClick={() => removeTool(idx)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
