
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

import { config } from '@/shared/config/index.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { llmClientService, LlmMessage } from '@/shared/services/llm-client.service.js'
import { ragSearchService } from '@/modules/rag/services/rag-search.service.js'
import { ragRerankService } from '@/modules/rag/services/rag-rerank.service.js'
import { ragCitationService } from '@/modules/rag/services/rag-citation.service.js'
import { ragSqlService } from '@/modules/rag/services/rag-sql.service.js'
import { ragGraphragService } from '@/modules/rag/services/rag-graphrag.service.js'
import { ragDeepResearchService } from '@/modules/rag/services/rag-deep-research.service.js'
import type { DeepResearchProgressEvent } from '@/modules/rag/services/rag-deep-research.service.js'
import { searchWeb } from '@/shared/services/web-search.service.js'
import {
  fullQuestionPrompt,
  crossLanguagePrompt,
  keywordPrompt,
  citationPrompt,
  askSummaryPrompt,
} from '@/shared/prompts/index.js'
import { detectLanguage, buildLanguageInstruction } from '@/shared/utils/language-detect.js'
import { htmlToMarkdown } from '@/shared/utils/html-to-markdown.js'
import { abilityService, buildOpenSearchAbacFilters } from '@/shared/services/ability.service.js'
import { log } from '@/shared/services/logger.service.js'
import { langfuseTraceService } from '@/shared/services/langfuse.service.js'
import { queryLogService } from '@/modules/rag/index.js'
import type { LangfuseTraceClient } from 'langfuse'
import { ChunkResult, ChatAssistant } from '@/shared/models/types.js'
import { memoryExtractionService, memoryMessageService } from '@/modules/memory/index.js'
import { Response as ExpressResponse } from 'express'
import { getUuid } from '@/shared/utils/uuid.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** @description Assistant prompt configuration from chat_assistants.prompt_config JSON column */
interface PromptConfig {
  /** System prompt template */
  system?: string
  /** Welcome message for new conversations (string or per-locale map) */
  prologue?: string | Record<string, string>
  /** Enable multi-turn question synthesis */
  refine_multiturn?: boolean
  /** Enable cross-language query expansion */
  cross_languages?: string
  /** Enable keyword extraction and appending */
  keyword?: boolean
  /** Enable citation insertion in answer */
  quote?: boolean
  /** Response when no knowledge base results found (string or per-locale map) */
  empty_response?: string | Record<string, string>
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
  /** When true, expand search to user's RBAC-accessible datasets beyond the explicitly linked ones */
  allow_rbac_datasets?: boolean
}

/** @description Timing metrics collected during the RAG pipeline execution */
interface PipelineMetrics {
  startTime: number
  refinementMs?: number
  retrievalMs?: number
  generationMs?: number
  totalChunks?: number
  totalTokens?: number
}

const DEFAULT_SYSTEM_PROMPT = `You are an intelligent assistant. Your primary function is to answer questions based strictly on the provided knowledge base.

**Essential Rules:**
  - Your answer must be derived **solely** from this dataset: \`{knowledge}\`.
  - **When information is available**: Summarize the content to give a detailed answer.
  - **When information is unavailable**: Your response must contain this exact sentence: "The answer you are looking for is not found in the dataset!"
  - **Always consider** the entire conversation history.`


// ---------------------------------------------------------------------------
// i18n Field Resolution
// ---------------------------------------------------------------------------

/**
 * @description Resolve an i18n field value.
 * Supports both legacy plain strings and per-locale Record<string, string> maps.
 * Falls back: userLang → 'en' → first non-empty value → empty string.
 * @param {string | Record<string, string> | undefined} value - Field value
 * @param {string} [userLang] - Preferred language code (e.g. 'vi', 'ja')
 * @returns {string} Resolved string for the user's language
 */
function resolveI18nField(
  value: string | Record<string, string> | undefined,
  userLang?: string
): string {
  if (!value) return ''
  if (typeof value === 'string') return value

  // Per-locale map: try user lang → en → first non-empty
  if (userLang && value[userLang]?.trim()) return value[userLang]
  if (value.en?.trim()) return value.en
  const firstNonEmpty = Object.values(value).find(v => v?.trim())
  return firstNonEmpty ?? ''
}

