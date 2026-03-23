/**
 * @fileoverview Unit tests for the useAgentStream SSE hook.
 *
 * Tests EventSource connection, SSE event parsing, accumulation of output,
 * error handling, stream close, and cleanup on unmount.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// EventSource mock
// ---------------------------------------------------------------------------

type EventSourceHandler = ((event: MessageEvent) => void) | null

class MockEventSource {
  url: string
  withCredentials: boolean
  onmessage: EventSourceHandler = null
  onerror: ((event: Event) => void) | null = null
  readyState = 0
  close = vi.fn()

  constructor(url: string, opts?: { withCredentials?: boolean }) {
    this.url = url
    this.withCredentials = opts?.withCredentials ?? false
    MockEventSource.instances.push(this)
  }

  /** Track all instances for test assertions */
  static instances: MockEventSource[] = []
  static reset() {
    MockEventSource.instances = []
  }

  /** Helper: simulate receiving an SSE message */
  simulateMessage(data: string) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }))
    }
  }

  /** Helper: simulate an error event */
  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'))
    }
  }
}

// Install the mock globally
vi.stubGlobal('EventSource', MockEventSource)

vi.mock('@/config', () => ({
  config: {
    apiBaseUrl: 'http://localhost:3001',
  },
}))

import { useAgentStream } from '@/features/agents/hooks/useAgentStream'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAgentStream', () => {
  beforeEach(() => {
    MockEventSource.reset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns initial state with empty output and no streaming', () => {
    const { result } = renderHook(() => useAgentStream())

    expect(result.current.output).toBe('')
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('opens EventSource with correct URL and credentials', () => {
    const { result } = renderHook(() => useAgentStream())

    act(() => {
      result.current.startStream('agent-1', 'run-1')
    })

    expect(MockEventSource.instances).toHaveLength(1)
    const es = MockEventSource.instances[0]!
    expect(es.url).toBe('http://localhost:3001/api/agents/agent-1/run/run-1/stream')
    expect(es.withCredentials).toBe(true)
  })

  it('sets isStreaming to true after startStream', () => {
    const { result } = renderHook(() => useAgentStream())

    act(() => {
      result.current.startStream('agent-1', 'run-1')
    })

    expect(result.current.isStreaming).toBe(true)
  })

  it('accumulates delta text from SSE messages', () => {
    const { result } = renderHook(() => useAgentStream())

    act(() => {
      result.current.startStream('agent-1', 'run-1')
    })

    const es = MockEventSource.instances[0]!

    act(() => {
      es.simulateMessage(JSON.stringify({ delta: 'Hello' }))
    })
    expect(result.current.output).toBe('Hello')

    act(() => {
      es.simulateMessage(JSON.stringify({ delta: ' World' }))
    })
    expect(result.current.output).toBe('Hello World')
  })

  it('handles [DONE] signal by closing stream', () => {
    const { result } = renderHook(() => useAgentStream())

    act(() => {
      result.current.startStream('agent-1', 'run-1')
    })

    const es = MockEventSource.instances[0]!

    act(() => {
      es.simulateMessage('[DONE]')
    })

    expect(result.current.isStreaming).toBe(false)
    expect(es.close).toHaveBeenCalled()
  })

  it('handles output_data.output from step events', () => {
    const { result } = renderHook(() => useAgentStream())

    act(() => {
      result.current.startStream('agent-1', 'run-1')
    })

    const es = MockEventSource.instances[0]!

    act(() => {
      es.simulateMessage(JSON.stringify({ output_data: { output: 'Step result' } }))
    })

    expect(result.current.output).toBe('Step result')
  })

  it('handles done event type with final output', () => {
    const { result } = renderHook(() => useAgentStream())

    act(() => {
      result.current.startStream('agent-1', 'run-1')
    })

    const es = MockEventSource.instances[0]!

    act(() => {
      es.simulateMessage(JSON.stringify({ type: 'done', output: 'Final output' }))
    })

    expect(result.current.output).toBe('Final output')
    expect(result.current.isStreaming).toBe(false)
  })

  it('handles error event type with error message', () => {
    const { result } = renderHook(() => useAgentStream())

    act(() => {
      result.current.startStream('agent-1', 'run-1')
    })

    const es = MockEventSource.instances[0]!

    act(() => {
      es.simulateMessage(JSON.stringify({ type: 'error', error: 'Node failed' }))
    })

    expect(result.current.error).toBe('Node failed')
    expect(result.current.isStreaming).toBe(false)
  })

  it('handles EventSource connection error', () => {
    const { result } = renderHook(() => useAgentStream())

    act(() => {
      result.current.startStream('agent-1', 'run-1')
    })

    const es = MockEventSource.instances[0]!

    act(() => {
      es.simulateError()
    })

    expect(result.current.error).toBe('Stream connection error')
    expect(result.current.isStreaming).toBe(false)
    expect(es.close).toHaveBeenCalled()
  })

  it('skips malformed JSON lines without crashing', () => {
    const { result } = renderHook(() => useAgentStream())

    act(() => {
      result.current.startStream('agent-1', 'run-1')
    })

    const es = MockEventSource.instances[0]!

    // Should not throw
    act(() => {
      es.simulateMessage('{ invalid json }')
    })

    // Stream remains active
    expect(result.current.isStreaming).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('stopStream closes the EventSource and preserves output', () => {
    const { result } = renderHook(() => useAgentStream())

    act(() => {
      result.current.startStream('agent-1', 'run-1')
    })

    const es = MockEventSource.instances[0]!

    act(() => {
      es.simulateMessage(JSON.stringify({ delta: 'partial' }))
    })

    act(() => {
      result.current.stopStream()
    })

    expect(result.current.isStreaming).toBe(false)
    expect(result.current.output).toBe('partial')
    expect(es.close).toHaveBeenCalled()
  })

  it('closes previous stream when starting a new one', () => {
    const { result } = renderHook(() => useAgentStream())

    act(() => {
      result.current.startStream('agent-1', 'run-1')
    })

    const firstEs = MockEventSource.instances[0]!

    act(() => {
      result.current.startStream('agent-1', 'run-2')
    })

    expect(firstEs.close).toHaveBeenCalled()
    expect(MockEventSource.instances).toHaveLength(2)
  })

  it('resets output when starting a new stream', () => {
    const { result } = renderHook(() => useAgentStream())

    act(() => {
      result.current.startStream('agent-1', 'run-1')
    })

    const es = MockEventSource.instances[0]!
    act(() => {
      es.simulateMessage(JSON.stringify({ delta: 'old output' }))
    })

    act(() => {
      result.current.startStream('agent-1', 'run-2')
    })

    expect(result.current.output).toBe('')
  })

  it('closes EventSource on unmount', () => {
    const { result, unmount } = renderHook(() => useAgentStream())

    act(() => {
      result.current.startStream('agent-1', 'run-1')
    })

    const es = MockEventSource.instances[0]!

    unmount()

    expect(es.close).toHaveBeenCalled()
  })
})
