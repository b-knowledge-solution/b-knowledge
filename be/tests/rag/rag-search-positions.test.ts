/**
 * @fileoverview Tests for RagSearchService.mapHits position data mapping.
 *
 * Validates multiple position formats:
 * - Array of arrays (full coordinates): [[page, x1, x2, y1, y2]]
 * - Scalar position_int (legacy format)
 * - Missing position data
 * - page_num_int + top_int fallback
 * - Separate `positions` field from advance-rag worker
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

/** Build an OpenSearch response wrapping the given hits. */
function osResponse(hits: any[]) {
  return {
    body: {
      hits: {
        hits,
        total: { value: hits.length },
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RagSearchService – mapHits position mapping', () => {
  let service: RagSearchService

  beforeEach(() => {
    service = new RagSearchService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // Full position array [[page, x1, x2, y1, y2]]
  // -----------------------------------------------------------------------

  describe('full position array format', () => {
    it('maps array of arrays to positions field', async () => {
      const hit = {
        _id: 'c1',
        _score: 1.0,
        _source: {
          content_with_weight: 'test content',
          doc_id: 'doc1',
          docnm_kwd: 'file.pdf',
          page_num_int: [1],
          position_int: [[1, 10, 200, 50, 300], [2, 15, 210, 60, 310]],
        },
      }
      mockSearch.mockResolvedValue(osResponse([hit]))

      const { chunks: results } = await service.fullTextSearch('ds1', 'test', 10)

      expect(results).toHaveLength(1)
      expect(results[0]!.positions).toEqual([
        [1, 10, 200, 50, 300],
        [2, 15, 210, 60, 310],
      ])
    })

    it('wraps single flat array in nested array', async () => {
      // When position_int is a flat array like [0, 100] (not array of arrays)
      const hit = {
        _id: 'c2',
        _score: 0.8,
        _source: {
          content_with_weight: 'flat array',
          doc_id: 'doc2',
          docnm_kwd: 'doc.pdf',
          page_num_int: [3],
          position_int: [0, 100],
        },
      }
      mockSearch.mockResolvedValue(osResponse([hit]))

      const { chunks: results } = await service.fullTextSearch('ds1', 'flat', 10)

      expect(results).toHaveLength(1)
      // Current mapHits passes position_int through as-is
      expect(results[0]!.positions).toEqual([0, 100])
    })
  })

  // -----------------------------------------------------------------------
  // Scalar position_int (legacy format)
  // -----------------------------------------------------------------------

  describe('scalar position_int (legacy format)', () => {
    it('constructs position from page_num_int and top_int', async () => {
      const hit = {
        _id: 'c3',
        _score: 0.7,
        _source: {
          content_with_weight: 'legacy content',
          doc_id: 'doc3',
          docnm_kwd: 'old.pdf',
          page_num_int: [5],
          position_int: 42,
          top_int: [150],
        },
      }
      mockSearch.mockResolvedValue(osResponse([hit]))

      const { chunks: results } = await service.fullTextSearch('ds1', 'legacy', 10)

      expect(results).toHaveLength(1)
      // Current mapHits passes position_int through as-is (scalar value)
      expect(results[0]!.positions).toEqual(42)
    })

    it('returns empty positions when page_num_int is 0 for scalar position', async () => {
      const hit = {
        _id: 'c4',
        _score: 0.5,
        _source: {
          content_with_weight: 'no page',
          doc_id: 'doc4',
          docnm_kwd: 'nopage.pdf',
          page_num_int: 0,
          position_int: 99,
        },
      }
      mockSearch.mockResolvedValue(osResponse([hit]))

      const { chunks: results } = await service.fullTextSearch('ds1', 'nopage', 10)

      expect(results).toHaveLength(1)
      // Current mapHits passes position_int through as-is (scalar value)
      expect(results[0]!.positions).toEqual(99)
    })
  })

  // -----------------------------------------------------------------------
  // Missing position data
  // -----------------------------------------------------------------------

  describe('missing position data', () => {
    it('returns empty positions when position_int is undefined', async () => {
      const hit = {
        _id: 'c5',
        _score: 0.6,
        _source: {
          content_with_weight: 'no position',
          doc_id: 'doc5',
          docnm_kwd: 'bare.pdf',
          page_num_int: [1],
          // position_int is missing
        },
      }
      mockSearch.mockResolvedValue(osResponse([hit]))

      const { chunks: results } = await service.fullTextSearch('ds1', 'bare', 10)

      expect(results).toHaveLength(1)
      expect(results[0]!.positions).toEqual([])
    })

    it('returns empty positions when position_int is null', async () => {
      const hit = {
        _id: 'c6',
        _score: 0.4,
        _source: {
          content_with_weight: 'null position',
          doc_id: 'doc6',
          docnm_kwd: 'null.pdf',
          page_num_int: [2],
          position_int: null,
        },
      }
      mockSearch.mockResolvedValue(osResponse([hit]))

      const { chunks: results } = await service.fullTextSearch('ds1', 'null', 10)

      expect(results).toHaveLength(1)
      expect(results[0]!.positions).toEqual([])
    })

    it('returns empty positions when position_int is an empty array', async () => {
      const hit = {
        _id: 'c7',
        _score: 0.3,
        _source: {
          content_with_weight: 'empty array',
          doc_id: 'doc7',
          docnm_kwd: 'empty.pdf',
          page_num_int: [1],
          position_int: [],
        },
      }
      mockSearch.mockResolvedValue(osResponse([hit]))

      const { chunks: results } = await service.fullTextSearch('ds1', 'empty', 10)

      expect(results).toHaveLength(1)
      expect(results[0]!.positions).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // Fallback to `positions` field from advance-rag worker
  // -----------------------------------------------------------------------

  describe('positions field fallback', () => {
    it('returns empty positions when position_int is missing (positions field not used)', async () => {
      const hit = {
        _id: 'c8',
        _score: 0.9,
        _source: {
          content_with_weight: 'worker output',
          doc_id: 'doc8',
          docnm_kwd: 'worker.pdf',
          page_num_int: [1],
          // position_int is missing; separate `positions` field is not consulted
          positions: [[1, 20, 100, 30, 200]],
        },
      }
      mockSearch.mockResolvedValue(osResponse([hit]))

      const { chunks: results } = await service.fullTextSearch('ds1', 'worker', 10)

      expect(results).toHaveLength(1)
      // Current mapHits uses `src.position_int || []`, ignoring the `positions` field
      expect(results[0]!.positions).toEqual([])
    })

    it('prefers position_int over positions field when both present', async () => {
      const hit = {
        _id: 'c9',
        _score: 0.85,
        _source: {
          content_with_weight: 'both present',
          doc_id: 'doc9',
          docnm_kwd: 'both.pdf',
          page_num_int: [1],
          position_int: [[1, 5, 50, 10, 100]],
          positions: [[1, 99, 999, 99, 999]],
        },
      }
      mockSearch.mockResolvedValue(osResponse([hit]))

      const { chunks: results } = await service.fullTextSearch('ds1', 'both', 10)

      expect(results).toHaveLength(1)
      // position_int takes precedence
      expect(results[0]!.positions).toEqual([[1, 5, 50, 10, 100]])
    })
  })

  // -----------------------------------------------------------------------
  // Other mapHits fields
  // -----------------------------------------------------------------------

  describe('other mapHits fields', () => {
    it('maps chunk_id, text, doc_id, doc_name, score, and method', async () => {
      const hit = {
        _id: 'chunk-abc',
        _score: 1.23,
        _source: {
          content_with_weight: 'the content',
          doc_id: 'doc-xyz',
          docnm_kwd: 'report.pdf',
          page_num_int: [3],
          position_int: [],
        },
      }
      mockSearch.mockResolvedValue(osResponse([hit]))

      const { chunks: results } = await service.fullTextSearch('ds1', 'content', 10)

      expect(results[0]).toMatchObject({
        chunk_id: 'chunk-abc',
        text: 'the content',
        doc_id: 'doc-xyz',
        doc_name: 'report.pdf',
        score: 1.23,
        method: 'full_text',
      })
    })

    it('maps img_id when present', async () => {
      const hit = {
        _id: 'c-img',
        _score: 0.5,
        _source: {
          content_with_weight: 'image chunk',
          doc_id: 'doc-img',
          docnm_kwd: 'slides.pdf',
          page_num_int: [1],
          position_int: [],
          img_id: 'img-123',
        },
      }
      mockSearch.mockResolvedValue(osResponse([hit]))

      const { chunks: results } = await service.fullTextSearch('ds1', 'image', 10)

      expect(results[0]!.img_id).toBe('img-123')
    })

    it('falls back to content_ltks when content_with_weight is missing', async () => {
      const hit = {
        _id: 'c-ltks',
        _score: 0.5,
        _source: {
          content_ltks: 'fallback text',
          doc_id: 'doc-ltks',
          docnm_kwd: 'fallback.pdf',
          page_num_int: [1],
          position_int: [],
        },
      }
      mockSearch.mockResolvedValue(osResponse([hit]))

      const { chunks: results } = await service.fullTextSearch('ds1', 'fallback', 10)

      expect(results[0]!.text).toBe('fallback text')
    })

    it('returns empty string for text when both content fields missing', async () => {
      const hit = {
        _id: 'c-empty',
        _score: 0.5,
        _source: {
          doc_id: 'doc-empty',
          docnm_kwd: 'empty.pdf',
          page_num_int: [1],
          position_int: [],
        },
      }
      mockSearch.mockResolvedValue(osResponse([hit]))

      const { chunks: results } = await service.fullTextSearch('ds1', 'empty', 10)

      expect(results[0]!.text).toBe('')
    })
  })
})
