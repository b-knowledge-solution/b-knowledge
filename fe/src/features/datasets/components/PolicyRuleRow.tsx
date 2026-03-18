/**
 * @fileoverview A single ABAC policy rule row with effect, action, and conditions editing.
 * Used within PolicyRuleEditor to compose the full policy rule list.
 *
 * @module features/datasets/components/PolicyRuleRow
 */

import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AbacPolicyRule } from '../types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the PolicyRuleRow component
 */
interface PolicyRuleRowProps {
  /** The policy rule data to display and edit */
  rule: AbacPolicyRule
  /** Callback when any field in the rule changes */
  onChange: (updated: AbacPolicyRule) => void
  /** Callback to remove this rule from the list */
  onRemove: () => void
  /** Whether the row inputs should be disabled (e.g. during save) */
  disabled?: boolean
}

/**
 * @description Internal representation of a single condition entry for editing
 */
interface ConditionEntry {
  key: string
  operator: 'equals' | 'in' | 'not_equals'
  value: string
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Parse a conditions Record into an array of ConditionEntry for editing.
 * Supports flat values (equals), arrays (in), and $ne operator objects (not equals).
 * @param {Record<string, unknown>} conditions - The rule conditions object
 * @returns {ConditionEntry[]} Array of condition entries for rendering
 */
function parseConditions(conditions: Record<string, unknown>): ConditionEntry[] {
  const entries: ConditionEntry[] = []
  for (const [key, val] of Object.entries(conditions)) {
    if (Array.isArray(val)) {
      // Array values represent an "in" operator
      entries.push({ key, operator: 'in', value: val.join(', ') })
    } else if (typeof val === 'object' && val !== null && '$ne' in val) {
      // Object with $ne key represents a "not equals" operator
      entries.push({ key, operator: 'not_equals', value: String((val as Record<string, unknown>)['$ne']) })
    } else {
      // Simple scalar values represent an "equals" operator
      entries.push({ key, operator: 'equals', value: String(val ?? '') })
    }
  }
  return entries
}

/**
 * @description Convert an array of ConditionEntry back to a conditions Record for the API.
 * @param {ConditionEntry[]} entries - The condition entries to serialize
 * @returns {Record<string, unknown>} The conditions object for the AbacPolicyRule
 */
function serializeConditions(entries: ConditionEntry[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const entry of entries) {
    // Skip entries with empty keys
    if (!entry.key.trim()) continue

    if (entry.operator === 'in') {
      // Split comma-separated values into an array
      result[entry.key] = entry.value.split(',').map((v) => v.trim()).filter(Boolean)
    } else if (entry.operator === 'not_equals') {
      result[entry.key] = { $ne: entry.value }
    } else {
      // Default equals operator stores as plain value
      result[entry.key] = entry.value
    }
  }
  return result
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Renders a single ABAC policy rule row with editable effect, action,
 * and condition fields. Each change propagates to the parent via onChange callback.
 *
 * @param {PolicyRuleRowProps} props - Rule data, change/remove callbacks, and disabled state
 * @returns {JSX.Element} Rendered policy rule row with inline editing controls
 */
export function PolicyRuleRow({ rule, onChange, onRemove, disabled }: PolicyRuleRowProps) {
  const { t } = useTranslation()

  // Parse conditions into editable entries
  const conditionEntries = parseConditions(rule.conditions)

  /**
   * @description Update the rule's effect field
   * @param {string} value - New effect value ('allow' or 'deny')
   */
  const handleEffectChange = (value: string) => {
    onChange({ ...rule, effect: value as 'allow' | 'deny' })
  }

  /**
   * @description Update the rule's action field
   * @param {string} value - New action value
   */
  const handleActionChange = (value: string) => {
    onChange({ ...rule, action: value })
  }

  /**
   * @description Update a specific condition entry and serialize back to conditions object
   * @param {number} index - Index of the condition to update
   * @param {Partial<ConditionEntry>} updates - Partial field updates
   */
  const updateCondition = (index: number, updates: Partial<ConditionEntry>) => {
    const updated = [...conditionEntries]
    updated[index] = { ...updated[index]!, ...updates }
    onChange({ ...rule, conditions: serializeConditions(updated) })
  }

  /**
   * @description Add a new empty condition entry
   */
  const addCondition = () => {
    const updated: ConditionEntry[] = [...conditionEntries, { key: '', operator: 'equals', value: '' }]
    onChange({ ...rule, conditions: serializeConditions(updated) })
  }

  /**
   * @description Remove a condition entry by index
   * @param {number} index - Index of the condition to remove
   */
  const removeCondition = (index: number) => {
    const updated = conditionEntries.filter((_, i) => i !== index)
    onChange({ ...rule, conditions: serializeConditions(updated) })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Top row: effect, action, and remove button */}
      <div className="flex items-center gap-3">
        {/* Effect select (allow/deny) */}
        <div className="w-32">
          <Select value={rule.effect} onValueChange={handleEffectChange} disabled={disabled}>
            <SelectTrigger className={rule.effect === 'allow'
              ? 'border-green-300 dark:border-green-700'
              : 'border-red-300 dark:border-red-700'
            }>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="allow">
                <span className="text-green-700 dark:text-green-300">
                  {t('accessControl.policy.effectAllow')}
                </span>
              </SelectItem>
              <SelectItem value="deny">
                <span className="text-red-700 dark:text-red-300">
                  {t('accessControl.policy.effectDeny')}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Action select (read/update/delete) */}
        <div className="w-32">
          <Select value={rule.action} onValueChange={handleActionChange} disabled={disabled}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="read">read</SelectItem>
              <SelectItem value="update">update</SelectItem>
              <SelectItem value="delete">delete</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Spacer pushes remove button to the right */}
        <div className="flex-1" />

        {/* Remove rule button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled}
          className="text-muted-foreground hover:text-destructive shrink-0"
          aria-label={t('accessControl.policy.removeRule')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Conditions section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('accessControl.policy.conditions')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={addCondition}
            disabled={disabled}
            className="h-6 px-2 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            {t('accessControl.policy.conditions')}
          </Button>
        </div>

        {/* Render each condition as an inline row */}
        {conditionEntries.map((entry, idx) => (
          <div key={idx} className="flex items-center gap-2">
            {/* Attribute name input */}
            <Input
              value={entry.key}
              onChange={(e) => updateCondition(idx, { key: e.target.value })}
              placeholder={t('accessControl.policy.attributeName')}
              disabled={disabled}
              className="h-8 text-sm flex-1"
            />

            {/* Operator select */}
            <Select
              value={entry.operator}
              onValueChange={(val: string) => updateCondition(idx, { operator: val as ConditionEntry['operator'] })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 w-28 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="equals">{t('accessControl.policy.operatorEquals')}</SelectItem>
                <SelectItem value="in">{t('accessControl.policy.operatorIn')}</SelectItem>
                <SelectItem value="not_equals">{t('accessControl.policy.operatorNotEquals')}</SelectItem>
              </SelectContent>
            </Select>

            {/* Value input */}
            <Input
              value={entry.value}
              onChange={(e) => updateCondition(idx, { value: e.target.value })}
              placeholder={t('accessControl.policy.value')}
              disabled={disabled}
              className="h-8 text-sm flex-1"
            />

            {/* Remove condition button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeCondition(idx)}
              disabled={disabled}
              className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}

        {/* Empty conditions hint */}
        {conditionEntries.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            {t('accessControl.policy.noRulesDesc')}
          </p>
        )}
      </div>
    </div>
  )
}
