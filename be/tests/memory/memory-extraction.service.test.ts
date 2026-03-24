/**
 * @fileoverview Unit tests for MemoryExtractionService.
 *
 * Tests LLM extraction: extractFromConversation dispatches per bitmask,
 * extractBatch processes multiple messages, parseLlmResponse JSON fallback,
 * importChatHistory groups user/assistant pairs, and fire-and-forget patterns.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMemoryModel = vi.hoisted(() => ({
  findById: vi.fn(),
}))

const mockChatMessageModel = vi.hoisted(() => ({
  getKnex: vi.fn(),
}))

const mockLlmClientService = vi.hoisted(() => ({
  chatCompletion: vi.fn(),
  embedTexts: vi.fn(),
}))

const mockMemoryMessageService = vi.hoisted(() => ({
  ensureIndex: vi.fn(),
  insertMessage: vi.fn(),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    memory: mockMemoryModel,
    chatMessage: mockChatMessageModel,
  },
}))

vi.mock('../../src/shared/services/llm-client.service.js', () => ({
  llmClientService: mockLlmClientService,
  LlmMessage: {},
}))

vi.mock('../../src/modules/memory/services/memory-message.service.js', () => ({
  memoryMessageService: mockMemoryMessageService,
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/shared/utils/uuid.js', () => {
  const { z } = require('zod')
  const re = /^[0-9a-f]{32}$/
  return {
    getUuid: vi.fn(() => 'aabbccdd11223344aabbccdd11223344'),
    hexId: z.string().regex(re, 'Invalid ID format (expected 32-char hex)'),
    hexIdWith: (msg: string) => z.string().regex(re, msg),
  }
})

import { memoryExtractionService } from '../../src/modules/memory/services/memory-extraction.service.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock memory pool record for extraction tests
 */
