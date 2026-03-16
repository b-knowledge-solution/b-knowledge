
/**
 * @fileoverview Chat conversation service — full RAG pipeline implementation.
 *
 * Migrated from RAGFlow's dialog_service.py async_chat() pipeline:
 * 1. Multi-turn conversation refinement
 * 2. Cross-language query expansion
 * 3. Keyword extraction
 * 4. Hybrid retrieval (BM25 + vector) across multiple knowledge bases
 * 5. Reranking
 * 6. Web search integration (Tavily)
 * 7. Knowledge graph retrieval
 * 8. Context-aware prompt assembly with citation instructions
 * 9. Delta SSE streaming (token-by-token, not accumulated)
 * 10. Post-processing: citation insertion & reference building
 *
 * All data lives in PostgreSQL + OpenSearch. LLM calls go directly via OpenAI SDK.
 *
 * @module services/chat-conversation
 */

import { ModelFactory } from '@/shared/models/factory.js'
import { llmClientService, LlmMessage } from '@/shared/services/llm-client.service.js'
import { ragSearchService } from '@/modules/rag/services/rag-search.service.js'
import { ragRerankService } from '@/modules/rag/services/rag-rerank.service.js'
import { ragCitationService } from '@/modules/rag/services/rag-citation.service.js'
import { ragSqlService } from '@/modules/rag/services/rag-sql.service.js'
import { ragGraphragService } from '@/modules/rag/services/rag-graphrag.service.js'
import { ragDeepResearchService } from '@/modules/rag/services/rag-deep-research.service.js'
import { searchWeb } from '@/shared/services/web-search.service.js'
import {
  fullQuestionPrompt,
  crossLanguagePrompt,
  keywordPrompt,
  citationPrompt,
  askSummaryPrompt,
} from '@/shared/prompts/index.js'
import { log } from '@/shared/services/logger.service.js'
import { langfuseTraceService } from '@/shared/services/langfuse.service.js'
import type { LangfuseTraceClient } from 'langfuse'
import { ChunkResult, ChatAssistant } from '@/shared/models/types.js'
import { Response as ExpressResponse } from 'express'
import { v4 as uuidv4 } from 'uuid'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Assistant prompt configuration from chat_assistants.prompt_config */
interface PromptConfig {
  /** System prompt template */
  system?: string
  /** Welcome message for new conversations */
  prologue?: string
  /** Enable multi-turn question synthesis */
  refine_multiturn?: boolean
  /** Enable cross-language query expansion */
  cross_languages?: string
  /** Enable keyword extraction and appending */
  keyword?: boolean
  /** Enable citation insertion in answer */
  quote?: boolean
  /** Response when no knowledge base results found */
  empty_response?: string
  /** Enable table-of-contents re-ranking */
  toc_enhance?: boolean
  /** Tavily API key for web search integration */
  tavily_api_key?: string
  /** Enable knowledge graph retrieval */
  use_kg?: boolean
  /** Dedicated rerank model provider ID */
  rerank_id?: string
  /** Enable deep research mode (recursive retrieval with sufficiency checks) */
  reasoning?: boolean
  /** Temperature for LLM generation */
  temperature?: number
  /** Top-p sampling */
  top_p?: number
  /** Frequency penalty */
  frequency_penalty?: number
  /** Presence penalty */
  presence_penalty?: number
  /** Max tokens for generation */
  max_tokens?: number
  /** Number of chunks to retrieve per knowledge base */
  top_n?: number
  /** Similarity threshold for vector search */
  similarity_threshold?: number
  /** Vector vs keyword weight (0-1, higher = more vector) */
  vector_similarity_weight?: number
}

/** Timing metrics for the RAG pipeline */
interface PipelineMetrics {
  startTime: number
  refinementMs?: number
  retrievalMs?: number
  generationMs?: number
  totalChunks?: number
  totalTokens?: number
}

// ---------------------------------------------------------------------------
// RAG Pipeline Helpers
// ---------------------------------------------------------------------------

/**
 * Refine multi-turn conversation into a single coherent question.
 * Uses the LLM to synthesize conversation history + latest question.
 * @param history - Previous conversation messages
 * @param currentQuestion - The latest user question
 * @param providerId - LLM provider ID to use
 * @param parent - Optional Langfuse parent for tracing
 * @returns Refined question incorporating conversation context
 */
