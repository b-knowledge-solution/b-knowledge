/**
 * @fileoverview Tests for RagSearchService similarity threshold bypass logic.
 *
 * When explicit doc_ids are provided, the similarity threshold is bypassed
 * (set to 0) so those documents are always included regardless of relevance score.
 * Upstream port: search.py similarity threshold bypass for explicit doc_ids.
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

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../src/shared/config/index.js', () => ({
  config: {
    opensearch: {
      host: 'http://localhost:9201',
      password: 'admin',
      systemTenantId: '00000000000000000000000000000001',
    },
  },
}))

import { RagSearchService } from '../../src/modules/rag/services/rag-search.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @description Build a minimal OpenSearch hit object */
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

/** @description Build a standard OpenSearch response envelope */
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

describe('RagSearchService — similarity threshold bypass', () => {
  let service: RagSearchService

  beforeEach(() => {
    service = new RagSearchService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('threshold applied when no doc_ids', () => {
    it('filters out low-scoring results when no doc_ids are provided', async () => {
      // Return chunks with varying scores
      mockSearch.mockResolvedValue(
        osResponse([
          makeHit('c1', 'high relevance', 0.9),
          makeHit('c2', 'low relevance', 0.1),
        ]),
      )

      const result = await service.search('t1', 'ds1', {
        query: 'test',
        method: 'full_text',
        similarity_threshold: 0.5,
      })

      // c2 (score 0.1) is below threshold 0.5 — should be filtered out
      const ids = result.chunks.map(c => c.chunk_id)
      expect(ids).toContain('c1')
      expect(ids).not.toContain('c2')
    })

    it('uses default threshold of 0.2 when similarity_threshold is not set', async () => {
      mockSearch.mockResolvedValue(
        osResponse([
          makeHit('c1', 'above default', 0.5),
          makeHit('c2', 'below default', 0.1),
        ]),
      )

      const result = await service.search('t1', 'ds1', {
        query: 'test',
        method: 'full_text',
        // no similarity_threshold specified — defaults to 0.2
      })

      // c2 (score 0.1) is below the default threshold of 0.2
      const ids = result.chunks.map(c => c.chunk_id)
      expect(ids).toContain('c1')
      expect(ids).not.toContain('c2')
    })
  })

  describe('threshold bypassed when doc_ids provided', () => {
    it('uses fallback 0.2 threshold instead of high configured threshold when doc_ids present', async () => {
      // When doc_ids are provided, the computed threshold is set to 0.
      // When doc_ids are provided, threshold is bypassed to 0 (RAGFlow behavior).
      // All chunks from explicitly selected documents are included regardless of score.
      mockSearch.mockResolvedValue(
        osResponse([
          makeHit('c1', 'above fallback threshold', 0.3, { doc_id: 'doc-a' }),
          makeHit('c2', 'below fallback threshold', 0.1, { doc_id: 'doc-a' }),
        ]),
      )

      const result = await service.search('t1', 'ds1', {
        query: 'test',
        method: 'full_text',
        similarity_threshold: 0.9,
        doc_ids: ['doc-a'],
      })

      // Without doc_ids, threshold=0.9 would filter out both (0.3 and 0.1 < 0.9).
      // With doc_ids, threshold is fully bypassed to 0 — all chunks pass.
      const ids = result.chunks.map(c => c.chunk_id)
      expect(ids).toContain('c1')
      expect(ids).toContain('c2')
    })

    it('adds doc_ids terms filter to the OpenSearch query', async () => {
      mockSearch.mockResolvedValue(osResponse([]))

      await service.search('t1', 'ds1', {
        query: 'test',
        method: 'full_text',
        doc_ids: ['doc-a', 'doc-b'],
      })

      // Verify that a terms filter was added for doc_id
      const body = mockSearch.mock.calls[0]![0].body
      const filter = body.query.bool.filter
      const docIdsFilter = filter.find(
        (f: any) => f.terms && 'doc_id' in f.terms,
      )
      expect(docIdsFilter).toBeDefined()
      expect(docIdsFilter.terms.doc_id).toEqual(['doc-a', 'doc-b'])
    })

    it('doc_ids bypass lowers effective threshold from configured value to 0.2 fallback', async () => {
      // With similarity_threshold=0.5 and no doc_ids, chunks below 0.5 are filtered.
      // With doc_ids, threshold becomes 0 -> fallback 0.2 is used.
      // So chunks between 0.2 and 0.5 that would normally be filtered are now included.
      mockSearch.mockResolvedValue(
        osResponse([
          makeHit('c1', 'medium score', 0.35, { doc_id: 'doc-x' }),
          makeHit('c2', 'high score', 0.8, { doc_id: 'doc-x' }),
        ]),
      )

      const result = await service.search('t1', 'ds1', {
        query: 'test',
        method: 'full_text',
        similarity_threshold: 0.5,
        doc_ids: ['doc-x'],
      })

      // Both should pass: 0.35 >= 0.2 and 0.8 >= 0.2
      expect(result.chunks.map(c => c.chunk_id)).toContain('c1')
      expect(result.chunks.map(c => c.chunk_id)).toContain('c2')
    })
  })
})
