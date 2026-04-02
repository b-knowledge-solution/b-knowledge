/**
 * @fileoverview Hook orchestrating agent canvas <-> server synchronization.
 * Loads agent data from the API, populates the Zustand canvas store,
 * provides save/auto-save, and exposes loading/saving state.
 *
 * @module features/agents/hooks/useAgentCanvas
 */

import { useEffect, useRef, useCallback } from 'react'
import { type Node, type Edge } from '@xyflow/react'
import { toast } from 'sonner'
import { useCanvasStore } from '../store/canvasStore'
import { useAgent, useUpdateAgent } from '../api/agentQueries'
import type { AgentDSL, AgentNodeDef, AgentEdgeDef } from '../types/agent.types'

/** @description Auto-save interval in milliseconds */
const AUTO_SAVE_INTERVAL = 30_000

/**
 * @description Converts DSL node definitions to ReactFlow Node array
 * @param {Record<string, AgentNodeDef>} dslNodes - Nodes from the agent DSL keyed by ID
 * @returns {Node[]} ReactFlow-compatible nodes with type, position, and data
 */
function dslNodesToReactFlow(dslNodes: Record<string, AgentNodeDef>): Node[] {
  return Object.entries(dslNodes).map(([id, def]) => ({
    id,
    type: 'canvasNode',
    position: def.position,
    data: {
      type: def.type,
      label: def.label,
      config: def.config,
    },
  }))
}

/**
 * @description Converts DSL edge definitions to ReactFlow Edge array
 * @param {AgentEdgeDef[]} dslEdges - Edges from the agent DSL
 * @returns {Edge[]} ReactFlow-compatible edges with source, target, and optional handles
 */
function dslEdgesToReactFlow(dslEdges: AgentEdgeDef[]): Edge[] {
  return dslEdges.map((e, i) => ({
    id: `e-${e.source}-${e.target}-${i}`,
    source: e.source,
    target: e.target,
    type: 'smartEdge',
    ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
    ...(e.condition ? { label: e.condition } : {}),
  }))
}

/**
 * @description Strips ReactFlow UI-only fields from nodes before saving to server.
 * Removes selected, dragging, measured, width, height to keep DSL clean.
 * @param {Node[]} nodes - ReactFlow nodes with potential UI state
 * @returns {Record<string, AgentNodeDef>} Clean DSL node definitions keyed by ID
 */
function reactFlowNodesToDSL(nodes: Node[]): Record<string, AgentNodeDef> {
  const result: Record<string, AgentNodeDef> = {}
  for (const node of nodes) {
    result[node.id] = {
      id: node.id,
      type: (node.data as Record<string, unknown>).type as AgentNodeDef['type'],
      position: node.position,
      config: ((node.data as Record<string, unknown>).config ?? {}) as Record<string, unknown>,
      label: ((node.data as Record<string, unknown>).label ?? '') as string,
    }
  }
  return result
}

/**
 * @description Converts ReactFlow edges back to DSL edge definitions
 * @param {Edge[]} edges - ReactFlow edges
 * @returns {AgentEdgeDef[]} DSL edge definitions for persistence
 */
function reactFlowEdgesToDSL(edges: Edge[]): AgentEdgeDef[] {
  return edges.map((e) => ({
    source: e.source,
    target: e.target,
    ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
    ...(e.label ? { condition: String(e.label) } : {}),
  }))
}

/**
 * @description Hook that orchestrates bidirectional sync between the agent canvas store
 * and the server API. Loads DSL on mount, provides save() with dirty checking,
 * and runs a 30-second auto-save interval.
 *
 * @param {string} id - Agent UUID from route params
 * @returns Object with agent data, loading/saving state, and save function
 */
export function useAgentCanvas(id: string) {
  const { data: agent, isLoading, error, refetch } = useAgent(id)
  const updateAgent = useUpdateAgent()

  // Refs for auto-save interval management
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasLoadedRef = useRef(false)

  // Store selectors
  const loadFromDSL = useCanvasStore((s) => s.loadFromDSL)
  const markClean = useCanvasStore((s) => s.markClean)
  const isDirty = useCanvasStore((s) => s.isDirty)
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)

  // Load agent DSL into canvas store when data arrives
  useEffect(() => {
    if (!agent?.dsl || hasLoadedRef.current) return

    const dsl = agent.dsl as AgentDSL
    const rfNodes = dslNodesToReactFlow(dsl.nodes)
    const rfEdges = dslEdgesToReactFlow(dsl.edges)
    loadFromDSL(rfNodes, rfEdges)
    hasLoadedRef.current = true
  }, [agent, loadFromDSL])

  // Reset loaded flag when agent ID changes
  useEffect(() => {
    hasLoadedRef.current = false
  }, [id])

  /**
   * @description Saves the current canvas state to the server by converting
   * ReactFlow nodes/edges back to DSL format and calling the update mutation
   */
  const save = useCallback(async () => {
    // Read current store state directly to get latest values
    const currentNodes = useCanvasStore.getState().nodes
    const currentEdges = useCanvasStore.getState().edges

    const dslNodes = reactFlowNodesToDSL(currentNodes)
    const dslEdges = reactFlowEdgesToDSL(currentEdges)

    // Preserve existing DSL settings and variables, only update graph
    const currentDSL = (agent?.dsl ?? {}) as Partial<AgentDSL>
    const dsl: AgentDSL = {
      nodes: dslNodes,
      edges: dslEdges,
      variables: currentDSL.variables ?? {},
      settings: currentDSL.settings ?? {
        mode: 'agent',
        max_execution_time: 300,
        retry_on_failure: false,
      },
    }

    try {
      await updateAgent.mutateAsync({ id, data: { dsl } })
      markClean()
      toast.success('Agent saved')
    } catch {
      toast.error('Failed to save agent')
    }
  }, [id, agent, updateAgent, markClean])

  // Auto-save interval: saves every 30s if canvas has unsaved changes
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      // Check dirty state directly from store to avoid stale closure
      const currentDirty = useCanvasStore.getState().isDirty
      if (currentDirty) {
        save()
      }
    }, AUTO_SAVE_INTERVAL)

    // Cleanup interval on unmount
    return () => {
      if (autoSaveRef.current) {
        clearInterval(autoSaveRef.current)
      }
    }
  }, [save])

  return {
    /** @description The loaded agent entity */
    agent,
    /** @description Whether the initial agent load is in progress */
    isLoading,
    /** @description Error from the agent query, if any */
    error,
    /** @description Refetch the agent data from the server */
    refetch,
    /** @description Whether the update mutation is in flight */
    isSaving: updateAgent.isPending,
    /** @description Whether the canvas has unsaved changes */
    isDirty,
    /** @description Current ReactFlow nodes */
    nodes,
    /** @description Current ReactFlow edges */
    edges,
    /** @description Save canvas state to server */
    save,
  }
}
