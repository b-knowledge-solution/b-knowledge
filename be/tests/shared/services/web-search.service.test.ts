/**
 * @fileoverview Unit tests for the Tavily web search service.
 *
 * Mocks the global fetch API to simulate Tavily API responses,
 * verifying result mapping to ChunkResult format, error handling,
 * and graceful degradation on failures.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))

vi.mock('../../../src/shared/services/logger.service.js', () => ({
  log: mockLog,
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('searchWeb', () => {
  /** Spy on global fetch to intercept HTTP requests */
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  /**
   * @description Helper to import searchWeb fresh for each test
   * @returns {Promise<typeof import('../../../src/shared/services/web-search.service.js')>}
   */
  async function importSearchWeb() {
    return await import(
      '../../../src/shared/services/web-search.service.js'
    )
  }

  /**
   * @description Should call Tavily API with correct parameters
   */
  it('should call Tavily API with correct request body', async () => {
    // Mock a successful Tavily response
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 })
    )

    const { searchWeb } = await importSearchWeb()
    await searchWeb('test query', 'tvly-api-key-123', 5)

    // Verify fetch was called with the Tavily endpoint
    expect(fetchSpy).toHaveBeenCalledWith('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: 'tvly-api-key-123',
        query: 'test query',
        search_depth: 'advanced',
        max_results: 5,
        include_answer: false,
      }),
    })
  })

  /**
   * @description Should use default maxResults of 3 when not specified
   */
  it('should default to 3 max results', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 })
    )

    const { searchWeb } = await importSearchWeb()
    await searchWeb('query', 'key')

    // Extract the request body to check max_results default
    const callBody = JSON.parse(
      (fetchSpy.mock.calls[0]![1] as RequestInit).body as string
    )
    expect(callBody.max_results).toBe(3)
  })

  /**
   * @description Should convert Tavily results to ChunkResult format
   */
  it('should map Tavily results to ChunkResult format', async () => {
    const tavilyResults = {
      results: [
        {
          url: 'https://example.com/page1',
          title: 'Example Page',
          content: 'This is the content of the page.',
          score: 0.95,
        },
        {
          url: 'https://example.com/page2',
          title: 'Second Page',
          content: 'More content here.',
          score: 0.87,
        },
      ],
    }

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(tavilyResults), { status: 200 })
    )

    const { searchWeb } = await importSearchWeb()
    const results = await searchWeb('test', 'key')

    // Verify correct number of results
    expect(results).toHaveLength(2)

    // Verify first result is properly mapped
    expect(results[0]).toEqual({
      chunk_id: 'web_0',
      text: '[Web: Example Page]\nThis is the content of the page.\nSource: https://example.com/page1',
      doc_name: 'Example Page',
      score: 0.95,
      method: 'web_search',
    })

    // Verify second result has correct index-based chunk_id
    expect(results[1]!.chunk_id).toBe('web_1')
    expect(results[1]!.method).toBe('web_search')
  })

  /**
   * @description Should return empty array when Tavily returns non-OK status
   */
  it('should return empty array on non-OK response', async () => {
    // Simulate a 429 rate limit response
    fetchSpy.mockResolvedValue(
      new Response('Rate limited', { status: 429 })
    )

    const { searchWeb } = await importSearchWeb()
    const results = await searchWeb('query', 'key')

    // Graceful degradation — empty results instead of throwing
    expect(results).toEqual([])
    expect(mockLog.warn).toHaveBeenCalledWith('Tavily search failed', {
      status: 429,
    })
  })

  /**
   * @description Should return empty array on 500 server error
   */
  it('should return empty array on 500 server error', async () => {
    fetchSpy.mockResolvedValue(
      new Response('Internal Server Error', { status: 500 })
    )

    const { searchWeb } = await importSearchWeb()
    const results = await searchWeb('query', 'key')

    expect(results).toEqual([])
  })

  /**
   * @description Should return empty array on network error (fetch throws)
   */
  it('should return empty array on network error', async () => {
    // Simulate a network failure
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'))

    const { searchWeb } = await importSearchWeb()
    const results = await searchWeb('query', 'key')

    // Should catch the error and return empty gracefully
    expect(results).toEqual([])
    expect(mockLog.warn).toHaveBeenCalledWith('Web search error', {
      error: 'Error: ECONNREFUSED',
    })
  })

  /**
   * @description Should return empty array when response JSON has no results property
   */
  it('should handle missing results property in response', async () => {
    // Tavily returns an object without a results array
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ answer: 'some answer' }), { status: 200 })
    )

    const { searchWeb } = await importSearchWeb()
    const results = await searchWeb('query', 'key')

    // data.results is undefined, fallback to empty array via || []
    expect(results).toEqual([])
  })

  /**
   * @description Should handle empty results array from Tavily
   */
  it('should handle empty results array', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 })
    )

    const { searchWeb } = await importSearchWeb()
    const results = await searchWeb('query', 'key')

    expect(results).toEqual([])
  })

  /**
   * @description Should handle JSON parse errors gracefully
   */
  it('should return empty array on malformed JSON response', async () => {
    // Return invalid JSON that will cause response.json() to throw
    fetchSpy.mockResolvedValue(
      new Response('not valid json{{{', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { searchWeb } = await importSearchWeb()
    const results = await searchWeb('query', 'key')

    // JSON parse error should be caught and return empty
    expect(results).toEqual([])
  })
})
