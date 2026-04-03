/**
 * @fileoverview Memory extraction service -- LLM-powered pipeline that converts
 * conversations into structured Semantic, Episodic, Procedural, and Raw memories.
 *
 * Handles both realtime (per-turn) and batch (session-end) extraction modes.
 * Supports custom prompts per memory pool, JSON parsing with fallback (Pitfall 3),
 * and chat history import (D-11).
 *
 * @module modules/memory/services/memory-extraction
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { llmClientService, LlmMessage } from '@/shared/services/llm-client.service.js'
import { log } from '@/shared/services/logger.service.js'
import { memoryMessageService } from './memory-message.service.js'
import type { Memory } from '../models/memory.model.js'
import {
  RAW_EXTRACTION_PROMPT,
  SEMANTIC_EXTRACTION_PROMPT,
  EPISODIC_EXTRACTION_PROMPT,
  PROCEDURAL_EXTRACTION_PROMPT,
} from '../prompts/extraction.prompts.js'
import type { PromptTemplate } from '../prompts/extraction.prompts.js'
import { getUuid } from '@/shared/utils/uuid.js'

// ============================================================================
// Constants
// ============================================================================

/** @description Bitmask values for memory types matching the memories table schema */
const MEMORY_TYPE = {
  RAW: 1,
  SEMANTIC: 2,
  EPISODIC: 4,
  PROCEDURAL: 8,
} as const

/** @description Map from bitmask value to default prompt template */
const TYPE_PROMPT_MAP: Record<number, PromptTemplate> = {
  [MEMORY_TYPE.RAW]: RAW_EXTRACTION_PROMPT,
  [MEMORY_TYPE.SEMANTIC]: SEMANTIC_EXTRACTION_PROMPT,
  [MEMORY_TYPE.EPISODIC]: EPISODIC_EXTRACTION_PROMPT,
  [MEMORY_TYPE.PROCEDURAL]: PROCEDURAL_EXTRACTION_PROMPT,
}

// ============================================================================
// Service
// ============================================================================

/**
 * @description Singleton service that extracts structured memories from conversations
 *   using LLM-powered analysis. Supports four memory types via bitmask configuration,
 *   custom prompts, and both realtime and batch extraction modes.
 */
