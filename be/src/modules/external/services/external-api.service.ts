/**
 * @fileoverview External API service for evaluation-ready RAG endpoints.
 *
 * Provides non-streaming, structured JSON responses for chat, search, and
 * retrieval operations. Designed for integration with evaluation tools like
 * promptfoo, returning answer, contexts, sources, and timing metadata.
 *
 * Unlike the OpenAI-compatible endpoints that use SSE streaming with mock
 * response interceptors, this service calls RAG pipeline components directly
 * and assembles structured responses.
 *
 * @module services/external-api
 */

import { ModelFactory } from '@/shared/models/factory.js'
import { ragSearchService } from '@/modules/rag/services/rag-search.service.js'
import { ragRerankService } from '@/modules/rag/services/rag-rerank.service.js'
import { ragCitationService } from '@/modules/rag/services/rag-citation.service.js'
import { llmClientService, LlmMessage } from '@/shared/services/llm-client.service.js'
import { askSummaryPrompt, citationPrompt } from '@/shared/prompts/index.js'
import { log } from '@/shared/services/logger.service.js'
import type { ChunkResult, SearchRequest, ChatAssistant, SearchApp } from '@/shared/models/types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @description A single retrieved context chunk in the evaluation response
 */
export interface EvalContext {
  text: string
  doc_id: string
  doc_name: string
  chunk_id: string
  score: number
  page_num: number[]
  token_count?: number
}

/**
 * @description Source document aggregation in the evaluation response
 */
export interface EvalSource {
  doc_id: string
  doc_name: string
  chunk_count: number
}

/**
 * @description Performance and pipeline metadata in the evaluation response
 */
export interface EvalMetadata {
  model: string
  assistant_id?: string | undefined
  search_app_id?: string | undefined
  retrieval_ms: number
  generation_ms?: number | undefined
  total_ms: number
  chunks_retrieved: number
  chunks_after_rerank: number
  search_method: string
}

/**
 * @description Full evaluation response for chat and search endpoints
 */
export interface EvalChatResponse {
  answer: string
  contexts: EvalContext[]
  sources: EvalSource[]
  metadata: EvalMetadata
}

/**
 * @description Evaluation response for retrieval-only endpoint (no LLM generation)
 */
export interface EvalRetrievalResponse {
  contexts: EvalContext[]
  sources: EvalSource[]
  metadata: Pick<EvalMetadata, 'retrieval_ms' | 'total_ms' | 'chunks_retrieved' | 'chunks_after_rerank' | 'search_method'>
}

/**
 * @description Options passed from the request to control retrieval and generation
 */
export interface EvalOptions {
  top_k?: number
  method?: 'full_text' | 'semantic' | 'hybrid'
  similarity_threshold?: number
  vector_similarity_weight?: number
  temperature?: number
  max_tokens?: number
  include_contexts?: boolean
  include_metadata?: boolean
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * @description Service orchestrating evaluation-ready RAG operations.
 *   Calls retrieval, reranking, and LLM generation pipeline components directly.
 */
class ExternalApiService {
  /**
   * @description Execute a full RAG chat: retrieve contexts, generate answer, return structured JSON.
   *   Uses either an assistant_id (chat assistant config) or direct dataset_ids.
   * @param {string} query - The user's question
   * @param {object} params - Assistant/dataset targeting and options
   * @param {string} userId - ID of the API key owner
   * @returns {Promise<EvalChatResponse>} Structured response with answer, contexts, sources, metadata
   */
  async chat(
    query: string,
    params: {
      assistant_id?: string
      dataset_ids?: string[]
      options?: EvalOptions
    },
    userId: string
  ): Promise<EvalChatResponse> {
    const startTime = Date.now()
    const opts = params.options ?? {}
    const topK = opts.top_k ?? 10
    const method = opts.method ?? 'hybrid'
    const threshold = opts.similarity_threshold ?? 0.2

    // Resolve dataset IDs from assistant config or direct parameter
    let datasetIds: string[] = params.dataset_ids ?? []
    let assistant: ChatAssistant | undefined
    let providerId: string | undefined

    if (params.assistant_id) {
      assistant = await ModelFactory.chatAssistant.findById(params.assistant_id) as ChatAssistant | undefined
      if (!assistant) throw new Error('Assistant not found')
      datasetIds = assistant.kb_ids ?? []
      providerId = assistant.llm_id ?? undefined
    }

    if (datasetIds.length === 0) {
      throw new Error('No datasets specified. Provide assistant_id or dataset_ids.')
    }

    // ── Retrieval ──────────────────────────────────────────────────────
    const retrievalStart = Date.now()
    const chunks = await this.retrieveFromDatasets(
      datasetIds, query, topK, method, threshold, opts.vector_similarity_weight
    )
    const retrievalMs = Date.now() - retrievalStart

    // ── Reranking ──────────────────────────────────────────────────────
    let rankedChunks = chunks
    const promptConfig = (assistant?.prompt_config ?? {}) as Record<string, unknown>
    if (promptConfig?.rerank_id && chunks.length > topK) {
      rankedChunks = await ragRerankService.rerank(query, chunks, topK, promptConfig.rerank_id as string)
    } else {
      rankedChunks = chunks.slice(0, topK)
    }

    // ── LLM Generation ─────────────────────────────────────────────────
    const genStart = Date.now()

    // Build context for the LLM
    const knowledge = rankedChunks
      .map((c, i) => `### Chunk ID: ${i}\n**Source**: ${c.doc_name || 'Unknown'}\n\n${c.text}`)
      .join('\n\n---\n\n')

    const systemPrompt = `${askSummaryPrompt.build(knowledge)}\n\n${citationPrompt.system}`

    const llmMessages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query },
    ]

