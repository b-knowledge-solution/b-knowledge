/**
 * @fileoverview Dedicated reranking service using external rerank model providers.
 *
 * Reads rerank provider config from `model_providers` table (model_type='rerank')
 * and routes to the correct API (Jina, Cohere, or generic OpenAI-compatible).
 *
 * Falls back to LLM-based reranking when no dedicated rerank model is configured.
 *
 * @module modules/rag/services/rag-rerank
 */

import { ModelFactory } from '@/shared/models/factory.js'
import { ChunkResult, ModelProvider } from '@/shared/models/types.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * Service for reranking retrieved chunks using dedicated rerank models.
 * Supports Jina, Cohere, BAAI, NVIDIA, and generic OpenAI-compatible rerankers.
 */
export class RagRerankService {
  /**
   * Rerank chunks using a dedicated reranking model.
   * Reads rerank provider from model_providers table.
   * Supports: Jina, Cohere, BAAI, NVIDIA, OpenAI-compatible rerankers.
   *
   * @param query - Search query
   * @param chunks - Chunks to rerank
   * @param topN - Number of top results to return
   * @param rerankProviderId - Optional specific rerank model provider ID
   * @returns Reranked chunks with updated scores
   */
  async rerank(
    query: string,
    chunks: ChunkResult[],
    topN: number,
    rerankProviderId?: string
  ): Promise<ChunkResult[]> {
    // Skip reranking for small result sets
    if (chunks.length <= topN) return chunks

    // Resolve the rerank model provider from DB
    const provider = await this.resolveRerankProvider(rerankProviderId)
    if (!provider) {
      log.warn('No rerank provider found, returning chunks as-is')
      return chunks.slice(0, topN)
    }

    // Extract document texts for the rerank API
    const documents = chunks.map(c => c.text.slice(0, 1024))

    try {
      // Route to the correct rerank API based on factory_name
      const factory = (provider.factory_name || '').toLowerCase()
      let scores: number[]

      if (factory.includes('jina')) {
        scores = await this.jinaRerank(query, documents, topN, provider.api_key || '', provider.model_name)
      } else if (factory.includes('cohere')) {
        scores = await this.cohereRerank(query, documents, topN, provider.api_key || '', provider.api_base || 'https://api.cohere.ai', provider.model_name)
      } else {
        // Generic OpenAI-compatible rerank (BAAI, NVIDIA, etc.)
        scores = await this.genericRerank(query, documents, topN, provider.api_key || '', provider.api_base || '', provider.model_name)
      }

      // Combine rerank scores with original search scores
      const scored = chunks.map((chunk, i) => ({
        chunk,
        hybridScore: this.computeHybridScore(chunk.score ?? 0, scores[i] ?? 0),
      }))

      // Sort by hybrid score descending and take topN
      scored.sort((a, b) => b.hybridScore - a.hybridScore)

      return scored.slice(0, topN).map(s => ({
        ...s.chunk,
        score: s.hybridScore,
      }))
    } catch (err) {
      log.error('Rerank API call failed, returning original order', { error: String(err) })
      return chunks.slice(0, topN)
    }
  }

