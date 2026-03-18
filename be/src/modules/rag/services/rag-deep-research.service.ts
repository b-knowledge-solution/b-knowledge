/**
 * @fileoverview Deep Research service with recursive question decomposition.
 *
 * Performs multi-round retrieval: checks whether retrieved context is
 * sufficient, generates follow-up questions for missing information,
 * and recursively searches until the answer is complete or max depth
 * is reached.
 *
 * @module modules/rag/services/rag-deep-research
 */

import { llmClientService, LlmMessage } from '@/shared/services/llm-client.service.js'
import { sufficiencyCheckPrompt, multiQueriesPrompt } from '@/shared/prompts/index.js'
import { log } from '@/shared/services/logger.service.js'
import { ChunkResult } from '@/shared/models/types.js'
import { ragSearchService } from '@/modules/rag/services/rag-search.service.js'
import { ragGraphragService } from '@/modules/rag/services/rag-graphrag.service.js'
import { searchWeb } from '@/shared/services/web-search.service.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration options for the deep research pipeline.
 */
export interface DeepResearchOptions {
  /** LLM provider ID for sufficiency check and follow-up generation */
  providerId?: string | undefined
  /** Tavily API key for web search (omit to skip web search) */
  tavilyApiKey?: string | undefined
  /** Whether to include knowledge graph retrieval */
  useKg?: boolean | undefined
  /** Maximum recursion depth (default 3) */
  maxDepth?: number | undefined
  /** Number of chunks to retrieve per round */
  topN?: number | undefined
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Service for deep research with recursive retrieval and sufficiency checking.
 * Iteratively retrieves, evaluates completeness, and generates follow-up
 * queries until the information is sufficient or max depth is reached.
 */
export class RagDeepResearchService {
  /**
   * Check if retrieved information is sufficient to answer the question.
   * @param question - Original question
   * @param retrievedContext - Current retrieved text
   * @param providerId - LLM provider ID
   * @returns Object indicating sufficiency and any missing information
   */
  async sufficiencyCheck(
    question: string,
    retrievedContext: string,
    providerId?: string
  ): Promise<{ isSufficient: boolean; missingInfo: string[] }> {
    // Use RAGFlow's sufficiency_check.md prompt template
    const messages: LlmMessage[] = [
      {
        role: 'user',
        content: sufficiencyCheckPrompt.build(question, retrievedContext.slice(0, 3000)),
      },
    ]

    try {
      const result = await llmClientService.chatCompletion(messages, {
        providerId,
        temperature: 0,
        max_tokens: 256,
      })

      // Handle both field name conventions (is_sufficient from RAGFlow, sufficient from legacy)
      const parsed = JSON.parse(result.replace(/```json\s*|```/g, '').trim())
      return {
        isSufficient: !!(parsed.is_sufficient ?? parsed.sufficient),
        missingInfo: Array.isArray(parsed.missing_information) ? parsed.missing_information : Array.isArray(parsed.missing) ? parsed.missing : [],
      }
    } catch (err) {
      log.warn('Sufficiency check failed, assuming sufficient', { error: String(err) })
      // Default to sufficient to avoid infinite loops
      return { isSufficient: true, missingInfo: [] }
    }
  }

  /**
   * Generate follow-up questions for missing information.
   * @param originalQuestion - Original user question
   * @param currentQuery - Current search query used
   * @param missingInfo - List of missing information
   * @param context - Already retrieved context
   * @param providerId - LLM provider ID
   * @returns Array of follow-up question/query pairs
   */
  async generateFollowUpQuestions(
    originalQuestion: string,
    currentQuery: string,
    missingInfo: string[],
    context: string,
    providerId?: string
  ): Promise<Array<{ question: string; query: string }>> {
    // Use RAGFlow's multi_queries_gen.md prompt template
    const messages: LlmMessage[] = [
      {
        role: 'user',
        content: multiQueriesPrompt.build(
          currentQuery,
          originalQuestion,
          context.slice(0, 1000),
          missingInfo.join('; ')
        ),
      },
    ]

    try {
      const result = await llmClientService.chatCompletion(messages, {
        providerId,
        temperature: 0.3,
        max_tokens: 512,
      })

      // Parse response: RAGFlow format has { reasoning, questions: [...] }
      const parsed = JSON.parse(result.replace(/```json\s*|```/g, '').trim())
      const questions = Array.isArray(parsed) ? parsed : Array.isArray(parsed.questions) ? parsed.questions : []
      return questions.filter(
        (item: any) => item.question && item.query
      )
    } catch (err) {
      log.warn('Follow-up question generation failed', { error: String(err) })
      return []
    }
  }

