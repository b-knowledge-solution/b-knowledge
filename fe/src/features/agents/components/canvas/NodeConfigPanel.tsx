/**
 * @fileoverview Right-side configuration panel for editing the selected node's data.
 * Shows a JSON editor for node config with apply/close controls.
 *
 * @module features/agents/components/canvas/NodeConfigPanel
 */

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useCanvasStore } from '../../store/canvasStore'
import type { OperatorType } from '../../types/agent.types'

/**
 * @description Right-side panel (360px fixed width) for configuring the currently
 * selected canvas node. Displays node type, label, and a JSON editor for the
 * node's config payload. Visible only when a node is selected.
 *
 * @returns {JSX.Element | null} Config panel or null when no node is selected
 */
export function NodeConfigPanel() {
  const { t } = useTranslation()
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId)
  const nodes = useCanvasStore((s) => s.nodes)
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const selectNode = useCanvasStore((s) => s.selectNode)

  // Find the currently selected node
  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null

  // Local state for the JSON editor
  const [configJson, setConfigJson] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)

  // Sync local JSON editor with selected node's config
  useEffect(() => {
    if (selectedNode) {
      const config = (selectedNode.data as Record<string, unknown>).config ?? {}
      setConfigJson(JSON.stringify(config, null, 2))
      setJsonError(null)
    }
  }, [selectedNode])

  /**
   * @description Validates and applies the JSON config to the selected node
   */
  const handleApply = useCallback(() => {
    if (!selectedNodeId) return

    try {
      const parsed = JSON.parse(configJson) as Record<string, unknown>
      updateNodeData(selectedNodeId, { config: parsed })
      setJsonError(null)
    } catch (err) {
      // Show parse error to help user fix invalid JSON
      setJsonError(err instanceof Error ? err.message : 'Invalid JSON')
    }
  }, [selectedNodeId, configJson, updateNodeData])

  /**
   * @description Closes the panel by deselecting the current node
   */
  const handleClose = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  // Hide panel when no node is selected
  if (!selectedNode) return null

  const nodeData = selectedNode.data as { type?: OperatorType; label?: string }

  return (
    <div className="w-[360px] border-l bg-background flex flex-col h-full">
      {/* Header: node type and close button */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">
            {nodeData.label ?? 'Node'}
          </div>
          <div className="text-xs text-muted-foreground">
            {nodeData.type ?? 'unknown'}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={handleClose}>
          <X className="h-4 w-4" />
          <span className="sr-only">{t('common.close', 'Close')}</span>
        </Button>
      </div>

      {/* Body: JSON config editor */}
      <div className="flex-1 overflow-auto p-4">
        <label className="text-sm font-medium mb-2 block">
          {t('common.configuration', 'Configuration')}
        </label>
        <Textarea
          value={configJson}
          onChange={(e) => {
            setConfigJson(e.target.value)
            setJsonError(null)
          }}
          className="font-mono text-xs min-h-[200px]"
          placeholder="{}"
        />
        {/* JSON validation error */}
        {jsonError && (
          <p className="text-xs text-destructive mt-1">{jsonError}</p>
        )}
      </div>

      {/* Footer: Apply button */}
      <div className="border-t px-4 py-3">
        <Button onClick={handleApply} className="w-full" size="sm">
          {t('common.apply', 'Apply')}
        </Button>
      </div>
    </div>
  )
}
