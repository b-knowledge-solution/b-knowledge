/**
 * @fileoverview Unit tests for the search widget API client factory.
 * Verifies correct client creation, method delegation, and parameter passing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the widgetAuth module
vi.mock('../../../src/lib/widgetAuth', () => ({
  createWidgetApiClient: vi.fn(),
}))

import { createSearchWidgetApi } from '../../../src/features/search-widget/searchWidgetApi'
import { createWidgetApiClient } from '../../../src/lib/widgetAuth'

describe('createSearchWidgetApi', () => {
  const mockGet = vi.fn()
  const mockPostStream = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createWidgetApiClient).mockReturnValue({
      mode: 'external',
      get: mockGet,
      post: vi.fn(),
      postStream: mockPostStream,
      getBaseUrl: vi.fn(() => 'http://localhost:3001'),
    } as any)
  })

  it('creates client with "search" type', () => {
    const config = { token: 'test-token' }
    createSearchWidgetApi(config)

    expect(createWidgetApiClient).toHaveBeenCalledWith('search', config)
  })

  it('exposes the auth mode from the underlying client', () => {
    const api = createSearchWidgetApi({ token: 'test-token' })
    expect(api.mode).toBe('external')
  })

  // --------------------------------------------------------------------------
  // getInfo
  // --------------------------------------------------------------------------
  describe('getInfo', () => {
    it('delegates to client.get with "info" path', async () => {
      const mockInfo = { name: 'Search App', description: 'Test' }
      mockGet.mockResolvedValue(mockInfo)

      const api = createSearchWidgetApi({ token: 'test-token' })
      const result = await api.getInfo()

      expect(mockGet).toHaveBeenCalledWith('info', undefined)
      expect(result).toEqual(mockInfo)
    })

    it('passes appId for internal mode', async () => {
      mockGet.mockResolvedValue({ name: 'App' })

      const api = createSearchWidgetApi({})
      await api.getInfo('app-123')

      expect(mockGet).toHaveBeenCalledWith('info', 'app-123')
    })
  })

  // --------------------------------------------------------------------------
  // askSearch
  // --------------------------------------------------------------------------
  describe('askSearch', () => {
    it('streams search request with query only', async () => {
      const mockResponse = new Response('data: test')
      mockPostStream.mockResolvedValue(mockResponse)

      const api = createSearchWidgetApi({ token: 'test-token' })
      const result = await api.askSearch('what is AI?')

      expect(mockPostStream).toHaveBeenCalledWith(
        'ask',
        { query: 'what is AI?' },
        undefined,
      )
      expect(result).toBe(mockResponse)
    })

    it('passes optional search parameters', async () => {
      mockPostStream.mockResolvedValue(new Response(''))

      const api = createSearchWidgetApi({ token: 'test-token' })
      await api.askSearch('query', {
        top_k: 10,
        method: 'hybrid',
        similarity_threshold: 0.8,
      })

      expect(mockPostStream).toHaveBeenCalledWith(
        'ask',
        {
          query: 'query',
          top_k: 10,
          method: 'hybrid',
          similarity_threshold: 0.8,
        },
        undefined,
      )
    })

    it('passes appId for internal mode search', async () => {
      mockPostStream.mockResolvedValue(new Response(''))

      const api = createSearchWidgetApi({})
      await api.askSearch('query', {}, 'app-456')

      expect(mockPostStream).toHaveBeenCalledWith(
        'ask',
        { query: 'query' },
        'app-456',
      )
    })
  })
})
