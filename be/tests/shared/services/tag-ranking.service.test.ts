/**
 * @fileoverview Tests for TagRankingService.
 *
 * Covers getQueryTags (TF-IDF tag extraction from chunks) and
 * scoreChunksByTags (cosine-similarity score boosting).
 */

import { describe, it, expect } from 'vitest'
import { tagRankingService } from '../../../src/shared/services/tag-ranking.service'
import type { ChunkResult } from '../../../src/shared/models/types'

/**
 * @description Helper to build a minimal ChunkResult with optional tag_kwd and score.
 */
function makeChunk(overrides: Partial<ChunkResult> = {}): ChunkResult {
  return {
    chunk_id: 'c1',
    text: 'test content',
    score: 1,
    ...overrides,
  } as ChunkResult
}

describe('TagRankingService', () => {
  // ── getQueryTags ─────────────────────────────────────────────────────

  describe('getQueryTags', () => {
    it('returns empty record when chunks array is empty', () => {
      const result = tagRankingService.getQueryTags([])
      expect(result).toEqual({})
    })

    it('returns empty record when chunks have no tag_kwd', () => {
      const chunks = [makeChunk(), makeChunk()]
      const result = tagRankingService.getQueryTags(chunks)
      expect(result).toEqual({})
    })

    it('extracts tags from object-style tag_kwd', () => {
      const chunks = [
        makeChunk({ tag_kwd: { python: 0.8, javascript: 0.3 } }),
        makeChunk({ tag_kwd: { python: 0.5, typescript: 0.4 } }),
      ]
      const result = tagRankingService.getQueryTags(chunks, 5)
      // python appears in 2 chunks, javascript and typescript in 1 each
      expect(Object.keys(result)).toContain('python')
      expect(Object.keys(result).length).toBeGreaterThan(0)
    })

    it('extracts tags from comma-separated string tag_kwd', () => {
      const chunks = [
        makeChunk({ tag_kwd: 'react, vue, angular' } as any),
        makeChunk({ tag_kwd: 'react, svelte' } as any),
      ]
      // Use topnTags=5 to ensure all tags are captured
      const result = tagRankingService.getQueryTags(chunks, 5)
      expect(Object.keys(result)).toContain('react')
      expect(Object.keys(result)).toContain('vue')
    })

    it('extracts tags from array-style tag_kwd', () => {
      const chunks = [
        makeChunk({ tag_kwd: ['database', 'sql'] } as any),
      ]
      const result = tagRankingService.getQueryTags(chunks, 5)
      expect(Object.keys(result)).toContain('database')
      expect(Object.keys(result)).toContain('sql')
    })

    it('extracts tags from JSON string tag_kwd', () => {
      const chunks = [
        makeChunk({ tag_kwd: '{"api": 0.9, "rest": 0.4}' } as any),
      ]
      const result = tagRankingService.getQueryTags(chunks, 5)
      expect(Object.keys(result)).toContain('api')
    })

    it('respects topnTags limit', () => {
      const chunks = [
        makeChunk({ tag_kwd: { a: 1, b: 1, c: 1, d: 1, e: 1 } }),
      ]
      const result = tagRankingService.getQueryTags(chunks, 2)
      expect(Object.keys(result).length).toBeLessThanOrEqual(2)
    })

    it('scores frequent tags with TF-IDF formula', () => {
      // Create chunks where "common" appears in all and "rare" in only one
      const chunks = [
        makeChunk({ tag_kwd: { common: 1, rare: 1 } }),
        makeChunk({ tag_kwd: { common: 1 } }),
        makeChunk({ tag_kwd: { common: 1 } }),
      ]
      const result = tagRankingService.getQueryTags(chunks, 5)
      // Both tags should appear; rare should have higher TF-IDF score
      expect(result).toHaveProperty('rare')
      expect(result).toHaveProperty('common')
      // rare tag (count=1) should score higher than common (count=3) due to IDF
      expect(result['rare']).toBeGreaterThan(result['common']!)
    })
  })

  // ── scoreChunksByTags ────────────────────────────────────────────────

  describe('scoreChunksByTags', () => {
    it('returns chunks unchanged when queryTags is empty', () => {
      const chunks = [makeChunk({ score: 5 }), makeChunk({ score: 3 })]
      const result = tagRankingService.scoreChunksByTags(chunks, {})
      expect(result).toEqual(chunks)
    })

    it('boosts chunks with matching tags', () => {
      const chunks = [
        makeChunk({ chunk_id: 'match', tag_kwd: { python: 1 }, score: 1 }),
        makeChunk({ chunk_id: 'nomatch', score: 1 }),
      ]
      const queryTags = { python: 0.5 }
      const result = tagRankingService.scoreChunksByTags(chunks, queryTags)

      // The chunk with matching tag should be boosted and appear first
      expect(result[0]!.chunk_id).toBe('match')
      expect(result[0]!.score).toBeGreaterThan(1)
    })

    it('sorts chunks by boosted score descending', () => {
      const chunks = [
        makeChunk({ chunk_id: 'low', tag_kwd: {}, score: 10 }),
        makeChunk({ chunk_id: 'high', tag_kwd: { ml: 1, ai: 1 }, score: 5 }),
      ]
      const queryTags = { ml: 0.8, ai: 0.6 }
      const result = tagRankingService.scoreChunksByTags(chunks, queryTags)

      // high-tag chunk should be boosted enough to outrank the low-tag chunk
      expect(result[0]!.chunk_id).toBe('high')
    })

    it('includes pagerank_fea in score boosting', () => {
      const chunks = [
        makeChunk({ chunk_id: 'nopr', tag_kwd: { x: 1 }, score: 1, pagerank_fea: 0 } as any),
        makeChunk({ chunk_id: 'withpr', tag_kwd: { x: 1 }, score: 1, pagerank_fea: 5 } as any),
      ]
      const queryTags = { x: 0.5 }
      const result = tagRankingService.scoreChunksByTags(chunks, queryTags)

      // Chunk with pagerank should score higher
      expect(result[0]!.chunk_id).toBe('withpr')
    })
  })
})