    const llmOptions: Record<string, unknown> = {
      providerId,
      temperature: opts.temperature ?? 0.7,
    }
    if (opts.max_tokens != null) llmOptions.max_tokens = opts.max_tokens

    const rawAnswer = await llmClientService.chatCompletion(llmMessages, llmOptions as any)

    const generationMs = Date.now() - genStart

    // Post-process citations
    const { answer: citedAnswer } = await ragCitationService.insertCitations(rawAnswer, rankedChunks)

    // ── Build response ──────────────────────────────────────────────────
    return {
      answer: citedAnswer,
      contexts: opts.include_contexts !== false ? this.buildContexts(rankedChunks) : [],
      sources: this.buildSources(rankedChunks),
      metadata: opts.include_metadata !== false ? {
        model: 'b-knowledge-rag',
        assistant_id: params.assistant_id,
        retrieval_ms: retrievalMs,
        generation_ms: generationMs,
        total_ms: Date.now() - startTime,
        chunks_retrieved: chunks.length,
        chunks_after_rerank: rankedChunks.length,
        search_method: method,
      } : {} as EvalMetadata,
    }
  }

  /**
   * @description Execute a search with AI summary: retrieve contexts, generate summary, return structured JSON.
   *   Uses either a search_app_id or direct dataset_ids.
   * @param {string} query - The search query
   * @param {object} params - Search app/dataset targeting and options
   * @param {string} userId - ID of the API key owner
   * @returns {Promise<EvalChatResponse>} Structured response with answer, contexts, sources, metadata
   */
  async search(
    query: string,
    params: {
      search_app_id?: string
      dataset_ids?: string[]
      options?: EvalOptions
    },
    userId: string
  ): Promise<EvalChatResponse> {
    const startTime = Date.now()
    const opts = params.options ?? {}
    const topK = opts.top_k ?? 10
    const method = opts.method ?? 'hybrid'
    const threshold = opts.similarity_threshold ?? 0.2

    // Resolve dataset IDs from search app config or direct parameter
    let datasetIds: string[] = params.dataset_ids ?? []
    let searchApp: SearchApp | undefined
    let providerId: string | undefined

    if (params.search_app_id) {
      searchApp = await ModelFactory.searchApp.findById(params.search_app_id) as SearchApp | undefined
      if (!searchApp) throw new Error('Search app not found')
      const rawIds = searchApp.dataset_ids
      datasetIds = Array.isArray(rawIds) ? rawIds : JSON.parse(rawIds as unknown as string)
      const config = searchApp.search_config as Record<string, unknown>
      providerId = config?.llm_id as string | undefined
    }

    if (datasetIds.length === 0) {
      throw new Error('No datasets specified. Provide search_app_id or dataset_ids.')
    }

    // ── Retrieval ──────────────────────────────────────────────────────
    const retrievalStart = Date.now()
    const chunks = await this.retrieveFromDatasets(
      datasetIds, query, topK, method, threshold, opts.vector_similarity_weight
    )
    const retrievalMs = Date.now() - retrievalStart

    // ── Reranking ──────────────────────────────────────────────────────
    let rankedChunks = chunks
    if (searchApp) {
      const config = searchApp.search_config as Record<string, unknown>
      if (config?.rerank_id && chunks.length > topK) {
        const rerankTopK = (config.rerank_top_k as number) ?? 1024
        rankedChunks = await ragRerankService.rerank(query, chunks, rerankTopK, config.rerank_id as string)
      } else {
        rankedChunks = chunks.slice(0, topK)
      }
    } else {
      rankedChunks = chunks.slice(0, topK)
    }

    // ── LLM Generation ─────────────────────────────────────────────────
    const genStart = Date.now()

    const knowledge = rankedChunks
      .map((c, i) => `### Chunk ID: ${i}\n**Source**: ${c.doc_name || 'Unknown'}\n\n${c.text}`)
      .join('\n\n---\n\n')

    const systemPrompt = `${askSummaryPrompt.build(knowledge)}\n\n${citationPrompt.system}`

    const searchLlmOptions: Record<string, unknown> = {
      providerId,
      temperature: opts.temperature ?? 0.7,
    }
    if (opts.max_tokens != null) searchLlmOptions.max_tokens = opts.max_tokens

    const rawSearchAnswer = await llmClientService.chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      searchLlmOptions as any
    )

    const generationMs = Date.now() - genStart
    const { answer: citedAnswer } = await ragCitationService.insertCitations(rawSearchAnswer, rankedChunks)

    return {
      answer: citedAnswer,
      contexts: opts.include_contexts !== false ? this.buildContexts(rankedChunks) : [],
      sources: this.buildSources(rankedChunks),
      metadata: opts.include_metadata !== false ? {
        model: 'b-knowledge-search',
        search_app_id: params.search_app_id,
        retrieval_ms: retrievalMs,
        generation_ms: generationMs,
        total_ms: Date.now() - startTime,
        chunks_retrieved: chunks.length,
        chunks_after_rerank: rankedChunks.length,
        search_method: method,
      } : {} as EvalMetadata,
    }
  }

  /**
   * @description Retrieval-only endpoint — no LLM generation.
   *   Returns raw retrieved and optionally reranked chunks.
   * @param {string} query - The search query
   * @param {string[]} datasetIds - Dataset UUIDs to search
   * @param {EvalOptions} [options] - Retrieval options
   * @returns {Promise<EvalRetrievalResponse>} Contexts, sources, and retrieval metadata
   */
  async retrieval(
    query: string,
    datasetIds: string[],
    options?: EvalOptions
  ): Promise<EvalRetrievalResponse> {
    const startTime = Date.now()
    const opts = options ?? {}
    const topK = opts.top_k ?? 10
    const method = opts.method ?? 'hybrid'
    const threshold = opts.similarity_threshold ?? 0.2

    const chunks = await this.retrieveFromDatasets(
      datasetIds, query, topK, method, threshold, opts.vector_similarity_weight
    )

    // Limit to topK
    const rankedChunks = chunks.slice(0, topK)
    const totalMs = Date.now() - startTime

    return {
      contexts: opts.include_contexts !== false ? this.buildContexts(rankedChunks) : [],
      sources: this.buildSources(rankedChunks),
      metadata: opts.include_metadata !== false ? {
        retrieval_ms: totalMs,
        total_ms: totalMs,
        chunks_retrieved: chunks.length,
        chunks_after_rerank: rankedChunks.length,
        search_method: method,
      } : {} as EvalRetrievalResponse['metadata'],
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * @description Search across multiple datasets, merge and sort results by score.
   * @param {string[]} datasetIds - UUIDs of datasets to search
   * @param {string} query - Search query text
   * @param {number} topK - Max results per dataset
   * @param {string} method - Search method
   * @param {number} threshold - Minimum similarity score
   * @param {number} [vectorWeight] - Optional vector similarity weight for hybrid search
   * @returns {Promise<ChunkResult[]>} Merged and scored chunk results
   */
  private async retrieveFromDatasets(
    datasetIds: string[],
    query: string,
    topK: number,
    method: string,
    threshold: number,
    vectorWeight?: number
  ): Promise<ChunkResult[]> {
    // Embed query for semantic/hybrid search
    let queryVector: number[] | null = null
    if (method !== 'full_text') {
      try {
        const vectors = await llmClientService.embedTexts([query])
        queryVector = vectors[0] ?? null
      } catch (err) {
        log.warn('Query embedding failed, falling back to full-text', { error: String(err) })
      }
    }

    // Search each dataset in parallel
    const resolvedMethod = (method || 'hybrid') as 'full_text' | 'semantic' | 'hybrid'
    const searchReq: SearchRequest = {
      query,
      top_k: topK * 2,
      method: resolvedMethod,
      similarity_threshold: threshold,
    }
    if (vectorWeight != null) searchReq.vector_similarity_weight = vectorWeight

    const results = await Promise.all(
      datasetIds.map(id =>
        ragSearchService.search('', id, searchReq, queryVector).catch(err => {
          log.warn('Search failed for dataset', { datasetId: id, error: String(err) })
          return { chunks: [] as ChunkResult[], total: 0 }
        })
      )
    )

    // Merge all results and sort by score descending
    const allChunks = results.flatMap(r => r.chunks)
    allChunks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    return allChunks
  }

  /**
   * @description Convert internal ChunkResult array to evaluation context format.
   * @param {ChunkResult[]} chunks - Retrieved chunks
   * @returns {EvalContext[]} Formatted context objects for the response
   */
  private buildContexts(chunks: ChunkResult[]): EvalContext[] {
    return chunks.map(c => ({
      text: c.text,
      doc_id: c.doc_id || '',
      doc_name: c.doc_name || 'Unknown',
      chunk_id: c.chunk_id,
      score: c.score ?? 0,
      page_num: c.page_num ?? [],
    }))
  }

  /**
   * @description Aggregate chunks into source documents for the response.
   * @param {ChunkResult[]} chunks - Retrieved chunks
   * @returns {EvalSource[]} Document-level aggregation with chunk counts
   */
  private buildSources(chunks: ChunkResult[]): EvalSource[] {
    const docMap = new Map<string, EvalSource>()
    for (const c of chunks) {
      const docId = c.doc_id || 'unknown'
      const existing = docMap.get(docId)
      if (existing) {
        existing.chunk_count++
      } else {
        docMap.set(docId, {
          doc_id: docId,
          doc_name: c.doc_name || 'Unknown',
          chunk_count: 1,
        })
      }
    }
    return Array.from(docMap.values())
  }
}

/** Singleton instance */
export const externalApiService = new ExternalApiService()
