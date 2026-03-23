/**
 * @fileoverview Unit tests for the useAgentCanvas hook.
 *
 * Tests DSL loading from API to canvas store, save function,
 * auto-save interval behavior, and dirty/saving state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useCanvasStore } from '@/features/agents/store/canvasStore'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMutateAsync = vi.fn()
const mockQueryData = {
  id: 'agent-1',
  name: 'Test Agent',
  dsl: {
    nodes: {
      'node-1': {
        id: 'node-1',
        type: 'generate',
        position: { x: 100, y: 200 },
        config: { model: 'gpt-4o' },
        label: 'Generate LLM',
      },
      'node-2': {
        id: 'node-2',
        type: 'answer',
        position: { x: 300, y: 200 },
        config: {},
        label: 'Answer',
      },
    },
    edges: [
      { source: 'node-1', target: 'node-2' },
    ],
    variables: {},
    settings: { mode: 'agent', max_execution_time: 300, retry_on_failure: false },
  },
}

const mockUseAgent = vi.fn()
const mockUseUpdateAgent = vi.fn()

vi.mock('@/features/agents/api/agentQueries', () => ({
  useAgent: (...args: any[]) => mockUseAgent(...args),
  useUpdateAgent: () => mockUseUpdateAgent(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { useAgentCanvas } from '@/features/agents/hooks/useAgentCanvas'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

describe('useAgentCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    resetStore()

    mockUseUpdateAgent.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns loading state while agent is loading', () => {
    mockUseAgent.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useAgentCanvas('agent-1'))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.agent).toBeUndefined()
  })

  it('returns error when query fails', () => {
    const err = new Error('Network error')
    mockUseAgent.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: err,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useAgentCanvas('agent-1'))

    expect(result.current.error).toBe(err)
  })

  it('loads DSL into canvas store when agent data arrives', async () => {
    mockUseAgent.mockReturnValue({
      data: mockQueryData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    renderHook(() => useAgentCanvas('agent-1'))

    // The store should be populated with nodes from the DSL
    await waitFor(() => {
      const { nodes, edges } = useCanvasStore.getState()
      expect(nodes).toHaveLength(2)
      expect(edges).toHaveLength(1)
    })
  })

  it('converts DSL nodes to ReactFlow format', async () => {
    mockUseAgent.mockReturnValue({
      data: mockQueryData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    renderHook(() => useAgentCanvas('agent-1'))

    await waitFor(() => {
      const { nodes } = useCanvasStore.getState()
      const node1 = nodes.find((n) => n.id === 'node-1')
      expect(node1).toBeDefined()
      expect(node1!.type).toBe('canvasNode')
      expect(node1!.position).toEqual({ x: 100, y: 200 })
      expect((node1!.data as any).type).toBe('generate')
      expect((node1!.data as any).label).toBe('Generate LLM')
    })
  })

  it('marks canvas as clean after loading', async () => {
    mockUseAgent.mockReturnValue({
      data: mockQueryData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    renderHook(() => useAgentCanvas('agent-1'))

    await waitFor(() => {
      expect(useCanvasStore.getState().isDirty).toBe(false)
    })
  })

  it('exposes save function that calls updateAgent', async () => {
    mockUseAgent.mockReturnValue({
      data: mockQueryData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    mockMutateAsync.mockResolvedValue({})

    const { result } = renderHook(() => useAgentCanvas('agent-1'))

    // Wait for DSL load
    await waitFor(() => {
      expect(useCanvasStore.getState().nodes).toHaveLength(2)
    })

    // Call save
    await act(async () => {
      await result.current.save()
    })

    expect(mockMutateAsync).toHaveBeenCalledWith({
      id: 'agent-1',
      data: expect.objectContaining({
        dsl: expect.objectContaining({
          nodes: expect.any(Object),
          edges: expect.any(Array),
          variables: expect.any(Object),
          settings: expect.any(Object),
        }),
      }),
    })
  })

  it('marks clean after successful save', async () => {
    mockUseAgent.mockReturnValue({
      data: mockQueryData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    mockMutateAsync.mockResolvedValue({})

    const { result } = renderHook(() => useAgentCanvas('agent-1'))

    await waitFor(() => {
      expect(useCanvasStore.getState().nodes).toHaveLength(2)
    })

    // Dirty the store
    useCanvasStore.getState().addNode({
      id: 'n-new',
      type: 'canvasNode',
      position: { x: 0, y: 0 },
      data: {},
    })
    expect(useCanvasStore.getState().isDirty).toBe(true)

    // Save
    await act(async () => {
      await result.current.save()
    })

    expect(useCanvasStore.getState().isDirty).toBe(false)
  })

  it('exposes isSaving from update mutation pending state', () => {
    mockUseUpdateAgent.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
    })
    mockUseAgent.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useAgentCanvas('agent-1'))

    expect(result.current.isSaving).toBe(true)
  })

  it('sets up auto-save interval that triggers when dirty', async () => {
    mockUseAgent.mockReturnValue({
      data: mockQueryData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    mockMutateAsync.mockResolvedValue({})

    renderHook(() => useAgentCanvas('agent-1'))

    // Wait for DSL load
    await waitFor(() => {
      expect(useCanvasStore.getState().nodes).toHaveLength(2)
    })

    // Dirty the store
    useCanvasStore.setState({ isDirty: true })

    // Advance timer past auto-save interval (30 seconds)
    act(() => {
      vi.advanceTimersByTime(31_000)
    })

    // Auto-save should have called mutateAsync
    expect(mockMutateAsync).toHaveBeenCalled()
  })

  it('auto-save does not fire when canvas is clean', async () => {
    mockUseAgent.mockReturnValue({
      data: mockQueryData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    mockMutateAsync.mockResolvedValue({})

    renderHook(() => useAgentCanvas('agent-1'))

    await waitFor(() => {
      expect(useCanvasStore.getState().nodes).toHaveLength(2)
    })

    // Canvas is clean after load
    expect(useCanvasStore.getState().isDirty).toBe(false)

    // Advance timer
    act(() => {
      vi.advanceTimersByTime(31_000)
    })

    // Should NOT have called save
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('cleans up auto-save interval on unmount', async () => {
    mockUseAgent.mockReturnValue({
      data: mockQueryData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    const { unmount } = renderHook(() => useAgentCanvas('agent-1'))

    await waitFor(() => {
      expect(useCanvasStore.getState().nodes).toHaveLength(2)
    })

    unmount()

    // Dirty after unmount
    useCanvasStore.setState({ isDirty: true })

    // Advance timer — should not save since interval was cleared
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(mockMutateAsync).not.toHaveBeenCalled()
  })
})
