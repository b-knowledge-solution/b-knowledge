/**
 * @fileoverview Tests for Socket.IO hooks.
 *
 * Tests:
 * - useSocketStatus: tracks connection lifecycle (connect, disconnect, error, reconnect)
 * - useSocketEvent: subscribes to events and cleans up on unmount
 * - useSocketQueryInvalidation: maps socket events to TanStack Query invalidations
 *
 * Mocks `@/lib/socket` and `@tanstack/react-query` to avoid real socket/query connections.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ============================================================================
// Mocks
// ============================================================================

// Map of event name to registered handler(s) for simulating socket events
type Handler = (...args: unknown[]) => void
let socketHandlers: Record<string, Handler[]> = {}

const mockSocket = {
  connected: false,
  on: vi.fn((event: string, handler: Handler) => {
    if (!socketHandlers[event]) socketHandlers[event] = []
    socketHandlers[event]!.push(handler)
  }),
  off: vi.fn((event: string, handler: Handler) => {
    if (socketHandlers[event]) {
      socketHandlers[event] = socketHandlers[event]!.filter((h) => h !== handler)
    }
  }),
}

vi.mock('@/lib/socket', () => ({
  getSocket: () => mockSocket,
  getSocketStatus: () => (mockSocket.connected ? 'connected' : 'disconnected'),
}))

// Mock query keys to provide known values for invalidation tests
vi.mock('@/lib/queryKeys', () => ({
  queryKeys: {
    datasets: { all: ['datasets'] },
    converter: { all: ['converter'] },
    broadcast: { all: ['broadcast'] },
    chat: { all: ['chat'] },
    users: { all: ['users'] },
    teams: { all: ['teams'] },
    glossary: { all: ['glossary'] },
    search: { all: ['search'] },
    llmProvider: { all: ['llm-provider'] },
    systemTools: { all: ['system-tools'] },
    dashboard: { all: ['dashboard'] },
    histories: { all: ['histories'] },
  },
}))

// Mock useQueryClient to capture invalidation calls
const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}))

// ============================================================================
// Tests
// ============================================================================

describe('useSocket hooks', () => {
  beforeEach(() => {
    // Reset handler map and mock state before each test
    socketHandlers = {}
    mockSocket.connected = false
    vi.clearAllMocks()
  })

  // --------------------------------------------------------------------------
  // useSocketStatus
  // --------------------------------------------------------------------------

  describe('useSocketStatus', () => {
    /** @description Dynamically import to pick up mocks */
    async function importHook() {
      const mod = await import('@/hooks/useSocket')
      return mod.useSocketStatus
    }

    /** @description Should return initial disconnected status */
    it('returns disconnected when socket is not connected', async () => {
      const useSocketStatus = await importHook()
      const { result } = renderHook(() => useSocketStatus())

      expect(result.current).toBe('disconnected')
    })

    /** @description Should update to connected when the connect event fires */
    it('transitions to connected on connect event', async () => {
      const useSocketStatus = await importHook()
      const { result } = renderHook(() => useSocketStatus())

      // Simulate the socket emitting a connect event
      act(() => {
        socketHandlers['connect']?.forEach((h) => h())
      })

      expect(result.current).toBe('connected')
    })

    /** @description Should update to disconnected when the disconnect event fires */
    it('transitions to disconnected on disconnect event', async () => {
      // Start connected
      mockSocket.connected = true
      const useSocketStatus = await importHook()
      const { result } = renderHook(() => useSocketStatus())

      // Simulate disconnect
      act(() => {
        socketHandlers['disconnect']?.forEach((h) => h())
      })

      expect(result.current).toBe('disconnected')
    })

    /** @description Should update to error on connect_error event */
    it('transitions to error on connect_error event', async () => {
      const useSocketStatus = await importHook()
      const { result } = renderHook(() => useSocketStatus())

      act(() => {
        socketHandlers['connect_error']?.forEach((h) => h())
      })

      expect(result.current).toBe('error')
    })

    /** @description Should update to connecting on reconnect_attempt event */
    it('transitions to connecting on reconnect_attempt event', async () => {
      const useSocketStatus = await importHook()
      const { result } = renderHook(() => useSocketStatus())

      act(() => {
        socketHandlers['reconnect_attempt']?.forEach((h) => h())
      })

      expect(result.current).toBe('connecting')
    })

    /** @description Should clean up event listeners on unmount */
    it('unsubscribes from socket events on unmount', async () => {
      const useSocketStatus = await importHook()
      const { unmount } = renderHook(() => useSocketStatus())

      unmount()

      // Verify off was called for all four events
      expect(mockSocket.off).toHaveBeenCalledWith('connect', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('disconnect', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('connect_error', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('reconnect_attempt', expect.any(Function))
    })
  })

  // --------------------------------------------------------------------------
  // useSocketEvent
  // --------------------------------------------------------------------------

  describe('useSocketEvent', () => {
    /** @description Dynamically import to pick up mocks */
    async function importHook() {
      const mod = await import('@/hooks/useSocket')
      return mod.useSocketEvent
    }

    /** @description Should subscribe to the given event name */
    it('registers a handler for the specified event', async () => {
      const useSocketEvent = await importHook()
      const callback = vi.fn()

      renderHook(() => useSocketEvent('test-event', callback))

      expect(mockSocket.on).toHaveBeenCalledWith('test-event', expect.any(Function))
    })

    /** @description Should invoke the callback when the event fires */
    it('calls callback when the event is emitted', async () => {
      const useSocketEvent = await importHook()
      const callback = vi.fn()

      renderHook(() => useSocketEvent('test-event', callback))

      // Simulate the event firing
      act(() => {
        socketHandlers['test-event']?.forEach((h) => h({ data: 'hello' }))
      })

      expect(callback).toHaveBeenCalledWith({ data: 'hello' })
    })

    /** @description Should unsubscribe when the component unmounts */
    it('removes the handler on unmount', async () => {
      const useSocketEvent = await importHook()
      const callback = vi.fn()

      const { unmount } = renderHook(() => useSocketEvent('test-event', callback))

      unmount()

      expect(mockSocket.off).toHaveBeenCalledWith('test-event', expect.any(Function))
    })

    /** @description Should always use the latest callback via ref pattern */
    it('uses the latest callback without re-subscribing', async () => {
      const useSocketEvent = await importHook()
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      const { rerender } = renderHook(
        ({ cb }) => useSocketEvent('test-event', cb),
        { initialProps: { cb: callback1 } },
      )

      // Rerender with a new callback — should NOT cause re-subscribe
      rerender({ cb: callback2 })

      // Fire event — should call the latest callback (callback2)
      act(() => {
        socketHandlers['test-event']?.forEach((h) => h('payload'))
      })

      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).toHaveBeenCalledWith('payload')
    })
  })

  // --------------------------------------------------------------------------
  // useSocketQueryInvalidation
  // --------------------------------------------------------------------------

  describe('useSocketQueryInvalidation', () => {
    /** @description Dynamically import to pick up mocks */
    async function importHook() {
      const mod = await import('@/hooks/useSocket')
      return mod.useSocketQueryInvalidation
    }

    /** @description Should register handlers for all default event-key mappings */
    it('subscribes to all default socket events', async () => {
      const useSocketQueryInvalidation = await importHook()

      renderHook(() => useSocketQueryInvalidation())

      // Verify subscription to known events from the default map
      const subscribedEvents = mockSocket.on.mock.calls.map((c) => c[0])
      expect(subscribedEvents).toContain('dataset:updated')
      expect(subscribedEvents).toContain('chat:updated')
      expect(subscribedEvents).toContain('llm-provider:updated')
      expect(subscribedEvents).toContain('dashboard:updated')
    })

    /** @description Should invalidate the correct query keys when a socket event fires */
    it('invalidates query keys when a mapped event fires', async () => {
      const useSocketQueryInvalidation = await importHook()

      renderHook(() => useSocketQueryInvalidation())

      // Simulate the dataset:updated event
      act(() => {
        socketHandlers['dataset:updated']?.forEach((h) => h())
      })

      // Should invalidate the datasets query key
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['datasets'],
      })
    })

    /** @description Should accept a custom event-key map */
    it('uses custom event-key map when provided', async () => {
      const useSocketQueryInvalidation = await importHook()
      const customMap = {
        'custom:event': [['custom-key'] as const],
      }

      renderHook(() => useSocketQueryInvalidation(customMap))

      // Simulate the custom event
      act(() => {
        socketHandlers['custom:event']?.forEach((h) => h())
      })

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['custom-key'],
      })
    })

    /** @description Should clean up all handlers on unmount */
    it('unsubscribes all handlers on unmount', async () => {
      const useSocketQueryInvalidation = await importHook()

      const { unmount } = renderHook(() => useSocketQueryInvalidation())

      // Count how many on calls were made (one per event)
      const onCallCount = mockSocket.on.mock.calls.length

      unmount()

      // off should be called the same number of times as on (excluding status hooks)
      // Filter to only the event:updated pattern calls
      const offCalls = mockSocket.off.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes(':'),
      )
      const onCalls = mockSocket.on.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes(':'),
      )
      expect(offCalls.length).toBe(onCalls.length)
    })
  })
})
