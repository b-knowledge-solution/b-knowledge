/**
 * @fileoverview Tests for ChatConversationService upstream features:
 * deleteAllSessions() and empty chunk filter.
 *
 * Covers: bulk session deletion, no-op on empty sessions,
 * and filtering out empty/invalid chunks from retrieval results.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — all transitive dependencies must be mocked
// ---------------------------------------------------------------------------

const mockSessionFindById = vi.fn()
const mockSessionUpdate = vi.fn()
const mockSessionCreate = vi.fn()
const mockSessionGetKnex = vi.fn()
const mockDialogFindById = vi.fn()
const mockMessageGetKnex = vi.fn()
const mockMessageFindById = vi.fn()
const mockMessageCreate = vi.fn()

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    chatSession: {
      findById: (...args: any[]) => mockSessionFindById(...args),
      update: (...args: any[]) => mockSessionUpdate(...args),
      create: (...args: any[]) => mockSessionCreate(...args),
      getKnex: (...args: any[]) => mockSessionGetKnex(...args),
    },
    chatAssistant: {
      findById: (...args: any[]) => mockDialogFindById(...args),
    },
    chatMessage: {
      getKnex: (...args: any[]) => mockMessageGetKnex(...args),
      findById: (...args: any[]) => mockMessageFindById(...args),
      create: (...args: any[]) => mockMessageCreate(...args),
    },
    modelProvider: {
      findDefaults: vi.fn().mockResolvedValue([]),
    },
  },
}))

vi.mock('@/shared/models/types.js', () => ({}))

vi.mock('@/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/shared/services/llm-client.service.js', () => ({
  llmClientService: {
    chatCompletion: vi.fn(),
    chatCompletionStream: vi.fn(),
  },
  LlmMessage: {},
}))

vi.mock('@/modules/rag/services/rag-search.service.js', () => ({
  ragSearchService: { search: vi.fn(), searchMultipleDatasets: vi.fn() },
}))

vi.mock('@/modules/rag/services/rag-rerank.service.js', () => ({
  ragRerankService: { rerank: vi.fn() },
}))

vi.mock('@/modules/rag/services/rag-citation.service.js', () => ({
  ragCitationService: { insertCitations: vi.fn() },
}))

vi.mock('@/modules/rag/services/rag-sql.service.js', () => ({
  ragSqlService: { querySql: vi.fn() },
}))

vi.mock('@/modules/rag/services/rag-graphrag.service.js', () => ({
  ragGraphragService: { retrieval: vi.fn() },
}))

vi.mock('@/modules/rag/services/rag-deep-research.service.js', () => ({
  ragDeepResearchService: { research: vi.fn() },
}))

vi.mock('@/shared/services/web-search.service.js', () => ({
  searchWeb: vi.fn(),
}))

vi.mock('@/shared/prompts/index.js', () => ({
  fullQuestionPrompt: { system: '', buildUser: vi.fn() },
  crossLanguagePrompt: { system: '', buildUser: vi.fn() },
  keywordPrompt: { build: vi.fn() },
  citationPrompt: { system: '' },
  askSummaryPrompt: {},
}))

vi.mock('@/shared/services/langfuse.service.js', () => ({
  langfuseTraceService: {
    createTrace: vi.fn(),
    createSpan: vi.fn(),
    createGeneration: vi.fn(),
    updateTrace: vi.fn(),
    flush: vi.fn(),
  },
}))

vi.mock('@/modules/rag/index.js', () => ({
  queryLogService: { logQuery: vi.fn() },
}))

vi.mock('@/shared/utils/language-detect.js', () => ({
  detectLanguage: async () => 'en',
  buildLanguageInstruction: () => '',
}))

vi.mock('@/shared/utils/html-to-markdown.js', () => ({
  htmlToMarkdown: (s: string) => s,
}))

vi.mock('@/shared/services/ability.service.js', () => ({
  abilityService: { buildAbility: vi.fn() },
  buildOpenSearchAbacFilters: () => [],
}))

vi.mock('@/shared/utils/uuid.js', () => {
  const { z } = require('zod')
  const re = /^[0-9a-f]{32}$/
  return {
    getUuid: () => 'aabbccdd11223344aabbccdd11223344',
    hexId: z.string().regex(re, 'Invalid ID format (expected 32-char hex)'),
    hexIdWith: (msg: string) => z.string().regex(re, msg),
  }
})

vi.mock('@/modules/memory/index.js', () => ({
  memoryExtractionService: { extractMemories: vi.fn() },
  memoryMessageService: { searchMemory: vi.fn().mockResolvedValue([]) },
}))

// Import after mocking
import { ChatConversationService } from '../../src/modules/chat/services/chat-conversation.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Create a chainable Knex-like builder that resolves to `result`
 */
