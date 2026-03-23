/**
 * @fileoverview Tests for RagDocumentService.deleteAllByDataset().
 *
 * Covers successful deletion with row count, empty dataset returning zero,
 * and verifying the correct table and filter are used.
 * Upstream port: DocumentService.delete_all_by_kb()
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockDel, mockWhere } = vi.hoisted(() => ({
  mockDel: vi.fn(),
  mockWhere: vi.fn(),
}))

vi.mock('../../src/shared/db/knex.js', () => {
  const dbFn = (tableName: string) => ({
    where: (...args: any[]) => {
      mockWhere(tableName, ...args)
      return { del: mockDel }
    },
  })
  return { db: dbFn }
})

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    ragDocument: {
      findByDatasetId: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      beginParse: vi.fn(),
      findByDatasetIdAsc: vi.fn(),
    },
    ragFile: {
      createFile: vi.fn(),
      createFile2Document: vi.fn(),
      deleteByDocumentId: vi.fn(),
    },
    ragTask: {
      create: vi.fn(),
      findById: vi.fn(),
      findByDocId: vi.fn(),
      findByDatasetId: vi.fn(),
      getOverviewStats: vi.fn(),
    },
    knowledgebase: {
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      findById: vi.fn(),
      incrementDocCount: vi.fn(),
    },
  },
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../src/shared/services/redis.service.js', () => ({
  getRedisClient: vi.fn().mockReturnValue(null),
}))

vi.mock('../../src/modules/rag/services/rag-search.service.js', () => ({
  ragSearchService: {
    deleteChunksByDocId: vi.fn(),
  },
}))

vi.mock('../../src/shared/utils/uuid.js', () => ({
  getUuid: () => 'aabbccdd11223344aabbccdd11223344',
}))

import { RagDocumentService } from '../../src/modules/rag/services/rag-document.service'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RagDocumentService.deleteAllByDataset', () => {
  let service: RagDocumentService

  beforeEach(() => {
    service = new RagDocumentService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('deletes all documents for a dataset and returns count', async () => {
    // Simulate 5 rows deleted
    mockDel.mockResolvedValue(5)

    const count = await service.deleteAllByDataset('ds-1', 'tenant-1')

    // Should query the 'document' table filtered by kb_id
    expect(mockWhere).toHaveBeenCalledWith('document', 'kb_id', 'ds-1')
    expect(mockDel).toHaveBeenCalledTimes(1)
    expect(count).toBe(5)
  })

  it('returns zero when dataset has no documents', async () => {
    // No rows affected
    mockDel.mockResolvedValue(0)

    const count = await service.deleteAllByDataset('empty-ds', 'tenant-1')

    expect(count).toBe(0)
  })

  it('passes through database errors', async () => {
    // Simulate a database error
    mockDel.mockRejectedValue(new Error('DB connection lost'))

    await expect(
      service.deleteAllByDataset('ds-err', 'tenant-1'),
    ).rejects.toThrow('DB connection lost')
  })
})
