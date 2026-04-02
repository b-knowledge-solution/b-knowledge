/**
 * @fileoverview Embedding-based citation insertion service.
 *
 * Migrates RAGFlow's `insert_citations()` from `rag/nlp/search.py`.
 * Uses embedding similarity between answer sentences and chunk embeddings
 * to insert precise citation markers into LLM answers.
 *
 * @module modules/rag/services/rag-citation
 */

import { llmClientService } from '@/shared/services/llm-client.service.js'
import { ChunkResult } from '@/shared/models/types.js'
import { log } from '@/shared/services/logger.service.js'
import { htmlToMarkdown } from '@/shared/utils/html-to-markdown.js'

/**
 * Service for inserting embedding-based citations into LLM answers.
 * Matches answer sentences to retrieved chunks using hybrid similarity
 * (vector cosine + keyword Jaccard).
 */
export class RagCitationService {
  /**
   * Insert citations into an LLM answer by matching answer sentences to retrieved chunks.
   * Uses embedding similarity between answer sentences and chunk embeddings.
   *
   * Algorithm (from RAGFlow):
   * 1. Split answer into sentences (multi-language aware)
   * 2. Embed each sentence using the embedding model
   * 3. Compute hybrid similarity (90% vector + 10% keyword) between each sentence and chunks
   * 4. Adaptive threshold: start at 0.63, decay by 20% until citations found (min 0.3)
   * 5. Insert ##ID:n$$ markers at sentence boundaries
   *
   * @param answer - Raw LLM answer text
   * @param chunks - Retrieved chunks with their text
   * @param embeddingProviderId - Embedding model provider ID
   * @returns Object with cited answer and set of cited chunk indices
   */
  async insertCitations(
    answer: string,
    chunks: ChunkResult[],
    embeddingProviderId?: string
  ): Promise<{ answer: string; citedIndices: Set<number> }> {
    const citedIndices = new Set<number>()

    // Skip if no chunks or empty answer
    if (!chunks.length || !answer.trim()) {
      return { answer, citedIndices }
    }

    // Step 1: Split answer into sentences
    const sentences = this.splitSentences(answer)
    if (sentences.length === 0) {
      return { answer, citedIndices }
    }

    try {
      // Step 2: Embed all sentences and chunk texts
      const sentenceTexts = sentences.map(s => s.text)
      // Convert HTML to Markdown for cleaner embedding comparison
      const chunkTexts = chunks.map(c => htmlToMarkdown(c.text).slice(0, 512))

      const [sentenceVecs, chunkVecs] = await Promise.all([
        this.embed(sentenceTexts, embeddingProviderId),
        this.embed(chunkTexts, embeddingProviderId),
      ])

      // Pre-tokenize chunk texts for keyword similarity
      const chunkTokenSets = chunkTexts.map(t => this.tokenize(t))

      // Step 3-5: Match sentences to chunks with adaptive threshold
      // Build the cited answer by inserting markers at sentence boundaries
      let citedAnswer = ''
      let lastEnd = 0

      for (let si = 0; si < sentences.length; si++) {
        const sentence = sentences[si]!
        const sentVec = sentenceVecs[si]
        const sentTokens = this.tokenize(sentence.text)

        // Skip sentences without valid embeddings
        if (!sentVec || sentVec.length === 0) {
          continue
        }

        // Find best matching chunks using adaptive threshold
        const matches: Array<{ index: number; score: number }> = []

        // Compute similarity against all chunks
        for (let ci = 0; ci < chunks.length; ci++) {
          const chunkVec = chunkVecs[ci]
          if (!chunkVec || chunkVec.length === 0) continue

          const score = this.hybridSimilarity(
            sentVec, chunkVec,
            sentTokens, chunkTokenSets[ci]!
          )
          matches.push({ index: ci, score })
        }

        // Sort by score descending
        matches.sort((a, b) => b.score - a.score)

        // Adaptive threshold: start at 0.63, decay by 20% until citations found
        let thr = 0.63
        let topMatches: Array<{ index: number; score: number }> = []

        while (thr > 0.3) {
          topMatches = matches.filter(m => m.score >= thr).slice(0, 4)
          if (topMatches.length > 0) break
          // Decay threshold by 20%
          thr *= 0.8
        }

        // Append text from last end to sentence end
        citedAnswer += answer.slice(lastEnd, sentence.endIdx)

        // Insert citation markers after the sentence
        if (topMatches.length > 0) {
          const markers = topMatches.map(m => `##ID:${m.index}$$`).join(' ')
          citedAnswer += ` ${markers}`

          // Track cited indices
          for (const m of topMatches) {
            citedIndices.add(m.index)
          }
        }

        lastEnd = sentence.endIdx
      }

      // Append any remaining text after the last sentence
      if (lastEnd < answer.length) {
        citedAnswer += answer.slice(lastEnd)
      }

      return { answer: citedAnswer, citedIndices }
    } catch (err) {
      log.warn('Embedding-based citation insertion failed, returning original answer', {
        error: String(err),
      })
      return { answer, citedIndices }
    }
  }