  /**
   * Call Jina Rerank API.
   * POST https://api.jina.ai/v1/rerank
   * Body: { model, query, documents, top_n }
   * Response: { results: [{ index, relevance_score }] }
   *
   * @param query - Search query
   * @param documents - Document texts to rerank
   * @param topN - Number of top results
   * @param apiKey - Jina API key
   * @param model - Jina rerank model name
   * @returns Array of relevance scores indexed by original document position
   */
  private async jinaRerank(
    query: string,
    documents: string[],
    topN: number,
    apiKey: string,
    model: string
  ): Promise<number[]> {
    const response = await fetch('https://api.jina.ai/v1/rerank', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, query, documents, top_n: topN }),
    })

    if (!response.ok) {
      throw new Error(`Jina rerank failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as {
      results: Array<{ index: number; relevance_score: number }>
    }

    // Build scores array indexed by original document position
    return this.mapScores(data.results, documents.length)
  }

  /**
   * Call Cohere Rerank API.
   * POST {base_url}/v2/rerank (or /v1/rerank)
   * Body: { model, query, documents, top_n, return_documents: false }
   * Response: { results: [{ index, relevance_score }] }
   *
   * @param query - Search query
   * @param documents - Document texts to rerank
   * @param topN - Number of top results
   * @param apiKey - Cohere API key
   * @param baseUrl - Cohere API base URL
   * @param model - Cohere rerank model name
   * @returns Array of relevance scores indexed by original document position
   */
  private async cohereRerank(
    query: string,
    documents: string[],
    topN: number,
    apiKey: string,
    baseUrl: string,
    model: string
  ): Promise<number[]> {
    // Try v2 first, fall back to v1
    const url = `${baseUrl.replace(/\/+$/, '')}/v2/rerank`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        query,
        documents,
        top_n: topN,
        return_documents: false,
      }),
    })

    if (!response.ok) {
      throw new Error(`Cohere rerank failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as {
      results: Array<{ index: number; relevance_score: number }>
    }

    return this.mapScores(data.results, documents.length)
  }

  /**
   * Call generic OpenAI-compatible Rerank API.
   * POST {base_url}/rerank
   * Body: { model, query, documents, top_n }
   * Response: { results: [{ index, relevance_score }] }
   *
   * @param query - Search query
   * @param documents - Document texts to rerank
   * @param topN - Number of top results
   * @param apiKey - API key
   * @param baseUrl - API base URL
   * @param model - Rerank model name
   * @returns Array of relevance scores indexed by original document position
   */
  private async genericRerank(
    query: string,
    documents: string[],
    topN: number,
    apiKey: string,
    baseUrl: string,
    model: string
  ): Promise<number[]> {
    const url = `${baseUrl.replace(/\/+$/, '')}/rerank`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, query, documents, top_n: topN }),
    })

    if (!response.ok) {
      throw new Error(`Generic rerank failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as {
      results: Array<{ index: number; relevance_score: number }>
    }

    return this.mapScores(data.results, documents.length)
  }

  /**
   * Resolve rerank model provider from DB.
   * Looks for model_type='rerank' in model_providers.
   *
   * @param rerankProviderId - Optional specific provider ID
   * @returns ModelProvider record or null if none configured
   */
  private async resolveRerankProvider(rerankProviderId?: string): Promise<ModelProvider | null> {
    // If a specific ID is given, look it up directly
    if (rerankProviderId) {
      const provider = await ModelFactory.modelProvider.findById(rerankProviderId)
      if (provider && provider.status === 'active' && provider.model_type === 'rerank') {
        return provider
      }
      return null
    }

    // Find default rerank provider
    const defaults = await ModelFactory.modelProvider.findDefaults()
    return defaults.find(p => p.model_type === 'rerank') || null
  }

  /**
   * Compute hybrid score: combine rerank score with original search score.
   * Formula: tkweight * originalScore + vtweight * rerankScore
   *
   * @param originalScore - Original search score from retrieval
   * @param rerankScore - Score from the rerank model (normalized to 0-1)
   * @param tkweight - Weight for original score (default 0.3)
   * @param vtweight - Weight for rerank score (default 0.7)
   * @returns Combined hybrid score
   */
  private computeHybridScore(
    originalScore: number,
    rerankScore: number,
    tkweight: number = 0.3,
    vtweight: number = 0.7
  ): number {
    return tkweight * originalScore + vtweight * rerankScore
  }

  /**
   * Map rerank API results to a scores array indexed by original document position.
   * Scores not present in results default to 0.
   *
   * @param results - Rerank API results with index and relevance_score
   * @param totalDocs - Total number of documents
   * @returns Array of normalized scores
   */
  private mapScores(
    results: Array<{ index: number; relevance_score: number }>,
    totalDocs: number
  ): number[] {
    // Initialize all scores to 0
    const scores = new Array<number>(totalDocs).fill(0)

    // Map returned scores, normalizing to [0, 1]
    for (const r of results) {
      if (r.index >= 0 && r.index < totalDocs) {
        // Clamp score to [0, 1]
        scores[r.index] = Math.max(0, Math.min(1, r.relevance_score))
      }
    }

    return scores
  }
}

/** Singleton instance of the rerank service */
export const ragRerankService = new RagRerankService()
