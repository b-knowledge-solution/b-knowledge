/**
 * @fileoverview Unit tests for ChatWidgetApi class.
 * Verifies dual-mode auth (internal/external), correct endpoint routing,
 * and request payload construction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the widgetAuth module before importing the API class
vi.mock('../../../src/lib/widgetAuth', () => ({
  createWidgetApiClient: vi.fn(),
}))

import { ChatWidgetApi } from '../../../src/features/chat-widget/chatWidgetApi'
import { createWidgetApiClient } from '../../../src/lib/widgetAuth'

describe('ChatWidgetApi', () => {
  const mockGet = vi.fn()
  const mockPost = vi.fn()
  const mockPostStream = vi.fn()
  const mockGetBaseUrl = vi.fn(() => 'http://localhost:3001')

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  // --------------------------------------------------------------------------
  // External mode
  // --------------------------------------------------------------------------
  describe('external mode', () => {
    beforeEach(() => {
      vi.mocked(createWidgetApiClient).mockReturnValue({
        mode: 'external',
        get: mockGet,
        post: mockPost,
        postStream: mockPostStream,
        getBaseUrl: mockGetBaseUrl,
      } as any)
    })

    it('getInfo calls client.get with "info" path', async () => {
      const mockInfo = { name: 'Test Chat', icon: null, description: null, prologue: 'Hi!' }
      mockGet.mockResolvedValue(mockInfo)

      const api = new ChatWidgetApi({ token: 'test-token' })
      const result = await api.getInfo()

      expect(mockGet).toHaveBeenCalledWith('info')
      expect(result).toEqual(mockInfo)
    })

    it('createSession calls client.post with "sessions" path', async () => {
      const mockSession = { id: 's1', dialog_id: 'd1', name: 'Widget Session' }
      mockPost.mockResolvedValue(mockSession)

      const api = new ChatWidgetApi({ token: 'test-token' })
      const result = await api.createSession('My Session')

      expect(mockPost).toHaveBeenCalledWith('sessions', { name: 'My Session' })
      expect(result).toEqual(mockSession)
    })

    it('sendMessage calls client.postStream with "completions" path', async () => {
      const mockResponse = new Response('data: test')
      mockPostStream.mockResolvedValue(mockResponse)

      const api = new ChatWidgetApi({ token: 'test-token' })
      const result = await api.sendMessage('hello', 's1')

      expect(mockPostStream).toHaveBeenCalledWith('completions', {
        content: 'hello',
        session_id: 's1',
      })
      expect(result).toBe(mockResponse)
    })
  })

  // --------------------------------------------------------------------------
  // Internal mode
  // --------------------------------------------------------------------------
  describe('internal mode', () => {
    beforeEach(() => {
      vi.mocked(createWidgetApiClient).mockReturnValue({
        mode: 'internal',
        get: mockGet,
        post: mockPost,
        postStream: mockPostStream,
        getBaseUrl: mockGetBaseUrl,
      } as any)
    })

    it('getInfo fetches dialog by ID via internal API', async () => {
      const dialogData = {
        name: 'Internal Chat',
        icon: 'chat-icon',
        description: 'A chat',
        prompt_config: { prologue: 'Welcome' },
      }
      vi.mocked(global.fetch).mockResolvedValue(
        new Response(JSON.stringify(dialogData), { status: 200 })
      )

      const api = new ChatWidgetApi({}, 'dialog-123')
      const result = await api.getInfo()

      // Verify fetch called with correct internal endpoint
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/chat/dialogs/dialog-123',
        { credentials: 'include' },
      )
      expect(result).toEqual({
        name: 'Internal Chat',
        icon: 'chat-icon',
        description: 'A chat',
        prologue: 'Welcome',
      })
    })

    it('getInfo throws on non-ok response', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        new Response('Not Found', { status: 404 })
      )

      const api = new ChatWidgetApi({}, 'bad-id')
      await expect(api.getInfo()).rejects.toThrow('Failed to get dialog info: 404')
    })

    it('createSession posts to conversations endpoint', async () => {
      const sessionData = { id: 's1', dialog_id: 'd1', name: 'Widget Session' }
      vi.mocked(global.fetch).mockResolvedValue(
        new Response(JSON.stringify(sessionData), { status: 200 })
      )

      const api = new ChatWidgetApi({}, 'dialog-123')
      const result = await api.createSession()

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/chat/conversations',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ dialog_id: 'dialog-123', name: 'Widget Session' }),
        }),
      )
      expect(result).toEqual(sessionData)
    })

    it('sendMessage posts to completion endpoint with SSE accept header', async () => {
      const mockResponse = new Response('data: {"answer": "test"}')
      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      const api = new ChatWidgetApi({}, 'dialog-123')
      const result = await api.sendMessage('test message', 'session-1')

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/chat/conversations/session-1/completion',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Accept: 'text/event-stream',
          }),
          body: JSON.stringify({
            content: 'test message',
            dialog_id: 'dialog-123',
          }),
        }),
      )
      expect(result).toBe(mockResponse)
    })
  })
})