  /**
   * Split text into sentences, supporting multiple languages.
   * Handles: English, Chinese, Japanese, Korean, Arabic, Vietnamese.
   * Preserves code blocks (``` delimited).
   * Filters sentences < 5 chars.
   *
   * @param text - Text to split
   * @returns Array of sentence strings with their original indices
   */
  splitSentences(text: string): Array<{ text: string; startIdx: number; endIdx: number }> {
    const results: Array<{ text: string; startIdx: number; endIdx: number }> = []

    // Find code blocks to exclude them from sentence splitting
    const codeBlockRegex = /```[\s\S]*?```/g
    const codeBlocks: Array<{ start: number; end: number }> = []
    let codeMatch: RegExpExecArray | null

    while ((codeMatch = codeBlockRegex.exec(text)) !== null) {
      codeBlocks.push({ start: codeMatch.index, end: codeMatch.index + codeMatch[0].length })
    }

    // Multi-language sentence splitting regex
    // Matches sentence-ending punctuation followed by whitespace or newline
    const sentenceEndRegex = /([^\|][；。？!！，،؛؟۔\n]|[a-z\u0600-\u06FF][.?;!،؛؟][ \n])/g

    let lastIdx = 0
    let match: RegExpExecArray | null

    while ((match = sentenceEndRegex.exec(text)) !== null) {
      const endPos = match.index + match[0].length

      // Skip if inside a code block
      const inCodeBlock = codeBlocks.some(cb => match!.index >= cb.start && match!.index < cb.end)
      if (inCodeBlock) continue

      const sentText = text.slice(lastIdx, endPos).trim()

      // Filter short sentences (< 5 chars)
      if (sentText.length >= 5) {
        results.push({
          text: sentText,
          startIdx: lastIdx,
          endIdx: endPos,
        })
      }

      lastIdx = endPos
    }

    // Handle remaining text after the last sentence boundary
    if (lastIdx < text.length) {
      const remaining = text.slice(lastIdx).trim()
      if (remaining.length >= 5) {
        results.push({
          text: remaining,
          startIdx: lastIdx,
          endIdx: text.length,
        })
      }
    }

    return results
  }

  /**
   * Compute embedding for a list of texts using the configured embedding model.
   * Reads embedding provider from model_providers (model_type='embedding').
   *
   * @param texts - Texts to embed
   * @param providerId - Optional embedding provider ID
   * @returns Array of embedding vectors
   */
  async embed(texts: string[], providerId?: string): Promise<number[][]> {
    return llmClientService.embedTexts(texts, providerId)
  }

  /**
   * Compute cosine similarity between two vectors.
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns Cosine similarity in range [-1, 1]
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!
      normA += a[i]! * a[i]!
      normB += b[i]! * b[i]!
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB)
    if (denominator === 0) return 0

    return dotProduct / denominator
  }

  /**
   * Compute hybrid similarity: vector_weight * cosine_sim + keyword_weight * keyword_sim.
   * Keyword similarity uses Jaccard index of tokenized texts.
   *
   * @param sentenceVec - Sentence embedding vector
   * @param chunkVec - Chunk embedding vector
   * @param sentenceTokens - Tokenized sentence words
   * @param chunkTokens - Tokenized chunk words
   * @param tkWeight - Keyword similarity weight (default 0.1)
   * @param vtWeight - Vector similarity weight (default 0.9)
   * @returns Hybrid similarity score
   */
  hybridSimilarity(
    sentenceVec: number[],
    chunkVec: number[],
    sentenceTokens: string[],
    chunkTokens: string[],
    tkWeight: number = 0.1,
    vtWeight: number = 0.9
  ): number {
    // Cosine similarity from embeddings
    const cosSim = this.cosineSimilarity(sentenceVec, chunkVec)

    // Jaccard index for keyword similarity
    const setA = new Set(sentenceTokens)
    const setB = new Set(chunkTokens)
    let intersection = 0
    for (const t of setA) {
      if (setB.has(t)) intersection++
    }
    const union = setA.size + setB.size - intersection
    const jaccardSim = union > 0 ? intersection / union : 0

    return vtWeight * cosSim + tkWeight * jaccardSim
  }

  /**
   * Tokenize text into lowercase word tokens for keyword similarity.
   *
   * @param text - Text to tokenize
   * @returns Array of lowercase word tokens
   */
  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/\W+/).filter(t => t.length > 1)
  }
}

/** Singleton instance of the citation service */
export const ragCitationService = new RagCitationService()
