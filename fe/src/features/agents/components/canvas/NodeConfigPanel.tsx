/**
 * @fileoverview Right-side configuration panel for editing the selected node's data.
 * Dispatches to type-specific forms for core operators, falls back to generic
 * JSON editor for remaining operator types.
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
import type { NodeFormProps } from './forms/types'
import { GenerateForm } from './forms/GenerateForm'
import { RetrievalForm } from './forms/RetrievalForm'
import { BeginForm } from './forms/BeginForm'
import { SwitchForm } from './forms/SwitchForm'
import { CodeForm } from './forms/CodeForm'
import { CategorizeForm } from './forms/CategorizeForm'
import { MessageForm } from './forms/MessageForm'
import { LoopForm } from './forms/LoopForm'
import { IterationForm } from './forms/IterationForm'
import { IterationItemForm } from './forms/IterationItemForm'
import { LoopItemForm } from './forms/LoopItemForm'
import { InvokeForm } from './forms/InvokeForm'
import { VariableAssignerForm } from './forms/VariableAssignerForm'
import { VariableAggregatorForm } from './forms/VariableAggregatorForm'
import { DataOperationsForm } from './forms/DataOperationsForm'
import { ListOperationsForm } from './forms/ListOperationsForm'
import { StringTransformForm } from './forms/StringTransformForm'
import { ExitLoopForm } from './forms/ExitLoopForm'
import { DocsGeneratorForm } from './forms/DocsGeneratorForm'
import { ExcelProcessorForm } from './forms/ExcelProcessorForm'
import { FillUpForm } from './forms/FillUpForm'
import { AgentWithToolsForm } from './forms/AgentWithToolsForm'
import { RewriteForm } from './forms/RewriteForm'
import { MemoryForm } from './forms/MemoryForm'

/**
 * @description Maps operator type to its dedicated configuration form component.
 *   Core operators have type-specific forms; remaining operators fall through
 *   to the generic JSON editor below.
 */
const FORM_MAP: Partial<Record<OperatorType, React.ComponentType<NodeFormProps>>> = {
  generate: GenerateForm,
  retrieval: RetrievalForm,
  begin: BeginForm,
  switch: SwitchForm,
  code: CodeForm,
  categorize: CategorizeForm,
  message: MessageForm,
  loop: LoopForm,
  iteration: IterationForm,
  iteration_item: IterationItemForm,
  loop_item: LoopItemForm,
  invoke: InvokeForm,
  variable_assigner: VariableAssignerForm,
  variable_aggregator: VariableAggregatorForm,
  data_operations: DataOperationsForm,
  list_operations: ListOperationsForm,
  string_transform: StringTransformForm,
  exit_loop: ExitLoopForm,
  docs_generator: DocsGeneratorForm,
  excel_processor: ExcelProcessorForm,
  fillup: FillUpForm,
  agent_with_tools: AgentWithToolsForm,
  rewrite: RewriteForm,
  memory_read: MemoryForm,
  memory_write: MemoryForm,
}

/**
 * @description Right-side panel (360px fixed width) for configuring the currently
 * selected canvas node. Dispatches to type-specific forms for 23 operator types
 * and falls back to a generic JSON editor for any remaining types.
 * Visible only when a node is selected.
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

  // Local state for the generic JSON editor (used when no type-specific form exists)
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
   * @description Validates and applies the JSON config to the selected node (generic editor)
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
   * @description Handles config updates from type-specific forms
   * @param {Record<string, unknown>} data - Partial node data to merge
   */
  const handleFormUpdate = useCallback(
    (data: Record<string, unknown>) => {
      if (!selectedNodeId) return
      updateNodeData(selectedNodeId, data)
    },
    [selectedNodeId, updateNodeData],
  )

  /**
   * @description Closes the panel by deselecting the current node
   */
  const handleClose = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  // Hide panel when no node is selected
  if (!selectedNode) return null

  const nodeData = selectedNode.data as { type?: OperatorType; label?: string; config?: Record<string, unknown> }

  // Resolve the type-specific form component, if available
  const FormComponent = nodeData.type ? FORM_MAP[nodeData.type] : undefined
  const nodeConfig = nodeData.config ?? {}

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

      {/* Body: type-specific form or generic JSON editor */}
      <div className="flex-1 overflow-auto p-4">
        {FormComponent ? (
          // Render the dedicated form for this operator type
          <FormComponent
            nodeId={selectedNode.id}
            config={nodeConfig}
            onUpdate={handleFormUpdate}
          />
        ) : (
          // Generic JSON editor fallback for operators without dedicated forms
          <>
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
          </>
        )}
      </div>

      {/* Footer: Apply button (only for generic JSON editor) */}
      {!FormComponent && (
        <div className="border-t px-4 py-3">
          <Button onClick={handleApply} className="w-full" size="sm">
            {t('common.apply', 'Apply')}
          </Button>
        </div>
      )}
    </div>
  )
}
