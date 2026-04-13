/**
 * @fileoverview Agent canvas page that renders the full-viewport visual builder
 * with toolbar, ReactFlow canvas, and node configuration panel.
 *
 * @module features/agents/pages/AgentCanvasPage
 */

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ReactFlowProvider } from '@xyflow/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { useAgentCanvas } from '../hooks/useAgentCanvas'
import { AgentToolbar } from '../components/AgentToolbar'
import { AgentCanvas } from '../components/AgentCanvas'
import { NodeConfigPanel } from '../components/canvas/NodeConfigPanel'
import { NodePalette } from '../components/canvas/NodePalette'
import { useUpdateAgent } from '../api/agentQueries'

/**
 * @description Full-viewport agent canvas page at /agents/:id.
 * Loads the agent, renders toolbar + canvas + config panel, and handles
 * unsaved changes warning via beforeunload.
 *
 * @returns {JSX.Element} Agent canvas page with toolbar, canvas, and side panel
 */
function AgentCanvasPageInner() {
  const { id = '' } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const { agent, isLoading, error, refetch, isDirty, isSaving, save } = useAgentCanvas(id)
  const updateAgent = useUpdateAgent()

  // Node palette (command palette) open state
  const [paletteOpen, setPaletteOpen] = useState(false)

  /**
   * @description Opens the node palette for adding new nodes
   */
  const handleOpenPalette = useCallback(() => {
    setPaletteOpen(true)
  }, [])

  // Keyboard shortcut: Cmd+K to open palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Warn on navigation away if there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  /**
   * @description Handles inline name change from the toolbar
   * @param {string} name - New agent name
   */
  const handleNameChange = useCallback((name: string) => {
    if (!id) return
    updateAgent.mutate({ id, data: { name } })
  }, [id, updateAgent])

  // Loading state: centered spinner
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  // Error state: message with retry
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-destructive">{t('common.error', 'Something went wrong')}</p>
        <Button onClick={() => refetch()}>{t('common.retry', 'Retry')}</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      <TooltipProvider>
        <AgentToolbar
          agent={agent}
          isDirty={isDirty}
          isSaving={isSaving}
          onSave={save}
          onNameChange={handleNameChange}
          onOpenPalette={handleOpenPalette}
        />
      </TooltipProvider>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas fills remaining viewport */}
        <div className="flex-1">
          <AgentCanvas onOpenPalette={handleOpenPalette} />
        </div>

        {/* Right-side config panel (360px fixed width, shown when node selected) */}
        <NodeConfigPanel />
      </div>

      {/* Node palette (Cmd+K command dialog) */}
      <NodePalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}

/**
 * @description Agent canvas page wrapper that provides the ReactFlowProvider context.
 * Required because ReactFlow hooks (useReactFlow) need the provider higher in the tree.
 *
 * @returns {JSX.Element} ReactFlowProvider-wrapped canvas page
 */
export default function AgentCanvasPage() {
  return (
    <ReactFlowProvider>
      <AgentCanvasPageInner />
    </ReactFlowProvider>
  )
}
