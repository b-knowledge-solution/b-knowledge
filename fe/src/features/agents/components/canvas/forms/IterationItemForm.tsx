/**
 * @fileoverview Iteration Item node configuration form.
 * Displays a read-only reference to the current iteration context.
 * The IterationItem is the body block inside an Iteration node;
 * its configuration is determined by the parent Iteration node.
 *
 * @module features/agents/components/canvas/forms/IterationItemForm
 */

import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import type { NodeFormProps } from './types'

/**
 * @description Configuration form for the Iteration Item operator node.
 *   This is a read-only informational panel that shows the current iteration
 *   context. The IterationItem acts as the body of an Iteration loop and
 *   its behavior is controlled by the parent Iteration node.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Iteration Item node configuration form
 */
export function IterationItemForm({ config }: NodeFormProps) {
  const { t } = useTranslation()

  // Extract parent iteration info from config if available
  const parentId = (config as Record<string, unknown>).parent_id as string | undefined
  const iteratorVar = (config as Record<string, unknown>).iterator_variable as string | undefined

  return (
    <div className="space-y-4">
      {/* Informational header */}
      <p className="text-sm text-muted-foreground">
        {t('agents.forms.iterationItem.description', 'This node represents the body of an iteration loop. Configure the parent Iteration node to change loop behavior.')}
      </p>

      {/* Parent iteration reference */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.iterationItem.parentId', 'Parent Iteration')}</Label>
        <p className="text-sm font-mono bg-muted/50 px-2 py-1 rounded">
          {parentId || t('agents.forms.iterationItem.noParent', 'Not linked')}
        </p>
      </div>

      {/* Current iterator variable name */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.iterationItem.iteratorVariable', 'Iterator Variable')}</Label>
        <p className="text-sm font-mono bg-muted/50 px-2 py-1 rounded">
          {iteratorVar || 'item'}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.iterationItem.iteratorVariableHint', 'Use this variable name in child nodes to access the current element')}
        </p>
      </div>
    </div>
  )
}
