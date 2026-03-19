/**
 * @fileoverview Tests for Version History features (DOCM-01, DOCM-02, DOCM-03).
 *
 * DOCM-01 and DOCM-03 tests: Implemented — verify createVersionDataset method
 * and version metadata storage on the RagService.
 * DOCM-02 tests: Still failing stubs — addressed in Plan 03-03 (rank_feature boost).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted so variables are available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockDatasetModel,
  mockMaxFirstFn,
} = vi.hoisted(() => {
  // The .first() at the end of the chain — controls the resolved value
  const mockMaxFirstFn = vi.fn().mockResolvedValue({ max: null })

  return {
    mockDatasetModel: {
      findAll: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      getKnex: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ increment: vi.fn() }) }),
    },
    mockMaxFirstFn,
  }
})

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    dataset: mockDatasetModel,
  },
}))

// Mock knex DB — returns a chainable query builder with controlled .first() output
vi.mock('../../src/shared/db/knex.js', () => {
  // Build a stable chain that always works regardless of clearAllMocks
  function makeChain(): any {
    return {
      where: () => makeChain(),
      max: () => makeChain(),
      orderBy: () => makeChain(),
      first: mockMaxFirstFn,
      then: (resolve: any) => Promise.resolve(resolve([])),
    }
  }
  return { db: () => makeChain() }
})

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../src/modules/audit/services/audit.service.js', () => ({
  auditService: { log: vi.fn() },
  AuditAction: { CREATE_SOURCE: 'CREATE_SOURCE' },
  AuditResourceType: { DATASET: 'DATASET' },
}))

vi.mock('../../src/modules/teams/services/team.service.js', () => ({
  teamService: { getUserTeams: vi.fn() },
}))

vi.mock('../../src/shared/services/ability.service.js', () => ({
  invalidateAllAbilities: vi.fn(),
}))

import { RagService } from '../../src/modules/rag/services/rag.service'

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const parentDataset = {
  id: 'parent-uuid-1234',
  name: 'Test Dataset',
  description: 'A test dataset',
  language: 'English',
  embedding_model: 'text-embedding-3-small',
  parser_id: 'naive',
  parser_config: JSON.stringify({ chunk_size: 512, overlap: 64 }),
  access_control: JSON.stringify({ public: true, team_ids: [], user_ids: [] }),
  policy_rules: JSON.stringify([{ effect: 'allow', action: 'read', subject: 'Document', conditions: {} }]),
  status: 'active',
  pagerank: 0,
  tenant_id: 'tenant-1',
  created_by: 'user-1',
  updated_by: 'user-1',
  doc_count: 5,
  chunk_count: 100,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
}

// ---------------------------------------------------------------------------
// DOCM-01: Version creation
// ---------------------------------------------------------------------------

describe('Version History - createVersionDataset', () => {
  let service: RagService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new RagService()

    // Reset default: no existing versions
    mockMaxFirstFn.mockResolvedValue({ max: null })
  })

  it('should create a version dataset with inherited parent settings', async () => {
    // Mock parent lookup
    mockDatasetModel.findById.mockResolvedValue(parentDataset)

    // No existing versions
    mockMaxFirstFn.mockResolvedValue({ max: null })

    // Mock dataset creation to return the new version dataset
    const createdDataset = {
      id: 'version-uuid-5678',
      name: 'Test Dataset (v1)',
      language: 'English',
      embedding_model: 'text-embedding-3-small',
      parser_id: 'naive',
      parser_config: parentDataset.parser_config,
      access_control: parentDataset.access_control,
      policy_rules: parentDataset.policy_rules,
      pagerank: 1,
      parent_dataset_id: 'parent-uuid-1234',
      version_number: 1,
      change_summary: 'Initial version upload',
      version_created_by: 'user-1',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    }
    mockDatasetModel.create.mockResolvedValue(createdDataset)

    const result = await service.createVersionDataset(
      'parent-uuid-1234',
      'Initial version upload',
      'user-1',
      'tenant-1',
    )

    // Verify parent was fetched
    expect(mockDatasetModel.findById).toHaveBeenCalledWith('parent-uuid-1234')

    // Verify create was called with inherited settings
    const createCall = mockDatasetModel.create.mock.calls[0]![0] as any
    expect(createCall.language).toBe('English')
    expect(createCall.embedding_model).toBe('text-embedding-3-small')
    expect(createCall.parser_id).toBe('naive')
    expect(createCall.parent_dataset_id).toBe('parent-uuid-1234')

    // Verify result is the created dataset
    expect(result.id).toBe('version-uuid-5678')
  })

  it('should set pagerank equal to version_number', async () => {
    mockDatasetModel.findById.mockResolvedValue(parentDataset)
    mockMaxFirstFn.mockResolvedValue({ max: null })
    mockDatasetModel.create.mockResolvedValue({ id: 'v-1', pagerank: 1, version_number: 1 })

    await service.createVersionDataset('parent-uuid-1234', null, 'user-1', 'tenant-1')

    // Verify pagerank matches version_number
    const createCall = mockDatasetModel.create.mock.calls[0]![0] as any
    expect(createCall.pagerank).toBe(1)
    expect(createCall.version_number).toBe(1)
    expect(createCall.pagerank).toBe(createCall.version_number)
  })

  it('should auto-increment version_number from existing versions', async () => {
    mockDatasetModel.findById.mockResolvedValue(parentDataset)

    // Existing versions: max version_number is 3
    mockMaxFirstFn.mockResolvedValue({ max: 3 })

    mockDatasetModel.create.mockResolvedValue({ id: 'v-4', pagerank: 4, version_number: 4 })

    await service.createVersionDataset('parent-uuid-1234', 'Fourth version', 'user-1', 'tenant-1')

    // Version number should be max(3) + 1 = 4
    const createCall = mockDatasetModel.create.mock.calls[0]![0] as any
    expect(createCall.version_number).toBe(4)
    expect(createCall.pagerank).toBe(4)
  })

  it('should generate default change summary when none provided', async () => {
    mockDatasetModel.findById.mockResolvedValue(parentDataset)
    mockMaxFirstFn.mockResolvedValue({ max: null })
    mockDatasetModel.create.mockResolvedValue({ id: 'v-1', version_number: 1 })

    // Pass null as change_summary to trigger default generation
    await service.createVersionDataset('parent-uuid-1234', null, 'user-1', 'tenant-1')

    const createCall = mockDatasetModel.create.mock.calls[0]![0] as any
    expect(createCall.change_summary).toBe('Version 1 uploaded by user')
  })

  it('should inherit parser_config, access_control, embedding_model from parent', async () => {
    mockDatasetModel.findById.mockResolvedValue(parentDataset)
    mockMaxFirstFn.mockResolvedValue({ max: null })
    mockDatasetModel.create.mockResolvedValue({ id: 'v-1', version_number: 1 })

    await service.createVersionDataset('parent-uuid-1234', null, 'user-1', 'tenant-1')

    const createCall = mockDatasetModel.create.mock.calls[0]![0] as any

    // Parser config inherited from parent
    expect(createCall.parser_config).toBe(parentDataset.parser_config)

    // Access control inherited from parent
    expect(createCall.access_control).toBe(parentDataset.access_control)

    // Embedding model inherited from parent
    expect(createCall.embedding_model).toBe('text-embedding-3-small')

    // Policy rules inherited from parent
    expect(createCall.policy_rules).toBe(parentDataset.policy_rules)
  })
})

// ---------------------------------------------------------------------------
// DOCM-02: Version-aware search (stubs — addressed in Plan 03-03)
// ---------------------------------------------------------------------------

describe('Version History - rank_feature boost', () => {
  it('should include rank_feature on pagerank_fea in search query should clause', () => {
    // OpenSearch query must add rank_feature clause to boost newer versions
    expect(true).toBe(false)
  })

  it('should not break search for datasets without pagerank_fea', () => {
    // Graceful degradation: missing field must not cause query errors
    expect(true).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// DOCM-03: Version metadata
// ---------------------------------------------------------------------------

describe('Version History - version metadata', () => {
  let service: RagService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new RagService()

    // Reset default: no existing versions
    mockMaxFirstFn.mockResolvedValue({ max: null })
  })

  it('should store version_number, change_summary, version_created_by on dataset', async () => {
    mockDatasetModel.findById.mockResolvedValue(parentDataset)
    mockMaxFirstFn.mockResolvedValue({ max: 1 })
    mockDatasetModel.create.mockResolvedValue({
      id: 'v-2',
      version_number: 2,
      change_summary: 'Updated policy docs',
      version_created_by: 'user-42',
    })

    await service.createVersionDataset('parent-uuid-1234', 'Updated policy docs', 'user-42', 'tenant-1')

    const createCall = mockDatasetModel.create.mock.calls[0]![0] as any

    // Version metadata columns are set on the dataset record
    expect(createCall.version_number).toBe(2)
    expect(createCall.change_summary).toBe('Updated policy docs')
    expect(createCall.version_created_by).toBe('user-42')
  })

  it('should return version metadata in getAvailableDatasets response', async () => {
    // getAvailableDatasets uses ModelFactory.dataset.findAll which returns
    // all columns including the version fields
    const datasetsWithVersionFields = [
      {
        ...parentDataset,
        parent_dataset_id: null,
        version_number: null,
        change_summary: null,
        version_created_by: null,
      },
      {
        id: 'v-1',
        name: 'Test Dataset (v1)',
        description: 'A test dataset',
        language: 'English',
        embedding_model: 'text-embedding-3-small',
        parser_id: 'naive',
        parser_config: '{}',
        access_control: '{"public": true}',
        status: 'active',
        doc_count: 3,
        chunk_count: 50,
        pagerank: 1,
        parent_dataset_id: 'parent-uuid-1234',
        version_number: 1,
        change_summary: 'First version',
        version_created_by: 'user-1',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]

    mockDatasetModel.findAll.mockResolvedValue(datasetsWithVersionFields)

    // Admin user sees all datasets
    const result = await service.getAvailableDatasets({ id: 'admin-1', role: 'admin' })

    // Verify version metadata fields are present in the response
    const versionDataset = result.find((d: any) => d.version_number === 1)
    expect(versionDataset).toBeDefined()
    expect((versionDataset as any).parent_dataset_id).toBe('parent-uuid-1234')
    expect((versionDataset as any).version_number).toBe(1)
    expect((versionDataset as any).change_summary).toBe('First version')
    expect((versionDataset as any).version_created_by).toBe('user-1')
  })
})
