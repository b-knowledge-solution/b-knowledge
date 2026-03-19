/**
 * @fileoverview Deep Research service with recursive question decomposition.
 *
 * Performs multi-round retrieval: checks whether retrieved context is
 * sufficient, generates follow-up questions for missing information,
 * and recursively searches until the answer is complete or max depth
 * is reached. Enforces token budget and call limits to prevent cost spirals.
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
 * @description Structured progress event emitted during deep research.
 * Provides typed information about sub-query progress, budget status,
 * and sufficiency checks.
 */
export interface DeepResearchProgressEvent {
  /** Event type discriminator */
  subEvent: 'subquery_start' | 'subquery_result' | 'budget_warning' | 'budget_exhausted' | 'sufficiency_check' | 'info'
  /** Search query being processed */
  query?: string
  /** Current recursion depth (0 = initial) */
  depth?: number
  /** Index of current sub-query in the batch */
  index?: number
  /** Total number of sub-queries in the current batch */
  total?: number
  /** Number of chunks returned from the sub-query */
  chunks?: number
  /** Human-readable message for display */
  message?: string
  /** Current token usage */
  tokensUsed?: number
  /** Maximum token budget */
  tokensMax?: number
  /** Current LLM call count */
  callsUsed?: number
  /** Maximum LLM call limit */
  callsMax?: number
  /** Number of completed sub-queries before budget exhaustion */
  completed?: number
}

/**
 * @description Configuration options for the deep research pipeline.
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
  /** Maximum token budget for LLM calls (default 50,000) */
  maxTokens?: number | undefined
  /** Maximum number of LLM calls (default 15) */
  maxCalls?: number | undefined
}

// ---------------------------------------------------------------------------
// BudgetTracker
// ---------------------------------------------------------------------------

/**
 * @description Tracks token usage and LLM call count during deep research.
 * Prevents cost spirals by enforcing hard limits on both dimensions.
 */
export class BudgetTracker {
  private tokensUsed = 0
  private callsUsed = 0

  /**
   * @param maxTokens - Maximum token budget (default 50,000)
   * @param maxCalls - Maximum number of LLM calls (default 15)
   */
  constructor(
    private readonly maxTokens: number = 50_000,
    private readonly maxCalls: number = 15
  ) {}

  /**
   * @description Record an LLM call with its estimated token usage.
   * @param tokens - Estimated token count for input + output
   */
  recordCall(tokens: number): void {
    this.tokensUsed += tokens
    this.callsUsed += 1
  }

  /**
   * @description Check whether the budget is exhausted (either limit reached).
   * @returns True if token or call limit has been reached
   */
  isExhausted(): boolean {
    return this.tokensUsed >= this.maxTokens || this.callsUsed >= this.maxCalls
  }

  /**
   * @description Check whether budget usage is at or above 80% on either dimension.
   * @returns True if approaching exhaustion
   */
  isWarning(): boolean {
    return (this.tokensUsed >= this.maxTokens * 0.8) || (this.callsUsed >= this.maxCalls * 0.8)
  }

