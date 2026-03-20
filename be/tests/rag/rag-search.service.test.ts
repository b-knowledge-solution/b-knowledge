/**
 * @fileoverview Tests for RagSearchService.
 *
 * Covers mapHits mapping logic, listChunks with available filter,
 * bulkSwitchChunks, hybridSearch score breakdown, deleteChunksByDocId,
 * and threshold filtering in the search dispatcher.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock the OpenSearch client
// ---------------------------------------------------------------------------

const mockSearch = vi.fn()
const mockBulk = vi.fn()
const mockIndex = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockDeleteByQuery = vi.fn()
const mockPing = vi.fn()

vi.mock('@opensearch-project/opensearch', () => ({
  Client: vi.fn().mockImplementation(() => ({
    search: mockSearch,
    bulk: mockBulk,
    index: mockIndex,
    update: mockUpdate,
    delete: mockDelete,
    deleteByQuery: mockDeleteByQuery,
    ping: mockPing,
  })),
}))

// Mock logger
vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
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

/** Build a minimal OpenSearch hit object. */
function makeHit(
  id: string,
  content: string,
  score: number,
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

describe('RagSearchService', () => {
  let service: RagSearchService

  beforeEach(() => {
    service = new RagSearchService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // mapHits (tested indirectly via fullTextSearch / listChunks)
  // -----------------------------------------------------------------------

  describe('mapHits', () => {
    it('maps available_int: 1 to available: true', async () => {
      mockSearch.mockResolvedValue(
        osResponse([makeHit('c1', 'text', 1.0, { available_int: 1 })]),
      )

      const { chunks } = await service.fullTextSearch('t1', 'ds1', 'text', 10)
      expect(chunks[0]!.available).toBe(true)
    })

    it('maps available_int: 0 to available: false', async () => {
      mockSearch.mockResolvedValue(
        osResponse([makeHit('c1', 'text', 1.0, { available_int: 0 })]),
      )

      const { chunks } = await service.fullTextSearch('t1', 'ds1', 'text', 10)
      expect(chunks[0]!.available).toBe(false)
    })

    it('defaults available to true when available_int is undefined', async () => {
      // Hit without available_int field
      const hit = {
        _id: 'c1',
        _score: 1.0,
        _source: {
          content_with_weight: 'legacy chunk',
          doc_id: 'doc1',
          docnm_kwd: 'file.pdf',
          page_num_int: [1],
          position_int: [],
        },
      }
      mockSearch.mockResolvedValue(osResponse([hit]))

      const { chunks } = await service.fullTextSearch('t1', 'ds1', 'q', 10)
      expect(chunks[0]!.available).toBe(true)
    })

    it('maps important_kwd and question_kwd arrays', async () => {
      mockSearch.mockResolvedValue(
        osResponse([
          makeHit('c1', 'text', 1.0, {
            important_kwd: ['key1', 'key2'],
            question_kwd: ['q1'],
          }),
        ]),
      )

      const { chunks } = await service.fullTextSearch('t1', 'ds1', 'text', 10)
      expect(chunks[0]!.important_kwd).toEqual(['key1', 'key2'])
      expect(chunks[0]!.question_kwd).toEqual(['q1'])
    })

    it('defaults to empty arrays when keywords are missing', async () => {
      // Hit source without important_kwd or question_kwd
      const hit = {
        _id: 'c1',
        _score: 1.0,
        _source: {
          content_with_weight: 'no keywords',
          doc_id: 'doc1',
          docnm_kwd: 'file.pdf',
          page_num_int: [],
          position_int: [],
        },
      }
      mockSearch.mockResolvedValue(osResponse([hit]))

      const { chunks } = await service.fullTextSearch('t1', 'ds1', 'q', 10)
      expect(chunks[0]!.important_kwd).toEqual([])
      expect(chunks[0]!.question_kwd).toEqual([])
    })

    it('calculates token_count from content length', async () => {
      // 20 chars => ceil(20/4) = 5 tokens
      const content = '12345678901234567890'
      mockSearch.mockResolvedValue(
        osResponse([makeHit('c1', content, 1.0)]),
      )

      const { chunks } = await service.fullTextSearch('t1', 'ds1', 'q', 10)
      expect(chunks[0]!.token_count).toBe(Math.ceil(content.length / 4))
    })

    it('extracts highlight from OpenSearch highlight response', async () => {
      const hit = {
        _id: 'c1',
        _score: 1.0,
        _source: {
          content_with_weight: 'full text here',
          doc_id: 'doc1',
          docnm_kwd: 'file.pdf',
          page_num_int: [],
          position_int: [],
        },
        highlight: {
          content_with_weight: ['<mark>full</mark> text here'],
        },
      }
      mockSearch.mockResolvedValue(osResponse([hit]))

      const { chunks } = await service.fullTextSearch('t1', 'ds1', 'full', 10)
      expect(chunks[0]!.highlight).toBe('<mark>full</mark> text here')
    })

    it('returns highlight as undefined when no highlight present', async () => {
      mockSearch.mockResolvedValue(
        osResponse([makeHit('c1', 'no highlight', 1.0)]),
      )

      const { chunks } = await service.fullTextSearch('t1', 'ds1', 'q', 10)
      expect(chunks[0]!.highlight).toBeUndefined()
    })
  })

  // -----------------------------------------------------------------------
  // listChunks with available filter
  // -----------------------------------------------------------------------

  describe('listChunks with available filter', () => {
    it('passes available_int: 1 term filter when available is true', async () => {
      mockSearch.mockResolvedValue(osResponse([], 0))

      await service.listChunks('t1', 'ds1', { available: true })

      const body = mockSearch.mock.calls[0]![0].body
      const must = body.query.bool.must
      expect(must).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ term: { available_int: 1 } }),
        ]),
      )
    })

    it('passes available_int: 0 term filter when available is false', async () => {
      mockSearch.mockResolvedValue(osResponse([], 0))

      await service.listChunks('t1', 'ds1', { available: false })

      const body = mockSearch.mock.calls[0]![0].body
      const must = body.query.bool.must
      expect(must).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ term: { available_int: 0 } }),
        ]),
      )
    })

    it('does not add available filter when available is undefined', async () => {
      mockSearch.mockResolvedValue(osResponse([], 0))

      await service.listChunks('t1', 'ds1', {})

      const body = mockSearch.mock.calls[0]![0].body
      const must = body.query.bool.must
      // Only kb_id filter, no available_int
      const availableFilters = must.filter(
        (m: any) => m.term && 'available_int' in m.term,
      )
      expect(availableFilters).toHaveLength(0)
    })
  })

  // -----------------------------------------------------------------------
  // bulkSwitchChunks
  // -----------------------------------------------------------------------

  describe('bulkSwitchChunks', () => {
    it('calls bulk API with correct update operations', async () => {
      mockBulk.mockResolvedValue({
        body: {
          items: [
            { update: { status: 200 } },
            { update: { status: 200 } },
          ],
        },
      })

      await service.bulkSwitchChunks('t1', 'ds1', ['c1', 'c2'], true)

      expect(mockBulk).toHaveBeenCalledTimes(1)
      const bulkBody = mockBulk.mock.calls[0]![0].body
      // Should have 4 entries: 2 actions + 2 docs
      expect(bulkBody).toHaveLength(4)
      // First pair: update action + doc
      expect(bulkBody[0]).toMatchObject({ update: { _id: 'c1' } })
      expect(bulkBody[1]).toEqual({ doc: { available_int: 1 } })
      // Second pair
      expect(bulkBody[2]).toMatchObject({ update: { _id: 'c2' } })
      expect(bulkBody[3]).toEqual({ doc: { available_int: 1 } })
    })

    it('returns count of successfully updated items', async () => {
      mockBulk.mockResolvedValue({
        body: {
          items: [
            { update: { status: 200 } },
            { update: { status: 404 } },
            { update: { status: 200 } },
          ],
        },
      })

      const result = await service.bulkSwitchChunks('t1', 'ds1', ['c1', 'c2', 'c3'], false)
      expect(result.updated).toBe(2)
    })

    it('handles empty chunk_ids gracefully', async () => {
      mockBulk.mockResolvedValue({
        body: { items: [] },
      })

      const result = await service.bulkSwitchChunks('t1', 'ds1', [], true)
      expect(result.updated).toBe(0)
    })
  })

  // -----------------------------------------------------------------------
  // hybridSearch score breakdown
  // -----------------------------------------------------------------------

  describe('hybridSearch score breakdown', () => {
    it('returns vector_similarity and term_similarity on merged results', async () => {
      // Full-text results
      mockSearch.mockResolvedValueOnce(
        osResponse([makeHit('c1', 'shared', 2.0)]),
      )
      // Semantic results
      mockSearch.mockResolvedValueOnce(
        osResponse([makeHit('c1', 'shared', 0.8)]),
      )

      const { chunks } = await service.hybridSearch(
        't1', 'ds1', 'query', [0.1], 10, 0, 0.5,
      )

      const c1 = chunks.find((c) => c.chunk_id === 'c1')
      expect(c1).toBeDefined()
      // Both scores should be present
      expect(c1!.vector_similarity).toBeDefined()
      expect(c1!.term_similarity).toBeDefined()
    })

    it('applies vectorWeight correctly to score formula', async () => {
      const vectorWeight = 0.7
      const textWeight = 1 - vectorWeight

      // Full-text results
      mockSearch.mockResolvedValueOnce(
        osResponse([makeHit('c1', 'content', 4.0)]),
      )
      // Semantic results
      mockSearch.mockResolvedValueOnce(
        osResponse([makeHit('c1', 'content', 0.9)]),
      )

      const { chunks } = await service.hybridSearch(
        't1', 'ds1', 'query', [0.1], 10, 0, vectorWeight,
      )

      const c1 = chunks.find((c) => c.chunk_id === 'c1')
      // When c1 is the only result in each set, normalized scores are both 1.0
      // weightedScore = textWeight * 1.0 + vectorWeight * 1.0 = 1.0
      const expectedScore = textWeight * 1.0 + vectorWeight * 1.0
      expect(c1!.score).toBeCloseTo(expectedScore, 5)
    })
  })

  // -----------------------------------------------------------------------
  // deleteChunksByDocId
  // -----------------------------------------------------------------------

  describe('deleteChunksByDocId', () => {
    it('strips hyphens from docId before querying', async () => {
      mockDeleteByQuery.mockResolvedValue({
        body: { deleted: 3 },
      })

      await service.deleteChunksByDocId('t1', 'ds1', 'abc-def-123')

      const body = mockDeleteByQuery.mock.calls[0]![0].body
      const docIdTerm = body.query.bool.must.find(
        (m: any) => m.term && 'doc_id' in m.term,
      )
      // Hyphens should be removed
      expect(docIdTerm.term.doc_id).toBe('abcdef123')
    })

    it('uses correct index and query structure', async () => {
      mockDeleteByQuery.mockResolvedValue({
        body: { deleted: 1 },
      })

      const result = await service.deleteChunksByDocId('t1', 'ds1', 'docid')

      expect(mockDeleteByQuery).toHaveBeenCalledTimes(1)
      const callArg = mockDeleteByQuery.mock.calls[0]![0]
      // Index should follow knowledge_{tenantId} pattern
      expect(callArg.index).toBe('knowledge_t1')
      // Query must include both kb_id and doc_id
      const must = callArg.body.query.bool.must
      expect(must).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ term: { kb_id: 'ds1' } }),
          expect.objectContaining({ term: { doc_id: 'docid' } }),
          expect.objectContaining({ term: { tenant_id: 't1' } }),
        ]),
      )
      expect(result.deleted).toBe(1)
    })
  })

  // -----------------------------------------------------------------------
  // Threshold filtering in search dispatcher
  // -----------------------------------------------------------------------

  describe('search dispatcher threshold filtering', () => {
    it('filters results below similarity_threshold', async () => {
      mockSearch.mockResolvedValue(
        osResponse([
          makeHit('c1', 'high', 0.9),
          makeHit('c2', 'medium', 0.5),
          makeHit('c3', 'low', 0.1),
        ]),
      )

      const result = await service.search('t1', 'ds1', {
        query: 'test',
        method: 'full_text',
        similarity_threshold: 0.4,
      })

      // Only c1 (0.9) and c2 (0.5) should remain; c3 (0.1) is below 0.4
      const ids = result.chunks.map((c) => c.chunk_id)
      expect(ids).toContain('c1')
      expect(ids).toContain('c2')
      expect(ids).not.toContain('c3')
    })

    it('filters by doc_ids when provided', async () => {
      mockSearch.mockResolvedValue(osResponse([makeHit('c1', 'text', 1.0)]))

      await service.search('t1', 'ds1', {
        query: 'q',
        method: 'full_text',
        doc_ids: ['doc-a', 'doc-b'],
      })

      const body = mockSearch.mock.calls[0]![0].body
      const filter = body.query.bool.filter
      // Should contain a terms filter for doc_id
      const docIdsFilter = filter.find(
        (f: any) => f.terms && 'doc_id' in f.terms,
      )
      expect(docIdsFilter).toBeDefined()
      expect(docIdsFilter.terms.doc_id).toEqual(['doc-a', 'doc-b'])
    })

    it('sets term_similarity for full_text results', async () => {
      mockSearch.mockResolvedValue(
        osResponse([makeHit('c1', 'text', 0.8)]),
      )

      const result = await service.search('t1', 'ds1', {
        query: 'test',
        method: 'full_text',
      })

      // full_text method should populate term_similarity from score
      expect(result.chunks[0]!.term_similarity).toBe(0.8)
    })

    it('sets vector_similarity for semantic results', async () => {
      mockSearch.mockResolvedValue(
        osResponse([makeHit('c1', 'semantic', 0.85)]),
      )

      const result = await service.search(
        't1', 'ds1',
        { query: 'test', method: 'semantic' },
        [0.1, 0.2, 0.3],
      )

      // semantic method should populate vector_similarity from score
      expect(result.chunks[0]!.vector_similarity).toBe(0.85)
    })
  })
})