async function refineMultiturnQuestion(
  history: Array<{ role: string; content: string }>,
  currentQuestion: string,
  providerId?: string,
  parent?: import('@/shared/services/langfuse.service.js').LangfuseParent
): Promise<string> {
  // Only refine if there's conversation history
  if (history.length === 0) return currentQuestion

  // Build conversation text for the prompt (last 3 turns = 6 messages)
  const conversationText = history
    .slice(-6)
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n')
  // Append current question
  const fullConversation = `${conversationText}\nUSER: ${currentQuestion}`

  // Use RAGFlow's full_question_prompt with date handling
  const today = new Date().toISOString().slice(0, 10)
  const refinementPrompt: LlmMessage[] = [
    {
      role: 'system',
      content: fullQuestionPrompt.system,
    },
    {
      role: 'user',
      content: fullQuestionPrompt.buildUser(fullConversation, today),
    },
  ]

  try {
    const refined = await llmClientService.chatCompletion(refinementPrompt, {
      providerId,
      temperature: 0.1,
      max_tokens: 256,
    }, parent)
    return refined.trim() || currentQuestion
  } catch (err) {
    log.warn('Multi-turn refinement failed, using original question', { error: String(err) })
    return currentQuestion
  }
}

/**
 * Expand query with cross-language translations for multilingual retrieval.
 * @param query - Original query text
 * @param targetLanguages - Comma-separated language list (e.g. "English,Japanese,Vietnamese")
 * @param providerId - LLM provider ID
 * @param parent - Optional Langfuse parent for tracing
 * @returns Expanded query with translations appended
 */
async function expandCrossLanguage(
  query: string,
  targetLanguages: string,
  providerId?: string,
  parent?: import('@/shared/services/langfuse.service.js').LangfuseParent
): Promise<string> {
  // Use RAGFlow's cross-language prompt with proper formatting rules
  const languages = targetLanguages.split(',').map(l => l.trim())
  const prompt: LlmMessage[] = [
    {
      role: 'system',
      content: crossLanguagePrompt.system,
    },
    {
      role: 'user',
      content: crossLanguagePrompt.buildUser(query, languages),
    },
  ]

  try {
    const translations = await llmClientService.chatCompletion(prompt, {
      providerId,
      temperature: 0.1,
      max_tokens: 512,
    }, parent)
    // Append translations to original query for broader retrieval
    return `${query}\n${translations.trim()}`
  } catch (err) {
    log.warn('Cross-language expansion failed', { error: String(err) })
    return query
  }
}

/**
 * Extract keywords from query for enhanced keyword-based retrieval.
 * @param query - User query text
 * @param providerId - LLM provider ID
 * @param parent - Optional Langfuse parent for tracing
 * @returns Array of extracted keywords
 */
async function extractKeywords(
  query: string,
  providerId?: string,
  parent?: import('@/shared/services/langfuse.service.js').LangfuseParent
): Promise<string[]> {
  // Use RAGFlow's keyword extraction prompt with structured template
  const prompt: LlmMessage[] = [
    {
      role: 'user',
      content: keywordPrompt.build(query, 8),
    },
  ]

  try {
    const result = await llmClientService.chatCompletion(prompt, {
      providerId,
      temperature: 0.1,
      max_tokens: 128,
    }, parent)
    return result.split(',').map(k => k.trim()).filter(Boolean)
  } catch (err) {
    log.warn('Keyword extraction failed', { error: String(err) })
    return []
  }
}

// Web search is now imported from @/shared/services/web-search.service.js

/**
 * Rerank retrieved chunks using the LLM for better relevance ordering.
 * Uses a cross-encoder style prompt to score each chunk.
 * @param query - Original user query
 * @param chunks - Retrieved chunks to rerank
 * @param topN - Number of top results to keep
 * @param providerId - LLM provider ID
 * @returns Reranked and filtered chunks
 */
async function rerankChunks(
  query: string,
  chunks: ChunkResult[],
  topN: number,
  providerId?: string
): Promise<ChunkResult[]> {
  // Skip reranking for small result sets
  if (chunks.length <= topN) return chunks

  // Build a concise reranking prompt
  const chunkSummaries = chunks
    .slice(0, 20) // Limit to 20 chunks for reranking efficiency
    .map((c, i) => `[${i}] ${c.text.slice(0, 200)}`)
    .join('\n')

  const prompt: LlmMessage[] = [
    {
      role: 'system',
      content: `You are a relevance ranker. Given a query and numbered text passages, output ONLY the indices of the most relevant passages in order of relevance, separated by commas. Output the top ${topN} most relevant indices only.`,
    },
    {
      role: 'user',
      content: `Query: ${query}\n\nPassages:\n${chunkSummaries}\n\nMost relevant indices (top ${topN}):`,
    },
  ]

  try {
    const result = await llmClientService.chatCompletion(prompt, {
      providerId,
      temperature: 0,
      max_tokens: 64,
    })

    // Parse indices from the response
    const indices = result.match(/\d+/g)?.map(Number).filter(i => i < chunks.length) || []
    if (indices.length === 0) return chunks.slice(0, topN)

    // Reorder chunks by LLM-determined relevance
    const reranked = indices.map(i => chunks[i]!).filter(Boolean)

    // Add any remaining chunks not in the reranked list
    const rerankedIds = new Set(reranked.map(c => c.chunk_id))
    for (const c of chunks) {
      if (!rerankedIds.has(c.chunk_id) && reranked.length < topN) {
        reranked.push(c)
      }
    }

    return reranked.slice(0, topN)
  } catch (err) {
    log.warn('LLM reranking failed, using original order', { error: String(err) })
    return chunks.slice(0, topN)
  }
}

