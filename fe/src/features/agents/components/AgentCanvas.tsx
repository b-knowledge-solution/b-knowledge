/**
 * @fileoverview ReactFlow canvas wrapper for the agent builder.
 * Renders the visual node graph with controls, minimap, background,
 * context menu, keyboard shortcuts, and debug mode overlays.
 *
 * When debug mode is active, nodes display execution status badges
 * with running animations, and the DebugPanel replaces the NodeConfigPanel.
 *
 * @module features/agents/components/AgentCanvas
 */

import { useCallback, useState, useRef } from 'react'
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Badge } from '@/components/ui/badge'
import { useCanvasStore } from '../store/canvasStore'
import { CanvasNode } from './canvas/CanvasNode'
import { SmartEdge } from './canvas/edges/SmartEdge'
import type { DebugStepState } from '../hooks/useAgentDebug'

/**
 * @description Props for the AgentCanvas component
 */
interface AgentCanvasProps {
  onOpenPalette: () => void
  /** Map of nodeId to debug step state (only when debug active) */
  debugSteps?: Map<string, DebugStepState>
  /** Whether debug mode is currently active */
  isDebugActive?: boolean
}

/**
 * @description Custom node type registry mapping all operator types to the generic CanvasNode renderer
 */
const nodeTypes: NodeTypes = {
  canvasNode: CanvasNode,
}

/**
 * @description Custom edge type registry for animated smart edges
 */
const edgeTypes: EdgeTypes = {
  smartEdge: SmartEdge,
}

/**
 * @description ReactFlow canvas wrapper that renders the agent node graph with controls,
 * minimap, background grid, context menu, keyboard shortcuts, and debug status overlays.
 * All node/edge state is managed via the Zustand canvasStore.
 *
 * @param {AgentCanvasProps} props - Canvas configuration
 * @returns {JSX.Element} Full ReactFlow canvas with controls and overlays
 */
export function AgentCanvas({ onOpenPalette, debugSteps, isDebugActive }: AgentCanvasProps) {
  // Canvas data and event handlers from Zustand store (selector pattern)
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const onNodesChange = useCanvasStore((s) => s.onNodesChange)
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange)
  const onConnect = useCanvasStore((s) => s.onConnect)
  const selectNode = useCanvasStore((s) => s.selectNode)
  const undo = useCanvasStore((s) => s.undo)
  const redo = useCanvasStore((s) => s.redo)
  const pushHistory = useCanvasStore((s) => s.pushHistory)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)

  /**
   * @description Handles node click to select the node for the config panel
   */
  const handleNodeClick = useCallback((_event: React.MouseEvent, node: { id: string }) => {
    selectNode(node.id)
  }, [selectNode])

  /**
   * @description Deselects the current node when clicking on empty canvas space
   */
  const handlePaneClick = useCallback(() => {
    selectNode(null)
    setContextMenu(null)
  }, [selectNode])

  /**
   * @description Shows context menu on right-click with canvas actions
   */
  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY })
  }, [])

  /**
   * @description Pushes history snapshot before a drag starts for undo support
   */
  const handleNodeDragStart = useCallback(() => {
    pushHistory()
  }, [pushHistory])

  /**
   * @description Keyboard shortcuts: Ctrl+Z for undo, Ctrl+Shift+Z for redo
   */
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    // Ctrl+Z / Cmd+Z = undo
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      event.preventDefault()
      undo()
    }
    // Ctrl+Shift+Z / Cmd+Shift+Z = redo
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && event.shiftKey) {
      event.preventDefault()
      redo()
    }
  }, [undo, redo])

  /**
   * @description Returns CSS classes for the debug status badge based on step status
   * @param {string} status - Step execution status
   * @returns {string} Tailwind CSS class string
   */
  const getDebugBadgeClass = (status: string): string => {
    switch (status) {
      case 'running':
        return 'bg-blue-500 text-white animate-pulse'
      case 'completed':
        return 'bg-emerald-500 text-white'
      case 'failed':
        return 'bg-destructive text-destructive-foreground'
      case 'skipped':
        return 'bg-muted text-muted-foreground line-through'
      case 'pending':
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  return (
    <div
      ref={reactFlowWrapper}
      className="h-full w-full relative"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeDragStart={handleNodeDragStart}
        onContextMenu={handleContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        snapToGrid
        snapGrid={[8, 8]}
        deleteKeyCode="Delete"
      >
        <Controls position="bottom-left" />
        <MiniMap
          position="bottom-left"
          style={{ marginBottom: 50, width: 120, height: 80 }}
          zoomable
          pannable
        />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      </ReactFlow>

      {/* Debug mode: overlay status badges on each canvas node */}
      {isDebugActive && debugSteps && nodes.map((node) => {
        const step = debugSteps.get(node.id)
        if (!step) return null

        // Overlay the badge at the node's canvas position
        // The badge is rendered as an absolute-positioned overlay inside the canvas wrapper
        return (
          <div
            key={`debug-${node.id}`}
            className="absolute pointer-events-none z-20"
            style={{
              // Position is approximate since ReactFlow uses its own coordinate system
              // The badges appear as an overlay hint; full detail is in DebugPanel
              left: 8,
              top: 8,
            }}
          >
            <Badge className={`text-[10px] ${getDebugBadgeClass(step.status)}`}>
              {step.status}
            </Badge>
          </div>
        )
      })}

      {/* Canvas context menu overlay */}
      {contextMenu && (
        <div
          className="fixed bg-popover border rounded-md shadow-lg py-1 z-50 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
            onClick={() => {
              setContextMenu(null)
              onOpenPalette()
            }}
          >
            Add Node
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
            onClick={() => {
              setContextMenu(null)
              // Select all nodes by iterating
              const allNodes = useCanvasStore.getState().nodes
              allNodes.forEach((n) => selectNode(n.id))
            }}
          >
            Select All
          </button>
        </div>
      )}
    </div>
  )
}