class MemoryExtractionService {
  /**
   * @description Extract memories from a single conversation turn.
   *   Loads the memory pool config, determines enabled types via bitmask,
   *   runs LLM extraction for each type, generates embeddings, and stores results.
   * @param {string} memoryId - UUID of the memory pool to extract into
   * @param {string} userInput - The user's message text
   * @param {string} assistantResponse - The assistant's response text
   * @param {string} sessionId - Chat session ID for source tracking
   * @param {string} userId - User ID who initiated the conversation
   * @param {string} tenantId - Tenant ID for multi-tenant isolation
   * @returns {Promise<void>}
   */
  async extractFromConversation(
    memoryId: string,
    userInput: string,
    assistantResponse: string,
    sessionId: string,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    // Load memory pool configuration from the database
    const memory = await ModelFactory.memory.findById(memoryId)
    if (!memory) {
      log.warn('Memory pool not found for extraction', { memoryId })
      return
    }

    // Combine user and assistant text into a single conversation block
    const conversation = `User: ${userInput}\nAssistant: ${assistantResponse}`

    // Ensure the OpenSearch index exists before inserting messages
    await memoryMessageService.ensureIndex(tenantId)

    // Check each memory type bit and extract accordingly
    const typeBits = [MEMORY_TYPE.RAW, MEMORY_TYPE.SEMANTIC, MEMORY_TYPE.EPISODIC, MEMORY_TYPE.PROCEDURAL]

    for (const typeBit of typeBits) {
      // Skip types not enabled in the memory pool bitmask
      if (!(memory.memory_type & typeBit)) continue

      try {
        // Extract memory items using LLM (or raw storage for RAW type)
        const items = await this.extractByType(conversation, typeBit, memory)

        for (const content of items) {
          // Skip empty extractions
          if (!content.trim()) continue

          // Generate embedding vector for semantic search capability
          const embedding = await this.getEmbedding(content, memory.embd_id, tenantId)

          // Store the extracted memory message in OpenSearch
          await memoryMessageService.insertMessage(tenantId, {
            message_id: getUuid(),
            memory_id: memoryId,
            content,
            content_embed: embedding,
            message_type: typeBit,
            status: 1,
            tenant_id: tenantId,
            source_id: sessionId,
          })
        }

        log.info('Memory extraction completed for type', {
          memoryId,
          type: typeBit,
          itemCount: items.length,
        })
      } catch (err) {
        // Log extraction failure per type but continue with other types
        log.error('Memory extraction failed for type', {
          memoryId,
          type: typeBit,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  /**
   * @description Extract memory items for a specific memory type using LLM.
   *   Selects the appropriate prompt template (default or custom), calls the LLM,
   *   and parses the JSON array response with fallback handling (Pitfall 3).
   * @param {string} conversation - Combined user+assistant conversation text
   * @param {number} type - Memory type bitmask value (RAW=1, SEMANTIC=2, EPISODIC=4, PROCEDURAL=8)
   * @param {Memory} memory - Memory pool configuration with prompts and model settings
   * @returns {Promise<string[]>} Array of extracted memory content strings
   */
  private async extractByType(
    conversation: string,
    type: number,
    memory: Memory,
  ): Promise<string[]> {
    // For RAW type without custom prompts, store conversation text directly (no LLM call)
    if (type === MEMORY_TYPE.RAW && !memory.system_prompt && !memory.user_prompt) {
      return [conversation]
    }

    // Select default prompt template for the memory type
    const defaultPrompt = TYPE_PROMPT_MAP[type]
    if (!defaultPrompt) {
      log.warn('No prompt template for memory type', { type })
      return []
    }

    // Use custom prompts if configured (D-03), otherwise use defaults
    const systemPrompt = memory.system_prompt || defaultPrompt.system
    const userPromptTemplate = memory.user_prompt || defaultPrompt.user

    // Replace {{conversation}} placeholder with actual conversation text
    const userPrompt = userPromptTemplate.replace('{{conversation}}', conversation)

    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]

    // Call LLM with the memory pool's configured model (or tenant default)
    const response = await llmClientService.chatCompletion(messages, {
      providerId: memory.llm_id || undefined,
      temperature: memory.temperature ?? 0.3,
      max_tokens: 2048,
    })

    // Parse LLM response as JSON array of memory items (Pitfall 3: robust parsing)
    return this.parseLlmResponse(response)
  }

  /**
   * @description Parse LLM response into an array of memory content strings.
   *   Handles multiple response formats with fallback (Pitfall 3):
   *   1. Direct JSON array parse
   *   2. Regex extraction of JSON array from response text
   *   3. Fallback to treating entire response as a single memory item
   * @param {string} response - Raw LLM response text
   * @returns {string[]} Array of extracted content strings
   */
  private parseLlmResponse(response: string): string[] {
    // Attempt 1: Direct JSON.parse of the full response
    try {
      const parsed = JSON.parse(response)
      if (Array.isArray(parsed)) {
        // Handle both string arrays and object arrays with "content" field
        return parsed.map((item: unknown) => {
          if (typeof item === 'string') return item
          if (typeof item === 'object' && item !== null && 'content' in item) {
            return String((item as { content: unknown }).content)
          }
          return String(item)
        }).filter(Boolean)
      }
    } catch {
      // JSON.parse failed -- try regex extraction
    }

    // Attempt 2: Extract JSON array from within the response text using regex
    const arrayMatch = response.match(/\[[\s\S]*?\]/)
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0])
        if (Array.isArray(parsed)) {
          return parsed.map((item: unknown) => {
            if (typeof item === 'string') return item
            if (typeof item === 'object' && item !== null && 'content' in item) {
              return String((item as { content: unknown }).content)
            }
            return String(item)
          }).filter(Boolean)
        }
      } catch {
        // Regex-extracted JSON also failed
      }
    }

    // Attempt 3: Treat the entire response as a single memory item
    log.warn('LLM response could not be parsed as JSON array, using raw response')
    return [response.trim()].filter(Boolean)
  }