/**
 * Build the system prompt with retrieved knowledge and citation instructions.
 * Follows RAGFlow's kb_prompt + citation_prompt pattern.
 * @param systemPrompt - Base system prompt from dialog config
 * @param chunks - Retrieved and reranked chunks
 * @param enableCitations - Whether to include citation instructions
 * @returns Assembled system message with context and citation guidance
 */
function buildContextPrompt(
  systemPrompt: string,
  chunks: ChunkResult[],
  enableCitations: boolean
): string {
  if (!chunks.length) return systemPrompt

  // Format each chunk with source metadata and index for citation
  const context = chunks
    .map((c, i) => {
      const source = c.doc_name ? ` [${c.doc_name}]` : ''
      const page = c.page_num?.length ? ` (p.${c.page_num.join(',')})` : ''
      return `[ID:${i}]${source}${page}\n${c.text}`
    })
    .join('\n\n')

  let prompt = `${systemPrompt}\n\n## Retrieved Knowledge\n${context}`

  // Add detailed citation instructions migrated from RAGFlow's citation_prompt.md
  if (enableCitations) {
    prompt += `\n\n${citationPrompt.system}`
  }

  return prompt
}

/**
 * Insert citation markers into the answer by matching content to chunks.
 * Post-processes the LLM answer to add or fix citations.
 * @param answer - Raw LLM answer text
 * @param chunks - Retrieved chunks used for context
 * @returns Answer with citation markers normalized
 */
function processCitations(answer: string, chunks: ChunkResult[]): {
  answer: string
  citedChunkIndices: Set<number>
} {
  const citedChunkIndices = new Set<number>()

  // Extract existing citations from the answer (##ID:n$$ format)
  const citationRegex = /##ID:(\d+)\$\$/g
  let match
  while ((match = citationRegex.exec(answer)) !== null) {
    const idx = parseInt(match[1]!, 10)
    if (idx < chunks.length) {
      citedChunkIndices.add(idx)
    }
  }

  // Also handle [ID:n] format that LLMs sometimes produce
  const altCitationRegex = /\[ID:(\d+)\]/g
  while ((match = altCitationRegex.exec(answer)) !== null) {
    const idx = parseInt(match[1]!, 10)
    if (idx < chunks.length) {
      citedChunkIndices.add(idx)
    }
  }

  // Normalize all citation formats to ##ID:n$$
  let normalizedAnswer = answer
    .replace(/\[ID:\s*(\d+)\]/g, '##ID:$1$$')
    .replace(/\(ID:\s*(\d+)\)/g, '##ID:$1$$')
    .replace(/ref\s*(\d+)/gi, '##ID:$1$$')

  return { answer: normalizedAnswer, citedChunkIndices }
}

/**
 * Format chunks into the reference structure expected by the frontend.
 * Only includes chunks that were actually cited in the answer.
 * @param chunks - All retrieved chunks
 * @param citedIndices - Set of chunk indices that were cited
 * @returns Reference object with chunks and doc_aggs
 */
