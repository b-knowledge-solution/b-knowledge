/**
 * @fileoverview Tests for RagService.getAggregatedParsingStatus().
 *
 * Covers grouping by run status, empty dataset, and multiple status values.
 * Upstream port: DocumentService.get_aggregate_parsing_status()
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockDatasetModel, mockDocumentModel, mockAuditLog, mockGetUserTeams } = vi.hoisted(() => ({
  mockDatasetModel: {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  mockDocumentModel: {
    findByDatasetId: vi.fn(),
    findById: vi.fn(),
  },
  mockAuditLog: vi.fn(),
  mockGetUserTeams: vi.fn(),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    dataset: mockDatasetModel,
    document: mockDocumentModel,
  },
}))

vi.mock('../../src/modules/audit/services/audit.service.js', () => ({
  auditService: { log: mockAuditLog },
  AuditAction: { CREATE_SOURCE: 'CREATE_SOURCE', UPDATE_SOURCE: 'UPDATE_SOURCE', DELETE_SOURCE: 'DELETE_SOURCE' },
  AuditResourceType: { DATASET: 'DATASET' },
}))

vi.mock('../../src/modules/teams/services/team.service.js', () => ({
  teamService: { getUserTeams: mockGetUserTeams },
}))

// Track calls to the db mock for assertion
const mockDbSelect = vi.fn()
const mockDbCount = vi.fn()
const mockDbGroupBy = vi.fn()
const mockDbWhere = vi.fn()

/**
 * @description Configurable db mock that tracks chained calls and resolves
 * to the configured result for getAggregatedParsingStatus.
 */
let dbQueryResult: any[] = []

vi.mock('../../src/shared/db/knex.js', () => {
  function makeChain(): any {
    return new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: any) => Promise.resolve(resolve(dbQueryResult))
        }
        if (prop === 'catch') {
          return () => makeChain()
        }
        if (prop === 'first') {
          return () => Promise.resolve(undefined)
        }
        if (prop === 'where') {
          mockDbWhere()
          return () => makeChain()
        }
        if (prop === 'groupBy') {
          mockDbGroupBy()
          return () => makeChain()
        }
        if (prop === 'select') {
          mockDbSelect()
          return () => makeChain()
        }
        if (prop === 'count') {
          mockDbCount()
          return () => makeChain()
        }
        if (prop === 'update') {
          return () => Promise.resolve(0)
        }
        return () => makeChain()
      },
    })
  }
  return { db: () => makeChain() }
})

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
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

import { RagService } from '../../src/modules/rag/services/rag.service'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RagService.getAggregatedParsingStatus', () => {
  let service: RagService

  beforeEach(() => {
    service = new RagService()
    vi.clearAllMocks()
    dbQueryResult = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns grouped status counts for a dataset with multiple statuses', async () => {
    // Simulate DB returning rows grouped by run status
    dbQueryResult = [
      { run: '0', count: '5' },
      { run: '1', count: '3' },
      { run: '2', count: '1' },
    ]

    const result = await service.getAggregatedParsingStatus('ds-1')

    // Should transform array rows into a record keyed by run value
    expect(result).toEqual({
      '0': 5,
      '1': 3,
      '2': 1,
    })
  })

  it('returns empty record for a dataset with no documents', async () => {
    // Simulate empty dataset — no documents, so no rows returned
    dbQueryResult = []

    const result = await service.getAggregatedParsingStatus('empty-ds')

    expect(result).toEqual({})
  })

  it('handles a single status group', async () => {
    // All documents share the same run status
    dbQueryResult = [
      { run: '1', count: '10' },
    ]

    const result = await service.getAggregatedParsingStatus('ds-2')

    expect(result).toEqual({ '1': 10 })
  })

  it('converts count strings to numbers', async () => {
    // DB count() typically returns string values in some drivers
    dbQueryResult = [
      { run: '0', count: '42' },
    ]

    const result = await service.getAggregatedParsingStatus('ds-3')

    // Ensure counts are numbers, not strings
    expect(typeof result['0']).toBe('number')
    expect(result['0']).toBe(42)
  })
})
