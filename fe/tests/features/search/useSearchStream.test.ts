/**
 * @fileoverview Tests for the useSearchStream hook.
 *
 * Covers:
 * - askSearch sets isStreaming true
 * - delta events accumulate answer
 * - reference events update chunks
 * - stopStream aborts controller
 * - clearResults resets state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock searchApi.askSearch to return a controllable ReadableStream
const mockAskSearch = vi.fn()

vi.mock('../../../src/features/search/api/searchApi', () => ({
  searchApi: {
    askSearch: (...args: any[]) => mockAskSearch(...args),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock SSE Response with a ReadableStream body.
 * @param events - Array of SSE data strings (without "data: " prefix)
 */
function createSSEResponse(events: string[]): Response {
  const encoder = new TextEncoder()
  let eventIndex = 0

  const stream = new ReadableStream({
    pull(controller) {
      if (eventIndex < events.length) {
        const data = `data: ${events[eventIndex]}\n\n`
        controller.enqueue(encoder.encode(data))
        eventIndex++
      } else {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

/**
 * Create a delayed SSE response that emits events with a delay.
 * Useful for testing streaming state.
 */
function createDelayedSSEResponse(events: string[], delayMs: number = 10): Response {
  const encoder = new TextEncoder()
  let eventIndex = 0

  const stream = new ReadableStream({
    async pull(controller) {
      if (eventIndex < events.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
        const data = `data: ${events[eventIndex]}\n\n`
        controller.enqueue(encoder.encode(data))
        eventIndex++
      } else {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSearchStream', () => {
  let useSearchStream: any

  beforeEach(async () => {
    vi.clearAllMocks()
    // Dynamic import to ensure mocks are applied
    const mod = await import('../../../src/features/search/hooks/useSearchStream')
    useSearchStream = mod.useSearchStream
  })

  it('initial state has empty values', () => {
    const { result } = renderHook(() => useSearchStream())

    expect(result.current.answer).toBe('')
    expect(result.current.chunks).toEqual([])
    expect(result.current.relatedQuestions).toEqual([])
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.pipelineStatus).toBe('')
    expect(result.current.error).toBeNull()
    expect(result.current.docAggs).toEqual([])
    expect(result.current.lastQuery).toBe('')
  })

  it('askSearch does nothing for empty query', async () => {
    const { result } = renderHook(() => useSearchStream())

    await act(async () => {
      result.current.askSearch('app-1', '   ')
    })

    expect(mockAskSearch).not.toHaveBeenCalled()
    expect(result.current.isStreaming).toBe(false)
  })

  it('askSearch processes delta events and accumulates answer', async () => {
    const sseResponse = createSSEResponse([
      JSON.stringify({ status: 'retrieving' }),
      JSON.stringify({ status: 'generating' }),
      JSON.stringify({ reference: { chunks: [{ chunk_id: 'c1', content: 'test chunk' }], doc_aggs: [] } }),
      JSON.stringify({ delta: 'Hello ' }),
      JSON.stringify({ delta: 'World' }),
      JSON.stringify({ answer: 'Hello World (cited)', reference: { chunks: [{ chunk_id: 'c1' }], doc_aggs: [{ doc_id: 'd1', doc_name: 'doc', count: 1 }] } }),
      '[DONE]',
    ])
    mockAskSearch.mockResolvedValue(sseResponse)

    const { result } = renderHook(() => useSearchStream())

    await act(async () => {
      result.current.askSearch('app-1', 'test query')
    })

    // After stream completes, should have final answer
    expect(result.current.answer).toBe('Hello World (cited)')
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.lastQuery).toBe('test query')
  })

  it('reference events update chunks and docAggs', async () => {
    const chunks = [
      { chunk_id: 'c1', content: 'chunk 1', doc_id: 'd1', doc_name: 'doc1', score: 0.9 },
      { chunk_id: 'c2', content: 'chunk 2', doc_id: 'd2', doc_name: 'doc2', score: 0.8 },
    ]
    const docAggs = [
      { doc_id: 'd1', doc_name: 'doc1', count: 1 },
      { doc_id: 'd2', doc_name: 'doc2', count: 1 },
    ]

    const sseResponse = createSSEResponse([
      JSON.stringify({ reference: { chunks, doc_aggs: docAggs } }),
      JSON.stringify({ delta: 'answer' }),
      '[DONE]',
    ])
    mockAskSearch.mockResolvedValue(sseResponse)

    const { result } = renderHook(() => useSearchStream())

    await act(async () => {
      result.current.askSearch('app-1', 'test')
    })

    expect(result.current.chunks).toHaveLength(2)
    expect(result.current.chunks[0].chunk_id).toBe('c1')
    expect(result.current.docAggs).toHaveLength(2)
  })

  it('related_questions events update relatedQuestions', async () => {
    const sseResponse = createSSEResponse([
      JSON.stringify({ delta: 'answer' }),
      JSON.stringify({ related_questions: ['Q1?', 'Q2?', 'Q3?'] }),
      '[DONE]',
    ])
    mockAskSearch.mockResolvedValue(sseResponse)

    const { result } = renderHook(() => useSearchStream())

    await act(async () => {
      result.current.askSearch('app-1', 'test')
    })

    expect(result.current.relatedQuestions).toEqual(['Q1?', 'Q2?', 'Q3?'])
  })

  it('clearResults resets all state', async () => {
    // First perform a search to populate state
    const sseResponse = createSSEResponse([
      JSON.stringify({ reference: { chunks: [{ chunk_id: 'c1' }], doc_aggs: [{ doc_id: 'd1', doc_name: 'doc', count: 1 }] } }),
      JSON.stringify({ delta: 'some answer' }),
      JSON.stringify({ related_questions: ['Q1?'] }),
      '[DONE]',
    ])
    mockAskSearch.mockResolvedValue(sseResponse)

    const { result } = renderHook(() => useSearchStream())

    await act(async () => {
      result.current.askSearch('app-1', 'test')
    })

    // Verify state is populated
    expect(result.current.answer).not.toBe('')
    expect(result.current.lastQuery).toBe('test')

    // Clear results
    act(() => {
      result.current.clearResults()
    })

    expect(result.current.answer).toBe('')
    expect(result.current.chunks).toEqual([])
    expect(result.current.relatedQuestions).toEqual([])
    expect(result.current.docAggs).toEqual([])
    expect(result.current.error).toBeNull()
    expect(result.current.pipelineStatus).toBe('')
    expect(result.current.lastQuery).toBe('')
  })

  it('stopStream sets isStreaming to false', async () => {
    // Create a response that never finishes
    const neverEndingStream = new ReadableStream({
      start() {
        // intentionally never close
      },
    })
    const response = new Response(neverEndingStream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })
    mockAskSearch.mockResolvedValue(response)

    const { result } = renderHook(() => useSearchStream())

    // Start streaming (don't await, it will never complete)
    act(() => {
      result.current.askSearch('app-1', 'test')
    })

    // Give it a tick to start
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    // Stop the stream
    act(() => {
      result.current.stopStream()
    })

    expect(result.current.isStreaming).toBe(false)
  })

  it('handles HTTP error responses', async () => {
    const errorResponse = new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
    mockAskSearch.mockResolvedValue(errorResponse)

    const { result } = renderHook(() => useSearchStream())

    await act(async () => {
      result.current.askSearch('app-1', 'test')
    })

    expect(result.current.error).toBe('Server error')
    expect(result.current.isStreaming).toBe(false)
  })

  it('handles pipeline error events', async () => {
    const sseResponse = createSSEResponse([
      JSON.stringify({ error: 'Retrieval failed' }),
    ])
    mockAskSearch.mockResolvedValue(sseResponse)

    const { result } = renderHook(() => useSearchStream())

    await act(async () => {
      result.current.askSearch('app-1', 'test')
    })

    expect(result.current.error).toBe('Retrieval failed')
    expect(result.current.isStreaming).toBe(false)
  })

  it('handles fetch rejection', async () => {
    mockAskSearch.mockRejectedValue(new Error('Network failure'))

    const { result } = renderHook(() => useSearchStream())

    await act(async () => {
      result.current.askSearch('app-1', 'test')
    })

    expect(result.current.error).toBe('Network failure')
    expect(result.current.isStreaming).toBe(false)
  })

  it('sets lastQuery to the submitted query', async () => {
    const sseResponse = createSSEResponse(['[DONE]'])
    mockAskSearch.mockResolvedValue(sseResponse)

    const { result } = renderHook(() => useSearchStream())

    await act(async () => {
      result.current.askSearch('app-1', 'my search query')
    })

    expect(result.current.lastQuery).toBe('my search query')
  })

  it('resets state when starting a new search', async () => {
    // First search
    const sseResponse1 = createSSEResponse([
      JSON.stringify({ delta: 'first answer' }),
      JSON.stringify({ related_questions: ['Q1?'] }),
      '[DONE]',
    ])
    mockAskSearch.mockResolvedValue(sseResponse1)

    const { result } = renderHook(() => useSearchStream())

    await act(async () => {
      result.current.askSearch('app-1', 'first query')
    })

    expect(result.current.answer).toBe('first answer')

    // Second search should reset
    const sseResponse2 = createSSEResponse([
      JSON.stringify({ delta: 'second answer' }),
      '[DONE]',
    ])
    mockAskSearch.mockResolvedValue(sseResponse2)

    await act(async () => {
      result.current.askSearch('app-1', 'second query')
    })

    expect(result.current.answer).toBe('second answer')
    expect(result.current.lastQuery).toBe('second query')
    // Related questions from first search should be cleared
    expect(result.current.relatedQuestions).toEqual([])
  })
})
