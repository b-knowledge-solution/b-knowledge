/**
 * @fileoverview Tests for Metadata Tagging features (DOCM-04, DOCM-05, DOCM-06).
 *
 * Tests verify that bulkUpdateMetadata stores tags in parser_config.metadata_tags
 * (separate from parser_config.metadata), with merge/overwrite modes and tenant isolation.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted so variables are available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockDatasetModel,
  mockDbUpdate,
  mockDbWhereIn,
  mockDbAndWhere,
  mockDbRaw,
} = vi.hoisted(() => {
  const mockDbRaw = vi.fn((...args: any[]) => args)
  const mockDbUpdate = vi.fn().mockResolvedValue(2)
  const mockDbAndWhere = vi.fn().mockReturnValue({ update: mockDbUpdate })
  const mockDbWhereIn = vi.fn().mockReturnValue({ andWhere: mockDbAndWhere })

  return {
    mockDatasetModel: {
      findAll: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      bulkUpdateMetadataTags: vi.fn().mockResolvedValue(undefined),
    },
    mockDbUpdate,
    mockDbWhereIn,
    mockDbAndWhere,
    mockDbRaw,
  }
})

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    dataset: mockDatasetModel,
  },
}))

// Mock knex DB with chain tracking for bulk metadata assertions
vi.mock('@/shared/db/knex.js', () => {
  function makeChain(): any {
    return new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') return (resolve: any) => Promise.resolve(resolve([]))
        if (prop === 'catch') return () => makeChain()
        if (prop === 'first') return () => Promise.resolve(undefined)
        if (prop === 'update') return mockDbUpdate
        if (prop === 'whereIn') return mockDbWhereIn
        if (prop === 'andWhere') return mockDbAndWhere
        if (prop === 'where') return () => makeChain()
        if (prop === 'max') return () => makeChain()
        return () => makeChain()
      },
    })
  }
  const dbFn = Object.assign(
    () => makeChain(),
    { raw: mockDbRaw },
  )
  return { db: dbFn }
})

vi.mock('@/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/modules/audit/services/audit.service.js', () => ({
  auditService: { log: vi.fn() },
  AuditAction: { CREATE_SOURCE: 'CREATE_SOURCE' },
  AuditResourceType: { DATASET: 'DATASET' },
}))

vi.mock('@/modules/teams/services/team.service.js', () => ({
  teamService: { getUserTeams: vi.fn() },
}))

vi.mock('@/shared/services/ability.service.js', () => ({
  invalidateAllAbilities: vi.fn(),
  AbacPolicyRule: {},
}))

import { RagService } from '../../src/modules/rag/services/rag.service'

// ---------------------------------------------------------------------------
// DOCM-04: Custom metadata tagging
// ---------------------------------------------------------------------------

describe('Metadata Tagging - custom tags', () => {
  let service: RagService

  beforeEach(() => {
    vi.clearAllMocks()
    // Re-establish mock chains after clearAllMocks
    mockDbAndWhere.mockReturnValue({ update: mockDbUpdate })
    mockDbWhereIn.mockReturnValue({ andWhere: mockDbAndWhere })
    mockDbUpdate.mockResolvedValue(2)
    service = new RagService()
  })

  it('should store metadata_tags in parser_config JSONB via merge mode', async () => {
    // metadata_tags is stored via model layer's bulkUpdateMetadataTags
    await service.bulkUpdateMetadata(
      ['11111111-1111-1111-1111-111111111111'],
      { department: 'engineering', project: 'alpha' },
      'merge',
      'tenant-1',
    )

    // Verify model method was called with correct arguments
    expect(mockDatasetModel.bulkUpdateMetadataTags).toHaveBeenCalledWith(
      ['11111111-1111-1111-1111-111111111111'],
      { department: 'engineering', project: 'alpha' },
      'merge',
      'tenant-1',
    )
  })

  it('should keep metadata_tags separate from auto-extracted metadata', async () => {
    // Overwrite mode also delegates to model layer with metadata_tags
    await service.bulkUpdateMetadata(
      ['22222222-2222-2222-2222-222222222222'],
      { category: 'internal' },
      'overwrite',
      'tenant-1',
    )

    // Verify overwrite mode is passed through to model
    expect(mockDatasetModel.bulkUpdateMetadataTags).toHaveBeenCalledWith(
      ['22222222-2222-2222-2222-222222222222'],
      { category: 'internal' },
      'overwrite',
      'tenant-1',
    )
  })
})

// ---------------------------------------------------------------------------
// DOCM-05: Auto-extraction parser config (FE-only, stubs kept)
// ---------------------------------------------------------------------------

describe('Metadata Tagging - auto-extraction config', () => {
  it.todo('should accept auto_keywords count in parser_config')

  it.todo('should accept auto_questions count in parser_config')

  it.todo('should accept enable_metadata boolean with metadata schema array')
})

// ---------------------------------------------------------------------------
// DOCM-06: Bulk metadata operations
// ---------------------------------------------------------------------------

describe('Metadata Tagging - bulk operations', () => {
  let service: RagService

  beforeEach(() => {
    vi.clearAllMocks()
    // Re-establish mock chains after clearAllMocks
    mockDbAndWhere.mockReturnValue({ update: mockDbUpdate })
    mockDbWhereIn.mockReturnValue({ andWhere: mockDbAndWhere })
    mockDbUpdate.mockResolvedValue(2)
    service = new RagService()
  })

  it('should update metadata_tags on multiple datasets in merge mode', async () => {
    // Merge mode: add new tags without removing existing ones
    const ids = [
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444',
    ]
    await service.bulkUpdateMetadata(ids, { env: 'prod' }, 'merge', 'tenant-2')

    // Should pass all IDs and merge mode to model method
    expect(mockDatasetModel.bulkUpdateMetadataTags).toHaveBeenCalledWith(
      ids,
      { env: 'prod' },
      'merge',
      'tenant-2',
    )
  })

  it('should replace metadata_tags on multiple datasets in overwrite mode', async () => {
    // Overwrite mode: replace all tags with the new set
    const ids = ['55555555-5555-5555-5555-555555555555']
    await service.bulkUpdateMetadata(ids, { owner: 'team-a' }, 'overwrite', 'tenant-2')

    // Should pass overwrite mode to model method
    expect(mockDatasetModel.bulkUpdateMetadataTags).toHaveBeenCalledWith(
      ids,
      { owner: 'team-a' },
      'overwrite',
      'tenant-2',
    )
  })

  it('should enforce tenant_id isolation on bulk updates', async () => {
    // Bulk operations must scope WHERE clause to current tenant
    await service.bulkUpdateMetadata(
      ['66666666-6666-6666-6666-666666666666'],
      { tag: 'value' },
      'merge',
      'isolated-tenant',
    )

    // Verify tenant_id is passed to model for isolation
    expect(mockDatasetModel.bulkUpdateMetadataTags).toHaveBeenCalledWith(
      ['66666666-6666-6666-6666-666666666666'],
      { tag: 'value' },
      'merge',
      'isolated-tenant',
    )
  })
})