function buildMemory(overrides: Partial<any> = {}): any {
  return {
    id: 'mem-1',
    name: 'Test Memory',
    memory_type: 15, // All types enabled (RAW=1 | SEMANTIC=2 | EPISODIC=4 | PROCEDURAL=8)
    embd_id: null,
    llm_id: null,
    temperature: 0.3,
    system_prompt: null,
    user_prompt: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemoryExtractionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMemoryMessageService.ensureIndex.mockResolvedValue(undefined)
    mockMemoryMessageService.insertMessage.mockResolvedValue(undefined)
    mockLlmClientService.embedTexts.mockResolvedValue([[0.1, 0.2, 0.3]])
  })

  // -----------------------------------------------------------------------
  // extractFromConversation
  // -----------------------------------------------------------------------

  describe('extractFromConversation', () => {
    it('returns early when memory pool not found', async () => {
      mockMemoryModel.findById.mockResolvedValue(null)

      await memoryExtractionService.extractFromConversation(
        'missing', 'Hello', 'World', 'session-1', 'user-1', 'tenant-1',
      )

      expect(mockMemoryMessageService.ensureIndex).not.toHaveBeenCalled()
      expect(mockMemoryMessageService.insertMessage).not.toHaveBeenCalled()
    })

    it('processes all enabled memory types from bitmask', async () => {
      // All 4 types enabled (bitmask 15)
      mockMemoryModel.findById.mockResolvedValue(buildMemory({ memory_type: 15 }))
      // RAW type (no custom prompts) returns raw conversation
      // SEMANTIC, EPISODIC, PROCEDURAL call LLM
      mockLlmClientService.chatCompletion.mockResolvedValue('["extracted fact"]')

      await memoryExtractionService.extractFromConversation(
        'mem-1', 'User input', 'Assistant response', 'session-1', 'user-1', 'tenant-1',
      )

      // RAW (1) stores raw + SEMANTIC (2) + EPISODIC (4) + PROCEDURAL (8) = 4 types
      // RAW stores conversation directly (1 insert) + 3 LLM extractions (1 insert each)
      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalledTimes(4)
    })

    it('skips disabled memory types from bitmask', async () => {
      // Only RAW (1) enabled
      mockMemoryModel.findById.mockResolvedValue(buildMemory({ memory_type: 1 }))

      await memoryExtractionService.extractFromConversation(
        'mem-1', 'User input', 'Assistant response', 'session-1', 'user-1', 'tenant-1',
      )

      // Only 1 insert for RAW type
      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalledTimes(1)
      // No LLM call for raw type without custom prompts
      expect(mockLlmClientService.chatCompletion).not.toHaveBeenCalled()
    })

    it('stores raw conversation directly without LLM call when no custom prompts', async () => {
      mockMemoryModel.findById.mockResolvedValue(buildMemory({ memory_type: 1 }))

      await memoryExtractionService.extractFromConversation(
        'mem-1', 'Hello', 'World', 'session-1', 'user-1', 'tenant-1',
      )

      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          content: 'User: Hello\nAssistant: World',
          message_type: 1,
          status: 1,
        }),
      )
    })

    it('uses LLM for RAW type when custom prompts are configured', async () => {
      mockMemoryModel.findById.mockResolvedValue(
        buildMemory({ memory_type: 1, system_prompt: 'Custom system', user_prompt: 'Extract: {{conversation}}' }),
      )
      mockLlmClientService.chatCompletion.mockResolvedValue('["raw extracted"]')

      await memoryExtractionService.extractFromConversation(
        'mem-1', 'Hello', 'World', 'session-1', 'user-1', 'tenant-1',
      )

      expect(mockLlmClientService.chatCompletion).toHaveBeenCalled()
    })

    it('skips empty extracted items', async () => {
      mockMemoryModel.findById.mockResolvedValue(buildMemory({ memory_type: 2 }))
      // LLM returns array with empty strings
      mockLlmClientService.chatCompletion.mockResolvedValue('["valid", "", "  "]')

      await memoryExtractionService.extractFromConversation(
        'mem-1', 'Hello', 'World', 'session-1', 'user-1', 'tenant-1',
      )

      // Only "valid" should be inserted (empty and whitespace-only are skipped)
      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalledTimes(1)
    })

    it('generates embeddings for each extracted item', async () => {
      mockMemoryModel.findById.mockResolvedValue(buildMemory({ memory_type: 2, embd_id: 'embd-model' }))
      mockLlmClientService.chatCompletion.mockResolvedValue('["fact one"]')

      await memoryExtractionService.extractFromConversation(
        'mem-1', 'Hello', 'World', 'session-1', 'user-1', 'tenant-1',
      )

      expect(mockLlmClientService.embedTexts).toHaveBeenCalledWith(['fact one'], 'embd-model')
      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          content_embed: [0.1, 0.2, 0.3],
        }),
      )
    })

    it('continues with other types when one type extraction fails', async () => {
      // Enable SEMANTIC (2) and EPISODIC (4)
      mockMemoryModel.findById.mockResolvedValue(buildMemory({ memory_type: 6 }))
      mockLlmClientService.chatCompletion
        .mockRejectedValueOnce(new Error('LLM timeout'))  // SEMANTIC fails
        .mockResolvedValueOnce('["episodic item"]')        // EPISODIC succeeds

      await memoryExtractionService.extractFromConversation(
        'mem-1', 'Hello', 'World', 'session-1', 'user-1', 'tenant-1',
      )

      // Only EPISODIC insert should succeed
      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalledTimes(1)
    })

    it('ensures OpenSearch index before inserting messages', async () => {
      mockMemoryModel.findById.mockResolvedValue(buildMemory({ memory_type: 1 }))

      await memoryExtractionService.extractFromConversation(
        'mem-1', 'Hello', 'World', 'session-1', 'user-1', 'tenant-1',
      )

      expect(mockMemoryMessageService.ensureIndex).toHaveBeenCalledWith('tenant-1')
    })
  })

  // -----------------------------------------------------------------------
  // extractByType -- LLM response parsing (via extractFromConversation)
  // -----------------------------------------------------------------------

  describe('parseLlmResponse (via extractFromConversation)', () => {
    beforeEach(() => {
      // Use SEMANTIC type (2) which always calls LLM
      mockMemoryModel.findById.mockResolvedValue(buildMemory({ memory_type: 2 }))
    })

    it('parses direct JSON string array', async () => {
      mockLlmClientService.chatCompletion.mockResolvedValue('["fact one", "fact two"]')

      await memoryExtractionService.extractFromConversation(
        'mem-1', 'Hello', 'World', 'session-1', 'user-1', 'tenant-1',
      )

      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalledTimes(2)
    })

    it('parses JSON object array with content field', async () => {
      mockLlmClientService.chatCompletion.mockResolvedValue(
        '[{"content": "fact one", "confidence": 0.9}, {"content": "fact two", "confidence": 0.8}]',
      )

      await memoryExtractionService.extractFromConversation(
        'mem-1', 'Hello', 'World', 'session-1', 'user-1', 'tenant-1',
      )

      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalledTimes(2)
      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ content: 'fact one' }),
      )
    })

    it('extracts JSON array from within response text (regex fallback)', async () => {
      mockLlmClientService.chatCompletion.mockResolvedValue(
        'Here are the facts:\n["extracted item"]\nDone.',
      )

      await memoryExtractionService.extractFromConversation(
        'mem-1', 'Hello', 'World', 'session-1', 'user-1', 'tenant-1',
      )

      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalledTimes(1)
    })

    it('falls back to raw response when JSON parsing fails completely', async () => {
      mockLlmClientService.chatCompletion.mockResolvedValue('This is just plain text response.')

      await memoryExtractionService.extractFromConversation(
        'mem-1', 'Hello', 'World', 'session-1', 'user-1', 'tenant-1',
      )

      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ content: 'This is just plain text response.' }),
      )
    })

    it('filters out empty strings from parsed array', async () => {
      mockLlmClientService.chatCompletion.mockResolvedValue('["valid", "", null]')

      await memoryExtractionService.extractFromConversation(
        'mem-1', 'Hello', 'World', 'session-1', 'user-1', 'tenant-1',
      )

      // "valid" + "null" (stringified) = 2, empty string filtered
      // Actually: filter(Boolean) removes "", and "null" is stringified from null
      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalledTimes(2)
    })
  })

  // -----------------------------------------------------------------------
  // extractBatch
  // -----------------------------------------------------------------------

  describe('extractBatch', () => {
    it('concatenates conversation history and processes as single extraction', async () => {
      mockMemoryModel.findById.mockResolvedValue(buildMemory({ memory_type: 1 }))

      const history = [
        { role: 'user', content: 'What is AI?' },
        { role: 'assistant', content: 'AI is artificial intelligence.' },
        { role: 'user', content: 'Tell me more.' },
        { role: 'assistant', content: 'It involves machine learning.' },
      ]

      await memoryExtractionService.extractBatch('mem-1', history, 'session-1', 'user-1', 'tenant-1')

      // Should insert the combined text as a single raw memory
      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          content: expect.stringContaining('User: What is AI?'),
        }),
      )
    })

    it('handles empty conversation history', async () => {
      mockMemoryModel.findById.mockResolvedValue(buildMemory({ memory_type: 1 }))

      await memoryExtractionService.extractBatch('mem-1', [], 'session-1', 'user-1', 'tenant-1')

      // Empty concatenation still goes through pipeline but content may be empty
      // RAW type stores conversation directly; empty string is trimmed and skipped
      // The conversation text is "User: \nAssistant: " which is not empty
      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // importChatHistory
  // -----------------------------------------------------------------------

  describe('importChatHistory', () => {
    it('groups user+assistant pairs and processes each', async () => {
      mockMemoryModel.findById.mockResolvedValue(buildMemory({ memory_type: 1 }))

      const chatBuilder: any = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          { role: 'user', content: 'Question 1' },
          { role: 'assistant', content: 'Answer 1' },
          { role: 'user', content: 'Question 2' },
          { role: 'assistant', content: 'Answer 2' },
        ]),
      }
      mockChatMessageModel.getKnex.mockReturnValue(chatBuilder)

      const result = await memoryExtractionService.importChatHistory(
        'mem-1', 'session-1', 'user-1', 'tenant-1',
      )

      expect(result.imported).toBe(2)
      // 2 conversation pairs, each producing at least 1 insert for RAW type
      expect(mockMemoryMessageService.insertMessage).toHaveBeenCalled()
    })

    it('handles user message without following assistant response', async () => {
      mockMemoryModel.findById.mockResolvedValue(buildMemory({ memory_type: 1 }))

      const chatBuilder: any = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          { role: 'user', content: 'Unanswered question' },
        ]),
      }
      mockChatMessageModel.getKnex.mockReturnValue(chatBuilder)

      const result = await memoryExtractionService.importChatHistory(
        'mem-1', 'session-1', 'user-1', 'tenant-1',
      )

      // Still processes the user message with empty assistant response
      expect(result.imported).toBe(1)
    })

    it('skips non-user messages at the start', async () => {
      mockMemoryModel.findById.mockResolvedValue(buildMemory({ memory_type: 1 }))

      const chatBuilder: any = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          { role: 'system', content: 'System message' },
          { role: 'assistant', content: 'Greeting' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
        ]),
      }
      mockChatMessageModel.getKnex.mockReturnValue(chatBuilder)

      const result = await memoryExtractionService.importChatHistory(
        'mem-1', 'session-1', 'user-1', 'tenant-1',
      )

      // Only 1 user message qualifies
      expect(result.imported).toBe(1)
    })

    it('skips user messages with empty content', async () => {
      mockMemoryModel.findById.mockResolvedValue(buildMemory({ memory_type: 1 }))

      const chatBuilder: any = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          { role: 'user', content: '' },
          { role: 'assistant', content: 'Response' },
          { role: 'user', content: 'Valid question' },
          { role: 'assistant', content: 'Valid answer' },
        ]),
      }
      mockChatMessageModel.getKnex.mockReturnValue(chatBuilder)

      const result = await memoryExtractionService.importChatHistory(
        'mem-1', 'session-1', 'user-1', 'tenant-1',
      )

      // First pair skipped (empty content), second pair processed
      expect(result.imported).toBe(1)
    })

    it('returns zero imported when no messages exist', async () => {
      mockMemoryModel.findById.mockResolvedValue(buildMemory({ memory_type: 1 }))

      const chatBuilder: any = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }
      mockChatMessageModel.getKnex.mockReturnValue(chatBuilder)

      const result = await memoryExtractionService.importChatHistory(
        'mem-1', 'session-1', 'user-1', 'tenant-1',
      )

      expect(result.imported).toBe(0)
    })

    it('queries messages ordered by timestamp ascending', async () => {
      mockMemoryModel.findById.mockResolvedValue(buildMemory({ memory_type: 1 }))

      const chatBuilder: any = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }
      mockChatMessageModel.getKnex.mockReturnValue(chatBuilder)

      await memoryExtractionService.importChatHistory(
        'mem-1', 'session-1', 'user-1', 'tenant-1',
      )

      expect(chatBuilder.where).toHaveBeenCalledWith('session_id', 'session-1')
      expect(chatBuilder.orderBy).toHaveBeenCalledWith('timestamp', 'asc')
    })
  })
})
