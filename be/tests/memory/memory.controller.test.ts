/**
 * @fileoverview Unit tests for MemoryController.
 *
 * Tests HTTP status codes, request delegation to services, error forwarding,
 * and tenant/user extraction for all memory pool and message endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, createMockResponse } from '../setup.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMemoryService = vi.hoisted(() => ({
  createPool: vi.fn(),
  listPools: vi.fn(),
  getPool: vi.fn(),
  updatePool: vi.fn(),
  deletePool: vi.fn(),
}))

const mockMemoryMessageService = vi.hoisted(() => ({
  listMessages: vi.fn(),
  deleteMessage: vi.fn(),
  searchMemory: vi.fn(),
  updateMessageStatus: vi.fn(),
  ensureIndex: vi.fn(),
  insertMessage: vi.fn(),
}))

const mockMemoryExtractionService = vi.hoisted(() => ({
  importChatHistory: vi.fn(),
}))

vi.mock('../../src/modules/memory/services/memory.service.js', () => ({
  memoryService: mockMemoryService,
}))

vi.mock('../../src/modules/memory/services/memory-message.service.js', () => ({
  memoryMessageService: mockMemoryMessageService,
}))

vi.mock('../../src/modules/memory/services/memory-extraction.service.js', () => ({
  memoryExtractionService: mockMemoryExtractionService,
}))

vi.mock('../../src/shared/middleware/tenant.middleware.js', () => ({
  getTenantId: (req: any) => req._tenantId ?? 'tenant-1',
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockGetUuid = vi.hoisted(() => vi.fn(() => 'aabbccdd11223344aabbccdd11223344'))

vi.mock('@/shared/utils/uuid.js', () => {
  const { z } = require('zod')
  const re = /^[0-9a-f]{32}$/
  return {
    getUuid: mockGetUuid,
    hexId: z.string().regex(re, 'Invalid ID format (expected 32-char hex)'),
    hexIdWith: (msg: string) => z.string().regex(re, msg),
  }
})

import { memoryController } from '../../src/modules/memory/controllers/memory.controller.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock memory pool record
 */