  /**
   * Full deep research pipeline with recursive question decomposition.
   * 1. Initial retrieval from KB + web + KG
   * 2. Sufficiency check
   * 3. If insufficient: generate follow-up questions
   * 4. Recursive search for each follow-up (max depth 3)
   * 5. Merge all results
   *
   * @param question - User question
   * @param kbIds - Knowledge base IDs
   * @param options - Configuration options
   * @param onProgress - Callback for streaming progress updates
   * @returns All retrieved chunks merged and deduplicated
   */
  async research(
    tenantId: string,
    question: string,
    kbIds: string[],
    options: DeepResearchOptions = {},
    onProgress?: (msg: string) => void
  ): Promise<ChunkResult[]> {
    const maxDepth = options.maxDepth ?? 3
    const topN = options.topN ?? 6

    // Track all collected chunks across rounds, deduplicated by chunk_id
    const allChunks = new Map<string, ChunkResult>()

    // Recursive inner function
    const searchRound = async (query: string, depth: number): Promise<void> => {
      if (depth > maxDepth) return

      const depthLabel = depth === 0 ? 'Initial' : `Follow-up (depth ${depth})`
      onProgress?.(`${depthLabel} search: "${query}"`)

      // ── Retrieve from knowledge bases ──
      const kbResults = await this.retrieveFromKbs(tenantId, kbIds, query, topN)
      for (const chunk of kbResults) {
        if (!allChunks.has(chunk.chunk_id)) {
          allChunks.set(chunk.chunk_id, chunk)
        }
      }

      // ── Web search (if configured) ──
      if (options.tavilyApiKey) {
        onProgress?.(`Web search: "${query}"`)
        const webResults = await searchWeb(query, options.tavilyApiKey, 3)
        for (const chunk of webResults) {
          // Web chunks use generated IDs; always add
          allChunks.set(chunk.chunk_id + `_d${depth}`, chunk)
        }
      }

      // ── Knowledge graph (if enabled) ──
      if (options.useKg && kbIds.length > 0) {
        onProgress?.('Knowledge graph retrieval')
        try {
          const kgContext = await ragGraphragService.retrieval(
            kbIds,
            query,
            options.providerId,
            2048
          )
          if (kgContext) {
            // Add KG context as a synthetic chunk
            allChunks.set(`kg_d${depth}`, {
              chunk_id: `kg_d${depth}`,
              text: kgContext,
              method: 'knowledge_graph',
              score: 1,
            })
          }
        } catch (err) {
          log.warn('KG retrieval in deep research failed', { error: String(err) })
        }
      }

      // ── Sufficiency check ──
      if (depth >= maxDepth) return // No more recursion allowed

      const currentContext = [...allChunks.values()]
        .map(c => c.text)
        .join('\n---\n')

      onProgress?.('Checking information completeness...')
      const { isSufficient, missingInfo } = await this.sufficiencyCheck(
        question,
        currentContext,
        options.providerId
      )

      if (isSufficient) {
        onProgress?.('Information is sufficient.')
        return
      }

      // ── Generate follow-up questions ──
      onProgress?.(`Missing information detected: ${missingInfo.join('; ')}`)
      const followUps = await this.generateFollowUpQuestions(
        question,
        query,
        missingInfo,
        currentContext,
        options.providerId
      )

      // ── Recursively search each follow-up ──
      for (const followUp of followUps) {
        await searchRound(followUp.query, depth + 1)
      }
    }

    // Start the recursive research pipeline
    await searchRound(question, 0)

    // Return all collected chunks sorted by score
    return [...allChunks.values()]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Retrieve chunks from all knowledge bases in parallel.
   * @param kbIds - Knowledge base IDs to search
   * @param query - Search query
   * @param topN - Number of results per KB
   * @returns Merged chunk results
   */
  private async retrieveFromKbs(
    tenantId: string,
    kbIds: string[],
    query: string,
    topN: number
  ): Promise<ChunkResult[]> {
    if (kbIds.length === 0) return []

    // Search all KBs in parallel
    const results = await Promise.all(
      kbIds.map(kbId =>
        ragSearchService.search(tenantId, kbId, {
          query,
          method: 'hybrid',
          top_k: topN,
          similarity_threshold: 0.2,
        }).catch(err => {
          log.warn('KB search failed in deep research', { kbId, error: String(err) })
          return { chunks: [] as ChunkResult[], total: 0 }
        })
      )
    )

    return results.flatMap(r => r.chunks)
  }
}

/** Singleton instance of the deep research service */
export const ragDeepResearchService = new RagDeepResearchService()
