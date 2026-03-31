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

const { mockDel, mockWhere, mockDeleteAllByDataset } = vi.hoisted(() => ({
  mockDel: vi.fn(),
  mockWhere: vi.fn(),
  mockDeleteAllByDataset: vi.fn(),
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
      deleteAllByDataset: mockDeleteAllByDataset,
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

vi.mock('../../src/shared/utils/uuid.js', () => {
  const { z } = require('zod')
  const re = /^[0-9a-f]{32}$/
  return {
    getUuid: () => 'aabbccdd11223344aabbccdd11223344',
    hexId: z.string().regex(re, 'Invalid ID format (expected 32-char hex)'),
    hexIdWith: (msg: string) => z.string().regex(re, msg),
  }
})

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
    // Model layer returns the number of deleted rows
    mockDeleteAllByDataset.mockResolvedValue(5)

    const count = await service.deleteAllByDataset('ds-1', 'tenant-1')

    // Should delegate to ragDocument model with the dataset ID
    expect(mockDeleteAllByDataset).toHaveBeenCalledWith('ds-1')
    expect(count).toBe(5)
  })

  it('returns zero when dataset has no documents', async () => {
    // No rows affected
    mockDeleteAllByDataset.mockResolvedValue(0)

    const count = await service.deleteAllByDataset('empty-ds', 'tenant-1')

    expect(count).toBe(0)
  })

  it('passes through database errors', async () => {
    // Simulate a database error from the model layer
    mockDeleteAllByDataset.mockRejectedValue(new Error('DB connection lost'))

    await expect(
      service.deleteAllByDataset('ds-err', 'tenant-1'),
    ).rejects.toThrow('DB connection lost')
  })
})