// ---------------------------------------------------------------------------
// RAG Pipeline Helpers
// ---------------------------------------------------------------------------

/**
 * @description Refine multi-turn conversation into a single coherent question.
 * Uses the LLM to synthesize conversation history + latest question.
 * @param {Array<{ role: string; content: string }>} history - Previous conversation messages
 * @param {string} currentQuestion - The latest user question
 * @param {string} [providerId] - LLM provider ID to use
 * @param {import('@/shared/services/langfuse.service.js').LangfuseParent} [parent] - Optional Langfuse parent for tracing
 * @returns {Promise<string>} Refined question incorporating conversation context
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
 * @description Expand query with cross-language translations for multilingual retrieval.
 * @param {string} query - Original query text
 * @param {string} targetLanguages - Comma-separated language list (e.g. "English,Japanese,Vietnamese")
 * @param {string} [providerId] - LLM provider ID
 * @param {import('@/shared/services/langfuse.service.js').LangfuseParent} [parent] - Optional Langfuse parent for tracing
 * @returns {Promise<string>} Expanded query with translations appended
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
 * @description Extract keywords from query for enhanced keyword-based retrieval.
 * @param {string} query - User query text
 * @param {string} [providerId] - LLM provider ID
 * @param {import('@/shared/services/langfuse.service.js').LangfuseParent} [parent] - Optional Langfuse parent for tracing
 * @returns {Promise<string[]>} Array of extracted keywords
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
 * @description Rerank retrieved chunks using the LLM for better relevance ordering.
 * Uses a cross-encoder style prompt to score each chunk.
 * @param {string} query - Original user query
 * @param {ChunkResult[]} chunks - Retrieved chunks to rerank
 * @param {number} topN - Number of top results to keep
 * @param {string} [providerId] - LLM provider ID
 * @returns {Promise<ChunkResult[]>} Reranked and filtered chunks
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
 * @description Build the system prompt with retrieved knowledge and citation instructions.
 * Follows RAGFlow's kb_prompt + citation_prompt pattern.
 * @param {string} systemPrompt - Base system prompt from dialog config
 * @param {ChunkResult[]} chunks - Retrieved and reranked chunks
 * @param {boolean} enableCitations - Whether to include citation instructions
 * @returns {string} Assembled system message with context and citation guidance
 */
function buildContextPrompt(
  systemPrompt: string,
  chunks: ChunkResult[],
  enableCitations: boolean
): string {
  if (!chunks.length) return systemPrompt

  // Format each chunk with source metadata and index for citation.
  // Convert HTML chunks to Markdown to reduce token usage while preserving content quality.
  const context = chunks
    .map((c, i) => {
      const source = c.doc_name ? ` [${c.doc_name}]` : ''
      const page = c.page_num?.length ? ` (p.${c.page_num.join(',')})` : ''
      // Convert HTML (e.g. tables from Excel parser) to compact Markdown
      const text = htmlToMarkdown(c.text)
      return `[ID:${i}]${source}${page}\n${text}`
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
 * @description Insert citation markers into the answer by matching content to chunks.
 * Post-processes the LLM answer to add or fix citations.
 * @param {string} answer - Raw LLM answer text
 * @param {ChunkResult[]} chunks - Retrieved chunks used for context
 * @returns {{ answer: string; citedChunkIndices: Set<number> }} Answer with citation markers normalized and set of cited chunk indices
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
 * @description Format chunks into the reference structure expected by the frontend.
 * Only includes chunks that were actually cited in the answer.
 * @param {ChunkResult[]} chunks - All retrieved chunks
 * @param {Set<number>} [citedIndices] - Set of chunk indices that were cited
 * @returns {{ chunks: object[]; doc_aggs: object[] }} Reference object with chunks and doc_aggs
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
      // Full position arrays for PDF chunk highlighting when clicking citations.
      // Format: [[pageNum, x1, x2, y1, y2], ...] — consumed by buildChunkHighlights()
      positions: c.positions || [],
      score: c.score ?? 0,
      img_id: c.img_id || '',
      cited: citedIndices?.has(i) ?? false,
    })),
    doc_aggs: [...docMap.values()],
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * @description Service class for chat conversation operations.
 * Implements the full RAG pipeline: retrieval, refinement, LLM generation, and citation.
 * Manages conversation CRUD, message persistence, and SSE streaming.
 */
