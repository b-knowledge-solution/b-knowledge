/**
 * @fileoverview Exit Loop node configuration form.
 * Minimal form for the Exit Loop operator which breaks out of
 * the enclosing Loop or Iteration when reached.
 *
 * @module features/agents/components/canvas/forms/ExitLoopForm
 */

import { useTranslation } from 'react-i18next'
import type { NodeFormProps } from './types'

/**
 * @description Configuration form for the Exit Loop operator node.
 *   This is a signal-only node with no configurable parameters. When execution
 *   reaches this node inside a Loop or Iteration body, the loop terminates
 *   immediately and control passes to the node after the loop.
 * @param {NodeFormProps} _props - Node ID, current config, and update callback (unused)
 * @returns {JSX.Element} Exit Loop node configuration form
 */
export function ExitLoopForm(_props: NodeFormProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      {/* Informational description - no configurable fields */}
      <p className="text-sm text-muted-foreground">
        {t('agents.forms.exitLoop.description', 'This node immediately breaks out of the enclosing Loop or Iteration when reached. No configuration is needed.')}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('agents.forms.exitLoop.usage', 'Place this node inside a Loop or Iteration body. Connect it to a condition branch to exit early based on a rule.')}
      </p>
    </div>
  )
}