function buildReference(chunks: ChunkResult[], citedIndices?: Set<number>) {
  // Use all chunks if no citation tracking, otherwise filter to cited ones
  const relevantChunks = citedIndices && citedIndices.size > 0
    ? chunks.filter((_, i) => citedIndices.has(i))
    : chunks

  // Aggregate by document
  const docMap = new Map<string, { doc_id: string; doc_name: string; count: number }>()
  for (const c of relevantChunks) {
    if (!c.doc_id) continue
    const existing = docMap.get(c.doc_id)
    if (existing) {
      existing.count++
    } else {
      docMap.set(c.doc_id, { doc_id: c.doc_id, doc_name: c.doc_name || '', count: 1 })
    }
  }

  return {
    chunks: chunks.map((c, i) => ({
      chunk_id: c.chunk_id,
      content_with_weight: c.text,
      doc_id: c.doc_id || '',
      docnm_kwd: c.doc_name || '',
      page_num_int: c.page_num?.[0] ?? 0,
      position_int: c.positions?.[0]?.[0] ?? 0,
      score: c.score ?? 0,
      cited: citedIndices?.has(i) ?? false,
    })),
    doc_aggs: [...docMap.values()],
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Service class for chat conversation operations.
 * Full RAG pipeline: retrieval → refinement → LLM generation → citation.
 */
export class ChatConversationService {
  /**
   * Create a new conversation session.
   * @param dialogId - The dialog (chat assistant) ID
   * @param name - Display name for the conversation
   * @param userId - ID of the user creating the conversation
   * @returns The created session
   */
  async createConversation(
    dialogId: string,
    name: string,
    userId: string
  ) {
    // Verify assistant exists
    const assistant = await ModelFactory.chatAssistant.findById(dialogId)
    if (!assistant) {
      throw new Error('Assistant not found')
    }

    // Create local session
    const session = await ModelFactory.chatSession.create({
      user_id: userId,
      title: name,
      dialog_id: dialogId,
      created_by: userId,
    } as any)

    // Insert prologue as first assistant message if assistant has one configured
    const promptConfig = typeof assistant.prompt_config === 'string'
      ? JSON.parse(assistant.prompt_config)
      : assistant.prompt_config
    if (promptConfig?.prologue) {
      await ModelFactory.chatMessage.create({
        session_id: session.id,
        role: 'assistant',
        content: promptConfig.prologue,
        created_by: 'system',
      } as any)
    }

    log.info('Conversation created', { sessionId: session.id, dialogId, userId })
    return session
  }

  /**
   * Get a conversation with its messages.
   * @param conversationId - UUID of the conversation
   * @param userId - ID of the requesting user (for access check)
   * @returns Session with messages array
   */
  async getConversation(conversationId: string, userId: string) {
    const session = await ModelFactory.chatSession.findById(conversationId)
    if (!session) return null
    if (session.user_id !== userId) return null

    // Fetch messages ordered by timestamp
    const messages = await ModelFactory.chatMessage.getKnex()
      .where('session_id', conversationId)
      .orderBy('timestamp', 'asc')

    return { ...session, messages }
  }

  /**
   * Rename a conversation.
   * @param conversationId - The conversation ID
   * @param name - The new name
   * @param userId - Requesting user ID
   */
  async renameConversation(conversationId: string, name: string, userId: string) {
    const session = await ModelFactory.chatSession.findById(conversationId)
    if (!session || session.user_id !== userId) return null

    await ModelFactory.chatSession.update(conversationId, { title: name, updated_by: userId } as any)
    return await ModelFactory.chatSession.findById(conversationId)
  }

  /**
   * List conversations for a dialog belonging to a user.
   * @param dialogId - The dialog ID to filter by
   * @param userId - The user ID to filter by
   * @returns Array of conversation sessions
   */
  async listConversations(dialogId: string, userId: string) {
    return ModelFactory.chatSession.getKnex()
      .where({ dialog_id: dialogId, user_id: userId })
      .orderBy('created_at', 'desc')
  }

  /**
   * Bulk delete conversations owned by a user.
   * @param conversationIds - Array of conversation IDs to delete
   * @param userId - ID of the user performing deletion
   * @returns Number of deleted sessions
   */
  async deleteConversations(
    conversationIds: string[],
    userId: string
  ): Promise<number> {
    // First verify ownership — only delete conversations belonging to this user
    const ownedIds: string[] = await ModelFactory.chatSession.getKnex()
      .whereIn('id', conversationIds)
      .andWhere('user_id', userId)
      .pluck('id')

    if (ownedIds.length === 0) return 0

    // Delete messages for owned conversations only
    await ModelFactory.chatMessage.getKnex()
      .whereIn('session_id', ownedIds)
      .delete()

    // Delete the sessions
    const deleted = await ModelFactory.chatSession.getKnex()
      .whereIn('id', ownedIds)
      .delete()

    log.info('Conversations deleted', { count: deleted, userId })
    return deleted
  }

  /**
   * Delete a specific message from a conversation.
   * @param conversationId - The conversation ID
   * @param messageId - The message ID to delete
   * @param userId - The user requesting deletion
   * @returns True if deleted
   */
  async deleteMessage(
    conversationId: string,
    messageId: string,
    userId: string
  ): Promise<boolean> {
    const session = await ModelFactory.chatSession.findById(conversationId)
    if (!session || session.user_id !== userId) return false

    const deleted = await ModelFactory.chatMessage.getKnex()
      .where({ id: messageId, session_id: conversationId })
      .delete()

    return deleted > 0
  }

  /**
   * Save feedback on a message.
   * @param messageId - The message ID
   * @param thumbup - True for positive, false for negative
   * @param feedback - Optional text feedback
   */
  async sendFeedback(
    messageId: string,
    thumbup: boolean,
    feedback?: string
  ): Promise<void> {
    const message = await ModelFactory.chatMessage.findById(messageId)
    if (!message) throw new Error('Message not found')

    const existing = (typeof message.citations === 'object' && message.citations) || {}
    const updated = {
      ...(existing as Record<string, unknown>),
      feedback: { thumbup, text: feedback || null, timestamp: new Date().toISOString() },
    }

    await ModelFactory.chatMessage.update(messageId, { citations: updated } as any)
  }

  /**
   * Stream a chat completion via SSE with full RAG pipeline.
   *
   * Pipeline steps (matching RAGFlow's dialog_service.py):
   * 1. Store user message
   * 2. Load dialog config & prompt settings
   * 3. Multi-turn refinement (if enabled)
   * 4. Cross-language expansion (if enabled)
   * 5. Keyword extraction (if enabled)
   * 6. Hybrid retrieval across knowledge bases
   * 7. Web search (if Tavily configured)
   * 8. Reranking
   * 9. Prompt assembly with context and citation instructions
   * 10. Delta SSE streaming (token-by-token)
   * 11. Post-processing: citation insertion
   * 12. Persist assistant message
   *
   * @param conversationId - The conversation ID
   * @param content - The user's message text
   * @param dialogId - Dialog configuration ID
   * @param userId - ID of the requesting user
   * @param res - Express response object for SSE streaming
   */
  async streamChat(
    conversationId: string,
    content: string,
    dialogId: string | undefined,
    userId: string,
    res: ExpressResponse,
    overrides?: Record<string, any>
  ): Promise<void> {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const metrics: PipelineMetrics = { startTime: Date.now() }

    // Create Langfuse trace for the full pipeline (fire-and-forget)
    let trace: LangfuseTraceClient | undefined
    try {
      trace = langfuseTraceService.createTrace({
        name: 'chat-rag-pipeline',
        userId: userId,
        sessionId: conversationId,
        input: content,
        tags: ['chat', 'rag-pipeline'],
      })
    } catch (err) {
      log.error('Langfuse trace creation failed', { error: String(err) })
    }

    try {
      // ── Step 1: Store user message ──────────────────────────────────────
      const userMsgId = uuidv4()
      await ModelFactory.chatMessage.create({
        id: userMsgId,
        session_id: conversationId,
        role: 'user',
        content,
        created_by: userId,
      } as any)

      // ── Step 2: Load assistant config ──────────────────────────────────────
      const assistant = dialogId
        ? await ModelFactory.chatAssistant.findById(dialogId)
        : null

      const cfg: PromptConfig = (assistant?.prompt_config || {}) as PromptConfig
      const systemPrompt = cfg.system || `Role: You're a smart assistant.
Task: Summarize the information from knowledge bases and answer user's question.
Requirements and restriction:
  - DO NOT make things up, especially for numbers.
  - If the information from knowledge is irrelevant with user's question, JUST SAY: Sorry, no relevant information provided.
  - Answer with markdown format text.
  - Answer in language of user's question.`
      const kbIds = assistant?.kb_ids || []

      // Apply per-request overrides from the client
      const providerId = overrides?.llm_id || assistant?.llm_id || undefined
      const topN = overrides?.top_n ?? cfg.top_n ?? 6
      const effectiveTemperature = overrides?.temperature ?? cfg.temperature ?? 0.7
      const effectiveMaxTokens = overrides?.max_tokens ?? cfg.max_tokens
      const useReasoning = overrides?.reasoning ?? cfg.reasoning ?? false
      const useInternet = overrides?.use_internet ?? (cfg.tavily_api_key ? true : false)
      const variableValues: Record<string, string> = overrides?.variables ?? {}

      // ── Step 3: Load conversation history ───────────────────────────────
      const history = await ModelFactory.chatMessage.getKnex()
        .where('session_id', conversationId)
        .where('id', '!=', userMsgId)
        .orderBy('timestamp', 'asc')
        .limit(20)

      // ── Step 4: Multi-turn refinement ───────────────────────────────────
      const refineStart = Date.now()
      let searchQuery = content

      if (cfg.refine_multiturn && history.length > 0) {
        // Send status event to frontend
        res.write(`data: ${JSON.stringify({ status: 'refining_question' })}\n\n`)
        // Create span for multi-turn refinement tracing
        let refinementSpan: import('@/shared/services/langfuse.service.js').LangfuseParent | undefined
        if (trace) {
          try { refinementSpan = langfuseTraceService.createSpan(trace, { name: 'multi-turn-refinement', input: content }) } catch (err) { log.error('Langfuse span failed', { error: String(err) }) }
        }
        searchQuery = await refineMultiturnQuestion(
          (history as Array<{ role: string; content: string }>).map(m => ({ role: m.role, content: m.content })),
          content,
          providerId,
          refinementSpan
        )
        // Update span output with refined query
        if (refinementSpan && 'end' in refinementSpan) {
          try { (refinementSpan as any).end({ output: searchQuery }) } catch (err) { log.error('Langfuse span end failed', { error: String(err) }) }
        }
        log.info('Refined multi-turn question', { original: content, refined: searchQuery })
      }

      // ── Step 5: Cross-language expansion ────────────────────────────────
      if (cfg.cross_languages) {
        // Create span for cross-language expansion tracing
        let crossLangSpan: import('@/shared/services/langfuse.service.js').LangfuseParent | undefined
        if (trace) {
          try { crossLangSpan = langfuseTraceService.createSpan(trace, { name: 'cross-language-expansion', input: searchQuery }) } catch (err) { log.error('Langfuse span failed', { error: String(err) }) }
        }
        searchQuery = await expandCrossLanguage(searchQuery, cfg.cross_languages, providerId, crossLangSpan)
        // End span with expanded query output
        if (crossLangSpan && 'end' in crossLangSpan) {
          try { (crossLangSpan as any).end({ output: searchQuery }) } catch (err) { log.error('Langfuse span end failed', { error: String(err) }) }
        }
      }

      // ── Step 6: Keyword extraction ──────────────────────────────────────
      let keywords: string[] = []
      if (cfg.keyword) {
        // Create span for keyword extraction tracing
        let keywordSpan: import('@/shared/services/langfuse.service.js').LangfuseParent | undefined
        if (trace) {
          try { keywordSpan = langfuseTraceService.createSpan(trace, { name: 'keyword-extraction', input: searchQuery }) } catch (err) { log.error('Langfuse span failed', { error: String(err) }) }
        }
        keywords = await extractKeywords(searchQuery, providerId, keywordSpan)
        if (keywords.length > 0) {
          // Append keywords to query for broader retrieval
          searchQuery = `${searchQuery} ${keywords.join(' ')}`
        }
        // End span with extracted keywords
        if (keywordSpan && 'end' in keywordSpan) {
          try { (keywordSpan as any).end({ output: keywords }) } catch (err) { log.error('Langfuse span end failed', { error: String(err) }) }
        }
      }

      metrics.refinementMs = Date.now() - refineStart

      // ── Step 6.5: SQL retrieval for structured data ─────────────────────
      if (kbIds.length > 0) {
        const sqlResult = await ragSqlService.querySql(content, kbIds, providerId)
        if (sqlResult) {
          // SQL query returned structured results — stream them directly
          res.write(`data: ${JSON.stringify({ delta: sqlResult.answer })}\n\n`)
          const sqlRef = buildReference(sqlResult.chunks)
          res.write(`data: ${JSON.stringify({ answer: sqlResult.answer, reference: sqlRef })}\n\n`)
          res.write(`data: [DONE]\n\n`)

          // Persist assistant message with SQL answer
          await ModelFactory.chatMessage.create({
            session_id: conversationId,
            role: 'assistant',
            content: sqlResult.answer,
            citations: JSON.stringify(sqlRef),
            created_by: userId,
          } as any)

          res.end()
          return
        }
      }

      // ── Step 7: Hybrid retrieval from knowledge bases ───────────────────
      const retrievalStart = Date.now()
      let allChunks: ChunkResult[] = []

      // Create retrieval span for tracing (critical for RAGAS evaluation)
      let retrievalSpan: ReturnType<typeof langfuseTraceService.createSpan> | undefined
      if (trace) {
        try { retrievalSpan = langfuseTraceService.createSpan(trace, { name: 'retrieval', input: searchQuery }) } catch (err) { log.error('Langfuse span failed', { error: String(err) }) }
      }

      // Embed the search query for semantic/hybrid retrieval
      let queryVector: number[] | null = null
      try {
        const vectors = await llmClientService.embedTexts([searchQuery])
        queryVector = vectors[0] ?? null
      } catch (err) {
        log.warn('Query embedding failed, falling back to full-text', { error: String(err) })
      }

      if (kbIds.length > 0) {
        res.write(`data: ${JSON.stringify({ status: 'retrieving' })}\n\n`)

        // Search all knowledge bases in parallel
        const searchPromises = kbIds.map(kbId =>
          ragSearchService.search(kbId, (() => {
            const req: import('@/shared/models/types.js').SearchRequest = {
              query: searchQuery,
              method: 'hybrid',
              top_k: topN * 2,
              similarity_threshold: cfg.similarity_threshold ?? 0.2,
            }
            if (cfg.vector_similarity_weight != null) req.vector_similarity_weight = cfg.vector_similarity_weight
            return req
          })(), queryVector).catch(err => {
            log.warn('Search failed for dataset', { kbId, error: String(err) })
            return { chunks: [] as ChunkResult[], total: 0 }
          })
        )

        const results = await Promise.all(searchPromises)

        // Log warnings for datasets that returned no results (may have been deleted)
        for (let i = 0; i < kbIds.length; i++) {
          if (results[i]!.chunks.length === 0) {
            log.warn(`Dataset ${kbIds[i]} returned no results — it may have been deleted`)
          }
        }

        allChunks = results.flatMap(r => r.chunks)

        // Sort by score desc
        allChunks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      }

      // ── Step 8: Web search (Tavily) ─────────────────────────────────────
      if (useInternet && cfg.tavily_api_key) {
        res.write(`data: ${JSON.stringify({ status: 'searching_web' })}\n\n`)
        const webResults = await searchWeb(searchQuery, cfg.tavily_api_key, 3)
        allChunks.push(...webResults)
      }

      // ── Step 8a: Knowledge graph retrieval (if enabled) ────────────────
      let kgContext = ''
      if (cfg.use_kg && kbIds.length > 0) {
        res.write(`data: ${JSON.stringify({ status: 'searching_knowledge_graph' })}\n\n`)
        try {
          kgContext = await ragGraphragService.retrieval(kbIds, searchQuery, providerId)
        } catch (err) {
          log.warn('Knowledge graph retrieval failed', { error: String(err) })
        }
      }

      // ── Step 8b: Deep research mode (if enabled) ──────────────────────
      if (useReasoning && kbIds.length > 0) {
        res.write(`data: ${JSON.stringify({ status: 'deep_research' })}\n\n`)
        try {
          const deepChunks = await ragDeepResearchService.research(
            searchQuery,
            kbIds,
            {
              providerId,
              tavilyApiKey: cfg.tavily_api_key,
              useKg: cfg.use_kg,
              maxDepth: 3,
              topN,
            },
            (msg) => {
              // Stream progress updates to the client
              res.write(`data: ${JSON.stringify({ status: 'deep_research', message: msg })}\n\n`)
            }
          )
          // Merge deep research chunks with existing chunks
          for (const chunk of deepChunks) {
            const exists = allChunks.some(c => c.chunk_id === chunk.chunk_id)
            if (!exists) {
              allChunks.push(chunk)
            }
          }
        } catch (err) {
          log.warn('Deep research failed, continuing with standard retrieval', { error: String(err) })
        }
      }

      // End retrieval span with chunk texts for RAGAS evaluation
      if (retrievalSpan) {
        try { retrievalSpan.end({ output: allChunks.map(c => c.text) }) } catch (err) { log.error('Langfuse span end failed', { error: String(err) }) }
      }

      // ── Step 9: Reranking ───────────────────────────────────────────────
      // Create reranking span for tracing
      let rerankSpan: ReturnType<typeof langfuseTraceService.createSpan> | undefined
      if (trace) {
        try { rerankSpan = langfuseTraceService.createSpan(trace, { name: 'reranking', input: allChunks.map(c => c.text) }) } catch (err) { log.error('Langfuse span failed', { error: String(err) }) }
      }

      if (allChunks.length > topN) {
        res.write(`data: ${JSON.stringify({ status: 'reranking' })}\n\n`)

        // Use dedicated rerank model if configured, otherwise fall back to LLM reranking
        if (cfg.rerank_id) {
          allChunks = await ragRerankService.rerank(content, allChunks, topN, cfg.rerank_id)
        } else {
          allChunks = await rerankChunks(content, allChunks, topN, providerId)
        }
      } else {
        allChunks = allChunks.slice(0, topN)
      }

      // End reranking span with reranked chunk texts
      if (rerankSpan) {
        try { rerankSpan.end({ output: allChunks.map(c => c.text) }) } catch (err) { log.error('Langfuse span end failed', { error: String(err) }) }
      }

      metrics.retrievalMs = Date.now() - retrievalStart
      metrics.totalChunks = allChunks.length

      // ── Step 10: Handle empty results ───────────────────────────────────
      if (allChunks.length === 0 && cfg.empty_response && kbIds.length > 0) {
        // No chunks found and empty_response is configured
        res.write(`data: ${JSON.stringify({ delta: cfg.empty_response })}\n\n`)
        res.write(`data: [DONE]\n\n`)

        // Store the empty response
        await ModelFactory.chatMessage.create({
          session_id: conversationId,
          role: 'assistant',
          content: cfg.empty_response,
          created_by: userId,
        } as any)

        res.end()
        return
      }

      // ── Step 11: Build prompt with context and citations ────────────────
      // Append knowledge graph context to the system prompt if available
      const basePrompt = kgContext
        ? `${systemPrompt}\n\n${kgContext}`
        : systemPrompt

      const contextSystemPrompt = buildContextPrompt(
        basePrompt,
        allChunks,
        cfg.quote !== false // Enable citations by default
      )

      // Apply variable substitution to system prompt
      let effectiveSystemPrompt = contextSystemPrompt
      for (const [key, value] of Object.entries(variableValues)) {
        effectiveSystemPrompt = effectiveSystemPrompt.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
      }

      // Assemble LLM messages: system + history + current
      const llmMessages: LlmMessage[] = [
        { role: 'system', content: effectiveSystemPrompt },
      ]

      for (const msg of history as Array<{ role: string; content: string }>) {
        llmMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })
      }

      llmMessages.push({ role: 'user', content })

      // ── Step 12: Delta SSE streaming ────────────────────────────────────
      const genStart = Date.now()
      let fullAnswer = ''

      // Send reference data immediately so frontend can show sources panel
      const reference = allChunks.length > 0 ? buildReference(allChunks) : null
      if (reference) {
        res.write(`data: ${JSON.stringify({ reference })}\n\n`)
      }

      // Create main-completion span for tracing the LLM streaming call
      let mainSpan: ReturnType<typeof langfuseTraceService.createSpan> | undefined
      if (trace) {
        try { mainSpan = langfuseTraceService.createSpan(trace, { name: 'main-completion' }) } catch (err) { log.error('Langfuse span failed', { error: String(err) }) }
      }

      // Stream LLM tokens as deltas (NOT accumulated)
      const stream = llmClientService.chatCompletionStream(llmMessages, {
        providerId,
        temperature: effectiveTemperature,
        ...(cfg.top_p != null ? { top_p: cfg.top_p } : {}),
        ...(effectiveMaxTokens != null ? { max_tokens: effectiveMaxTokens } : {}),
      }, mainSpan)

      for await (const chunk of stream) {
        if (chunk.content) {
          fullAnswer += chunk.content

          // Send DELTA only (just the new token, not the full text)
          res.write(`data: ${JSON.stringify({ delta: chunk.content })}\n\n`)
        }
      }

      metrics.generationMs = Date.now() - genStart

      // ── Step 13: Post-process citations ─────────────────────────────────
      // Try embedding-based citation insertion first, fall back to regex-only
      let processedAnswer: string
      let citedChunkIndices: Set<number>

      try {
        // Check if an embedding model is available for precise citation matching
        const embDefaults = await ModelFactory.modelProvider.findDefaults()
        const hasEmbedding = embDefaults.some(p => p.model_type === 'embedding')

        if (hasEmbedding && allChunks.length > 0) {
          const citationResult = await ragCitationService.insertCitations(fullAnswer, allChunks)
          processedAnswer = citationResult.answer
          citedChunkIndices = citationResult.citedIndices
        } else {
          const regexResult = processCitations(fullAnswer, allChunks)
          processedAnswer = regexResult.answer
          citedChunkIndices = regexResult.citedChunkIndices
        }
      } catch {
        // Fall back to regex-based citations on any error
        const regexResult = processCitations(fullAnswer, allChunks)
        processedAnswer = regexResult.answer
        citedChunkIndices = regexResult.citedChunkIndices
      }

      // Rebuild reference with citation tracking
      const finalReference = allChunks.length > 0
        ? buildReference(allChunks, citedChunkIndices)
        : null

      // Send final answer with processed citations and updated reference
      res.write(`data: ${JSON.stringify({
        answer: processedAnswer,
        reference: finalReference,
        metrics: {
          refinement_ms: metrics.refinementMs,
          retrieval_ms: metrics.retrievalMs,
          generation_ms: metrics.generationMs,
          total_ms: Date.now() - metrics.startTime,
          chunks_retrieved: metrics.totalChunks,
          chunks_cited: citedChunkIndices.size,
        },
      })}\n\n`)

      // Send completion signal
      res.write(`data: [DONE]\n\n`)

      // ── Step 14: Persist assistant message ──────────────────────────────
      if (processedAnswer) {
        await ModelFactory.chatMessage.create({
          session_id: conversationId,
          role: 'assistant',
          content: processedAnswer,
          citations: finalReference ? JSON.stringify(finalReference) : null,
          created_by: userId,
        } as any)
      }

      // Auto-generate session title from first user message
      const msgCount = await ModelFactory.chatMessage.getKnex()
        .where('session_id', conversationId)
        .count('id as count')
        .first()
      if (Number(msgCount?.count) <= 2) {
        const title = content.length > 100 ? content.slice(0, 100) + '...' : content
        await ModelFactory.chatSession.update(conversationId, { title } as any)
      }

      // Update Langfuse trace with final output and flush (fire-and-forget)
      if (trace) {
        try {
          langfuseTraceService.updateTrace(trace, { output: processedAnswer })
          // End main-completion span if still open
          if (mainSpan) { mainSpan.end({ output: processedAnswer }) }
          await langfuseTraceService.flush()
        } catch (err) {
          log.error('Langfuse trace finalization failed', { error: String(err) })
        }
      }

      log.info('Chat completed', {
        conversationId,
        totalMs: Date.now() - metrics.startTime,
        chunksRetrieved: metrics.totalChunks,
        chunksCited: citedChunkIndices.size,
      })
    } catch (error) {
      log.error('Stream chat error', { conversationId, error: (error as Error).message })
      res.write(`data: ${JSON.stringify({ error: (error as Error).message })}\n\n`)
    } finally {
      if (!res.writableEnded) {
        res.end()
      }
    }
  }
}

/** Singleton instance of the chat conversation service */
export const chatConversationService = new ChatConversationService()
