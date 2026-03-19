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
    service = new RagService()
    vi.clearAllMocks()
  })

  it('should store metadata_tags in parser_config JSONB via merge mode', async () => {
    // metadata_tags is stored inside parser_config.metadata_tags using jsonb_set
    await service.bulkUpdateMetadata(
      ['11111111-1111-1111-1111-111111111111'],
      { department: 'engineering', project: 'alpha' },
      'merge',
      'tenant-1',
    )

    // Verify db('datasets').whereIn was called with the dataset IDs
    expect(mockDbWhereIn).toHaveBeenCalledWith('id', ['11111111-1111-1111-1111-111111111111'])
    // Verify tenant isolation was applied
    expect(mockDbAndWhere).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    // Verify update was called (the raw SQL uses metadata_tags key, not metadata)
    expect(mockDbUpdate).toHaveBeenCalled()
    // Verify db.raw was called with metadata_tags path (NOT metadata)
    const rawCall = mockDbRaw.mock.calls[0]
    expect(rawCall[0]).toContain('metadata_tags')
    // Ensure it does NOT reference the auto-extraction 'metadata' key path directly
    expect(rawCall[0]).not.toContain("'{metadata}'")
  })

  it('should keep metadata_tags separate from auto-extracted metadata', async () => {
    // The raw SQL should use {metadata_tags} path, never {metadata}
    await service.bulkUpdateMetadata(
      ['22222222-2222-2222-2222-222222222222'],
      { category: 'internal' },
      'overwrite',
      'tenant-1',
    )

    const rawCall = mockDbRaw.mock.calls[0]
    // Overwrite mode also uses metadata_tags path
    expect(rawCall[0]).toContain('{metadata_tags}')
    // Verify the tags JSON is passed as parameter
    expect(rawCall[1]).toBe(JSON.stringify({ category: 'internal' }))
  })
})

// ---------------------------------------------------------------------------
// DOCM-05: Auto-extraction parser config (FE-only, stubs kept)
// ---------------------------------------------------------------------------

describe('Metadata Tagging - auto-extraction config', () => {
  it('should accept auto_keywords count in parser_config', () => {
    // Controls how many keywords the parser auto-extracts per document
    // This is FE-only config stored in parser_config — no backend validation needed
    expect(true).toBe(false)
  })

  it('should accept auto_questions count in parser_config', () => {
    // Controls how many questions the parser generates per chunk
    expect(true).toBe(false)
  })

  it('should accept enable_metadata boolean with metadata schema array', () => {
    // enable_metadata toggles extraction; metadata_schema defines fields to extract
    expect(true).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// DOCM-06: Bulk metadata operations
// ---------------------------------------------------------------------------

describe('Metadata Tagging - bulk operations', () => {
  let service: RagService

  beforeEach(() => {
    service = new RagService()
    vi.clearAllMocks()
  })

  it('should update metadata_tags on multiple datasets in merge mode', async () => {
    // Merge mode: add new tags without removing existing ones
    const ids = [
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444',
    ]
    await service.bulkUpdateMetadata(ids, { env: 'prod' }, 'merge', 'tenant-2')

    // Should pass all IDs to whereIn
    expect(mockDbWhereIn).toHaveBeenCalledWith('id', ids)
    // Merge mode uses COALESCE to preserve existing tags
    const rawCall = mockDbRaw.mock.calls[0]
    expect(rawCall[0]).toContain('COALESCE')
    expect(rawCall[0]).toContain('metadata_tags')
  })

  it('should replace metadata_tags on multiple datasets in overwrite mode', async () => {
    // Overwrite mode: replace all tags with the new set
    const ids = ['55555555-5555-5555-5555-555555555555']
    await service.bulkUpdateMetadata(ids, { owner: 'team-a' }, 'overwrite', 'tenant-2')

    expect(mockDbWhereIn).toHaveBeenCalledWith('id', ids)
    // Overwrite mode does NOT use COALESCE for the inner merge
    const rawCall = mockDbRaw.mock.calls[0]
    expect(rawCall[0]).toContain('{metadata_tags}')
    // Overwrite uses simple jsonb_set without COALESCE on metadata_tags
    expect(rawCall[0]).not.toContain("COALESCE(parser_config->'metadata_tags'")
  })

  it('should enforce tenant_id isolation on bulk updates', async () => {
    // Bulk operations must scope WHERE clause to current tenant
    await service.bulkUpdateMetadata(
      ['66666666-6666-6666-6666-666666666666'],
      { tag: 'value' },
      'merge',
      'isolated-tenant',
    )

    // Verify tenant_id filter was applied
    expect(mockDbAndWhere).toHaveBeenCalledWith('tenant_id', 'isolated-tenant')
  })
})
