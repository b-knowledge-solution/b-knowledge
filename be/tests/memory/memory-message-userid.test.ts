/**
 * @fileoverview Tests for MemoryMessageService user_id tracking.
 *
 * Verifies that user_id is included in the OpenSearch document when inserting
 * messages, matching the upstream port for user attribution on memory messages.
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

describe('MemoryMessageService — user_id tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock enforceFifo to not actually run (tested elsewhere)
    mockMemoryModel.findById.mockResolvedValue(null)
  })

  describe('insertMessage with user_id', () => {
    it('includes user_id in the OpenSearch document when provided', async () => {
      mockOsClient.index.mockResolvedValue({ body: {} })
      // enforceFifo: pool not found so it returns early
      mockMemoryModel.findById.mockResolvedValue(null)

      await memoryMessageService.insertMessage('tenant-1', {
        message_id: 'msg-1',
        memory_id: 'mem-1',
        content: 'Test memory',
        message_type: 1,
        status: 1,
        tenant_id: 'tenant-1',
        user_id: 'user-abc',
      })

      // Verify the indexed document contains user_id
      expect(mockOsClient.index).toHaveBeenCalledTimes(1)
      const indexedBody = mockOsClient.index.mock.calls[0]![0].body
      expect(indexedBody.user_id).toBe('user-abc')
      expect(indexedBody.message_id).toBe('msg-1')
      expect(indexedBody.memory_id).toBe('mem-1')
    })

    it('omits user_id from the document when not provided', async () => {
      mockOsClient.index.mockResolvedValue({ body: {} })
      mockMemoryModel.findById.mockResolvedValue(null)

      await memoryMessageService.insertMessage('tenant-1', {
        message_id: 'msg-2',
        memory_id: 'mem-1',
        content: 'No user tracking',
        message_type: 1,
        status: 1,
        tenant_id: 'tenant-1',
      })

      // user_id should be undefined (not explicitly set)
      const indexedBody = mockOsClient.index.mock.calls[0]![0].body
      expect(indexedBody.user_id).toBeUndefined()
    })

    it('stores the correct tenant_id and created_at timestamp', async () => {
      mockOsClient.index.mockResolvedValue({ body: {} })
      mockMemoryModel.findById.mockResolvedValue(null)

      const before = new Date().toISOString()
      await memoryMessageService.insertMessage('tenant-1', {
        message_id: 'msg-3',
        memory_id: 'mem-1',
        content: 'Timestamped message',
        message_type: 2,
        status: 1,
        tenant_id: 'tenant-1',
        user_id: 'user-xyz',
      })
      const after = new Date().toISOString()

      const indexedBody = mockOsClient.index.mock.calls[0]![0].body
      expect(indexedBody.tenant_id).toBe('tenant-1')
      // created_at should be between before and after
      expect(indexedBody.created_at >= before).toBe(true)
      expect(indexedBody.created_at <= after).toBe(true)
    })
  })

  describe('MemoryMessageDoc interface user_id field', () => {
    it('user_id is preserved through the full insert document', async () => {
      mockOsClient.index.mockResolvedValue({ body: {} })
      mockMemoryModel.findById.mockResolvedValue(null)

      const doc = {
        message_id: 'msg-4',
        memory_id: 'mem-2',
        content: 'With all fields',
        message_type: 4,
        status: 1,
        tenant_id: 'tenant-1',
        user_id: 'user-full',
        source_id: 'session-123',
      }

      await memoryMessageService.insertMessage('tenant-1', doc)

      const indexedBody = mockOsClient.index.mock.calls[0]![0].body
      // All fields from the input doc should be present
      expect(indexedBody.user_id).toBe('user-full')
      expect(indexedBody.source_id).toBe('session-123')
      expect(indexedBody.content).toBe('With all fields')
      expect(indexedBody.message_type).toBe(4)
    })
  })
})