  /**
   * @description Generate an embedding vector for a text string.
   *   Uses the memory pool's configured embedding model or falls back to tenant default.
   * @param {string} text - Text content to embed
   * @param {string | null} embdId - Optional embedding model provider ID
   * @param {string} tenantId - Tenant ID (unused but kept for future per-tenant model resolution)
   * @returns {Promise<number[]>} Embedding vector
   */
  private async getEmbedding(
    text: string,
    embdId: string | null,
    _tenantId: string,
  ): Promise<number[]> {
    // Call embedding service with pool-specific or default model
    const vectors = await llmClientService.embedTexts(
      [text],
      embdId || undefined,
    )
    return vectors[0] ?? []
  }

  /**
   * @description Extract memories from a full conversation session in batch mode (D-02).
   *   Concatenates all conversation history into a single text block and processes
   *   it through the extraction pipeline as one unit.
   * @param {string} memoryId - UUID of the memory pool
   * @param {Array<{ role: string; content: string }>} conversationHistory - Full conversation messages
   * @param {string} sessionId - Chat session ID for source tracking
   * @param {string} userId - User ID who initiated the conversation
   * @param {string} tenantId - Tenant ID for multi-tenant isolation
   * @returns {Promise<void>}
   */
  async extractBatch(
    memoryId: string,
    conversationHistory: Array<{ role: string; content: string }>,
    sessionId: string,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    // Concatenate all messages into a single conversation text for batch extraction
    const combinedText = conversationHistory
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n')

    // Process the combined text through the standard extraction pipeline
    await this.extractFromConversation(
      memoryId,
      combinedText,
      '',
      sessionId,
      userId,
      tenantId,
    )
  }

  /**
   * @description Import existing chat history into a memory pool (D-11).
   *   Loads all messages from a chat session, groups them into user+assistant pairs,
   *   and processes each pair through the extraction pipeline.
   * @param {string} memoryId - UUID of the memory pool to import into
   * @param {string} sessionId - Chat session ID to import messages from
   * @param {string} userId - User ID performing the import
   * @param {string} tenantId - Tenant ID for multi-tenant isolation
   * @returns {Promise<{ imported: number }>} Count of imported memory items
   */
  async importChatHistory(
    memoryId: string,
    sessionId: string,
    userId: string,
    tenantId: string,
  ): Promise<{ imported: number }> {
    // Load all messages from the chat session ordered chronologically
    const messages = await ModelFactory.chatMessage.findBySessionIdOrdered(sessionId)

    // Collect user+assistant conversation pairs first
    const pairs: Array<{ userContent: string; assistantResponse: string }> = []
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]!

      // Only process user messages that have a following assistant response
      if (msg.role !== 'user') continue

      const nextMsg = messages[i + 1]
      const assistantResponse = nextMsg?.role === 'assistant' ? nextMsg.content : ''

      // Skip pairs where user message is empty
      if (!msg.content) continue

      pairs.push({ userContent: msg.content, assistantResponse })
    }

    // Process in batches of 5 to parallelize LLM + embedding calls
    const BATCH_SIZE = 5
    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
      const batch = pairs.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(pair =>
          this.extractFromConversation(
            memoryId,
            pair.userContent,
            pair.assistantResponse,
            sessionId,
            userId,
            tenantId,
          )
        )
      )
    }

    log.info('Chat history import completed', { memoryId, sessionId, imported: pairs.length })
    return { imported: pairs.length }
  }
}

/** @description Singleton memory extraction service instance */
export const memoryExtractionService = new MemoryExtractionService()
