/**
 * @fileoverview Loop Item node configuration form.
 * Displays a read-only reference to the current loop context.
 * The LoopItem is the body block inside a Loop node; its configuration
 * is determined by the parent Loop node.
 *
 * @module features/agents/components/canvas/forms/LoopItemForm
 */

import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import type { NodeFormProps } from './types'

/**
 * @description Configuration form for the Loop Item operator node.
 *   This is a read-only informational panel that shows the current loop
 *   context. The LoopItem acts as the body of a Loop and its behavior
 *   is controlled by the parent Loop node.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Loop Item node configuration form
 */
export function LoopItemForm({ config }: NodeFormProps) {
  const { t } = useTranslation()

  // Extract parent loop info from config if available
  const parentId = (config as Record<string, unknown>).parent_id as string | undefined
  const maxIterations = (config as Record<string, unknown>).maximum_loop_count as number | undefined

  return (
    <div className="space-y-4">
      {/* Informational header */}
      <p className="text-sm text-muted-foreground">
        {t('agents.forms.loopItem.description', 'This node represents the body of a loop. Configure the parent Loop node to change loop behavior.')}
      </p>

      {/* Parent loop reference */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.loopItem.parentId', 'Parent Loop')}</Label>
        <p className="text-sm font-mono bg-muted/50 px-2 py-1 rounded">
          {parentId || t('agents.forms.loopItem.noParent', 'Not linked')}
        </p>
      </div>

      {/* Max iterations from parent */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.loopItem.maxIterations', 'Max Iterations (from parent)')}</Label>
        <p className="text-sm font-mono bg-muted/50 px-2 py-1 rounded">
          {maxIterations ?? t('agents.forms.loopItem.notSet', 'Not set')}
        </p>
      </div>
    </div>
  )
}
