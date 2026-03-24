/**
 * @fileoverview Tests for Dataset Access HTTP endpoints.
 *
 * Validates request handling, RBAC enforcement, and proper HTTP status codes
 * for dataset access management routes using the JSONB access_control field.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createMockRequest, createMockResponse } from '../setup'

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted so variables are available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockRagService,
  mockRagSearchService,
  mockRagDocumentService,
  mockRagRedisService,
  mockRagStorageService,
} = vi.hoisted(() => ({
  mockRagService: {
    getAvailableDatasets: vi.fn(),
    getDatasetById: vi.fn(),
    createDataset: vi.fn(),
    updateDataset: vi.fn(),
    deleteDataset: vi.fn(),
  },
  mockRagSearchService: {
    search: vi.fn(),
    listChunks: vi.fn(),
  },
  mockRagDocumentService: {
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
  },
  mockRagRedisService: {
    queueParseInit: vi.fn(),
    queueAdvancedTask: vi.fn(),
    queueEnrichmentTask: vi.fn(),
  },
  mockRagStorageService: {
    getFile: vi.fn(),
    putFile: vi.fn(),
    buildStoragePath: vi.fn(),
    getFileType: vi.fn(),
    getContentType: vi.fn(),
  },
}))

vi.mock('../../src/modules/rag/services/rag.service.js', () => ({ ragService: mockRagService }))
vi.mock('../../src/modules/rag/services/rag-search.service.js', () => ({ ragSearchService: mockRagSearchService }))
vi.mock('../../src/modules/rag/services/rag-document.service.js', () => ({ ragDocumentService: mockRagDocumentService }))
vi.mock('../../src/modules/rag/services/rag-redis.service.js', () => ({
  ragRedisService: mockRagRedisService,
  getUuid: vi.fn().mockReturnValue('aabbccdd11223344aabbccdd11223344'),
}))
vi.mock('@/shared/utils/uuid.js', () => {
  const { z } = require('zod')
  const re = /^[0-9a-f]{32}$/
  return {
    getUuid: vi.fn().mockReturnValue('aabbccdd11223344aabbccdd11223344'),
    hexId: z.string().regex(re, 'Invalid ID format (expected 32-char hex)'),
    hexIdWith: (msg: string) => z.string().regex(re, msg),
  }
})
vi.mock('../../src/modules/rag/services/rag-storage.service.js', () => ({ ragStorageService: mockRagStorageService }))
vi.mock('../../src/shared/services/redis.service.js', () => ({ getRedisClient: vi.fn() }))
vi.mock('../../src/shared/utils/ip.js', () => ({ getClientIp: vi.fn().mockReturnValue('127.0.0.1') }))

import { RagController } from '../../src/modules/rag/controllers/rag.controller'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dataset Access Routes', () => {
  let controller: RagController
  let res: ReturnType<typeof createMockResponse>

  beforeEach(() => {
    controller = new RagController()
    res = createMockResponse()
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // GET /api/rag/datasets/:id/access
  // -----------------------------------------------------------------------

  describe('GET /api/rag/datasets/:id/access', () => {
    it('admin gets 200 with dataset access_control', async () => {
      const dataset = {
        id: 'ds1',
        name: 'Test',
        status: 'active',
        access_control: JSON.stringify({ public: false, user_ids: ['u1'], team_ids: ['t1'] }),
      }
      mockRagService.getDatasetById.mockResolvedValue(dataset)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'ds1' },
      })
      await controller.getDataset(req, res)

      expect(res.json).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalledWith(403)
    })

    it('returns 404 when dataset does not exist', async () => {
      mockRagService.getDatasetById.mockResolvedValue(undefined)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'nonexistent' },
      })
      await controller.getDataset(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 404 when dataset is deleted', async () => {
      mockRagService.getDatasetById.mockResolvedValue({ id: 'ds1', status: 'deleted' })

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'ds1' },
      })
      await controller.getDataset(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns dataset with access_control as JSON', async () => {
      const acl = { public: true, user_ids: [], team_ids: [] }
      const dataset = { id: 'ds1', name: 'Public DS', status: 'active', access_control: JSON.stringify(acl) }
      mockRagService.getDatasetById.mockResolvedValue(dataset)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'ds1' },
      })
      await controller.getDataset(req, res)

      const returnedData = res.json.mock.calls[0][0]
      expect(returnedData.access_control).toBeDefined()
    })
  })

  // -----------------------------------------------------------------------
  // PUT /api/rag/datasets/:id/access (via updateDataset)
  // -----------------------------------------------------------------------

  describe('PUT /api/rag/datasets/:id/access', () => {
    it('admin can update access_control for a dataset', async () => {
      const updatedAcl = { public: false, user_ids: ['u2'], team_ids: ['t1'] }
      const updated = { id: 'ds1', name: 'DS1', access_control: JSON.stringify(updatedAcl) }
      mockRagService.updateDataset.mockResolvedValue(updated)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin', email: 'admin@e.com' },
        params: { id: 'ds1' },
        body: { access_control: updatedAcl },
      })
      await controller.updateDataset(req, res)

      expect(mockRagService.updateDataset).toHaveBeenCalled()
      expect(res.json).toHaveBeenCalled()
    })

    it('returns 404 when user is not authenticated and dataset not found', async () => {
      // Controller proceeds with user=undefined; service returns undefined (no mock set)
      mockRagService.updateDataset.mockResolvedValue(undefined)

      const req = createMockRequest({
        user: undefined,
        params: { id: 'ds1' },
        body: { access_control: { public: true } },
      })
      await controller.updateDataset(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 500 on service error', async () => {
      mockRagService.updateDataset.mockRejectedValue(new Error('DB failure'))

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin', email: 'admin@e.com' },
        params: { id: 'ds1' },
        body: { access_control: { public: true } },
      })
      await controller.updateDataset(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })

    it('can set dataset to public via access_control update', async () => {
      const updatedAcl = { public: true }
      const updated = { id: 'ds1', access_control: JSON.stringify(updatedAcl) }
      mockRagService.updateDataset.mockResolvedValue(updated)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin', email: 'admin@e.com' },
        params: { id: 'ds1' },
        body: { access_control: updatedAcl },
      })
      await controller.updateDataset(req, res)

      expect(res.json).toHaveBeenCalled()
    })

    it('can clear all access by setting empty arrays', async () => {
      const clearedAcl = { public: false, user_ids: [], team_ids: [] }
      const updated = { id: 'ds1', access_control: JSON.stringify(clearedAcl) }
      mockRagService.updateDataset.mockResolvedValue(updated)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin', email: 'admin@e.com' },
        params: { id: 'ds1' },
        body: { access_control: clearedAcl },
      })
      await controller.updateDataset(req, res)

      expect(res.json).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // GET /api/rag/datasets - user only sees accessible datasets
  // -----------------------------------------------------------------------

  describe('GET /api/rag/datasets', () => {
    it('user only sees datasets they have access to', async () => {
      const userDatasets = [
        { id: 'ds1', name: 'Public', access_control: JSON.stringify({ public: true }) },
        { id: 'ds2', name: 'My DS', created_by: 'user-1', access_control: JSON.stringify({ public: false }) },
      ]
      mockRagService.getAvailableDatasets.mockResolvedValue(userDatasets)

      const req = createMockRequest({
        user: { id: 'user-1', role: 'user' },
      })
      await controller.listDatasets(req, res)

      expect(mockRagService.getAvailableDatasets).toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledWith(userDatasets)
    })

    it('admin sees all datasets', async () => {
      const allDatasets = [
        { id: 'ds1', name: 'DS1', created_by: 'user-1' },
        { id: 'ds2', name: 'DS2', created_by: 'user-2' },
        { id: 'ds3', name: 'DS3', created_by: 'admin-1' },
      ]
      mockRagService.getAvailableDatasets.mockResolvedValue(allDatasets)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
      })
      await controller.listDatasets(req, res)

      expect(res.json).toHaveBeenCalledWith(allDatasets)
    })

    it('returns 500 on service error', async () => {
      mockRagService.getAvailableDatasets.mockRejectedValue(new Error('fail'))

      const req = createMockRequest({
        user: { id: 'user-1', role: 'user' },
      })
      await controller.listDatasets(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  // -----------------------------------------------------------------------
  // Validation errors
  // -----------------------------------------------------------------------

  describe('Validation errors', () => {
    it('returns 400 when dataset ID is missing for delete', async () => {
      const req = createMockRequest({ params: {} })
      await controller.deleteDataset(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 409 when creating dataset with duplicate name', async () => {
      mockRagService.createDataset.mockRejectedValue(new Error('already exists'))

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin', email: 'admin@e.com' },
        body: { name: 'Existing DS' },
      })
      await controller.createDataset(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
    })
  })
})
