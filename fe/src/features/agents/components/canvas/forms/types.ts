/**
 * @fileoverview Shared types for operator configuration forms.
 * @module features/agents/components/canvas/forms/types
 */

/**
 * @description Props interface shared by all operator configuration forms.
 *   Each form receives the current node config and a callback to propagate updates.
 */
export interface NodeFormProps {
  /** UUID of the canvas node being configured */
  nodeId: string
  /** Current node configuration object */
  config: Record<string, unknown>
  /** Callback to propagate config changes to the canvas store */
  onUpdate: (data: Record<string, unknown>) => void
}
