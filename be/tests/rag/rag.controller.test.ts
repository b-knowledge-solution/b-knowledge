/**
 * @fileoverview Tests for RagController.
 *
 * Covers dataset CRUD routes, search endpoint, auth validation,
 * and proper HTTP status codes / error handling.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createMockRequest, createMockResponse } from '../setup'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRagService = {
  getAvailableDatasets: vi.fn(),
  getDatasetById: vi.fn(),
  createDataset: vi.fn(),
  updateDataset: vi.fn(),
  deleteDataset: vi.fn(),
}

const mockRagSearchService = {
  search: vi.fn(),
  listChunks: vi.fn(),
}

const mockRagDocumentService = {
  listDocuments: vi.fn(),
  createKnowledgebase: vi.fn(),
  updateKnowledgebase: vi.fn(),
  deleteKnowledgebase: vi.fn(),
  getKnowledgebase: vi.fn(),
  getDocument: vi.fn(),
  beginParse: vi.fn(),
  softDeleteDocument: vi.fn(),
  isAdvancedTaskRunning: vi.fn(),
  getDatasetDocuments: vi.fn(),
  createTask: vi.fn(),
  getAdvancedTaskStatus: vi.fn(),
  getTaskStatus: vi.fn(),
  createFile: vi.fn(),
  createDocument: vi.fn(),
  createFile2Document: vi.fn(),
  incrementDocCount: vi.fn(),
}

const mockRagRedisService = {
  queueParseInit: vi.fn(),
  queueAdvancedTask: vi.fn(),
  queueEnrichmentTask: vi.fn(),
}

const mockRagStorageService = {
  getFile: vi.fn(),
  putFile: vi.fn(),
  buildStoragePath: vi.fn(),
  getFileType: vi.fn(),
  getContentType: vi.fn(),
}

vi.mock('../../src/modules/rag/services/rag.service.js', () => ({ ragService: mockRagService }))
vi.mock('../../src/modules/rag/services/rag-search.service.js', () => ({ ragSearchService: mockRagSearchService }))
vi.mock('../../src/modules/rag/services/rag-document.service.js', () => ({ ragDocumentService: mockRagDocumentService }))
vi.mock('../../src/modules/rag/services/rag-redis.service.js', () => ({
  ragRedisService: mockRagRedisService,
  getUuid: vi.fn().mockReturnValue('mock-uuid'),
}))
vi.mock('../../src/modules/rag/services/rag-storage.service.js', () => ({ ragStorageService: mockRagStorageService }))
vi.mock('../../src/shared/services/redis.service.js', () => ({ getRedisClient: vi.fn() }))
vi.mock('../../src/shared/utils/ip.js', () => ({ getClientIp: vi.fn().mockReturnValue('127.0.0.1') }))

import { RagController } from '../../src/modules/rag/controllers/rag.controller'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RagController', () => {
  let controller: RagController
  let res: ReturnType<typeof createMockResponse>

  beforeEach(() => {
    controller = new RagController()
    res = createMockResponse()
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // listDatasets
  // -----------------------------------------------------------------------

  describe('listDatasets', () => {
    it('returns datasets', async () => {
      const datasets = [{ id: 'd1', name: 'DS1' }]
      mockRagService.getAvailableDatasets.mockResolvedValue(datasets)

      const req = createMockRequest({ user: { id: 'u1' } })
      await controller.listDatasets(req, res)

      expect(res.json).toHaveBeenCalledWith(datasets)
    })

    it('returns 500 on error', async () => {
      mockRagService.getAvailableDatasets.mockRejectedValue(new Error('fail'))

      const req = createMockRequest({ user: { id: 'u1' } })
      await controller.listDatasets(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  // -----------------------------------------------------------------------
  // getDataset
  // -----------------------------------------------------------------------

  describe('getDataset', () => {
    it('returns dataset when found', async () => {
      const dataset = { id: 'd1', name: 'DS', status: 'active' }
      mockRagService.getDatasetById.mockResolvedValue(dataset)

      const req = createMockRequest({ params: { id: 'd1' } })
      await controller.getDataset(req, res)

      expect(res.json).toHaveBeenCalledWith(dataset)
    })

    it('returns 404 when not found', async () => {
      mockRagService.getDatasetById.mockResolvedValue(undefined)

      const req = createMockRequest({ params: { id: 'bad' } })
      await controller.getDataset(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 404 when dataset is deleted', async () => {
      mockRagService.getDatasetById.mockResolvedValue({ id: 'd1', status: 'deleted' })

      const req = createMockRequest({ params: { id: 'd1' } })
      await controller.getDataset(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })
  })

  // -----------------------------------------------------------------------
  // createDataset
  // -----------------------------------------------------------------------

  describe('createDataset', () => {
    it('returns 201 on success', async () => {
      const created = { id: 'new1', name: 'New' }
      mockRagService.createDataset.mockResolvedValue(created)
      mockRagDocumentService.createKnowledgebase.mockResolvedValue({})

      const req = createMockRequest({
        user: { id: 'u1', email: 'u@e.com' },
        body: { name: 'New' },
      })
      await controller.createDataset(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(created)
    })

    it('returns 409 when duplicate name', async () => {
      mockRagService.createDataset.mockRejectedValue(new Error('already exists'))

      const req = createMockRequest({
        user: { id: 'u1', email: 'u@e.com' },
        body: { name: 'Dup' },
      })
      await controller.createDataset(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
    })
  })

  // -----------------------------------------------------------------------
  // searchChunks
  // -----------------------------------------------------------------------

  describe('searchChunks', () => {
    it('returns search results', async () => {
      const searchResult = { chunks: [{ chunk_id: 'c1' }], total: 1 }
      mockRagSearchService.search.mockResolvedValue(searchResult)

      const req = createMockRequest({
        params: { id: 'ds1' },
        body: { query: 'test', method: 'full_text' },
      })
      await controller.searchChunks(req, res)

      expect(res.json).toHaveBeenCalledWith(searchResult)
    })

    it('returns 400 when dataset ID missing', async () => {
      const req = createMockRequest({ params: {}, body: { query: 'q' } })
      await controller.searchChunks(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 500 on search error', async () => {
      mockRagSearchService.search.mockRejectedValue(new Error('OS down'))

      const req = createMockRequest({ params: { id: 'ds1' }, body: { query: 'q' } })
      await controller.searchChunks(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  // -----------------------------------------------------------------------
  // listChunks
  // -----------------------------------------------------------------------

  describe('listChunks', () => {
    it('returns paginated chunks', async () => {
      const result = { chunks: [], total: 0, page: 1, limit: 20 }
      mockRagSearchService.listChunks.mockResolvedValue(result)

      const req = createMockRequest({ params: { id: 'ds1' }, query: {} })
      await controller.listChunks(req, res)

      expect(res.json).toHaveBeenCalledWith(result)
    })

    it('passes query params to service', async () => {
      mockRagSearchService.listChunks.mockResolvedValue({ chunks: [], total: 0, page: 2, limit: 10 })

      const req = createMockRequest({
        params: { id: 'ds1' },
        query: { doc_id: 'doc1', page: '2', limit: '10' },
      })
      await controller.listChunks(req, res)

      expect(mockRagSearchService.listChunks).toHaveBeenCalledWith('ds1', {
        doc_id: 'doc1',
        page: 2,
        limit: 10,
      })
    })
  })

  // -----------------------------------------------------------------------
  // deleteDataset
  // -----------------------------------------------------------------------

  describe('deleteDataset', () => {
    it('returns 204 on success', async () => {
      mockRagService.deleteDataset.mockResolvedValue(undefined)
      mockRagDocumentService.deleteKnowledgebase.mockResolvedValue(undefined)

      const req = createMockRequest({
        user: { id: 'u1', email: 'u@e.com' },
        params: { id: 'd1' },
      })
      await controller.deleteDataset(req, res)

      expect(res.status).toHaveBeenCalledWith(204)
    })

    it('returns 400 when ID missing', async () => {
      const req = createMockRequest({ params: {} })
      await controller.deleteDataset(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })
})
