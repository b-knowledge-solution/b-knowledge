/**
 * @fileoverview Unit tests for Code Graph API service.
 * Mocks the shared API client to verify endpoint paths and parameters.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { codeGraphApi } from '@/features/code-graph/api/codeGraphApi'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
}))

const KB_ID = 'test-kb-123'

describe('codeGraphApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getStats', () => {
    it('calls GET /api/code-graph/:kbId/stats', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ nodes: [], relationships: [] })
      await codeGraphApi.getStats(KB_ID)
      expect(api.get).toHaveBeenCalledWith(`/api/code-graph/${KB_ID}/stats`)
    })
  })

  describe('getGraphData', () => {
    it('calls GET /api/code-graph/:kbId/graph with default limit', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ nodes: [], links: [] })
      await codeGraphApi.getGraphData(KB_ID)
      expect(api.get).toHaveBeenCalledWith(`/api/code-graph/${KB_ID}/graph?limit=500`)
    })

    it('calls with custom limit', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ nodes: [], links: [] })
      await codeGraphApi.getGraphData(KB_ID, 100)
      expect(api.get).toHaveBeenCalledWith(`/api/code-graph/${KB_ID}/graph?limit=100`)
    })
  })

  describe('getCallers', () => {
    it('calls GET /api/code-graph/:kbId/callers with encoded name', async () => {
      vi.mocked(api.get).mockResolvedValueOnce([])
      await codeGraphApi.getCallers(KB_ID, 'my_function')
      expect(api.get).toHaveBeenCalledWith(
        `/api/code-graph/${KB_ID}/callers?name=my_function`
      )
    })

    it('encodes special characters in name', async () => {
      vi.mocked(api.get).mockResolvedValueOnce([])
      await codeGraphApi.getCallers(KB_ID, 'Class.method')
      expect(api.get).toHaveBeenCalledWith(
        `/api/code-graph/${KB_ID}/callers?name=Class.method`
      )
    })
  })

  describe('getCallees', () => {
    it('calls GET /api/code-graph/:kbId/callees with name', async () => {
      vi.mocked(api.get).mockResolvedValueOnce([])
      await codeGraphApi.getCallees(KB_ID, 'init')
      expect(api.get).toHaveBeenCalledWith(
        `/api/code-graph/${KB_ID}/callees?name=init`
      )
    })
  })

  describe('getSnippet', () => {
    it('calls GET /api/code-graph/:kbId/snippet with name', async () => {
      vi.mocked(api.get).mockResolvedValueOnce([])
      await codeGraphApi.getSnippet(KB_ID, 'process_data')
      expect(api.get).toHaveBeenCalledWith(
        `/api/code-graph/${KB_ID}/snippet?name=process_data`
      )
    })
  })

  describe('getHierarchy', () => {
    it('calls GET /api/code-graph/:kbId/hierarchy with name', async () => {
      vi.mocked(api.get).mockResolvedValueOnce([])
      await codeGraphApi.getHierarchy(KB_ID, 'BaseClass')
      expect(api.get).toHaveBeenCalledWith(
        `/api/code-graph/${KB_ID}/hierarchy?name=BaseClass`
      )
    })
  })

  describe('executeCypher', () => {
    it('calls POST /api/code-graph/:kbId/cypher with body', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ results: [], count: 0 })
      const cypher = 'MATCH (n) RETURN n LIMIT 10'
      await codeGraphApi.executeCypher(KB_ID, cypher, { limit: 10 })
      expect(api.post).toHaveBeenCalledWith(
        `/api/code-graph/${KB_ID}/cypher`,
        { cypher, params: { limit: 10 } }
      )
    })

    it('sends undefined params when not provided', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ results: [], count: 0 })
      await codeGraphApi.executeCypher(KB_ID, 'MATCH (n) RETURN n')
      expect(api.post).toHaveBeenCalledWith(
        `/api/code-graph/${KB_ID}/cypher`,
        { cypher: 'MATCH (n) RETURN n', params: undefined }
      )
    })
  })
})
