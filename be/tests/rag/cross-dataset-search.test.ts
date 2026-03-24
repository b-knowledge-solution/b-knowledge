/**
 * @fileoverview Tests for cross-dataset multi-KB search.
 *
 * Covers searchMultipleDatasets method: merged results with kb_id,
 * ABAC filter passthrough, 20 KB cap with warning, and empty input handling.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock the OpenSearch client
// ---------------------------------------------------------------------------

const mockSearch = vi.fn()

vi.mock('@opensearch-project/opensearch', () => ({
  Client: vi.fn().mockImplementation(() => ({
    search: mockSearch,
    bulk: vi.fn(),
    index: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteByQuery: vi.fn(),
    ping: vi.fn(),
  })),
}))

// Mock logger with hoisted mocks so warn calls can be inspected
const { mockLogWarn } = vi.hoisted(() => ({
  mockLogWarn: vi.fn(),
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: mockLogWarn, debug: vi.fn() },
}))

// Mock config
vi.mock('../../src/shared/config/index.js', () => ({
  config: {
    opensearch: {
      host: 'http://localhost:9201',
      password: 'admin',
      systemTenantId: '00000000000000000000000000000001',
    },
  },
}))

// Import after mocking
import { RagSearchService } from '../../src/modules/rag/services/rag-search.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal OpenSearch hit object with kb_id in source. */
function makeHit(
  id: string,
  content: string,
  score: number,
  kbId: string = '',
  overrides: Record<string, unknown> = {},
) {
  return {
    _id: id,
    _score: score,
    _source: {
      content_with_weight: content,
      doc_id: 'doc1',
      docnm_kwd: 'file.pdf',
      page_num_int: [1],
      position_int: [0, 100],
      kb_id: kbId,
      ...overrides,
    },
  }
}

/** Build a standard OpenSearch response envelope. */
function osResponse(hits: any[], total?: number) {
  return {
    body: {
      hits: {
        hits,
        total: total !== undefined ? { value: total } : { value: hits.length },
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RagSearchService.searchMultipleDatasets', () => {
  let service: RagSearchService

  beforeEach(() => {
    service = new RagSearchService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return merged results sorted by score with kb_id populated', async () => {
    const kb1Id = 'aaaa1111bbbb2222cccc3333dddd4444'
    const kb2Id = 'eeee5555ffff6666aaaa7777bbbb8888'

    mockSearch.mockResolvedValue(
      osResponse([
        makeHit('c1', 'chunk from kb1', 0.9, kb1Id),
        makeHit('c2', 'chunk from kb2', 0.95, kb2Id),
        makeHit('c3', 'another from kb1', 0.7, kb1Id),
      ])
    )

    const result = await service.searchMultipleDatasets(
      'tenant1',
      ['aaaa1111-bbbb-2222-cccc-3333dddd4444', 'eeee5555-ffff-6666-aaaa-7777bbbb8888'],
      { query: 'test query', method: 'full_text', top_k: 10 },
    )

    // Results should be sorted by score descending
    expect(result.chunks.length).toBe(3)
    expect(result.chunks[0].score).toBeGreaterThanOrEqual(result.chunks[1].score!)
    expect(result.chunks[1].score).toBeGreaterThanOrEqual(result.chunks[2].score!)

    // kb_id should be populated on each chunk
    expect(result.chunks[0].kb_id).toBe(kb2Id)
    expect(result.chunks[1].kb_id).toBe(kb1Id)
  })

  it('should pass ABAC filters through to OpenSearch query', async () => {
    mockSearch.mockResolvedValue(osResponse([]))

    const abacFilters = [
      { term: { department: 'engineering' } },
    ]

    await service.searchMultipleDatasets(
      'tenant1',
      ['aaaa1111-bbbb-2222-cccc-3333dddd4444'],
      { query: 'test', top_k: 5 },
      null,
      abacFilters,
    )

    // Verify the search was called and ABAC filters are included
    expect(mockSearch).toHaveBeenCalledTimes(1)
    const searchBody = mockSearch.mock.calls[0][0].body
    const filterClauses = searchBody.query.bool.filter
    // Should include available_int exclusion filter and ABAC filter
    // Tenant isolation is by index name (knowledge_{tenantId}), NOT by tenant_id field
    expect(filterClauses).toEqual(
      expect.arrayContaining([
        { bool: { must_not: [{ range: { available_int: { lt: 1 } } }] } },
        { term: { department: 'engineering' } },
      ])
    )
  })

  it('should cap to 20 KBs and log warning when more than 20 provided', async () => {
    mockSearch.mockResolvedValue(osResponse([]))

    // Generate 25 KB IDs
    const kbIds = Array.from({ length: 25 }, (_, i) =>
      `kb${String(i).padStart(4, '0')}00-0000-0000-0000-000000000000`
    )

    await service.searchMultipleDatasets(
      'tenant1',
      kbIds,
      { query: 'test', top_k: 5 },
    )

    // Should have logged a warning about exceeding 20 KB cap
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.stringContaining('20'),
      expect.any(Object),
    )

    // The search should use only 20 KB IDs in the terms filter
    const searchBody = mockSearch.mock.calls[0][0].body
    const mustClauses = searchBody.query.bool.must
    const termsClause = mustClauses.find((c: any) => c.terms?.kb_id)
    expect(termsClause.terms.kb_id).toHaveLength(20)
  })

  it('should return empty results when datasetIds is empty', async () => {
    const result = await service.searchMultipleDatasets(
      'tenant1',
      [],
      { query: 'test', top_k: 5 },
    )

    expect(result.chunks).toEqual([])
    expect(result.total).toBe(0)
    // Should not call OpenSearch at all
    expect(mockSearch).not.toHaveBeenCalled()
  })
})
