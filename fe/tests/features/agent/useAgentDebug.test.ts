/**
 * @fileoverview Unit tests for the useAgentDebug hook.
 *
 * Tests Socket.IO event subscription, debug start/stop, step/continue
 * commands, breakpoint toggling, and state management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let socketCallback: ((event: any) => void) | null = null

vi.mock('@/hooks/useSocket', () => ({
  useSocketEvent: (_eventName: string, callback: (event: any) => void) => {
    // Capture the callback so tests can simulate socket events
    socketCallback = callback
  },
}))

const mockApiPost = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    post: (...args: any[]) => mockApiPost(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
}))

import { useAgentDebug } from '@/features/agents/hooks/useAgentDebug'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAgentDebug', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    socketCallback = null
  })

  it('returns initial inactive state', () => {
    const { result } = renderHook(() => useAgentDebug())

    expect(result.current.isDebugActive).toBe(false)
    expect(result.current.currentRunId).toBeNull()
    expect(result.current.steps.size).toBe(0)
    expect(result.current.breakpoints.size).toBe(0)
  })

  // ========================================================================
  // startDebug
  // ========================================================================

  describe('startDebug', () => {
    it('posts to debug endpoint and activates debug mode', async () => {
      mockApiPost.mockResolvedValue({ run_id: 'run-1' })

      const { result } = renderHook(() => useAgentDebug())

      await act(async () => {
        await result.current.startDebug('agent-1', 'Hello')
      })

      expect(mockApiPost).toHaveBeenCalledWith('/api/agents/agent-1/debug', { input: 'Hello' })
      expect(result.current.isDebugActive).toBe(true)
      expect(result.current.currentRunId).toBe('run-1')
    })

    it('resets steps and breakpoints on start', async () => {
      mockApiPost.mockResolvedValue({ run_id: 'run-1' })

      const { result } = renderHook(() => useAgentDebug())

      // Start and then start again
      await act(async () => {
        await result.current.startDebug('agent-1', 'Hello')
      })

      await act(async () => {
        await result.current.startDebug('agent-1', 'Hello again')
      })

      expect(result.current.steps.size).toBe(0)
      expect(result.current.breakpoints.size).toBe(0)
    })
  })

  // ========================================================================
  // Socket.IO events
  // ========================================================================

  describe('socket events', () => {
    it('updates step state from agent:debug:step events', async () => {
      mockApiPost.mockResolvedValue({ run_id: 'run-1' })

      const { result } = renderHook(() => useAgentDebug())

      await act(async () => {
        await result.current.startDebug('agent-1', 'test')
      })

      // Simulate socket event
      act(() => {
        socketCallback?.({
          run_id: 'run-1',
          node_id: 'node-1',
          status: 'running',
          input: { query: 'test' },
        })
      })

      const step = result.current.steps.get('node-1')
      expect(step).toBeDefined()
      expect(step!.status).toBe('running')
      expect(step!.input).toEqual({ query: 'test' })
    })

    it('ignores events from different run IDs', async () => {
      mockApiPost.mockResolvedValue({ run_id: 'run-1' })

      const { result } = renderHook(() => useAgentDebug())

      await act(async () => {
        await result.current.startDebug('agent-1', 'test')
      })

      // Event from a different run
      act(() => {
        socketCallback?.({
          run_id: 'run-other',
          node_id: 'node-1',
          status: 'completed',
        })
      })

      expect(result.current.steps.size).toBe(0)
    })

    it('updates step with completed status and output', async () => {
      mockApiPost.mockResolvedValue({ run_id: 'run-1' })

      const { result } = renderHook(() => useAgentDebug())

      await act(async () => {
        await result.current.startDebug('agent-1', 'test')
      })

      act(() => {
        socketCallback?.({
          run_id: 'run-1',
          node_id: 'node-1',
          status: 'completed',
          output: { result: 'done' },
          duration_ms: 150,
        })
      })

      const step = result.current.steps.get('node-1')
      expect(step!.status).toBe('completed')
      expect(step!.output).toEqual({ result: 'done' })
      expect(step!.duration_ms).toBe(150)
    })

    it('updates step with failed status and error', async () => {
      mockApiPost.mockResolvedValue({ run_id: 'run-1' })

      const { result } = renderHook(() => useAgentDebug())

      await act(async () => {
        await result.current.startDebug('agent-1', 'test')
      })

      act(() => {
        socketCallback?.({
          run_id: 'run-1',
          node_id: 'node-1',
          status: 'failed',
          error: 'Timeout exceeded',
        })
      })

      const step = result.current.steps.get('node-1')
      expect(step!.status).toBe('failed')
      expect(step!.error).toBe('Timeout exceeded')
    })
  })

  // ========================================================================
  // stepNext
  // ========================================================================

  describe('stepNext', () => {
    it('posts to step endpoint', async () => {
      mockApiPost.mockResolvedValue({ run_id: 'run-1' })

      const { result } = renderHook(() => useAgentDebug())

      await act(async () => {
        await result.current.startDebug('agent-1', 'test')
      })

      mockApiPost.mockResolvedValue(undefined)

      await act(async () => {
        await result.current.stepNext()
      })

      expect(mockApiPost).toHaveBeenCalledWith('/api/agents/agent-1/debug/run-1/step')
    })

    it('does nothing when not in debug mode', async () => {
      const { result } = renderHook(() => useAgentDebug())

      await act(async () => {
        await result.current.stepNext()
      })

      // Only the step call would matter; since no agentId/runId, no POST
      expect(mockApiPost).not.toHaveBeenCalled()
    })
  })

  // ========================================================================
  // continueRun
  // ========================================================================

  describe('continueRun', () => {
    it('posts to continue endpoint', async () => {
      mockApiPost.mockResolvedValue({ run_id: 'run-1' })

      const { result } = renderHook(() => useAgentDebug())

      await act(async () => {
        await result.current.startDebug('agent-1', 'test')
      })

      mockApiPost.mockResolvedValue(undefined)

      await act(async () => {
        await result.current.continueRun()
      })

      expect(mockApiPost).toHaveBeenCalledWith('/api/agents/agent-1/debug/run-1/continue')
    })
  })

  // ========================================================================
  // toggleBreakpoint
  // ========================================================================

  describe('toggleBreakpoint', () => {
    it('adds a breakpoint via POST', async () => {
      mockApiPost.mockResolvedValue({ run_id: 'run-1' })

      const { result } = renderHook(() => useAgentDebug())

      await act(async () => {
        await result.current.startDebug('agent-1', 'test')
      })

      mockApiPost.mockResolvedValue(undefined)

      await act(async () => {
        await result.current.toggleBreakpoint('node-1')
      })

      expect(mockApiPost).toHaveBeenCalledWith(
        '/api/agents/agent-1/debug/run-1/breakpoint',
        { node_id: 'node-1' }
      )
      expect(result.current.breakpoints.has('node-1')).toBe(true)
    })

    it('removes an existing breakpoint via DELETE', async () => {
      mockApiPost.mockResolvedValue({ run_id: 'run-1' })

      const { result } = renderHook(() => useAgentDebug())

      await act(async () => {
        await result.current.startDebug('agent-1', 'test')
      })

      // Add breakpoint first
      mockApiPost.mockResolvedValue(undefined)
      await act(async () => {
        await result.current.toggleBreakpoint('node-1')
      })

      expect(result.current.breakpoints.has('node-1')).toBe(true)

      // Remove breakpoint
      mockApiDelete.mockResolvedValue(undefined)
      await act(async () => {
        await result.current.toggleBreakpoint('node-1')
      })

      expect(mockApiDelete).toHaveBeenCalledWith(
        '/api/agents/agent-1/debug/run-1/breakpoint/node-1'
      )
      expect(result.current.breakpoints.has('node-1')).toBe(false)
    })
  })

  // ========================================================================
  // stopDebug
  // ========================================================================

  describe('stopDebug', () => {
    it('resets all debug state', async () => {
      mockApiPost.mockResolvedValue({ run_id: 'run-1' })

      const { result } = renderHook(() => useAgentDebug())

      await act(async () => {
        await result.current.startDebug('agent-1', 'test')
      })

      // Simulate a step event
      act(() => {
        socketCallback?.({
          run_id: 'run-1',
          node_id: 'node-1',
          status: 'running',
        })
      })

      expect(result.current.isDebugActive).toBe(true)
      expect(result.current.steps.size).toBe(1)

      // Stop debug
      act(() => {
        result.current.stopDebug()
      })

      expect(result.current.isDebugActive).toBe(false)
      expect(result.current.currentRunId).toBeNull()
      expect(result.current.steps.size).toBe(0)
      expect(result.current.breakpoints.size).toBe(0)
    })
  })
})
