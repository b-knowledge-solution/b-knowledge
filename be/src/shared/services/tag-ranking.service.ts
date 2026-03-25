/**
 * @fileoverview Tag ranking service for boosting chunk relevance using tag-based TF-IDF scoring.
 *
 * Derives query-relevant tags from retrieved chunks and re-scores chunks
 * using cosine similarity between chunk tags and query-level tag vectors.
 *
 * @module shared/services/tag-ranking
 */

import type { ChunkResult } from '@/shared/models/types.js'

/**
 * @description Tag ranking service that computes query-level tag relevance via TF-IDF
 * and boosts chunk scores using cosine similarity between chunk tags and query tags.
 * Singleton instance exported as `tagRankingService`.
 */
class TagRankingService {
  /**
   * @description Parse a chunk's tag_kwd field into a normalized tag-score record.
   * Handles multiple formats: object, JSON string, comma-separated string, array, or null.
   * @param {unknown} tagKwd - Raw tag_kwd value from an OpenSearch chunk document
   * @returns {Record<string, number>} Normalized tag-to-score mapping
   *
   * @example
   * ```ts
   * parseChunkTags({ foo: 0.8, bar: 0.3 }) // { foo: 0.8, bar: 0.3 }
   * parseChunkTags('foo, bar')              // { foo: 1, bar: 1 }
   * parseChunkTags(['foo', 'bar'])          // { foo: 1, bar: 1 }
   * parseChunkTags(null)                    // {}
   * ```
   */
  private parseChunkTags(tagKwd: unknown): Record<string, number> {
    // Null or undefined — no tags
    if (tagKwd == null) return {}

    // Already an object — return as-is (OpenSearch may store as JSON object)
    if (typeof tagKwd === 'object' && !Array.isArray(tagKwd)) {
      return tagKwd as Record<string, number>
    }

    // Array of tag strings — assign uniform weight
    if (Array.isArray(tagKwd)) {
      const result: Record<string, number> = {}
      for (const tag of tagKwd) {
        const trimmed = String(tag).trim()
        if (trimmed) result[trimmed] = 1
      }
      return result
    }

    // String — try JSON parse first, fall back to comma-separated
    if (typeof tagKwd === 'string') {
      const trimmed = tagKwd.trim()
      if (!trimmed) return {}

      // Attempt JSON parse for stringified objects or arrays
      try {
        const parsed = JSON.parse(trimmed)
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          return parsed as Record<string, number>
        }
        if (Array.isArray(parsed)) {
          const result: Record<string, number> = {}
          for (const tag of parsed) {
            const t = String(tag).trim()
            if (t) result[t] = 1
          }
          return result
        }
      } catch {
        // Not valid JSON — treat as comma-separated string
      }

      // Comma-separated string fallback
      const result: Record<string, number> = {}
      for (const part of trimmed.split(',')) {
        const t = part.trim()
        if (t) result[t] = 1
      }
      return result
    }

    return {}
  }

  /**
   * @description Derive query-relevant tags from retrieved chunks using TF-IDF scoring.
   * Counts tag occurrences across all chunks, applies a TF-IDF formula to weight
   * rare but present tags higher, and returns the top N tags.
   * @param {ChunkResult[]} chunks - Retrieved chunks with optional tag_kwd fields
   * @param {number} [topnTags=3] - Number of top tags to return
   * @returns {Record<string, number>} Top N tags mapped to their TF-IDF scores
   */
  getQueryTags(chunks: ChunkResult[], topnTags: number = 3): Record<string, number> {
    // Count tag occurrences across all chunks
    const tagCounts: Record<string, number> = {}
    let totalCount = 0

    for (const chunk of chunks) {
      const tags = this.parseChunkTags(chunk.tag_kwd)
      for (const tag of Object.keys(tags)) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1
        totalCount++
      }
    }

    // No tags found — return empty
    if (totalCount === 0) return {}

    // Score each tag with TF-IDF: reward tags that appear in relevant chunks but not everywhere
    const numChunks = chunks.length
    const scored: Array<[string, number]> = []
    for (const [tag, count] of Object.entries(tagCounts)) {
      // TF: proportion of tag occurrences in the result set
      const tf = count / totalCount
      // IDF: log(total chunks / chunks containing this tag + 1) — penalizes ubiquitous tags
      const idf = Math.log(numChunks / count + 1)
      const score = tf * idf
      scored.push([tag, score])
    }

    // Sort by score descending and take top N
    scored.sort((a, b) => b[1] - a[1])
    const result: Record<string, number> = {}
    for (const [tag, score] of scored.slice(0, topnTags)) {
      result[tag] = score
    }

    return result
  }

  /**
   * @description Boost chunk scores using cosine similarity between each chunk's tags
   * and the query-level tag vector. Adds tag similarity bonus and pagerank feature
   * to the original score, then re-sorts descending.
   * @param {ChunkResult[]} chunks - Retrieved chunks to re-score
   * @param {Record<string, number>} queryTags - Query-level tag weights from getQueryTags()
   * @returns {ChunkResult[]} Chunks re-sorted by boosted score (descending)
   */
  scoreChunksByTags(chunks: ChunkResult[], queryTags: Record<string, number>): ChunkResult[] {
    const queryTagKeys = Object.keys(queryTags)

    // No query tags — return unchanged
    if (queryTagKeys.length === 0) return chunks

    // Pre-compute query vector magnitude for cosine similarity
    let queryMagnitude = 0
    for (const key of queryTagKeys) {
      queryMagnitude += queryTags[key]! * queryTags[key]!
    }
    queryMagnitude = Math.sqrt(queryMagnitude)

    // Avoid division by zero
    if (queryMagnitude === 0) return chunks

    const boosted = chunks.map((chunk) => {
      const chunkTags = this.parseChunkTags(chunk.tag_kwd)

      // Compute cosine similarity between chunk tags and query tags
      let dotProduct = 0
      for (const key of queryTagKeys) {
        const chunkVal = chunkTags[key] || 0
        const queryVal = queryTags[key]!
        dotProduct += chunkVal * queryVal
      }

      // Chunk magnitude must use ALL chunk tags (not just query-overlapping keys)
      let chunkMagnitude = 0
      for (const val of Object.values(chunkTags)) {
        chunkMagnitude += val * val
      }
      chunkMagnitude = Math.sqrt(chunkMagnitude)

      const tagSimilarity = chunkMagnitude > 0
        ? dotProduct / (queryMagnitude * chunkMagnitude)
        : 0

      // Extract pagerank feature from chunk (may not be present)
      const pagerankFea = chunk.pagerank_fea ?? 0

      // Boost: original score + tag similarity bonus + pagerank feature
      const originalScore = chunk.score ?? 0
      const finalScore = originalScore + (tagSimilarity * 10) + pagerankFea

      return { ...chunk, score: finalScore }
    })

    // Re-sort by boosted score descending
    boosted.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    return boosted
  }
}

/** Singleton tag ranking service instance */
export const tagRankingService = new TagRankingService()
