/**
 * @fileoverview Unit tests for the agent canvas Zustand store.
 *
 * Tests node/edge CRUD, selection, dirty tracking, bulk operations,
 * undo/redo history stack, and DSL load/clean helpers.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasStore } from '@/features/agents/store/canvasStore'
import type { Node, Edge } from '@xyflow/react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Creates a minimal ReactFlow node for testing
 */
function buildNode(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    type: 'canvasNode',
    position: { x: 0, y: 0 },
    data: { type: 'generate', label: `Node ${id}`, config: {} },
    ...overrides,
  }
}

/**
 * @description Creates a minimal ReactFlow edge for testing
 */
function buildEdge(source: string, target: string): Edge {
  return { id: `e-${source}-${target}`, source, target }
}

/**
 * @description Resets the canvas store to its initial state before each test
 */
function resetStore() {
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    isDirty: false,
    history: [],
    historyIndex: -1,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('canvasStore', () => {
  beforeEach(() => {
    resetStore()
  })

  // ========================================================================
  // Initial state
  // ========================================================================

  describe('initial state', () => {
    it('starts with empty nodes and edges', () => {
      const { nodes, edges } = useCanvasStore.getState()
      expect(nodes).toEqual([])
      expect(edges).toEqual([])
    })

    it('starts with no selection and clean state', () => {
      const { selectedNodeId, isDirty } = useCanvasStore.getState()
      expect(selectedNodeId).toBeNull()
      expect(isDirty).toBe(false)
    })
  })

  // ========================================================================
  // addNode
  // ========================================================================

  describe('addNode', () => {
    it('adds a node to state', () => {
      const node = buildNode('n-1')
      useCanvasStore.getState().addNode(node)

      const { nodes } = useCanvasStore.getState()
      expect(nodes).toHaveLength(1)
      expect(nodes[0]!.id).toBe('n-1')
    })

    it('marks canvas as dirty', () => {
      useCanvasStore.getState().addNode(buildNode('n-1'))
      expect(useCanvasStore.getState().isDirty).toBe(true)
    })

    it('appends to existing nodes', () => {
      useCanvasStore.getState().addNode(buildNode('n-1'))
      useCanvasStore.getState().addNode(buildNode('n-2'))

      expect(useCanvasStore.getState().nodes).toHaveLength(2)
    })
  })

  // ========================================================================
  // removeNode
  // ========================================================================

  describe('removeNode', () => {
    it('removes a node by ID', () => {
      useCanvasStore.getState().addNode(buildNode('n-1'))
      useCanvasStore.getState().addNode(buildNode('n-2'))

      useCanvasStore.getState().removeNode('n-1')

      const { nodes } = useCanvasStore.getState()
      expect(nodes).toHaveLength(1)
      expect(nodes[0]!.id).toBe('n-2')
    })

    it('removes edges connected to the removed node', () => {
      useCanvasStore.setState({
        nodes: [buildNode('n-1'), buildNode('n-2'), buildNode('n-3')],
        edges: [buildEdge('n-1', 'n-2'), buildEdge('n-2', 'n-3'), buildEdge('n-1', 'n-3')],
      })

      useCanvasStore.getState().removeNode('n-1')

      const { edges } = useCanvasStore.getState()
      // Only n-2 -> n-3 should remain
      expect(edges).toHaveLength(1)
      expect(edges[0]!.source).toBe('n-2')
    })

    it('deselects the removed node if it was selected', () => {
      useCanvasStore.setState({
        nodes: [buildNode('n-1')],
        selectedNodeId: 'n-1',
      })

      useCanvasStore.getState().removeNode('n-1')

      expect(useCanvasStore.getState().selectedNodeId).toBeNull()
    })

    it('preserves selection if a different node is removed', () => {
      useCanvasStore.setState({
        nodes: [buildNode('n-1'), buildNode('n-2')],
        selectedNodeId: 'n-2',
      })

      useCanvasStore.getState().removeNode('n-1')

      expect(useCanvasStore.getState().selectedNodeId).toBe('n-2')
    })
  })

  // ========================================================================
  // updateNodeData
  // ========================================================================

  describe('updateNodeData', () => {
    it('merges data into the target node', () => {
      const node = buildNode('n-1', { data: { type: 'generate', label: 'Gen', config: { model: 'gpt-4o' } } })
      useCanvasStore.setState({ nodes: [node] })

      useCanvasStore.getState().updateNodeData('n-1', { config: { model: 'claude-3-opus' } })

      const updated = useCanvasStore.getState().nodes[0]!
      expect((updated.data as any).config.model).toBe('claude-3-opus')
    })

    it('does not affect other nodes', () => {
      useCanvasStore.setState({
        nodes: [buildNode('n-1'), buildNode('n-2')],
      })

      useCanvasStore.getState().updateNodeData('n-1', { config: { foo: 'bar' } })

      const n2 = useCanvasStore.getState().nodes[1]!
      expect((n2.data as any).config).toEqual({})
    })

    it('marks canvas as dirty', () => {
      useCanvasStore.setState({ nodes: [buildNode('n-1')], isDirty: false })

      useCanvasStore.getState().updateNodeData('n-1', { label: 'Updated' })

      expect(useCanvasStore.getState().isDirty).toBe(true)
    })
  })

  // ========================================================================
  // updateNodePosition
  // ========================================================================

  describe('updateNodePosition', () => {
    it('updates the position of a specific node', () => {
      useCanvasStore.setState({ nodes: [buildNode('n-1')] })

      useCanvasStore.getState().updateNodePosition('n-1', { x: 100, y: 200 })

      expect(useCanvasStore.getState().nodes[0]!.position).toEqual({ x: 100, y: 200 })
    })
  })

  // ========================================================================
  // selectNode
  // ========================================================================

  describe('selectNode', () => {
    it('sets the selected node ID', () => {
      useCanvasStore.getState().selectNode('n-1')
      expect(useCanvasStore.getState().selectedNodeId).toBe('n-1')
    })

    it('clears selection when null', () => {
      useCanvasStore.getState().selectNode('n-1')
      useCanvasStore.getState().selectNode(null)
      expect(useCanvasStore.getState().selectedNodeId).toBeNull()
    })
  })

  // ========================================================================
  // setNodes / setEdges (bulk operations)
  // ========================================================================

  describe('bulk operations', () => {
    it('setNodes replaces all nodes', () => {
      useCanvasStore.getState().addNode(buildNode('old'))

      useCanvasStore.getState().setNodes([buildNode('new-1'), buildNode('new-2')])

      const { nodes } = useCanvasStore.getState()
      expect(nodes).toHaveLength(2)
      expect(nodes[0]!.id).toBe('new-1')
    })

    it('setEdges replaces all edges', () => {
      useCanvasStore.setState({ edges: [buildEdge('a', 'b')] })

      useCanvasStore.getState().setEdges([buildEdge('x', 'y')])

      const { edges } = useCanvasStore.getState()
      expect(edges).toHaveLength(1)
      expect(edges[0]!.source).toBe('x')
    })

    it('setNodes marks dirty', () => {
      useCanvasStore.setState({ isDirty: false })
      useCanvasStore.getState().setNodes([buildNode('n-1')])
      expect(useCanvasStore.getState().isDirty).toBe(true)
    })

    it('setEdges marks dirty', () => {
      useCanvasStore.setState({ isDirty: false })
      useCanvasStore.getState().setEdges([buildEdge('a', 'b')])
      expect(useCanvasStore.getState().isDirty).toBe(true)
    })
  })

  // ========================================================================
  // markClean / isDirty tracking
  // ========================================================================

  describe('dirty tracking', () => {
    it('markClean resets isDirty to false', () => {
      useCanvasStore.getState().addNode(buildNode('n-1'))
      expect(useCanvasStore.getState().isDirty).toBe(true)

      useCanvasStore.getState().markClean()
      expect(useCanvasStore.getState().isDirty).toBe(false)
    })
  })

  // ========================================================================
  // loadFromDSL
  // ========================================================================

  describe('loadFromDSL', () => {
    it('sets nodes, edges and resets dirty state', () => {
      // Pre-dirty the store
      useCanvasStore.getState().addNode(buildNode('old'))

      const nodes = [buildNode('a'), buildNode('b')]
      const edges = [buildEdge('a', 'b')]
      useCanvasStore.getState().loadFromDSL(nodes, edges)

      const state = useCanvasStore.getState()
      expect(state.nodes).toHaveLength(2)
      expect(state.edges).toHaveLength(1)
      expect(state.isDirty).toBe(false)
      expect(state.selectedNodeId).toBeNull()
    })

    it('initializes history with the loaded state', () => {
      const nodes = [buildNode('a')]
      const edges: Edge[] = []
      useCanvasStore.getState().loadFromDSL(nodes, edges)

      const { history, historyIndex } = useCanvasStore.getState()
      expect(history).toHaveLength(1)
      expect(historyIndex).toBe(0)
    })
  })

  // ========================================================================
  // Undo / redo
  // ========================================================================

  describe('undo/redo', () => {
    it('canUndo returns false when no history', () => {
      expect(useCanvasStore.getState().canUndo()).toBe(false)
    })

    it('canRedo returns false when no history', () => {
      expect(useCanvasStore.getState().canRedo()).toBe(false)
    })

    it('undo restores previous state', () => {
      // Load initial state (sets history[0])
      useCanvasStore.getState().loadFromDSL([buildNode('a')], [])

      // Push history before mutation
      useCanvasStore.getState().pushHistory()

      // Mutate: add a node
      useCanvasStore.getState().addNode(buildNode('b'))
      useCanvasStore.getState().pushHistory()

      // Now we have 3 history entries: [initial], [after push before add], [after add]
      expect(useCanvasStore.getState().nodes).toHaveLength(2)

      // Undo to state before adding 'b'
      useCanvasStore.getState().undo()
      expect(useCanvasStore.getState().nodes).toHaveLength(1)
      expect(useCanvasStore.getState().nodes[0]!.id).toBe('a')
    })

    it('redo restores undone state', () => {
      useCanvasStore.getState().loadFromDSL([buildNode('a')], [])
      useCanvasStore.getState().pushHistory()
      useCanvasStore.getState().addNode(buildNode('b'))
      useCanvasStore.getState().pushHistory()

      // Undo then redo
      useCanvasStore.getState().undo()
      expect(useCanvasStore.getState().nodes).toHaveLength(1)

      useCanvasStore.getState().redo()
      expect(useCanvasStore.getState().nodes).toHaveLength(2)
    })

    it('canUndo/canRedo reflect history position', () => {
      useCanvasStore.getState().loadFromDSL([buildNode('a')], [])
      useCanvasStore.getState().pushHistory()
      useCanvasStore.getState().addNode(buildNode('b'))
      useCanvasStore.getState().pushHistory()

      // At the end of history: canUndo=true, canRedo=false
      expect(useCanvasStore.getState().canUndo()).toBe(true)
      expect(useCanvasStore.getState().canRedo()).toBe(false)

      // After undo: canRedo=true
      useCanvasStore.getState().undo()
      expect(useCanvasStore.getState().canRedo()).toBe(true)
    })

    it('undo at the beginning is a no-op', () => {
      useCanvasStore.getState().loadFromDSL([buildNode('a')], [])

      // historyIndex is 0, undo should do nothing
      useCanvasStore.getState().undo()
      expect(useCanvasStore.getState().nodes).toHaveLength(1)
    })

    it('redo at the end is a no-op', () => {
      useCanvasStore.getState().loadFromDSL([buildNode('a')], [])

      useCanvasStore.getState().redo()
      expect(useCanvasStore.getState().nodes).toHaveLength(1)
    })

    it('pushHistory truncates redo entries', () => {
      useCanvasStore.getState().loadFromDSL([buildNode('a')], [])
      useCanvasStore.getState().pushHistory()
      useCanvasStore.getState().addNode(buildNode('b'))
      useCanvasStore.getState().pushHistory()

      // Undo, then push new history (should discard redo)
      useCanvasStore.getState().undo()
      useCanvasStore.getState().addNode(buildNode('c'))
      useCanvasStore.getState().pushHistory()

      // Cannot redo after new push
      expect(useCanvasStore.getState().canRedo()).toBe(false)
    })

    it('caps history at maxHistory', () => {
      useCanvasStore.getState().loadFromDSL([], [])

      // Push more entries than maxHistory (50)
      for (let i = 0; i < 60; i++) {
        useCanvasStore.getState().pushHistory()
      }

      const { history, maxHistory } = useCanvasStore.getState()
      expect(history.length).toBeLessThanOrEqual(maxHistory)
    })

    it('undo marks dirty', () => {
      useCanvasStore.getState().loadFromDSL([buildNode('a')], [])
      useCanvasStore.getState().pushHistory()
      useCanvasStore.getState().addNode(buildNode('b'))
      useCanvasStore.getState().pushHistory()
      useCanvasStore.getState().markClean()

      useCanvasStore.getState().undo()
      expect(useCanvasStore.getState().isDirty).toBe(true)
    })
  })
})
