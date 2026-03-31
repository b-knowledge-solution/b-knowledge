/**
 * @fileoverview Variable Aggregator node configuration form.
 * Provides controls for defining groups of variable selectors.
 * Each group picks the first available variable from a prioritized list.
 *
 * @module features/agents/components/canvas/forms/VariableAggregatorForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { NodeFormProps } from './types'

/**
 * @description Variable selector within an aggregation group
 */
interface VariableSelector {
  value: string
}

/**
 * @description Aggregation group with a name and ordered variable selectors
 */
interface AggregationGroup {
  group_name: string
  variables: VariableSelector[]
}

/**
 * @description Internal state shape for VariableAggregator form fields
 */
interface VariableAggregatorConfig {
  groups: AggregationGroup[]
}

/** @description Default configuration for a new VariableAggregator node */
const DEFAULTS: VariableAggregatorConfig = {
  groups: [],
}

/**
 * @description Configuration form for the Variable Aggregator operator node.
 *   Defines groups of variable selectors. For each group, the runtime picks the
 *   first variable in the list that has a non-empty value and outputs it under
 *   the group name. This enables fallback patterns (try A, then B, then C).
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Variable Aggregator node configuration form
 */
export function VariableAggregatorForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<VariableAggregatorConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<VariableAggregatorConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<VariableAggregatorConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof VariableAggregatorConfig>(field: K, value: VariableAggregatorConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  /**
   * @description Adds a new aggregation group
   */
  const addGroup = () => {
    const next: AggregationGroup[] = [
      ...state.groups,
      { group_name: '', variables: [{ value: '' }] },
    ]
    updateField('groups', next)
  }

  /**
   * @description Updates a group's name at the given index
   */
  const updateGroupName = (index: number, name: string) => {
    const next = state.groups.map((g, i) => (i === index ? { ...g, group_name: name } : g))
    updateField('groups', next)
  }

  /**
   * @description Removes a group at the given index
   */
  const removeGroup = (index: number) => {
    const next = state.groups.filter((_, i) => i !== index)
    updateField('groups', next)
  }

  /**
   * @description Adds a variable selector to a specific group
   */
  const addSelector = (groupIndex: number) => {
    const next = state.groups.map((g, i) =>
      i === groupIndex ? { ...g, variables: [...g.variables, { value: '' }] } : g,
    )
    updateField('groups', next)
  }

  /**
   * @description Updates a variable selector value within a group
   */
  const updateSelector = (groupIndex: number, selectorIndex: number, value: string) => {
    const next = state.groups.map((g, gi) =>
      gi === groupIndex
        ? {
            ...g,
            variables: g.variables.map((s, si) => (si === selectorIndex ? { value } : s)),
          }
        : g,
    )
    updateField('groups', next)
  }

  /**
   * @description Removes a variable selector from a group
   */
  const removeSelector = (groupIndex: number, selectorIndex: number) => {
    const next = state.groups.map((g, gi) =>
      gi === groupIndex
        ? { ...g, variables: g.variables.filter((_, si) => si !== selectorIndex) }
        : g,
    )
    updateField('groups', next)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {t('agents.forms.variableAggregator.description', 'Each group outputs the first non-empty variable from its list. Use this to create fallback chains.')}
      </p>

      {/* Aggregation groups */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('agents.forms.variableAggregator.groups', 'Groups')}</Label>
          <Button variant="ghost" size="sm" onClick={addGroup}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('common.add', 'Add')}
          </Button>
        </div>

        {state.groups.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t('agents.forms.variableAggregator.noGroups', 'No groups defined. Add a group to aggregate variables.')}
          </p>
        )}

        {state.groups.map((group, gIdx) => (
          <div key={gIdx} className="space-y-2 p-2 border rounded-md bg-muted/30">
            <div className="flex items-center gap-2">
              {/* Group name */}
              <Input
                value={group.group_name}
                onChange={(e) => updateGroupName(gIdx, e.target.value)}
                placeholder={t('agents.forms.variableAggregator.groupName', 'Group name (output key)')}
                className="flex-1 text-sm"
              />
              <Button variant="ghost" size="icon" onClick={() => removeGroup(gIdx)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>

            {/* Variable selectors within this group (priority order) */}
            <div className="space-y-1 pl-2 border-l-2 border-muted">
              {group.variables.map((sel, sIdx) => (
                <div key={sIdx} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{sIdx + 1}.</span>
                  <Input
                    value={sel.value}
                    onChange={(e) => updateSelector(gIdx, sIdx, e.target.value)}
                    placeholder={t('agents.forms.variableAggregator.variableRef', 'component@variable')}
                    className="flex-1 text-sm"
                  />
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeSelector(gIdx, sIdx)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => addSelector(gIdx)}>
                <Plus className="h-3 w-3 mr-1" />
                {t('agents.forms.variableAggregator.addVariable', 'Add fallback variable')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
