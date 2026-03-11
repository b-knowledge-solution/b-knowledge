/**
 * @fileoverview Tests for RagSearchService.
 *
 * Covers fullTextSearch, semanticSearch, hybridSearch, the search dispatcher,
 * listChunks, health check, and mapHits mapping logic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock the OpenSearch client
// ---------------------------------------------------------------------------

const mockSearch = vi.fn()
const mockPing = vi.fn()

vi.mock('@opensearch-project/opensearch', () => ({
  Client: vi.fn().mockImplementation(() => ({
    search: mockSearch,
    ping: mockPing,
  })),
}))

// Import after mocking
import { RagSearchService } from '../../src/modules/rag/services/rag-search.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal OpenSearch hit object. */
function makeHit(id: string, content: string, score: number) {
  return {
    _id: id,
    _score: score,
    _source: {
      content_with_weight: content,
      doc_id: 'doc1',
      docnm_kwd: 'file.pdf',
      page_num_int: [1],
      position_int: [0, 100],
    },
  }
}

function osResponse(hits: any[], total?: number) {
  return {
    body: {
      hits: {
        hits,
        total: total !== undefined ? { value: total } : hits.length,
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
  // fullTextSearch
  // -----------------------------------------------------------------------

  describe('fullTextSearch', () => {
    it('returns mapped chunk results', async () => {
      mockSearch.mockResolvedValue(osResponse([makeHit('c1', 'hello world', 1.5)]))

      const results = await service.fullTextSearch('ds1', 'hello', 10)

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        chunk_id: 'c1',
        text: 'hello world',
        doc_id: 'doc1',
        score: 1.5,
        method: 'full_text',
      })
    })

    it('returns empty array when no hits', async () => {
      mockSearch.mockResolvedValue(osResponse([]))

      const results = await service.fullTextSearch('ds1', 'nothing', 10)
      expect(results).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // semanticSearch
  // -----------------------------------------------------------------------

  describe('semanticSearch', () => {
    it('returns results above threshold', async () => {
      mockSearch.mockResolvedValue(osResponse([
        makeHit('c1', 'relevant', 0.9),
        makeHit('c2', 'irrelevant', 0.1),
      ]))

      const results = await service.semanticSearch('ds1', [0.1, 0.2], 10, 0.5)

      expect(results).toHaveLength(1)
      expect(results[0]!.chunk_id).toBe('c1')
    })

    it('returns empty when all results below threshold', async () => {
      mockSearch.mockResolvedValue(osResponse([makeHit('c1', 'low', 0.1)]))

      const results = await service.semanticSearch('ds1', [0.1], 10, 0.5)
      expect(results).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // hybridSearch
  // -----------------------------------------------------------------------

  describe('hybridSearch', () => {
    it('falls back to full text when no query vector', async () => {
      mockSearch.mockResolvedValue(osResponse([makeHit('c1', 'text', 1.0)]))

      const results = await service.hybridSearch('ds1', 'query', null, 10, 0)

      expect(results).toHaveLength(1)
      // Only one search call (full-text), not two
      expect(mockSearch).toHaveBeenCalledTimes(1)
    })

    it('merges and deduplicates results keeping highest score', async () => {
      // First call: fullTextSearch
      mockSearch.mockResolvedValueOnce(osResponse([
        makeHit('c1', 'shared', 0.5),
        makeHit('c2', 'text-only', 0.3),
      ]))
      // Second call: semanticSearch
      mockSearch.mockResolvedValueOnce(osResponse([
        makeHit('c1', 'shared', 0.9),
        makeHit('c3', 'semantic-only', 0.7),
      ]))

      const results = await service.hybridSearch('ds1', 'query', [0.1], 10, 0)

      expect(results).toHaveLength(3)
      // c1 should have highest score (0.9)
      const c1 = results.find(r => r.chunk_id === 'c1')
      expect(c1?.score).toBe(0.9)
      // Sorted by score desc
      expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score!)
    })

    it('respects topK limit after merge', async () => {
      mockSearch.mockResolvedValueOnce(osResponse([
        makeHit('c1', 'a', 1.0),
        makeHit('c2', 'b', 0.9),
      ]))
      mockSearch.mockResolvedValueOnce(osResponse([
        makeHit('c3', 'c', 0.8),
        makeHit('c4', 'd', 0.7),
      ]))

      const results = await service.hybridSearch('ds1', 'q', [0.1], 2, 0)
      expect(results).toHaveLength(2)
    })
  })

  // -----------------------------------------------------------------------
  // search dispatcher
  // -----------------------------------------------------------------------

  describe('search', () => {
    it('defaults to full_text method', async () => {
      mockSearch.mockResolvedValue(osResponse([makeHit('c1', 'text', 1.0)]))

      const result = await service.search('ds1', { query: 'test' })

      expect(result.chunks).toHaveLength(1)
      expect(result.total).toBe(1)
    })

    it('uses full_text when method is semantic but no vector provided', async () => {
      mockSearch.mockResolvedValue(osResponse([makeHit('c1', 'fallback', 1.0)]))

      const result = await service.search('ds1', { query: 'q', method: 'semantic' })

      expect(result.chunks).toHaveLength(1)
      // Only one OS call (full-text fallback)
      expect(mockSearch).toHaveBeenCalledTimes(1)
    })

    it('uses semantic search when method is semantic and vector provided', async () => {
      mockSearch.mockResolvedValue(osResponse([makeHit('c1', 'sem', 0.9)]))

      const result = await service.search('ds1', { query: 'q', method: 'semantic' }, [0.1, 0.2])

      expect(result.chunks).toHaveLength(1)
    })

    it('defaults top_k to 10 when not specified', async () => {
      mockSearch.mockResolvedValue(osResponse([]))

      await service.search('ds1', { query: 'q' })

      // Verify size=10 was passed
      const searchBody = mockSearch.mock.calls[0]![0].body
      expect(searchBody.size).toBe(10)
    })

    it('respects custom top_k', async () => {
      mockSearch.mockResolvedValue(osResponse([]))

      await service.search('ds1', { query: 'q', top_k: 5 })

      const searchBody = mockSearch.mock.calls[0]![0].body
      expect(searchBody.size).toBe(5)
    })
  })

  // -----------------------------------------------------------------------
  // listChunks
  // -----------------------------------------------------------------------

  describe('listChunks', () => {
    it('returns paginated chunks', async () => {
      mockSearch.mockResolvedValue(osResponse([makeHit('c1', 'chunk', 0)], 50))

      const result = await service.listChunks('ds1', { page: 1, limit: 20 })

      expect(result.chunks).toHaveLength(1)
      expect(result.total).toBe(50)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
    })

    it('applies doc_id filter when provided', async () => {
      mockSearch.mockResolvedValue(osResponse([], 0))

      await service.listChunks('ds1', { doc_id: 'doc-abc' })

      const body = mockSearch.mock.calls[0]![0].body
      const must = body.query.bool.must
      expect(must).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ term: { doc_id: 'doc-abc' } }),
        ])
      )
    })

    it('defaults to page 1 and limit 20', async () => {
      mockSearch.mockResolvedValue(osResponse([], 0))

      const result = await service.listChunks('ds1')

      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
      const body = mockSearch.mock.calls[0]![0].body
      expect(body.from).toBe(0)
      expect(body.size).toBe(20)
    })
  })

  // -----------------------------------------------------------------------
  // health
  // -----------------------------------------------------------------------

  describe('health', () => {
    it('returns true when ping succeeds', async () => {
      mockPing.mockResolvedValue({})
      expect(await service.health()).toBe(true)
    })

    it('returns false when ping fails', async () => {
      mockPing.mockRejectedValue(new Error('connection refused'))
      expect(await service.health()).toBe(false)
    })
  })
})
