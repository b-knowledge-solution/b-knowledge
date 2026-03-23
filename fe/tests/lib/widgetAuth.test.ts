/**
 * @fileoverview Tests for widget authentication and API client.
 *
 * Tests:
 * - Auth mode detection: internal (cookie) vs external (token)
 * - URL building: embed path for external, app path for internal
 * - Headers: Bearer token for external, no auth header for internal
 * - Credentials: include for internal, omit for external
 * - GET, POST, postStream methods
 * - Error handling for non-OK responses
 *
 * Mocks global `fetch` for all HTTP assertions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Tests
// ============================================================================

describe('widgetAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset fetch mock for each test
    vi.mocked(global.fetch).mockReset()
  })

  /**
   * @description Dynamically imports the module so mocks are resolved
   * @returns {Promise<typeof import('@/lib/widgetAuth')>} Module exports
   */
  async function importModule() {
    return await import('@/lib/widgetAuth')
  }

  // --------------------------------------------------------------------------
  // Auth mode detection
  // --------------------------------------------------------------------------

  describe('auth mode', () => {
    /** @description Should be external when a token is provided */
    it('returns external mode when token is provided', async () => {
      const { createWidgetApiClient } = await importModule()
      const client = createWidgetApiClient('search', { token: 'my-token' })
      expect(client.mode).toBe('external')
    })

    /** @description Should be internal when no token is provided */
    it('returns internal mode when no token is provided', async () => {
      const { createWidgetApiClient } = await importModule()
      const client = createWidgetApiClient('chat', {})
      expect(client.mode).toBe('internal')
    })

    /** @description Should be internal when token is undefined */
    it('returns internal mode when token is undefined', async () => {
      const { createWidgetApiClient } = await importModule()
      const client = createWidgetApiClient('search', { token: undefined })
      expect(client.mode).toBe('internal')
    })
  })

  // --------------------------------------------------------------------------
  // URL building
  // --------------------------------------------------------------------------

  describe('buildUrl', () => {
    /** @description External mode should build embed URL with token */
    it('builds embed URL for external mode', async () => {
      const { createWidgetApiClient } = await importModule()
      const client = createWidgetApiClient('search', {
        token: 'tok-123',
        baseUrl: 'https://api.example.com',
      })

      const url = client.buildUrl('query', undefined)
      expect(url).toBe('https://api.example.com/api/search/embed/tok-123/query')
    })

    /** @description Internal mode should build app URL with appId */
    it('builds app URL for internal mode', async () => {
      const { createWidgetApiClient } = await importModule()
      const client = createWidgetApiClient('chat', {})

      const url = client.buildUrl('messages', 'app-1')
      expect(url).toContain('/api/chat/apps/app-1/messages')
    })

    /** @description Should handle different module types in URL path */
    it('includes correct module in URL path', async () => {
      const { createWidgetApiClient } = await importModule()

      const searchClient = createWidgetApiClient('search', { token: 'tok' })
      const chatClient = createWidgetApiClient('chat', { token: 'tok' })

      expect(searchClient.buildUrl('query')).toContain('/api/search/')
      expect(chatClient.buildUrl('query')).toContain('/api/chat/')
    })
  })

  // --------------------------------------------------------------------------
  // getBaseUrl
  // --------------------------------------------------------------------------

  describe('getBaseUrl', () => {
    /** @description External mode should return the provided baseUrl */
    it('returns baseUrl for external mode', async () => {
      const { createWidgetApiClient } = await importModule()
      const client = createWidgetApiClient('search', {
        token: 'tok-123',
        baseUrl: 'https://api.example.com',
      })
      expect(client.getBaseUrl()).toBe('https://api.example.com')
    })

    /** @description External mode should return empty string when baseUrl is not provided */
    it('returns empty string for external mode without baseUrl', async () => {
      const { createWidgetApiClient } = await importModule()
      const client = createWidgetApiClient('search', { token: 'tok-123' })
      expect(client.getBaseUrl()).toBe('')
    })
  })

  // --------------------------------------------------------------------------
  // GET method
  // --------------------------------------------------------------------------

  describe('get', () => {
    /** @description Should send GET with include credentials for internal mode */
    it('sends GET with cookies for internal mode', async () => {
      const { createWidgetApiClient } = await importModule()
      const client = createWidgetApiClient('search', {})

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      } as Response)

      await client.get('query', 'app-1')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        }),
      )
    })

    /** @description Should send GET with omit credentials and Bearer token for external mode */
    it('sends GET with Bearer token for external mode', async () => {
      const { createWidgetApiClient } = await importModule()
      const client = createWidgetApiClient('search', {
        token: 'my-token',
        baseUrl: 'https://api.example.com',
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      } as Response)

      await client.get('query')

      const [, options] = vi.mocked(global.fetch).mock.calls[0]!
      expect(options?.credentials).toBe('omit')
      // Verify Authorization header
      const headers = options?.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer my-token')
    })

    /** @description Should throw on non-OK response with error message */
    it('throws error on non-ok response', async () => {
      const { createWidgetApiClient } = await importModule()
      const client = createWidgetApiClient('search', {})

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Forbidden' }),
      } as Response)

      await expect(client.get('query', 'app-1')).rejects.toThrow('Forbidden')
    })

    /** @description Should throw generic error when response has no error message */
    it('throws generic error when response body has no error field', async () => {
      const { createWidgetApiClient } = await importModule()
      const client = createWidgetApiClient('search', {})

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response)

      await expect(client.get('query', 'app-1')).rejects.toThrow('API error: 500')
    })

    /** @description Should handle json parse failure gracefully */
    it('throws generic error when json parsing fails', async () => {
      const { createWidgetApiClient } = await importModule()
      const client = createWidgetApiClient('search', {})

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => { throw new Error('parse fail') },
      } as Response)

      await expect(client.get('query', 'app-1')).rejects.toThrow('API error: 502')
    })
  })

  // --------------------------------------------------------------------------
  // POST method
  // --------------------------------------------------------------------------

  describe('post', () => {
    /** @description Should send POST with JSON body */
    it('sends POST with serialized body', async () => {
      const { createWidgetApiClient } = await importModule()
      const client = createWidgetApiClient('chat', {})

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg-1' }),
      } as Response)

      const body = { message: 'Hello' }
      await client.post('messages', body, 'app-1')

      const [, options] = vi.mocked(global.fetch).mock.calls[0]!
      expect(options?.method).toBe('POST')
      expect(options?.body).toBe(JSON.stringify(body))
    })

    /** @description Should throw on non-OK POST response */
    it('throws on error response', async () => {
      const { createWidgetApiClient } = await importModule()
      const client = createWidgetApiClient('chat', {})

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Bad request' }),
      } as Response)

      await expect(client.post('messages', {}, 'app-1')).rejects.toThrow('Bad request')
    })
  })

  // --------------------------------------------------------------------------
  // postStream method
  // --------------------------------------------------------------------------

  describe('postStream', () => {
    /** @description Should return raw Response for SSE streaming */
    it('returns raw Response object', async () => {
      const { createWidgetApiClient } = await importModule()
      const client = createWidgetApiClient('chat', {})

      const mockResponse = { ok: true, body: {} } as Response
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse)

      const result = await client.postStream('stream', { prompt: 'Hi' }, 'app-1')

      // postStream returns the raw Response
      expect(result).toBe(mockResponse)
    })

    /** @description Should include Accept: text/event-stream header */
    it('sets Accept header to text/event-stream', async () => {
      const { createWidgetApiClient } = await importModule()
      const client = createWidgetApiClient('chat', {})

      vi.mocked(global.fetch).mockResolvedValueOnce({ ok: true } as Response)

      await client.postStream('stream', {}, 'app-1')

      const [, options] = vi.mocked(global.fetch).mock.calls[0]!
      const headers = options?.headers as Record<string, string>
      expect(headers['Accept']).toBe('text/event-stream')
    })
  })
})
