/**
 * @fileoverview Unit tests for MemoryMessageService.
 *
 * Tests OpenSearch operations: ensureIndex (caching), insertMessage (with FIFO),
 * searchMemory (hybrid text+vector), listMessages (pagination/filters),
 * deleteMessage, deleteAllByMemory, updateMessageStatus (forget/restore),
 * and enforceFifo (oldest deletion when over limit).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockOsClient = vi.hoisted(() => ({
  indices: {
    exists: vi.fn(),
    create: vi.fn(),
  },
  index: vi.fn(),
  search: vi.fn(),
  count: vi.fn(),
  delete: vi.fn(),
  deleteByQuery: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@opensearch-project/opensearch', () => ({
  Client: vi.fn(() => mockOsClient),
}))

const mockMemoryModel = vi.hoisted(() => ({
  findById: vi.fn(),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    memory: mockMemoryModel,
  },
}))

vi.mock('../../src/shared/config/index.js', () => ({
  config: {
    opensearch: {
      host: 'http://localhost:9201',
      password: 'admin',
    },
  },
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { memoryMessageService } from '../../src/modules/memory/services/memory-message.service.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemoryMessageService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the internal indexCache by calling a method that doesn't use it
    // The service is a singleton, so we need to ensure clean state
  })

  // -----------------------------------------------------------------------
  // ensureIndex
  // -----------------------------------------------------------------------

  describe('ensureIndex', () => {
    it('creates index when it does not exist', async () => {
      mockOsClient.indices.exists.mockResolvedValue({ body: false })
      mockOsClient.indices.create.mockResolvedValue({ body: {} })

      await memoryMessageService.ensureIndex('new-tenant')

      expect(mockOsClient.indices.exists).toHaveBeenCalledWith({ index: 'memory_new-tenant' })
      expect(mockOsClient.indices.create).toHaveBeenCalledWith(
        expect.objectContaining({ index: 'memory_new-tenant' }),
      )
    })

    it('skips creation when index already exists', async () => {
      mockOsClient.indices.exists.mockResolvedValue({ body: true })

      await memoryMessageService.ensureIndex('existing-tenant')

      expect(mockOsClient.indices.create).not.toHaveBeenCalled()
    })

    it('caches verified tenants and skips subsequent checks', async () => {
      mockOsClient.indices.exists.mockResolvedValue({ body: true })

      // First call checks the index
      await memoryMessageService.ensureIndex('cached-tenant')
      expect(mockOsClient.indices.exists).toHaveBeenCalledTimes(1)

      // Second call should skip (cached)
      await memoryMessageService.ensureIndex('cached-tenant')
      expect(mockOsClient.indices.exists).toHaveBeenCalledTimes(1)
    })

    it('does not throw on error (logs instead)', async () => {
      mockOsClient.indices.exists.mockRejectedValue(new Error('Connection refused'))

      // Should not throw
      await expect(memoryMessageService.ensureIndex('fail-tenant')).resolves.toBeUndefined()
    })
  })

  // -----------------------------------------------------------------------
  // insertMessage
  // -----------------------------------------------------------------------

  describe('insertMessage', () => {
    it('inserts a document into the tenant index with created_at', async () => {
      mockOsClient.index.mockResolvedValue({ body: {} })
      // Mock enforceFifo dependencies
      mockMemoryModel.findById.mockResolvedValue({ memory_size: 9000000 })
      mockOsClient.count.mockResolvedValue({ body: { count: 1 } })

      const doc = {
        message_id: 'msg-1',
        memory_id: 'pool-1',
        content: 'Test content',
        content_embed: [0.1, 0.2],
        message_type: 1,
        status: 1,
        tenant_id: 'tenant-1',
      }

      await memoryMessageService.insertMessage('tenant-1', doc)

      expect(mockOsClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'memory_tenant-1',
          id: 'msg-1',
          refresh: 'true',
          body: expect.objectContaining({
            message_id: 'msg-1',
            content: 'Test content',
            created_at: expect.any(String),
          }),
        }),
      )
    })

    it('calls enforceFifo after insertion', async () => {
      mockOsClient.index.mockResolvedValue({ body: {} })
      // Pool allows ~1 message (9000 / 9000 = 1), current count = 1, so no excess
      mockMemoryModel.findById.mockResolvedValue({ memory_size: 9000 })
      mockOsClient.count.mockResolvedValue({ body: { count: 1 } })

      await memoryMessageService.insertMessage('tenant-1', {
        message_id: 'msg-1',
        memory_id: 'pool-1',
        content: 'Test',
        message_type: 1,
        status: 1,
        tenant_id: 'tenant-1',
      })

      // enforceFifo calls count for the pool
      expect(mockOsClient.count).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // enforceFifo
  // -----------------------------------------------------------------------

  describe('enforceFifo', () => {
    it('deletes oldest messages when count exceeds limit', async () => {
      // Pool allows 1 message (9000 / 9000 = 1), but there are 3
      mockMemoryModel.findById.mockResolvedValue({ memory_size: 9000 })
      mockOsClient.count.mockResolvedValue({ body: { count: 3 } })
      mockOsClient.search.mockResolvedValue({
        body: {
          hits: {
            hits: [
              { _id: 'old-1' },
              { _id: 'old-2' },
            ],
          },
        },
      })
      mockOsClient.deleteByQuery.mockResolvedValue({ body: {} })

      await memoryMessageService.enforceFifo('tenant-1', 'pool-1')

      // Should search for 2 oldest (3 - 1 = 2 excess)
      expect(mockOsClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            size: 2,
            sort: [{ created_at: { order: 'asc' } }],
          }),
        }),
      )
      // Should delete by IDs
      expect(mockOsClient.deleteByQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            query: { ids: { values: ['old-1', 'old-2'] } },
          },
        }),
      )
    })

    it('skips deletion when count is within limit', async () => {
      mockMemoryModel.findById.mockResolvedValue({ memory_size: 90000 })
      mockOsClient.count.mockResolvedValue({ body: { count: 5 } })

      await memoryMessageService.enforceFifo('tenant-1', 'pool-1')

      // 90000 / 9000 = 10 max messages, 5 is within limit
      expect(mockOsClient.search).not.toHaveBeenCalled()
      expect(mockOsClient.deleteByQuery).not.toHaveBeenCalled()
    })

    it('returns early when pool not found', async () => {
      mockMemoryModel.findById.mockResolvedValue(null)

      await memoryMessageService.enforceFifo('tenant-1', 'missing')

      expect(mockOsClient.count).not.toHaveBeenCalled()
    })

    it('does not throw on error (logs instead)', async () => {
      mockMemoryModel.findById.mockRejectedValue(new Error('DB error'))

      // Should not throw
      await expect(
        memoryMessageService.enforceFifo('tenant-1', 'pool-1'),
      ).resolves.toBeUndefined()
    })

    it('skips deleteByQuery when no IDs found in search', async () => {
      mockMemoryModel.findById.mockResolvedValue({ memory_size: 9000 })
      mockOsClient.count.mockResolvedValue({ body: { count: 3 } })
      mockOsClient.search.mockResolvedValue({
        body: { hits: { hits: [] } },
      })

      await memoryMessageService.enforceFifo('tenant-1', 'pool-1')

      expect(mockOsClient.deleteByQuery).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // searchMemory
  // -----------------------------------------------------------------------

  describe('searchMemory', () => {
    it('returns mapped search results with hybrid text+vector query', async () => {
      mockOsClient.search.mockResolvedValue({
        body: {
          hits: {
            hits: [
              {
                _id: 'msg-1',
                _score: 0.95,
                _source: {
                  content: 'Found memory',
                  message_type: 2,
                  memory_id: 'pool-1',
                  created_at: '2026-01-01T00:00:00.000Z',
                },
              },
            ],
          },
        },
      })

      const results = await memoryMessageService.searchMemory(
        'tenant-1',
        'pool-1',
        'test query',
        [0.1, 0.2, 0.3],
        10,
        0.7,
      )

      expect(results).toEqual([
        {
          id: 'msg-1',
          content: 'Found memory',
          message_type: 2,
          score: 0.95,
          memory_id: 'pool-1',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ])
    })

    it('builds query with both text match and knn when vector provided', async () => {
      mockOsClient.search.mockResolvedValue({ body: { hits: { hits: [] } } })

      await memoryMessageService.searchMemory('tenant-1', 'pool-1', 'query', [0.1], 5, 0.8)

      const callBody = mockOsClient.search.mock.calls[0]![0].body
      // Should have 2 should clauses: text match + knn
      expect(callBody.query.bool.should).toHaveLength(2)
      // Must clause filters by memory_id
      expect(callBody.query.bool.must).toEqual([{ term: { memory_id: 'pool-1' } }])
      // Filter ensures tenant isolation and active status
      expect(callBody.query.bool.filter).toEqual([
        { term: { tenant_id: 'tenant-1' } },
        { term: { status: 1 } },
      ])
    })

    it('builds query with text match only when vector is empty', async () => {
      mockOsClient.search.mockResolvedValue({ body: { hits: { hits: [] } } })

      await memoryMessageService.searchMemory('tenant-1', 'pool-1', 'query', [], 10)

      const callBody = mockOsClient.search.mock.calls[0]![0].body
      // Should have 1 should clause: text match only
      expect(callBody.query.bool.should).toHaveLength(1)
      expect(callBody.query.bool.should[0]).toHaveProperty('match')
    })

    it('returns empty array when no hits', async () => {
      mockOsClient.search.mockResolvedValue({ body: { hits: { hits: [] } } })

      const results = await memoryMessageService.searchMemory('tenant-1', 'pool-1', 'query', [])

      expect(results).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // listMessages
  // -----------------------------------------------------------------------

  describe('listMessages', () => {
    it('returns paginated results with total count', async () => {
      mockOsClient.search.mockResolvedValue({
        body: {
          hits: {
            total: { value: 42 },
            hits: [
              { _id: 'msg-1', _source: { content: 'item 1', message_type: 1, status: 1 } },
              { _id: 'msg-2', _source: { content: 'item 2', message_type: 2, status: 1 } },
            ],
          },
        },
      })

      const result = await memoryMessageService.listMessages('tenant-1', 'pool-1', 1, 20)

      expect(result.total).toBe(42)
      expect(result.items).toHaveLength(2)
      expect(result.items[0]).toEqual(
        expect.objectContaining({ message_id: 'msg-1', content: 'item 1' }),
      )
    })

    it('applies keyword filter when provided', async () => {
      mockOsClient.search.mockResolvedValue({
        body: { hits: { total: { value: 0 }, hits: [] } },
      })

      await memoryMessageService.listMessages('tenant-1', 'pool-1', 1, 20, 'search term')

      const callBody = mockOsClient.search.mock.calls[0]![0].body
      expect(callBody.query.bool.must).toEqual([
        { match: { content: 'search term' } },
      ])
    })

    it('uses match_all when no keyword provided', async () => {
      mockOsClient.search.mockResolvedValue({
        body: { hits: { total: { value: 0 }, hits: [] } },
      })

      await memoryMessageService.listMessages('tenant-1', 'pool-1', 1, 20)

      const callBody = mockOsClient.search.mock.calls[0]![0].body
      expect(callBody.query.bool.must).toEqual([{ match_all: {} }])
    })

    it('applies message_type filter when provided', async () => {
      mockOsClient.search.mockResolvedValue({
        body: { hits: { total: { value: 0 }, hits: [] } },
      })

      await memoryMessageService.listMessages('tenant-1', 'pool-1', 1, 20, undefined, 4)

      const callBody = mockOsClient.search.mock.calls[0]![0].body
      // Filter should include memory_id, tenant_id, and message_type
      expect(callBody.query.bool.filter).toEqual(
        expect.arrayContaining([{ term: { message_type: 4 } }]),
      )
    })

    it('calculates correct from offset for pagination', async () => {
      mockOsClient.search.mockResolvedValue({
        body: { hits: { total: { value: 0 }, hits: [] } },
      })

      await memoryMessageService.listMessages('tenant-1', 'pool-1', 3, 10)

      const callBody = mockOsClient.search.mock.calls[0]![0].body
      // Page 3, size 10 => from = (3-1)*10 = 20
      expect(callBody.from).toBe(20)
      expect(callBody.size).toBe(10)
    })

    it('handles numeric total (non-object format)', async () => {
      mockOsClient.search.mockResolvedValue({
        body: { hits: { total: 15, hits: [] } },
      })

      const result = await memoryMessageService.listMessages('tenant-1', 'pool-1', 1, 20)

      expect(result.total).toBe(15)
    })
  })

  // -----------------------------------------------------------------------
  // deleteMessage
  // -----------------------------------------------------------------------

  describe('deleteMessage', () => {
    it('deletes a single message by document ID', async () => {
      mockOsClient.delete.mockResolvedValue({ body: {} })

      await memoryMessageService.deleteMessage('tenant-1', 'msg-1')

      expect(mockOsClient.delete).toHaveBeenCalledWith({
        index: 'memory_tenant-1',
        id: 'msg-1',
        refresh: 'true',
      })
    })
  })

  // -----------------------------------------------------------------------
  // deleteAllByMemory
  // -----------------------------------------------------------------------

  describe('deleteAllByMemory', () => {
    it('deletes all messages for a memory pool via deleteByQuery', async () => {
      mockOsClient.deleteByQuery.mockResolvedValue({ body: {} })

      await memoryMessageService.deleteAllByMemory('pool-1', 'tenant-1')

      expect(mockOsClient.deleteByQuery).toHaveBeenCalledWith({
        index: 'memory_tenant-1',
        body: {
          query: { term: { memory_id: 'pool-1' } },
        },
        refresh: true,
      })
    })

    it('does not throw on error (logs warning instead)', async () => {
      mockOsClient.deleteByQuery.mockRejectedValue(new Error('Index not found'))

      await expect(
        memoryMessageService.deleteAllByMemory('pool-1', 'tenant-1'),
      ).resolves.toBeUndefined()
    })
  })

  // -----------------------------------------------------------------------
  // updateMessageStatus (forget/restore)
  // -----------------------------------------------------------------------

  describe('updateMessageStatus', () => {
    it('sets status to 0 for forget operation', async () => {
      mockOsClient.update.mockResolvedValue({ body: {} })

      await memoryMessageService.updateMessageStatus('tenant-1', 'msg-1', 0)

      expect(mockOsClient.update).toHaveBeenCalledWith({
        index: 'memory_tenant-1',
        id: 'msg-1',
        body: { doc: { status: 0 } },
        refresh: 'true',
      })
    })

    it('sets status to 1 for restore operation', async () => {
      mockOsClient.update.mockResolvedValue({ body: {} })

      await memoryMessageService.updateMessageStatus('tenant-1', 'msg-1', 1)

      expect(mockOsClient.update).toHaveBeenCalledWith({
        index: 'memory_tenant-1',
        id: 'msg-1',
        body: { doc: { status: 1 } },
        refresh: 'true',
      })
    })
  })
})
