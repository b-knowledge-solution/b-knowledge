/**
 * @fileoverview Tests for Version History features (DOCM-01, DOCM-02, DOCM-03).
 *
 * DOCM-01 and DOCM-03: Verify createVersionDataset method and version metadata.
 * DOCM-02: Verify rank_feature boost on pagerank_fea in search queries.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted so variables are available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockDatasetModel,
  mockMaxFirstFn,
  mockSearchFn,
} = vi.hoisted(() => {
  const mockMaxFirstFn = vi.fn().mockResolvedValue({ max: null })
  const mockSearchFn = vi.fn().mockResolvedValue({
    body: {
      hits: {
        total: { value: 0 },
        hits: [],
      },
    },
  })

  return {
    mockDatasetModel: {
      findAll: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      getKnex: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ increment: vi.fn() }) }),
    },
    mockMaxFirstFn,
    mockSearchFn,
  }
})

// Mock shared dependencies using @/ alias to match vitest resolve config
vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    dataset: mockDatasetModel,
  },
}))

vi.mock('@/shared/db/knex.js', () => {
  // Build a stable chainable query builder with controlled .first() output
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
}))

// Mock config for RagSearchService (uses config.opensearch.*)
vi.mock('@/shared/config/index.js', () => ({
  config: {
    opensearch: {
      systemTenantId: 'test-system-tenant',
      host: 'http://localhost:9200',
      password: '',
    },
  },
}))

// Mock OpenSearch client to capture query bodies for DOCM-02 tests
vi.mock('@opensearch-project/opensearch', () => ({
  Client: vi.fn().mockImplementation(() => ({
    search: mockSearchFn,
  })),
}))

import { Client } from '@opensearch-project/opensearch'
import { RagService } from '../../src/modules/rag/services/rag.service'
import { RagSearchService } from '../../src/modules/rag/services/rag-search.service'

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

/**
 * Selectively clear mock call history without destroying mockImplementation.
 * This avoids the vitest vi.clearAllMocks() issue that clears mockImplementation
 * on the OpenSearch Client constructor.
 */
function clearMockHistory() {
  mockDatasetModel.findAll.mockClear()
  mockDatasetModel.findById.mockClear()
  mockDatasetModel.create.mockClear()
  mockDatasetModel.update.mockClear()
  mockDatasetModel.getKnex.mockClear()
  mockMaxFirstFn.mockClear()
  mockSearchFn.mockClear()
}

// ---------------------------------------------------------------------------
// DOCM-01: Version creation
// ---------------------------------------------------------------------------

describe('Version History - createVersionDataset', () => {
  let service: RagService

  beforeEach(() => {
    clearMockHistory()
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
      null,
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

    await service.createVersionDataset('parent-uuid-1234', null, null, 'user-1', 'tenant-1')

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

    await service.createVersionDataset('parent-uuid-1234', 'Fourth version', null, 'user-1', 'tenant-1')

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
    await service.createVersionDataset('parent-uuid-1234', null, null, 'user-1', 'tenant-1')

    const createCall = mockDatasetModel.create.mock.calls[0]![0] as any
    expect(createCall.change_summary).toBe('Version 1 uploaded by user')
  })

  it('should inherit parser_config, access_control, embedding_model from parent', async () => {
    mockDatasetModel.findById.mockResolvedValue(parentDataset)
    mockMaxFirstFn.mockResolvedValue({ max: null })
    mockDatasetModel.create.mockResolvedValue({ id: 'v-1', version_number: 1 })

    await service.createVersionDataset('parent-uuid-1234', null, null, 'user-1', 'tenant-1')

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
// DOCM-02: Version-aware search (rank_feature boost)
// ---------------------------------------------------------------------------

describe('Version History - rank_feature boost', () => {
  let searchService: RagSearchService

  beforeEach(() => {
    // Re-establish Client mockImplementation because the global setup.ts afterEach
    // calls vi.resetAllMocks() which clears mockImplementation on all mocks
    vi.mocked(Client).mockImplementation(() => ({
      search: mockSearchFn,
    }) as any)
    mockSearchFn.mockClear()
    mockSearchFn.mockResolvedValue({
      body: { hits: { total: { value: 0 }, hits: [] } },
    })
    searchService = new RagSearchService()
  })

  it('should include rank_feature on pagerank_fea in fullTextSearch should clause', async () => {
    await searchService.fullTextSearch('tenant-1', 'ds-1', 'test query', 10)

    // Verify the search was called
    expect(mockSearchFn).toHaveBeenCalledTimes(1)
    const queryBody = mockSearchFn.mock.calls[0]![0].body.query.bool

    // The should array must contain a rank_feature clause on pagerank_fea
    expect(queryBody.should).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rank_feature: { field: 'pagerank_fea', linear: {} },
        }),
      ]),
    )
  })

  it('should include rank_feature on pagerank_fea in semanticSearch should clause', async () => {
    const fakeVector = Array(128).fill(0.1)
    await searchService.semanticSearch('tenant-1', 'ds-1', fakeVector, 10, 0.3)

    expect(mockSearchFn).toHaveBeenCalledTimes(1)
    const queryBody = mockSearchFn.mock.calls[0]![0].body.query.bool

    // Should clause must contain both knn and rank_feature
    expect(queryBody.should).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rank_feature: { field: 'pagerank_fea', linear: {} },
        }),
        expect.objectContaining({
          knn: expect.any(Object),
        }),
      ]),
    )
  })

  it('should not break search for datasets without pagerank_fea field', async () => {
    // rank_feature in a should clause is gracefully ignored when the field
    // is missing from the document — OpenSearch returns 0 boost, no error.
    // We verify the query structure is valid (no errors thrown during construction).
    await searchService.fullTextSearch('tenant-1', 'ds-no-pagerank', 'test', 5)

    // Query executed successfully — rank_feature in should is optional by design
    expect(mockSearchFn).toHaveBeenCalledTimes(1)
    const queryBody = mockSearchFn.mock.calls[0]![0].body.query.bool

    // rank_feature clause is always present (OpenSearch handles missing fields gracefully)
    expect(queryBody.should).toBeDefined()
    expect(queryBody.should.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// DOCM-03: Version metadata
// ---------------------------------------------------------------------------

describe('Version History - version metadata', () => {
  let service: RagService

  beforeEach(() => {
    clearMockHistory()
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

    // Signature: (parentDatasetId, changeSummary, versionLabel, userId, tenantId)
    await service.createVersionDataset('parent-uuid-1234', 'Updated policy docs', null, 'user-42', 'tenant-1')

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
