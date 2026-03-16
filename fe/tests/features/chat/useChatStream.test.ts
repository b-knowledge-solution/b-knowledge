/**
 * @fileoverview Tests for useChatStream hook.
 *
 * Covers sendMessage (creates message array), stopStream (aborts controller),
 * clearMessages, setMessages, and SSE event handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockApiSendMessage = vi.fn()

vi.mock('@/features/chat/api/chatApi', () => ({
  chatApi: {
    sendMessage: (...args: any[]) => mockApiSendMessage(...args),
  },
}))

// Import after mocking
import { useChatStream } from '@/features/chat/hooks/useChatStream'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock Response with a ReadableStream from SSE data lines.
 * @param lines - Array of SSE data strings (e.g., JSON.stringify({...}))
 * @returns A mock Response object
 */
function createMockSSEResponse(lines: string[]): Response {
  const encoded = new TextEncoder().encode(
    lines.map(l => `data: ${l}\n\n`).join('')
  )

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoded)
      controller.close()
    },
  })

  return {
    ok: true,
    body: stream,
    json: vi.fn(),
  } as unknown as Response
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useChatStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  describe('initial state', () => {
    it('returns empty messages array', () => {
      const { result } = renderHook(() => useChatStream('conv-1', 'dialog-1'))
      expect(result.current.messages).toEqual([])
    })

    it('is not streaming initially', () => {
      const { result } = renderHook(() => useChatStream('conv-1', 'dialog-1'))
      expect(result.current.isStreaming).toBe(false)
    })

    it('has no error initially', () => {
      const { result } = renderHook(() => useChatStream('conv-1', 'dialog-1'))
      expect(result.current.error).toBeNull()
    })

    it('has no references initially', () => {
      const { result } = renderHook(() => useChatStream('conv-1', 'dialog-1'))
      expect(result.current.references).toBeNull()
    })

    it('has no pipeline status initially', () => {
      const { result } = renderHook(() => useChatStream('conv-1', 'dialog-1'))
      expect(result.current.pipelineStatus).toBeNull()
    })

    it('has no metrics initially', () => {
      const { result } = renderHook(() => useChatStream('conv-1', 'dialog-1'))
      expect(result.current.metrics).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // sendMessage
  // -----------------------------------------------------------------------

  describe('sendMessage', () => {
    it('adds user message to messages array', async () => {
      const response = createMockSSEResponse([
        JSON.stringify({ delta: 'Hello' }),
        JSON.stringify({ answer: 'Hello from AI' }),
        '[DONE]',
      ])
      mockApiSendMessage.mockResolvedValue(response)

      const { result } = renderHook(() => useChatStream('conv-1', 'dialog-1'))

      await act(async () => {
        result.current.sendMessage('Hi there')
      })

      const msgs = result.current.messages
      expect(msgs.length).toBeGreaterThanOrEqual(1)
      expect(msgs[0]!.role).toBe('user')
      expect(msgs[0]!.content).toBe('Hi there')
    })

    it('does nothing when conversationId is null', async () => {
      const { result } = renderHook(() => useChatStream(null, 'dialog-1'))

      await act(async () => {
        result.current.sendMessage('Hello')
      })

      expect(result.current.messages).toEqual([])
      expect(mockApiSendMessage).not.toHaveBeenCalled()
    })

    it('does nothing when dialogId is null', async () => {
      const { result } = renderHook(() => useChatStream('conv-1', null))

      await act(async () => {
        result.current.sendMessage('Hello')
      })

      expect(result.current.messages).toEqual([])
      expect(mockApiSendMessage).not.toHaveBeenCalled()
    })

    it('sets error on HTTP failure', async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ error: 'Server error' }),
        body: null,
      } as unknown as Response
      mockApiSendMessage.mockResolvedValue(errorResponse)

      const { result } = renderHook(() => useChatStream('conv-1', 'dialog-1'))

      await act(async () => {
        result.current.sendMessage('test')
      })

      expect(result.current.error).toBe('Server error')
      expect(result.current.isStreaming).toBe(false)
    })

    it('adds assistant message from final processed answer', async () => {
      const response = createMockSSEResponse([
        JSON.stringify({ delta: 'Part 1' }),
        JSON.stringify({ delta: ' Part 2' }),
        JSON.stringify({ answer: 'Final processed answer', reference: { chunks: [], doc_aggs: [] } }),
        '[DONE]',
      ])
      mockApiSendMessage.mockResolvedValue(response)

      const { result } = renderHook(() => useChatStream('conv-1', 'dialog-1'))

      await act(async () => {
        result.current.sendMessage('test')
      })

      const assistantMsg = result.current.messages.find(m => m.role === 'assistant')
      expect(assistantMsg).toBeDefined()
      expect(assistantMsg!.content).toBe('Final processed answer')
    })

    it('stores metrics from the final answer event', async () => {
      const metrics = {
        refinement_ms: 100,
        retrieval_ms: 200,
        generation_ms: 500,
        total_ms: 800,
        chunks_retrieved: 5,
        chunks_cited: 2,
      }
      const response = createMockSSEResponse([
        JSON.stringify({ delta: 'Hi' }),
        JSON.stringify({ answer: 'Hi', metrics }),
        '[DONE]',
      ])
      mockApiSendMessage.mockResolvedValue(response)

      const { result } = renderHook(() => useChatStream('conv-1', 'dialog-1'))

      await act(async () => {
        result.current.sendMessage('test')
      })

      expect(result.current.metrics).toEqual(metrics)
    })
  })

  // -----------------------------------------------------------------------
  // stopStream
  // -----------------------------------------------------------------------

  describe('stopStream', () => {
    it('sets isStreaming to false and clears pipeline status', () => {
      const { result } = renderHook(() => useChatStream('conv-1', 'dialog-1'))

      act(() => {
        result.current.stopStream()
      })

      expect(result.current.isStreaming).toBe(false)
      expect(result.current.pipelineStatus).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // clearMessages
  // -----------------------------------------------------------------------

  describe('clearMessages', () => {
    it('resets all state', async () => {
      const response = createMockSSEResponse([
        JSON.stringify({ delta: 'Test' }),
        JSON.stringify({ answer: 'Test answer' }),
        '[DONE]',
      ])
      mockApiSendMessage.mockResolvedValue(response)

      const { result } = renderHook(() => useChatStream('conv-1', 'dialog-1'))

      await act(async () => {
        result.current.sendMessage('Hello')
      })

      expect(result.current.messages.length).toBeGreaterThan(0)

      act(() => {
        result.current.clearMessages()
      })

      expect(result.current.messages).toEqual([])
      expect(result.current.currentAnswer).toBe('')
      expect(result.current.references).toBeNull()
      expect(result.current.pipelineStatus).toBeNull()
      expect(result.current.metrics).toBeNull()
      expect(result.current.error).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // setMessages
  // -----------------------------------------------------------------------

  describe('setMessages', () => {
    it('allows setting messages externally (e.g., loading a conversation)', () => {
      const { result } = renderHook(() => useChatStream('conv-1', 'dialog-1'))

      act(() => {
        result.current.setMessages([
          { id: 'msg-1', role: 'user', content: 'Loaded message', timestamp: '2026-01-01' },
          { id: 'msg-2', role: 'assistant', content: 'Loaded response', timestamp: '2026-01-01' },
        ])
      })

      expect(result.current.messages).toHaveLength(2)
      expect(result.current.messages[0]!.content).toBe('Loaded message')
      expect(result.current.messages[1]!.content).toBe('Loaded response')
    })
  })
})
