/**
 * @fileoverview Unit tests for the Agent API layer.
 *
 * Verifies correct HTTP methods, URLs, query string construction,
 * and payload shapes for all agent CRUD, versioning, templates, and run operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
    put: (...args: any[]) => mockPut(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
}))

import { agentApi } from '@/features/agents/api/agentApi'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agentApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ========================================================================
  // List
  // ========================================================================

  describe('list', () => {
    it('calls GET /api/agents with no params', async () => {
      const mockData = { data: [], total: 0, page: 1, page_size: 20 }
      mockGet.mockResolvedValue(mockData)

      const result = await agentApi.list()

      expect(mockGet).toHaveBeenCalledWith('/api/agents')
      expect(result).toBe(mockData)
    })

    it('builds query string from filter params', async () => {
      mockGet.mockResolvedValue({ data: [], total: 0 })

      await agentApi.list({ mode: 'pipeline', status: 'published', search: 'test', page: 2, page_size: 10 })

      const url = mockGet.mock.calls[0]![0] as string
      expect(url).toContain('/api/agents?')
      expect(url).toContain('mode=pipeline')
      expect(url).toContain('status=published')
      expect(url).toContain('search=test')
      expect(url).toContain('page=2')
      expect(url).toContain('page_size=10')
    })

    it('omits undefined filter params from query string', async () => {
      mockGet.mockResolvedValue({ data: [] })

      await agentApi.list({ mode: 'agent' })

      const url = mockGet.mock.calls[0]![0] as string
      expect(url).toContain('mode=agent')
      expect(url).not.toContain('status')
      expect(url).not.toContain('search')
    })

    it('includes knowledge_base_id when provided', async () => {
      mockGet.mockResolvedValue({ data: [] })

      await agentApi.list({ knowledge_base_id: 'kb-1' })

      const url = mockGet.mock.calls[0]![0] as string
      expect(url).toContain('knowledge_base_id=kb-1')
    })
  })

  // ========================================================================
  // getById
  // ========================================================================

  describe('getById', () => {
    it('calls GET /api/agents/:id', async () => {
      const mockAgent = { id: 'agent-1', name: 'My Agent' }
      mockGet.mockResolvedValue(mockAgent)

      const result = await agentApi.getById('agent-1')

      expect(mockGet).toHaveBeenCalledWith('/api/agents/agent-1')
      expect(result).toBe(mockAgent)
    })
  })

  // ========================================================================
  // create
  // ========================================================================

  describe('create', () => {
    it('calls POST /api/agents with correct payload', async () => {
      const createData = { name: 'New Agent', mode: 'agent' as const }
      const mockResponse = { id: 'agent-new', name: 'New Agent' }
      mockPost.mockResolvedValue(mockResponse)

      const result = await agentApi.create(createData)

      expect(mockPost).toHaveBeenCalledWith('/api/agents', createData)
      expect(result).toBe(mockResponse)
    })

    it('passes optional template_id and description', async () => {
      const createData = {
        name: 'From Template',
        mode: 'pipeline' as const,
        template_id: 'tmpl-1',
        description: 'test desc',
      }
      mockPost.mockResolvedValue({ id: 'agent-2' })

      await agentApi.create(createData)

      expect(mockPost).toHaveBeenCalledWith('/api/agents', createData)
    })
  })

  // ========================================================================
  // update
  // ========================================================================

  describe('update', () => {
    it('calls PUT /api/agents/:id with update payload', async () => {
      const updateData = { name: 'Renamed', status: 'published' as const }
      mockPut.mockResolvedValue({ id: 'agent-1', name: 'Renamed' })

      const result = await agentApi.update('agent-1', updateData)

      expect(mockPut).toHaveBeenCalledWith('/api/agents/agent-1', updateData)
      expect(result).toEqual({ id: 'agent-1', name: 'Renamed' })
    })
  })

  // ========================================================================
  // delete
  // ========================================================================

  describe('delete', () => {
    it('calls DELETE /api/agents/:id', async () => {
      mockDelete.mockResolvedValue(undefined)

      await agentApi.delete('agent-1')

      expect(mockDelete).toHaveBeenCalledWith('/api/agents/agent-1')
    })
  })

  // ========================================================================
  // duplicate
  // ========================================================================

  describe('duplicate', () => {
    it('calls POST /api/agents/:id/duplicate', async () => {
      mockPost.mockResolvedValue({ id: 'agent-dup' })

      const result = await agentApi.duplicate('agent-1')

      expect(mockPost).toHaveBeenCalledWith('/api/agents/agent-1/duplicate')
      expect(result).toEqual({ id: 'agent-dup' })
    })
  })

  // ========================================================================
  // exportJson
  // ========================================================================

  describe('exportJson', () => {
    it('calls GET /api/agents/:id/export', async () => {
      const mockAgent = { id: 'agent-1', dsl: {} }
      mockGet.mockResolvedValue(mockAgent)

      const result = await agentApi.exportJson('agent-1')

      expect(mockGet).toHaveBeenCalledWith('/api/agents/agent-1/export')
      expect(result).toBe(mockAgent)
    })
  })

  // ========================================================================
  // Versioning
  // ========================================================================

  describe('versioning', () => {
    it('saveVersion calls POST /api/agents/:id/versions', async () => {
      mockPost.mockResolvedValue({ version_number: 2 })

      const result = await agentApi.saveVersion('agent-1', { version_label: 'v2' })

      expect(mockPost).toHaveBeenCalledWith('/api/agents/agent-1/versions', { version_label: 'v2' })
      expect(result).toEqual({ version_number: 2 })
    })

    it('listVersions calls GET /api/agents/:id/versions', async () => {
      mockGet.mockResolvedValue([{ id: 'v-1' }])

      const result = await agentApi.listVersions('agent-1')

      expect(mockGet).toHaveBeenCalledWith('/api/agents/agent-1/versions')
      expect(result).toEqual([{ id: 'v-1' }])
    })

    it('restoreVersion calls POST /api/agents/:id/versions/:versionId/restore', async () => {
      mockPost.mockResolvedValue({ id: 'agent-1' })

      await agentApi.restoreVersion('agent-1', 'v-1')

      expect(mockPost).toHaveBeenCalledWith('/api/agents/agent-1/versions/v-1/restore')
    })

    it('deleteVersion calls DELETE /api/agents/:id/versions/:versionId', async () => {
      mockDelete.mockResolvedValue(undefined)

      await agentApi.deleteVersion('agent-1', 'v-1')

      expect(mockDelete).toHaveBeenCalledWith('/api/agents/agent-1/versions/v-1')
    })
  })

  // ========================================================================
  // Templates
  // ========================================================================

  describe('listTemplates', () => {
    it('calls GET /api/agents/templates', async () => {
      const mockTemplates = [{ id: 'tmpl-1', name: 'RAG Pipeline' }]
      mockGet.mockResolvedValue(mockTemplates)

      const result = await agentApi.listTemplates()

      expect(mockGet).toHaveBeenCalledWith('/api/agents/templates')
      expect(result).toBe(mockTemplates)
    })
  })

  // ========================================================================
  // Runs
  // ========================================================================

  describe('listRuns', () => {
    it('calls GET /api/agents/:agentId/runs', async () => {
      const mockRuns = [{ id: 'run-1', status: 'completed' }]
      mockGet.mockResolvedValue(mockRuns)

      const result = await agentApi.listRuns('agent-1')

      expect(mockGet).toHaveBeenCalledWith('/api/agents/agent-1/runs')
      expect(result).toBe(mockRuns)
    })
  })

  // ========================================================================
  // Error handling
  // ========================================================================

  describe('error handling', () => {
    it('propagates API errors from list()', async () => {
      mockGet.mockRejectedValue(new Error('Network error'))

      await expect(agentApi.list()).rejects.toThrow('Network error')
    })

    it('propagates API errors from create()', async () => {
      mockPost.mockRejectedValue(new Error('Validation failed'))

      await expect(agentApi.create({ name: '', mode: 'agent' })).rejects.toThrow('Validation failed')
    })

    it('propagates API errors from delete()', async () => {
      mockDelete.mockRejectedValue(new Error('Not found'))

      await expect(agentApi.delete('nonexistent')).rejects.toThrow('Not found')
    })
  })
})
