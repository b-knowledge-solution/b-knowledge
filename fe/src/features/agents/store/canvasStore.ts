/**
 * @fileoverview Zustand store for the agent canvas, managing ReactFlow nodes, edges,
 * selection state, dirty tracking, and undo/redo history.
 *
 * IMPORTANT: Always use selectors when consuming this store to avoid unnecessary re-renders.
 * Example: `useCanvasStore((s) => s.selectedNodeId)` — never destructure the full store.
 *
 * @module features/agents/store/canvasStore
 */

import { create } from 'zustand'
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react'

/**
 * @description Snapshot of canvas state for undo/redo history
 */
interface CanvasHistoryEntry {
  nodes: Node[]
  edges: Edge[]
}

/**
 * @description Complete canvas state shape including data, history, and mutation methods
 */
interface CanvasState {
  // Canvas data
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null
  isDirty: boolean

  // Undo/redo history
  history: CanvasHistoryEntry[]
  historyIndex: number
  maxHistory: number

  // ReactFlow event handlers (wired directly to ReactFlow component props)
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect

  // Canvas mutations
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  selectNode: (id: string | null) => void
  addNode: (node: Node) => void
  removeNode: (id: string) => void
  updateNodeData: (id: string, data: Record<string, unknown>) => void
  updateNodePosition: (id: string, position: { x: number; y: number }) => void

  // Persistence helpers
  markClean: () => void
  loadFromDSL: (nodes: Node[], edges: Edge[]) => void

  // Undo/redo
  pushHistory: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

/**
 * @description Zustand store for agent canvas state with ReactFlow integration, undo/redo,
 * and dirty tracking. Consumers MUST use selectors to avoid full-store re-renders.
 *
 * @example
 * // Correct usage with selector
 * const nodes = useCanvasStore((s) => s.nodes)
 * const selectNode = useCanvasStore((s) => s.selectNode)
 *
 * // WRONG — causes re-render on every state change
 * // const { nodes, selectNode } = useCanvasStore()
 */
export const useCanvasStore = create<CanvasState>((set, get) => ({
  // Initial canvas state
  nodes: [],
  edges: [],
  selectedNodeId: null,
  isDirty: false,

  // History defaults
  history: [],
  historyIndex: -1,
  maxHistory: 50,

  // ---------------------------------------------------------------------------
  // ReactFlow event handlers
  // ---------------------------------------------------------------------------

  /**
   * @description Handles ReactFlow node change events (drag, select, remove)
   * @param {Parameters<OnNodesChange>[0]} changes - Node change events from ReactFlow
   */
  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
      isDirty: true,
    }))
  },

  /**
   * @description Handles ReactFlow edge change events (select, remove)
   * @param {Parameters<OnEdgesChange>[0]} changes - Edge change events from ReactFlow
   */
  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
      isDirty: true,
    }))
  },

  /**
   * @description Handles new edge connection between nodes
   * @param {Parameters<OnConnect>[0]} connection - Connection event from ReactFlow
   */
  onConnect: (connection) => {
    set((state) => ({
      edges: addEdge(connection, state.edges),
      isDirty: true,
    }))
  },

  // ---------------------------------------------------------------------------
  // Canvas mutations
  // ---------------------------------------------------------------------------

  /**
   * @description Replaces all canvas nodes
   * @param {Node[]} nodes - New node array
   */
  setNodes: (nodes) => {
    set({ nodes, isDirty: true })
  },

  /**
   * @description Replaces all canvas edges
   * @param {Edge[]} edges - New edge array
   */
  setEdges: (edges) => {
    set({ edges, isDirty: true })
  },

  /**
   * @description Sets the currently selected node for the property panel
   * @param {string | null} id - Node ID to select, or null to deselect
   */
  selectNode: (id) => {
    set({ selectedNodeId: id })
  },

  /**
   * @description Adds a new node to the canvas
   * @param {Node} node - ReactFlow node to add
   */
  addNode: (node) => {
    set((state) => ({
      nodes: [...state.nodes, node],
      isDirty: true,
    }))
  },

  /**
   * @description Removes a node and its connected edges from the canvas
   * @param {string} id - ID of the node to remove
   */
  removeNode: (id) => {
    set((state) => ({
      // Filter out the node
      nodes: state.nodes.filter((n) => n.id !== id),
      // Remove edges connected to the removed node
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      // Deselect if the removed node was selected
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      isDirty: true,
    }))
  },

  /**
   * @description Updates the data payload of a specific node
   * @param {string} id - Target node ID
   * @param {Record<string, unknown>} data - Partial data to merge into the node
   */
  updateNodeData: (id, data) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n
      ),
      isDirty: true,
    }))
  },

  /**
   * @description Updates the position of a specific node on the canvas
   * @param {string} id - Target node ID
   * @param {{ x: number; y: number }} position - New x/y coordinates
   */
  updateNodePosition: (id, position) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, position } : n
      ),
      isDirty: true,
    }))
  },

  // ---------------------------------------------------------------------------
  // Persistence helpers
  // ---------------------------------------------------------------------------

  /**
   * @description Marks the canvas as clean (no unsaved changes), typically after save
   */
  markClean: () => {
    set({ isDirty: false })
  },

  /**
   * @description Loads nodes and edges from a saved DSL, resetting history and dirty state
   * @param {Node[]} nodes - Nodes parsed from the agent DSL
   * @param {Edge[]} edges - Edges parsed from the agent DSL
   */
  loadFromDSL: (nodes, edges) => {
    set({
      nodes,
      edges,
      selectedNodeId: null,
      isDirty: false,
      // Reset history when loading fresh data
      history: [{ nodes, edges }],
      historyIndex: 0,
    })
  },

  // ---------------------------------------------------------------------------
  // Undo/redo
  // ---------------------------------------------------------------------------

  /**
   * @description Snapshots current canvas state onto the history stack.
   * Call before any mutation that should be undoable. Truncates any redo entries.
   */
  pushHistory: () => {
    const { nodes, edges, history, historyIndex, maxHistory } = get()
    // Truncate any redo entries beyond current index
    const trimmed = history.slice(0, historyIndex + 1)
    const updated = [...trimmed, { nodes: [...nodes], edges: [...edges] }]

    // Cap history length at maxHistory to prevent unbounded memory growth
    const capped = updated.length > maxHistory
      ? updated.slice(updated.length - maxHistory)
      : updated

    set({
      history: capped,
      historyIndex: capped.length - 1,
    })
  },

  /**
   * @description Restores the previous canvas state from history
   */
  undo: () => {
    const { history, historyIndex } = get()
    // Guard: nothing to undo
    if (historyIndex <= 0) return

    const prev = history[historyIndex - 1]
    if (!prev) return

    set({
      nodes: prev.nodes,
      edges: prev.edges,
      historyIndex: historyIndex - 1,
      isDirty: true,
    })
  },

  /**
   * @description Restores the next canvas state from history (after undo)
   */
  redo: () => {
    const { history, historyIndex } = get()
    // Guard: nothing to redo
    if (historyIndex >= history.length - 1) return

    const next = history[historyIndex + 1]
    if (!next) return

    set({
      nodes: next.nodes,
      edges: next.edges,
      historyIndex: historyIndex + 1,
      isDirty: true,
    })
  },

  /**
   * @description Returns whether undo is available
   * @returns {boolean} True if there is history to undo
   */
  canUndo: () => {
    return get().historyIndex > 0
  },

  /**
   * @description Returns whether redo is available
   * @returns {boolean} True if there are redo entries after current position
   */
  canRedo: () => {
    const { history, historyIndex } = get()
    return historyIndex < history.length - 1
  },
}))
