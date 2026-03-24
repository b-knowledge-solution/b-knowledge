/**
 * @fileoverview ABAC policy rule editor for dataset access control.
 * Provides an inline editor to add, edit, and remove policy rules
 * that govern fine-grained access to a dataset's documents.
 *
 * @module features/datasets/components/PolicyRuleEditor
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Info, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { PolicyRuleRow } from './PolicyRuleRow'
import { useUpdateDatasetPolicy } from '../api/datasetQueries'
import type { AbacPolicyRule } from '../types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the PolicyRuleEditor component
 */
interface PolicyRuleEditorProps {
  /** Dataset ID to save policy rules for */
  datasetId: string
  /** Initial policy rules to populate the editor */
  initialRules: AbacPolicyRule[]
  /** Optional callback after successful save */
  onSave?: (rules: AbacPolicyRule[]) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Inline editor for managing ABAC policy rules on a dataset.
 * Displays a section header with an inheritance tooltip, a list of editable
 * policy rule rows, and controls to add new rules and save changes.
 *
 * @param {PolicyRuleEditorProps} props - Dataset ID, initial rules, and optional save callback
 * @returns {JSX.Element} Rendered policy rule editor section
 */
export function PolicyRuleEditor({ datasetId, initialRules, onSave }: PolicyRuleEditorProps) {
  const { t } = useTranslation()

  // Local state for the working copy of rules
  const [rules, setRules] = useState<AbacPolicyRule[]>(initialRules)

  // Mutation hook for saving policy rules to the backend
  const updatePolicy = useUpdateDatasetPolicy(datasetId)

  /**
   * @description Add a new empty rule with default values
   */
  const handleAddRule = () => {
    const newRule: AbacPolicyRule = {
      id: crypto.randomUUID(),
      effect: 'allow',
      action: 'read',
      subject: 'Document',
      conditions: {},
    }
    setRules((prev) => [...prev, newRule])
  }

  /**
   * @description Update a specific rule in the list
   * @param {number} index - Index of the rule to update
   * @param {AbacPolicyRule} updated - The updated rule data
   */
  const handleRuleChange = (index: number, updated: AbacPolicyRule) => {
    setRules((prev) => prev.map((r, i) => (i === index ? updated : r)))
  }

  /**
   * @description Remove a rule from the list by index
   * @param {number} index - Index of the rule to remove
   */
  const handleRemoveRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index))
  }

  /**
   * @description Save the current rules to the backend via mutation
   */
  const handleSave = async () => {
    try {
      await updatePolicy.mutateAsync(rules)
      // Notify parent of successful save
      onSave?.(rules)
    } catch {
      // Error toast is handled by the mutation's global error handler
    }
  }

  const isSaving = updatePolicy.isPending

  return (
    <div className="space-y-4">
      {/* Section header with inheritance tooltip */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {t('accessControl.policy.title')}
        </h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <p className="text-sm">{t('accessControl.policy.inheritanceTooltip')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Empty state when no rules exist */}
      {rules.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('accessControl.policy.noRulesDesc')}
        </p>
      )}

      {/* List of policy rule rows */}
      <div className="space-y-3">
        {rules.map((rule, index) => (
          <PolicyRuleRow
            key={rule.id}
            rule={rule}
            onChange={(updated) => handleRuleChange(index, updated)}
            onRemove={() => handleRemoveRule(index)}
            disabled={isSaving}
          />
        ))}
      </div>

      {/* Action buttons: Add Rule and Save */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddRule}
          disabled={isSaving}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          {t('accessControl.policy.addRule')}
        </Button>

        {/* Only show save button when there are rules or rules have been modified */}
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          {t('accessControl.policy.save')}
        </Button>
      </div>
    </div>
  )
}