export class ChatConversationService {
  /**
   * @description Create a new conversation session.
   * Verifies assistant exists and optionally inserts a prologue message.
   * @param {string} dialogId - The dialog (chat assistant) ID
   * @param {string} name - Display name for the conversation
   * @param {string} userId - ID of the user creating the conversation
   * @returns {Promise<object>} The created session
   * @throws {Error} If the assistant does not exist
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
      title: name || 'New Conversation',
      dialog_id: dialogId,
      created_by: userId,
    } as any)

    // Insert prologue as first assistant message if assistant has one configured
    const promptConfig = typeof assistant.prompt_config === 'string'
      ? JSON.parse(assistant.prompt_config)
      : assistant.prompt_config
    if (promptConfig?.prologue) {
      const resolvedPrologue = resolveI18nField(promptConfig.prologue)
      if (resolvedPrologue) {
        await ModelFactory.chatMessage.create({
          session_id: session.id,
          role: 'assistant',
          content: resolvedPrologue,
          created_by: 'system',
        } as any)
      }
    }

    log.info('Conversation created', { sessionId: session.id, dialogId, userId })
    return session
  }

  /**
   * @description Get a conversation with its messages.
   * Returns null if the conversation does not exist or belongs to another user.
   * @param {string} conversationId - UUID of the conversation
   * @param {string} userId - ID of the requesting user (for access check)
   * @returns {Promise<object | null>} Session with messages array, or null if not found/unauthorized
   */
  async getConversation(conversationId: string, userId: string) {
    const session = await ModelFactory.chatSession.findById(conversationId)
    if (!session) return null

    // Verify ownership — only the conversation owner can access it
    if (session.user_id !== userId) return null

    // Fetch messages ordered by timestamp
    const messages = await ModelFactory.chatMessage.getKnex()
      .where('session_id', conversationId)
      .orderBy('timestamp', 'asc')

    // Map citations -> reference
    const mappedMessages = messages.map((msg: any) => {
      let reference = undefined
      if (msg.citations) {
        try {
          reference = typeof msg.citations === 'string'
            ? JSON.parse(msg.citations)
            : msg.citations
        } catch { /* ignore parse errors */ }
      }
      return { ...msg, reference }
    })

    return { ...session, messages: mappedMessages }
  }

  /**
   * @description Rename a conversation.
   * Returns null if the conversation does not exist or belongs to another user.
   * @param {string} conversationId - The conversation ID
   * @param {string} name - The new name
   * @param {string} userId - Requesting user ID
   * @returns {Promise<object | null>} Updated session or null if not found/unauthorized
   */
  async renameConversation(conversationId: string, name: string, userId: string) {
    const session = await ModelFactory.chatSession.findById(conversationId)
    // Verify existence and ownership
    if (!session || session.user_id !== userId) return null

    await ModelFactory.chatSession.update(conversationId, { title: name, updated_by: userId } as any)
    return await ModelFactory.chatSession.findById(conversationId)
  }