  /**
   * @description Get current budget status for reporting.
   * @returns Object with current and max values for tokens and calls
   */
  getStatus() {
    return {
      tokensUsed: this.tokensUsed,
      tokensMax: this.maxTokens,
      callsUsed: this.callsUsed,
      callsMax: this.maxCalls,
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Approximate token count from text length (~4 chars per token).
 * @param text - Input text to measure
 * @returns Estimated token count
 */
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * @description Service for deep research with recursive retrieval and sufficiency checking.
 * Iteratively retrieves, checks completeness, and generates follow-up
 * queries until the information is sufficient, max depth is reached, or
 * the token/call budget is exhausted.
 */
export class RagDeepResearchService {
  /**
   * @description Check if retrieved information is sufficient to answer the question.
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
   * @description Generate follow-up questions for missing information.
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
   * @description Full deep research pipeline with recursive question decomposition
   * and budget enforcement.
   *
   * Flow:
   * 1. Initial retrieval from KB + web + KG
   * 2. Sufficiency check (budget-guarded)
   * 3. If insufficient: generate follow-up questions (budget-guarded)
   * 4. Recursive search for each follow-up (max depth 3)
   * 5. Merge all results
   *
   * Enforces token budget (default 50K) and call limit (default 15) to prevent
   * cost spirals. When budget is exhausted, returns partial results from
   * completed sub-queries rather than failing.
   *
   * @param tenantId - Tenant ID for isolation
   * @param question - User question
   * @param kbIds - Knowledge base IDs
   * @param options - Configuration options including budget limits
   * @param onProgress - Callback for structured progress events
   * @returns All retrieved chunks merged and deduplicated
   */
  async research(
    tenantId: string,
    question: string,
    kbIds: string[],
    options: DeepResearchOptions = {},
    onProgress?: (event: DeepResearchProgressEvent) => void
  ): Promise<ChunkResult[]> {
    const maxDepth = options.maxDepth ?? 3
    const topN = options.topN ?? 6
    const budget = new BudgetTracker(options.maxTokens ?? 50_000, options.maxCalls ?? 15)

    // Track all collected chunks across rounds, deduplicated by chunk_id
    const allChunks = new Map<string, ChunkResult>()

    // Recursive inner function -- returns true if budget exhausted (abort signal)
    const searchRound = async (query: string, depth: number, index: number = 0, total: number = 1): Promise<boolean> => {
      if (depth > maxDepth) return false

      // Emit subquery_start event with structured metadata
      onProgress?.({
        subEvent: 'subquery_start',
        query,
        depth,
        index,
        total,
        message: `${depth === 0 ? 'Initial' : `Follow-up (depth ${depth})`} search: "${query}"`,
      })

      // ── Retrieve from knowledge bases ──
      const kbResults = await this.retrieveFromKbs(tenantId, kbIds, query, topN)
      for (const chunk of kbResults) {
        if (!allChunks.has(chunk.chunk_id)) {
          allChunks.set(chunk.chunk_id, chunk)
        }
      }

      // Emit subquery_result event with chunk count
      onProgress?.({
        subEvent: 'subquery_result',
        query,
        depth,
        chunks: kbResults.length,
        message: `Retrieved ${kbResults.length} chunks`,
      })

      // ── Web search (if configured) ──
      if (options.tavilyApiKey) {
        onProgress?.({ subEvent: 'info', message: `Web search: "${query}"` })
        const webResults = await searchWeb(query, options.tavilyApiKey, 3)
        for (const chunk of webResults) {
          // Web chunks use generated IDs; always add
          allChunks.set(chunk.chunk_id + `_d${depth}`, chunk)
        }
      }

      // ── Knowledge graph (if enabled) ──
      if (options.useKg && kbIds.length > 0) {
        onProgress?.({ subEvent: 'info', message: 'Knowledge graph retrieval' })
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

      // ── Budget check before sufficiency LLM call ──
      if (depth >= maxDepth) return false
      if (budget.isExhausted()) {
        const status = budget.getStatus()
        onProgress?.({
          subEvent: 'budget_exhausted',
          message: 'Budget exhausted before sufficiency check',
          ...status,
          completed: allChunks.size,
        })
        log.info('Deep research budget exhausted', { ...status, chunksCollected: allChunks.size })
        return true
      }

      // ── Sufficiency check ──
      const currentContext = [...allChunks.values()]
        .map(c => c.text)
        .join('\n---\n')

      onProgress?.({ subEvent: 'sufficiency_check', message: 'Checking information completeness...' })
      const promptText = sufficiencyCheckPrompt.build(question, currentContext.slice(0, 3000))
      const { isSufficient, missingInfo } = await this.sufficiencyCheck(
        question,
        currentContext,
        options.providerId
      )

      // Record token usage for the sufficiency check call
      budget.recordCall(approxTokens(promptText) + approxTokens(JSON.stringify({ isSufficient, missingInfo })))

      // Emit budget warning if usage is at 80%+
      if (budget.isWarning() && !budget.isExhausted()) {
        const status = budget.getStatus()
        onProgress?.({
          subEvent: 'budget_warning',
          message: 'Budget usage at 80%+',
          ...status,
        })
      }

      // Check budget again after the LLM call
      if (budget.isExhausted()) {
        const status = budget.getStatus()
        onProgress?.({
          subEvent: 'budget_exhausted',
          message: 'Budget exhausted after sufficiency check',
          ...status,
          completed: allChunks.size,
        })
        log.info('Deep research budget exhausted after sufficiency check', { ...status, chunksCollected: allChunks.size })
        return true
      }

      if (isSufficient) {
        onProgress?.({ subEvent: 'info', message: 'Information is sufficient.' })
        return false
      }

      // ── Generate follow-up questions (budget-guarded) ──
      onProgress?.({ subEvent: 'info', message: `Missing information detected: ${missingInfo.join('; ')}` })
      const followUps = await this.generateFollowUpQuestions(
        question,
        query,
        missingInfo,
        currentContext,
        options.providerId
      )

      // Record token usage for follow-up generation
      budget.recordCall(approxTokens(query + question + currentContext.slice(0, 1000)) + approxTokens(JSON.stringify(followUps)))

      // Check budget after follow-up generation
      if (budget.isExhausted()) {
        const status = budget.getStatus()
        onProgress?.({
          subEvent: 'budget_exhausted',
          message: 'Budget exhausted after generating follow-up questions',
          ...status,
          completed: allChunks.size,
        })
        log.info('Deep research budget exhausted after follow-up generation', { ...status, chunksCollected: allChunks.size })
        return true
      }

      // ── Recursively search each follow-up ──
      for (let i = 0; i < followUps.length; i++) {
        // Check budget before each sub-query recursion
        if (budget.isExhausted()) {
          const status = budget.getStatus()
          onProgress?.({
            subEvent: 'budget_exhausted',
            message: `Budget exhausted after ${i}/${followUps.length} follow-up sub-queries`,
            ...status,
            completed: i,
            total: followUps.length,
          })
          return true
        }
        const exhausted = await searchRound(followUps[i].query, depth + 1, i, followUps.length)
        if (exhausted) return true
      }

      return false
    }

    // Start the recursive research pipeline
    await searchRound(question, 0)

    // Return all collected chunks sorted by score
    return [...allChunks.values()]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * @description Retrieve chunks from all knowledge bases in parallel.
   * @param tenantId - Tenant ID for isolation
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