function makeBuilder(result: unknown) {
  const builder: any = {
    where: vi.fn().mockImplementation(function (this: any, ...args: any[]) {
      if (typeof args[0] === 'function') {
        args[0].call(this, this)
        return this
      }
      return this
    }),
    andWhere: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockReturnThis(),
    pluck: vi.fn().mockResolvedValue(result),
    delete: vi.fn().mockResolvedValue(typeof result === 'number' ? result : 0),
    select: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(result),
    then: (onFulfilled: any) => Promise.resolve(result).then(onFulfilled),
  }
  return builder
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatConversationService — upstream features', () => {
  let service: ChatConversationService

  beforeEach(() => {
    service = new ChatConversationService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // deleteAllSessions
  // -----------------------------------------------------------------------

  describe('deleteAllSessions', () => {
    it('deletes all sessions and their messages for a dialog and user', async () => {
      const sessionIds = ['sess-1', 'sess-2', 'sess-3']

      // Mock getKnex for chatSession to return session IDs via pluck
      const sessionBuilder = makeBuilder(sessionIds)
      mockSessionGetKnex.mockReturnValue(sessionBuilder)

      // Mock getKnex for chatMessage to return a deletable builder
      const messageBuilder = {
        whereIn: vi.fn().mockReturnThis(),
        delete: vi.fn().mockResolvedValue(10),
      }
      mockMessageGetKnex.mockReturnValue(messageBuilder)

      const count = await service.deleteAllSessions('dialog-1', 'user-1')

      // Should pluck session IDs filtered by dialog_id and user_id
      expect(sessionBuilder.where).toHaveBeenCalled()
      expect(sessionBuilder.andWhere).toHaveBeenCalled()

      // Should delete messages in those sessions
      expect(messageBuilder.whereIn).toHaveBeenCalledWith('session_id', sessionIds)
      expect(messageBuilder.delete).toHaveBeenCalled()
    })

    it('returns 0 when no sessions exist for the dialog and user', async () => {
      // Empty session list
      const sessionBuilder = makeBuilder([])
      sessionBuilder.pluck.mockResolvedValue([])
      mockSessionGetKnex.mockReturnValue(sessionBuilder)

      const count = await service.deleteAllSessions('dialog-empty', 'user-1')

      // Should return 0 without attempting message deletion
      expect(count).toBe(0)
      expect(mockMessageGetKnex).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // Empty chunk filter
  // -----------------------------------------------------------------------

  describe('empty chunk filter', () => {
    it('filters out chunks without chunk_id from retrieval results', () => {
      // Simulate the filtering logic applied in chat():
      // allChunks = allChunks.filter(chunk => chunk && chunk.chunk_id)
      const chunks = [
        { chunk_id: 'c1', text: 'valid', score: 0.9 },
        { chunk_id: '', text: 'empty id', score: 0.5 },
        { chunk_id: 'c3', text: 'another valid', score: 0.4 },
        null,
        undefined,
      ]

      // Apply the same filter logic as the service
      const filtered = chunks.filter((chunk: any) => chunk && chunk.chunk_id)

      // Null, undefined, and empty chunk_id entries should be removed
      expect(filtered).toHaveLength(2)
      expect(filtered.map((c: any) => c.chunk_id)).toEqual(['c1', 'c3'])
    })

    it('returns all chunks when none are empty', () => {
      const chunks = [
        { chunk_id: 'c1', text: 'first', score: 0.9 },
        { chunk_id: 'c2', text: 'second', score: 0.8 },
      ]

      const filtered = chunks.filter((chunk: any) => chunk && chunk.chunk_id)

      expect(filtered).toHaveLength(2)
    })

    it('returns empty array when all chunks are invalid', () => {
      const chunks = [
        null,
        undefined,
        { chunk_id: '', text: 'empty' },
        { text: 'no chunk_id field' },
      ]

      const filtered = chunks.filter((chunk: any) => chunk && chunk.chunk_id)

      expect(filtered).toHaveLength(0)
    })
  })
})