  /**
   * @description List conversations for a dialog belonging to a user.
   * @param {string} dialogId - The dialog ID to filter by
   * @param {string} userId - The user ID to filter by
   * @returns {Promise<object[]>} Array of conversation sessions ordered by creation date descending
   */
  async listConversations(dialogId: string, userId: string) {
    return ModelFactory.chatSession.getKnex()
      .where({ dialog_id: dialogId, user_id: userId })
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Bulk delete conversations owned by a user.
   * Only deletes conversations belonging to the requesting user.
   * Also removes all associated messages.
   * @param {string[]} conversationIds - Array of conversation IDs to delete
   * @param {string} userId - ID of the user performing deletion
   * @returns {Promise<number>} Number of deleted sessions
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
   * @description Deletes all conversation sessions for a given dialog/assistant.
   * Upstream port: dialog_service delete_all_sessions concept.
   * Also removes all associated messages for the deleted sessions.
   * @param {string} dialogId - Dialog/assistant ID whose sessions to delete
   * @param {string} userId - User ID for ownership filtering
   * @returns {Promise<number>} Number of sessions deleted
   */
  async deleteAllSessions(dialogId: string, userId: string): Promise<number> {
    // Find all session IDs owned by this user for the given dialog
    const sessionIds: string[] = await ModelFactory.chatSession.getKnex()
      .where('dialog_id', dialogId)
      .andWhere('user_id', userId)
      .pluck('id')

    if (sessionIds.length === 0) return 0

    // Bulk delete all messages belonging to these sessions
    await ModelFactory.chatMessage.getKnex()
      .whereIn('session_id', sessionIds)
      .delete()

    // Bulk delete the sessions themselves
    const count = await ModelFactory.chatSession.getKnex()
      .whereIn('id', sessionIds)
      .delete()

    log.info('All sessions deleted for dialog', { dialogId, userId, count })
    return count
  }

  /**
   * @description Delete a specific message from a conversation.
   * Verifies conversation ownership before allowing deletion.
   * @param {string} conversationId - The conversation ID
   * @param {string} messageId - The message ID to delete
   * @param {string} userId - The user requesting deletion
   * @returns {Promise<boolean>} True if the message was deleted
   */
  async deleteMessage(
    conversationId: string,
    messageId: string,
    userId: string
  ): Promise<boolean> {
    const session = await ModelFactory.chatSession.findById(conversationId)
    // Verify existence and ownership before deletion
    if (!session || session.user_id !== userId) return false

    // Delete the specific message by ID and session scope
    const deleted = await ModelFactory.chatMessage.getKnex()
      .where({ id: messageId, session_id: conversationId })
      .delete()

    return deleted > 0
  }

  /**
   * @description Save feedback on a message.
   * Stores thumbs up/down and optional text feedback in the message's citations JSON.
   * @param {string} messageId - The message ID
   * @param {boolean} thumbup - True for positive, false for negative
   * @param {string} [feedback] - Optional text feedback
   * @returns {Promise<void>}
   * @throws {Error} If the message does not exist
   */
  async sendFeedback(
    messageId: string,
    thumbup: boolean,
    feedback?: string
  ): Promise<void> {
    // Fetch the message to merge feedback into existing citations JSON
    const message = await ModelFactory.chatMessage.findById(messageId)
    if (!message) throw new Error('Message not found')

    // Merge new feedback with existing citations data (preserving reference info)
    const existing = (typeof message.citations === 'object' && message.citations) || {}
    const updated = {
      ...(existing as Record<string, unknown>),
      feedback: { thumbup, text: feedback || null, timestamp: new Date().toISOString() },
    }

    await ModelFactory.chatMessage.update(messageId, { citations: updated } as any)

    // Dual-write to answer_feedback table for structured analytics
    try {
      await ModelFactory.answerFeedback.create({
        source: 'chat',
        source_id: message.session_id,
        message_id: messageId,
        user_id: message.created_by || 'unknown',
        thumbup,
        comment: feedback || null,
        query: message.content || '',
        answer: message.content || '',
        chunks_used: null,
        trace_id: null,
        tenant_id: config.opensearch.systemTenantId,
      })
    } catch (err) {
      // Non-critical: log but don't fail the primary feedback write
      log.warn('Failed to dual-write chat feedback to answer_feedback table', { error: (err as Error).message })
    }
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
   * @param {string} conversationId - The conversation ID
   * @param {string} content - The user's message text
   * @param {string | undefined} dialogId - Dialog configuration ID
   * @param {string} userId - ID of the requesting user
   * @param {ExpressResponse} res - Express response object for SSE streaming
   * @param {Record<string, any>} [overrides] - Optional per-request parameter overrides
   * @returns {Promise<void>}
   */
  async streamChat(
    conversationId: string,
    content: string,
    dialogId: string | undefined,
    userId: string,
    res: ExpressResponse,
    overrides?: Record<string, any>,
    tenantId: string = '',
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
      const userMsgId = getUuid()
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
      const systemPrompt = cfg.system || DEFAULT_SYSTEM_PROMPT
      const kbIds = assistant?.kb_ids || []

      // Apply per-request overrides from the client
      const providerId = overrides?.llm_id || assistant?.llm_id || undefined
      const topN = overrides?.top_n ?? cfg.top_n ?? 6
      const effectiveTemperature = overrides?.temperature ?? cfg.temperature ?? 0.7
      const effectiveMaxTokens = overrides?.max_tokens ?? cfg.max_tokens
      const useReasoning = overrides?.reasoning ?? cfg.reasoning ?? false
      const useInternet = overrides?.use_internet ?? (cfg.tavily_api_key ? true : false)
      const variableValues: Record<string, string> = overrides?.variables ?? {}

      // ── Step 2b: Detect user input language for response language matching ──
      // Runs before prompt assembly so the language instruction can be prepended to the system prompt.
      // This ensures the LLM responds in the same language as the user's question.
      const detectedLang = detectLanguage(content)
      const langInstruction = buildLanguageInstruction(detectedLang)

      // Flag to skip retrieval pipeline (set when no KBs configured on assistant)
      const skipRetrieval = kbIds.length === 0

      // ── Step 3: Load conversation history ───────────────────────────────
      const history = await ModelFactory.chatMessage.getKnex()
        .where('session_id', conversationId)
        .where('id', '!=', userMsgId)
        .orderBy('timestamp', 'asc')
        .limit(20)

      // ── Step 4: Multi-turn refinement ───────────────────────────────────
      const retrievalTimings: Record<string, number> = {}
      const refineStart = Date.now()
      let searchQuery = content

      if (!skipRetrieval && cfg.refine_multiturn && history.length > 0) {
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
        retrievalTimings.refineMultiturn = Date.now() - refineStart
      }

      // ── Step 5: Cross-language expansion ────────────────────────────────
      if (!skipRetrieval && cfg.cross_languages) {
        const crossLangStart = Date.now()
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
        retrievalTimings.crossLanguage = Date.now() - crossLangStart
      }

      // ── Step 6: Keyword extraction ──────────────────────────────────────
      let keywords: string[] = []
      const keywordStart = Date.now()
      if (!skipRetrieval && cfg.keyword) {
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
        retrievalTimings.keywordExtraction = Date.now() - keywordStart
      }

      metrics.refinementMs = Date.now() - refineStart

      // ── Step 6.5: SQL retrieval for structured data ─────────────────────
      if (!skipRetrieval && kbIds.length > 0) {
        const sqlResult = await ragSqlService.querySql(content, kbIds, providerId, tenantId)
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
      if (!skipRetrieval) {
        try {
          const embedStart = Date.now()
          const vectors = await llmClientService.embedTexts([searchQuery])
          retrievalTimings.queryEmbedding = Date.now() - embedStart
          queryVector = vectors[0] ?? null
        } catch (err) {
          log.warn('Query embedding failed, falling back to full-text', { error: String(err) })
        }
      }

      // ── Step 7a: Expand to RBAC-accessible datasets if enabled ──────────
      // SECURITY-CRITICAL: When allow_rbac_datasets is enabled, resolve the user's
      // RBAC-accessible datasets using per-user ABAC filtering. Do NOT use a tenant-wide
      // findAll — that would bypass per-user ABAC rules and leak unauthorized data.
      let allKbIds = [...kbIds]
      if (!skipRetrieval && cfg.allow_rbac_datasets && userId && tenantId) {
        try {
          const userContext = {
            id: userId,
            role: 'user',
            current_org_id: tenantId,
          }
          // Build CASL ability for this specific user to determine authorized datasets
          const userAbility = abilityService.buildAbilityFor(userContext)
          // Fetch all tenant datasets, then filter by what the user's ABAC rules permit
          const allTenantDatasets = await ModelFactory.dataset.getKnex()
            .where('tenant_id', tenantId)
            .select('id', 'name', 'tenant_id')

          // Only include datasets the user is authorized to read via CASL ability check
          const authorizedKbIds = allTenantDatasets
            .filter((d: any) => userAbility.can('read', { __caslSubjectType__: 'Dataset', ...d } as any))
            .map((d: any) => d.id as string)
            .filter((id: string) => !kbIds.includes(id))

          if (authorizedKbIds.length > 0) {
            allKbIds = [...kbIds, ...authorizedKbIds]
            log.info('Expanded KB search with RBAC-accessible datasets', {
              original: kbIds.length,
              expanded: allKbIds.length,
            })
          }
        } catch (err) {
          log.warn('RBAC dataset expansion failed, using original kbIds', { error: String(err) })
        }
      }

      if (!skipRetrieval && allKbIds.length > 0) {
        res.write(`data: ${JSON.stringify({ status: 'retrieving' })}\n\n`)
        const osSearchStart = Date.now()

        // Build search request shared by both paths
        const searchReq: import('@/shared/models/types.js').SearchRequest = {
          query: searchQuery,
          method: 'hybrid',
          top_k: topN * 2,
          similarity_threshold: cfg.similarity_threshold ?? 0.2,
        }
        if (cfg.vector_similarity_weight != null) searchReq.vector_similarity_weight = cfg.vector_similarity_weight

        // When RBAC expansion produced multiple datasets, use cross-dataset single-query search
        if (cfg.allow_rbac_datasets && allKbIds.length > kbIds.length) {
          const crossResult = await ragSearchService.searchMultipleDatasets(
            tenantId, allKbIds, searchReq, queryVector
          ).catch(err => {
            log.warn('Cross-dataset search failed', { error: String(err) })
            return { chunks: [] as ChunkResult[], total: 0 }
          })
          allChunks = crossResult.chunks
        } else {
          // Standard per-KB parallel search (no RBAC expansion)
          const searchPromises = allKbIds.map(kbId =>
            ragSearchService.search(tenantId, kbId, searchReq, queryVector).catch(err => {
              log.warn('Search failed for dataset', { kbId, error: String(err) })
              return { chunks: [] as ChunkResult[], total: 0 }
            })
          )

          const results = await Promise.all(searchPromises)

          // Log warnings for datasets that returned no results (may have been deleted)
          for (let i = 0; i < allKbIds.length; i++) {
            if (results[i]!.chunks.length === 0) {
              log.warn(`Dataset ${allKbIds[i]} returned no results — it may have been deleted`)
            }
          }

          allChunks = results.flatMap(r => r.chunks)
        }

        // Sort by score desc
        allChunks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

        // Filter out empty or invalid chunks before further processing.
        // Upstream port: dialog_service empty doc filter to prevent null reference errors.
        allChunks = allChunks.filter(chunk => chunk && chunk.chunk_id)

        retrievalTimings.osSearch = Date.now() - osSearchStart
      }

      // ── Step 8: Web search (Tavily) ─────────────────────────────────────
      if (!skipRetrieval && useInternet && cfg.tavily_api_key) {
        res.write(`data: ${JSON.stringify({ status: 'searching_web' })}\n\n`)
        const webStart = Date.now()
        const webResults = await searchWeb(searchQuery, cfg.tavily_api_key, 3)
        retrievalTimings.webSearch = Date.now() - webStart
        allChunks.push(...webResults)
      }

      // ── Step 8a: Knowledge graph retrieval (graph+vector hybrid) ───────
      // When use_kg is enabled, retrieve structured graph context (entities + relations)
      // from the knowledge graph. This context is merged with vector chunks in Step 11
      // to produce a richer answer combining structured and unstructured knowledge.
      let kgContext = ''
      if (!skipRetrieval && cfg.use_kg && kbIds.length > 0) {
        log.info('Using graph+vector hybrid retrieval', { kbCount: kbIds.length })
        res.write(`data: ${JSON.stringify({ status: 'searching_knowledge_graph' })}\n\n`)
        try {
          const kgStart = Date.now()
          kgContext = await ragGraphragService.retrieval(kbIds, searchQuery, providerId)
          retrievalTimings.knowledgeGraph = Date.now() - kgStart
        } catch (err) {
          log.warn('Knowledge graph retrieval failed', { error: String(err) })
        }
      }

      // ── Step 8b: Budget-aware deep research mode (if enabled) ─────────
      // Deep research uses recursive question decomposition with hard budget caps
      // (50K tokens / 15 LLM calls) to prevent cost spirals. The onProgress callback
      // streams structured DeepResearchProgressEvent objects as SSE events so the
      // frontend can render sub-query progress, budget status, and intermediate results.
      if (!skipRetrieval && useReasoning && kbIds.length > 0) {
        res.write(`data: ${JSON.stringify({ status: 'deep_research' })}\n\n`)
        const drStart = Date.now()
        try {
          const deepChunks = await ragDeepResearchService.research(
            tenantId,
            searchQuery,
            kbIds,
            {
              providerId,
              tavilyApiKey: cfg.tavily_api_key,
              useKg: cfg.use_kg,
              maxDepth: 3,
              topN,
              // Budget caps prevent token cost spirals (Phase 5 Pitfall 5)
              maxTokens: 50_000,
              maxCalls: 15,
            },
            (event: DeepResearchProgressEvent) => {
              // Stream structured progress events for frontend rendering
              res.write(`data: ${JSON.stringify({
                status: 'deep_research',
                subEvent: event.subEvent,
                query: event.query,
                depth: event.depth,
                index: event.index,
                total: event.total,
                chunks: event.chunks,
                message: event.message,
                // Include budget status only when available
                ...(event.tokensUsed !== undefined ? { tokensUsed: event.tokensUsed, tokensMax: event.tokensMax } : {}),
                ...(event.callsUsed !== undefined ? { callsUsed: event.callsUsed, callsMax: event.callsMax } : {}),
                ...(event.completed !== undefined ? { completed: event.completed } : {}),
              })}\n\n`)
            }
          )
          // Merge deep research chunks with existing chunks, deduplicating by chunk_id.
          // When budget is exhausted mid-recursion, research() returns partial results
          // from completed sub-queries (not an empty array).
          for (const chunk of deepChunks) {
            const exists = allChunks.some(c => c.chunk_id === chunk.chunk_id)
            if (!exists) {
              allChunks.push(chunk)
            }
          }
        } catch (err) {
          log.warn('Deep research failed, continuing with standard retrieval', { error: String(err) })
        }
        retrievalTimings.deepResearch = Date.now() - drStart
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
        if (cfg.rerank_id) {
          // Use dedicated rerank model (Jina/Cohere/BAAI) — fast (~300ms)
          res.write(`data: ${JSON.stringify({ status: 'reranking' })}\n\n`)
          const rerankStart = Date.now()
          allChunks = await ragRerankService.rerank(content, allChunks, topN, cfg.rerank_id)
          retrievalTimings.reranking = Date.now() - rerankStart
        } else {
          // No rerank model configured — use OpenSearch hybrid scores directly.
          // Chunks are already sorted by score from multi-field boosted hybrid search,
          // so truncating to topN gives good results without the 3-5s LLM reranking overhead.
          allChunks = allChunks.slice(0, topN)
        }
      } else {
        allChunks = allChunks.slice(0, topN)
      }

      // End reranking span with reranked chunk texts
      if (rerankSpan) {
        try { rerankSpan.end({ output: allChunks.map(c => c.text) }) } catch (err) { log.error('Langfuse span end failed', { error: String(err) }) }
      }

      metrics.retrievalMs = Date.now() - retrievalStart
      retrievalTimings.totalRetrieval = metrics.retrievalMs
      log.info('Retrieval pipeline timings (ms)', { sessionId: conversationId, userMsgId, timings: retrievalTimings, chunkCount: allChunks.length })
      metrics.totalChunks = allChunks.length

      // ── Step 10: Handle empty results ───────────────────────────────────
      if (allChunks.length === 0 && cfg.empty_response && kbIds.length > 0) {
        // No chunks found and empty_response is configured
        // Resolve per-locale value based on user query language
        const resolvedEmptyResponse = resolveI18nField(cfg.empty_response, detectedLang)
        if (resolvedEmptyResponse) {
          res.write(`data: ${JSON.stringify({ delta: resolvedEmptyResponse })}\n\n`)
          res.write(`data: [DONE]\n\n`)

          // Store the empty response
          await ModelFactory.chatMessage.create({
            session_id: conversationId,
            role: 'assistant',
            content: resolvedEmptyResponse,
            created_by: userId,
          } as any)

          res.end()
          return
        }
      }

      // ── Step 10b: Inject relevant memories into context (D-09 auto-inject) ──
      // When the assistant has a linked memory pool, search for relevant past memories
      // and prepend them to the system prompt for personalized responses.
      let memoryContext = ''
      if (assistant?.memory_id) {
        try {
          // Generate embedding for the user's query to enable semantic memory search
          let memoryQueryVector: number[] = []
          if (queryVector) {
            memoryQueryVector = queryVector
          } else {
            try {
              const vecs = await llmClientService.embedTexts([content])
              memoryQueryVector = vecs[0] ?? []
            } catch {
              // Embedding failed -- will fall back to text-only memory search
            }
          }

          const memories = await memoryMessageService.searchMemory(
            tenantId,
            assistant.memory_id,
            content,
            memoryQueryVector,
            5,
          )

          // Prepend relevant memories to system prompt if any were found
          if (memories.length > 0) {
            memoryContext = `\n\nRelevant memories:\n${memories.map(m => '- ' + m.content).join('\n')}`
            log.info('Injected memories into chat context', {
              memoryId: assistant.memory_id,
              count: memories.length,
            })
          }
        } catch (err) {
          // Memory search failure must not break chat -- graceful degradation
          log.warn('Memory search failed, continuing without memories', {
            memoryId: assistant.memory_id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      // ── Step 11: Build prompt with context and citations ────────────────
      // Prepend language instruction so the LLM responds in the user's detected language.
      // Then append knowledge graph context (graph+vector merge point) if available.
      const langAwarePrompt = `${langInstruction}\n\n${systemPrompt}${memoryContext}`
      const basePrompt = kgContext
        ? `${langAwarePrompt}\n\n${kgContext}`
        : langAwarePrompt

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

      // ── Step 14b: Fire-and-forget memory extraction (Pitfall 5 -- non-blocking) ──
      // When the assistant has a linked memory pool, extract memories from the conversation
      // after the response has been streamed. Uses void to ensure no await -- must not block.
      if (assistant?.memory_id && processedAnswer) {
        // Fire-and-forget memory extraction -- must not block chat response
        void memoryExtractionService
          .extractFromConversation(assistant.memory_id, content, processedAnswer, conversationId, userId, tenantId)
          .catch(err => log.error('Memory extraction failed', { memoryId: assistant.memory_id, error: String(err) }))
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

      // Async analytics logging — fire-and-forget, non-blocking (never awaited)
      // Uses the highest chunk similarity score as confidence proxy
      const topChunkScore = allChunks.length > 0
        ? Math.max(...allChunks.map(c => c.score ?? 0))
        : null
      queryLogService.logQuery({
        source: 'chat',
        source_id: conversationId,
        user_id: userId,
        tenant_id: tenantId,
        query: content,
        dataset_ids: kbIds,
        result_count: allChunks.length,
        ...(topChunkScore != null ? { confidence_score: topChunkScore } : {}),
        response_time_ms: Date.now() - metrics.startTime,
        failed_retrieval: allChunks.length === 0,
      })

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