function buildPool(overrides: Partial<any> = {}): any {
  return {
    id: 'pool-1',
    name: 'Test Pool',
    tenant_id: 'tenant-1',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemoryController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-establish uuid mock after clearAllMocks resets implementations
    mockGetUuid.mockReturnValue('aabbccdd11223344aabbccdd11223344')
  })

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  describe('create', () => {
    it('returns 201 with created pool', async () => {
      const pool = buildPool()
      mockMemoryService.createPool.mockResolvedValue(pool)

      const req = createMockRequest({
        body: { name: 'Test Pool' },
        user: { id: 'user-1' },
      })
      const res = createMockResponse()

      await memoryController.create(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(pool)
      expect(mockMemoryService.createPool).toHaveBeenCalledWith(
        { name: 'Test Pool' },
        'user-1',
        'tenant-1',
      )
    })

    it('returns error status on service failure', async () => {
      const error = new Error('DB error') as any
      error.statusCode = 500
      mockMemoryService.createPool.mockRejectedValue(error)

      const req = createMockRequest({ body: { name: 'Test' }, user: { id: 'u1' } })
      const res = createMockResponse()

      await memoryController.create(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: 'DB error' })
    })
  })

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------

  describe('list', () => {
    it('returns 200 with pool list', async () => {
      const pools = [buildPool()]
      mockMemoryService.listPools.mockResolvedValue(pools)

      const req = createMockRequest({ user: { id: 'user-1' } })
      const res = createMockResponse()

      await memoryController.list(req, res)

      expect(res.json).toHaveBeenCalledWith(pools)
      expect(mockMemoryService.listPools).toHaveBeenCalledWith('tenant-1', 'user-1')
    })

    it('returns 500 on service failure', async () => {
      mockMemoryService.listPools.mockRejectedValue(new Error('fail'))

      const req = createMockRequest({ user: { id: 'u1' } })
      const res = createMockResponse()

      await memoryController.list(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to list memory pools' })
    })
  })

  // -----------------------------------------------------------------------
  // getById
  // -----------------------------------------------------------------------

  describe('getById', () => {
    it('returns 200 with pool when found', async () => {
      const pool = buildPool()
      mockMemoryService.getPool.mockResolvedValue(pool)

      const req = createMockRequest({ params: { id: 'pool-1' } })
      const res = createMockResponse()

      await memoryController.getById(req, res)

      expect(res.json).toHaveBeenCalledWith(pool)
    })

    it('returns 404 when pool not found', async () => {
      mockMemoryService.getPool.mockResolvedValue(null)

      const req = createMockRequest({ params: { id: 'missing' } })
      const res = createMockResponse()

      await memoryController.getById(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({ error: 'Memory pool not found' })
    })

    it('returns error status on service failure', async () => {
      const error = new Error('Service error') as any
      error.statusCode = 403
      mockMemoryService.getPool.mockRejectedValue(error)

      const req = createMockRequest({ params: { id: 'pool-1' } })
      const res = createMockResponse()

      await memoryController.getById(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
    })
  })

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------

  describe('update', () => {
    it('returns 200 with updated pool', async () => {
      const updated = buildPool({ name: 'Updated' })
      mockMemoryService.updatePool.mockResolvedValue(updated)

      const req = createMockRequest({
        params: { id: 'pool-1' },
        body: { name: 'Updated' },
      })
      const res = createMockResponse()

      await memoryController.update(req, res)

      expect(res.json).toHaveBeenCalledWith(updated)
      expect(mockMemoryService.updatePool).toHaveBeenCalledWith('pool-1', { name: 'Updated' }, 'tenant-1')
    })

    it('returns 404 when pool not found for update', async () => {
      const error = new Error('Memory pool not found') as any
      error.statusCode = 404
      mockMemoryService.updatePool.mockRejectedValue(error)

      const req = createMockRequest({ params: { id: 'missing' }, body: { name: 'X' } })
      const res = createMockResponse()

      await memoryController.update(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })
  })

  // -----------------------------------------------------------------------
  // remove
  // -----------------------------------------------------------------------

  describe('remove', () => {
    it('returns 204 on successful deletion', async () => {
      mockMemoryService.deletePool.mockResolvedValue(undefined)

      const req = createMockRequest({ params: { id: 'pool-1' } })
      const res = createMockResponse()

      await memoryController.remove(req, res)

      expect(res.status).toHaveBeenCalledWith(204)
      expect(res.send).toHaveBeenCalled()
    })

    it('returns 404 when pool not found for deletion', async () => {
      const error = new Error('Memory pool not found') as any
      error.statusCode = 404
      mockMemoryService.deletePool.mockRejectedValue(error)

      const req = createMockRequest({ params: { id: 'missing' } })
      const res = createMockResponse()

      await memoryController.remove(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })
  })

  // -----------------------------------------------------------------------
  // listMessages
  // -----------------------------------------------------------------------

  describe('listMessages', () => {
    it('returns 200 with paginated messages', async () => {
      const result = { items: [{ message_id: 'msg-1' }], total: 1 }
      mockMemoryMessageService.listMessages.mockResolvedValue(result)

      const req = createMockRequest({
        params: { id: 'pool-1' },
        query: { page: '1', page_size: '20' },
      })
      const res = createMockResponse()

      await memoryController.listMessages(req, res)

      expect(res.json).toHaveBeenCalledWith(result)
      expect(mockMemoryMessageService.listMessages).toHaveBeenCalledWith(
        'tenant-1', 'pool-1', 1, 20, undefined, undefined,
      )
    })

    it('passes keyword and message_type filters', async () => {
      mockMemoryMessageService.listMessages.mockResolvedValue({ items: [], total: 0 })

      const req = createMockRequest({
        params: { id: 'pool-1' },
        query: { page: '1', page_size: '10', keyword: 'test', message_type: '2' },
      })
      const res = createMockResponse()

      await memoryController.listMessages(req, res)

      expect(mockMemoryMessageService.listMessages).toHaveBeenCalledWith(
        'tenant-1', 'pool-1', 1, 10, 'test', 2,
      )
    })

    it('returns 500 on service failure', async () => {
      mockMemoryMessageService.listMessages.mockRejectedValue(new Error('OS error'))

      const req = createMockRequest({ params: { id: 'pool-1' }, query: {} })
      const res = createMockResponse()

      await memoryController.listMessages(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  // -----------------------------------------------------------------------
  // deleteMessage
  // -----------------------------------------------------------------------

  describe('deleteMessage', () => {
    it('returns 204 on successful message deletion', async () => {
      mockMemoryMessageService.deleteMessage.mockResolvedValue(undefined)

      const req = createMockRequest({ params: { id: 'pool-1', messageId: 'msg-1' } })
      const res = createMockResponse()

      await memoryController.deleteMessage(req, res)

      expect(res.status).toHaveBeenCalledWith(204)
      expect(mockMemoryMessageService.deleteMessage).toHaveBeenCalledWith('tenant-1', 'msg-1')
    })

    it('returns error status on failure', async () => {
      const error = new Error('Not found') as any
      error.statusCode = 404
      mockMemoryMessageService.deleteMessage.mockRejectedValue(error)

      const req = createMockRequest({ params: { id: 'pool-1', messageId: 'missing' } })
      const res = createMockResponse()

      await memoryController.deleteMessage(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })
  })

  // -----------------------------------------------------------------------
  // searchMessages
  // -----------------------------------------------------------------------

  describe('searchMessages', () => {
    it('returns 200 with search results', async () => {
      const results = [{ id: 'msg-1', content: 'found', score: 0.9 }]
      mockMemoryMessageService.searchMemory.mockResolvedValue(results)

      const req = createMockRequest({
        params: { id: 'pool-1' },
        body: { query: 'test query', top_k: 5 },
      })
      const res = createMockResponse()

      await memoryController.searchMessages(req, res)

      expect(res.json).toHaveBeenCalledWith(results)
      expect(mockMemoryMessageService.searchMemory).toHaveBeenCalledWith(
        'tenant-1', 'pool-1', 'test query', [], 5,
      )
    })

    it('uses default top_k of 10 when not provided', async () => {
      mockMemoryMessageService.searchMemory.mockResolvedValue([])

      const req = createMockRequest({
        params: { id: 'pool-1' },
        body: { query: 'test' },
      })
      const res = createMockResponse()

      await memoryController.searchMessages(req, res)

      expect(mockMemoryMessageService.searchMemory).toHaveBeenCalledWith(
        'tenant-1', 'pool-1', 'test', [], 10,
      )
    })

    it('returns 500 on failure', async () => {
      mockMemoryMessageService.searchMemory.mockRejectedValue(new Error('Search error'))

      const req = createMockRequest({
        params: { id: 'pool-1' },
        body: { query: 'test' },
      })
      const res = createMockResponse()

      await memoryController.searchMessages(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  // -----------------------------------------------------------------------
  // forgetMessage
  // -----------------------------------------------------------------------

  describe('forgetMessage', () => {
    it('returns 200 with success message on forget', async () => {
      mockMemoryMessageService.updateMessageStatus.mockResolvedValue(undefined)

      const req = createMockRequest({ params: { id: 'pool-1', messageId: 'msg-1' } })
      const res = createMockResponse()

      await memoryController.forgetMessage(req, res)

      expect(res.json).toHaveBeenCalledWith({ message: 'Message forgotten' })
      expect(mockMemoryMessageService.updateMessageStatus).toHaveBeenCalledWith(
        'tenant-1', 'msg-1', 0,
      )
    })

    it('returns error status on failure', async () => {
      const error = new Error('OS error') as any
      error.statusCode = 500
      mockMemoryMessageService.updateMessageStatus.mockRejectedValue(error)

      const req = createMockRequest({ params: { id: 'pool-1', messageId: 'msg-1' } })
      const res = createMockResponse()

      await memoryController.forgetMessage(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  // -----------------------------------------------------------------------
  // importHistory
  // -----------------------------------------------------------------------

  describe('importHistory', () => {
    it('returns 200 with import count', async () => {
      mockMemoryExtractionService.importChatHistory.mockResolvedValue({ imported: 5 })

      const req = createMockRequest({
        params: { id: 'pool-1' },
        body: { session_id: 'session-1' },
        user: { id: 'user-1' },
      })
      const res = createMockResponse()

      await memoryController.importHistory(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ imported: 5 })
      expect(mockMemoryExtractionService.importChatHistory).toHaveBeenCalledWith(
        'pool-1', 'session-1', 'user-1', 'tenant-1',
      )
    })

    it('returns error status on failure', async () => {
      const error = new Error('Import failed') as any
      error.statusCode = 500
      mockMemoryExtractionService.importChatHistory.mockRejectedValue(error)

      const req = createMockRequest({
        params: { id: 'pool-1' },
        body: { session_id: 'session-1' },
        user: { id: 'u1' },
      })
      const res = createMockResponse()

      await memoryController.importHistory(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  // -----------------------------------------------------------------------
  // addMessage
  // -----------------------------------------------------------------------

  describe('addMessage', () => {
    it('returns 201 with message_id on successful insert', async () => {
      mockMemoryMessageService.ensureIndex.mockResolvedValue(undefined)
      mockMemoryMessageService.insertMessage.mockResolvedValue(undefined)

      const req = createMockRequest({
        params: { id: 'pool-1' },
        body: { content: 'Direct message', message_type: 2 },
      })
      const res = createMockResponse()

      await memoryController.addMessage(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith({ message_id: 'aabbccdd11223344aabbccdd11223344' })
      expect(mockMemoryMessageService.ensureIndex).toHaveBeenCalledWith('tenant-1')
      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          message_id: 'aabbccdd11223344aabbccdd11223344',
          memory_id: 'pool-1',
          content: 'Direct message',
          message_type: 2,
          status: 1,
        }),
      )
    })

    it('defaults message_type to 1 (RAW) when not provided', async () => {
      mockMemoryMessageService.ensureIndex.mockResolvedValue(undefined)
      mockMemoryMessageService.insertMessage.mockResolvedValue(undefined)

      const req = createMockRequest({
        params: { id: 'pool-1' },
        body: { content: 'Raw content' },
      })
      const res = createMockResponse()

      await memoryController.addMessage(req, res)

      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ message_type: 1 }),
      )
    })

    it('returns error status on failure', async () => {
      mockMemoryMessageService.ensureIndex.mockRejectedValue(new Error('Index error'))

      const req = createMockRequest({
        params: { id: 'pool-1' },
        body: { content: 'Test' },
      })
      const res = createMockResponse()

      await memoryController.addMessage(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  // -----------------------------------------------------------------------
  // Tenant isolation
  // -----------------------------------------------------------------------

  describe('tenant isolation', () => {
    it('extracts tenant ID from request for all operations', async () => {
      mockMemoryService.listPools.mockResolvedValue([])

      const req = createMockRequest({
        _tenantId: 'custom-tenant',
        user: { id: 'user-1' },
      })
      const res = createMockResponse()

      await memoryController.list(req, res)

      expect(mockMemoryService.listPools).toHaveBeenCalledWith('custom-tenant', 'user-1')
    })

    it('falls back to empty string when no tenant or user', async () => {
      mockMemoryService.createPool.mockResolvedValue(buildPool())

      const req = createMockRequest({ body: { name: 'Test' } })
      const res = createMockResponse()

      await memoryController.create(req, res)

      // userId defaults to '' when req.user is undefined
      expect(mockMemoryService.createPool).toHaveBeenCalledWith(
        { name: 'Test' },
        '',
        'tenant-1',
      )
    })
  })
})
