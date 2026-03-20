/**
 * @fileoverview Tests for ChatConversationService conversation operations.
 *
 * Covers createConversation, getConversation, listConversations,
 * renameConversation, deleteConversations, and edge cases around
 * ownership checks and bulk deletion.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockChatAssistantFindById = vi.fn()
const mockChatSessionCreate = vi.fn()
const mockChatSessionFindById = vi.fn()
const mockChatSessionUpdate = vi.fn()
const mockChatSessionGetKnex = vi.fn()
const mockChatMessageCreate = vi.fn()
const mockChatMessageGetKnex = vi.fn()

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    chatAssistant: {
      findById: (...args: any[]) => mockChatAssistantFindById(...args),
      getKnex: vi.fn(),
    },
    chatSession: {
      create: (...args: any[]) => mockChatSessionCreate(...args),
      findById: (...args: any[]) => mockChatSessionFindById(...args),
      update: (...args: any[]) => mockChatSessionUpdate(...args),
      getKnex: (...args: any[]) => mockChatSessionGetKnex(...args),
    },
    chatMessage: {
      create: (...args: any[]) => mockChatMessageCreate(...args),
      getKnex: (...args: any[]) => mockChatMessageGetKnex(...args),
    },
    chatAssistantAccess: {
      findAccessibleAssistantIds: vi.fn().mockResolvedValue([]),
      findByAssistantId: vi.fn().mockResolvedValue([]),
    },
    user: { getKnex: vi.fn() },
    team: { getKnex: vi.fn() },
  },
}))

vi.mock('@/shared/models/types.js', () => ({}))

vi.mock('@/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/shared/services/llm-client.service.js', () => ({
  llmClientService: { chatCompletion: vi.fn(), chatCompletionStream: vi.fn() },
}))

vi.mock('@/modules/rag/services/rag-search.service.js', () => ({
  ragSearchService: { search: vi.fn() },
}))

vi.mock('@/modules/rag/services/rag-rerank.service.js', () => ({
  ragRerankService: { rerank: vi.fn() },
}))

vi.mock('@/modules/rag/services/rag-citation.service.js', () => ({
  ragCitationService: { insertCitations: vi.fn() },
}))

vi.mock('@/modules/rag/services/rag-sql.service.js', () => ({
  ragSqlService: { query: vi.fn() },
}))

vi.mock('@/modules/rag/services/rag-graphrag.service.js', () => ({
  ragGraphragService: { query: vi.fn() },
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
  keywordPrompt: { system: '', buildUser: vi.fn() },
  citationPrompt: { system: '' },
  askSummaryPrompt: { build: vi.fn() },
}))

vi.mock('@/shared/utils/language-detect.js', () => ({
  detectLanguage: vi.fn().mockReturnValue('en'),
  buildLanguageInstruction: vi.fn().mockReturnValue(''),
}))

vi.mock('@/shared/services/ability.service.js', () => ({
  abilityService: { buildAbility: vi.fn() },
  buildOpenSearchAbacFilters: () => [],
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

// Import after mocking
import { ChatConversationService } from '../../src/modules/chat/services/chat-conversation.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a chainable Knex-like builder that resolves to `result` when awaited.
 */
function makeBuilder(result: unknown) {
  const builder: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockReturnThis(),
    pluck: vi.fn().mockResolvedValue(result),
    delete: vi.fn().mockResolvedValue(result),
    then: (onFulfilled: any) => Promise.resolve(result).then(onFulfilled),
  }
  return builder
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatConversationService – conversation operations', () => {
  let service: ChatConversationService

  beforeEach(() => {
    service = new ChatConversationService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // createConversation
  // -----------------------------------------------------------------------

  describe('createConversation', () => {
    it('creates a session and returns it', async () => {
      const session = { id: 's1', title: 'Hello', dialog_id: 'd1', user_id: 'u1' }
      mockChatAssistantFindById.mockResolvedValue({ id: 'd1', prompt_config: {} })
      mockChatSessionCreate.mockResolvedValue(session)

      const result = await service.createConversation('d1', 'Hello', 'u1')

      expect(result).toEqual(session)
      expect(mockChatSessionCreate).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'u1',
        title: 'Hello',
        dialog_id: 'd1',
      }))
    })

    it('throws when assistant does not exist', async () => {
      mockChatAssistantFindById.mockResolvedValue(undefined)

      await expect(service.createConversation('d-none', 'Hello', 'u1')).rejects.toThrow('Assistant not found')
    })

    it('inserts prologue message when assistant has one', async () => {
      const session = { id: 's1', title: 'Hello' }
      mockChatAssistantFindById.mockResolvedValue({
        id: 'd1',
        prompt_config: { prologue: 'Welcome!' },
      })
      mockChatSessionCreate.mockResolvedValue(session)
      mockChatMessageCreate.mockResolvedValue({})

      await service.createConversation('d1', 'Hello', 'u1')

      expect(mockChatMessageCreate).toHaveBeenCalledWith(expect.objectContaining({
        session_id: 's1',
        role: 'assistant',
        content: 'Welcome!',
      }))
    })
  })

  // -----------------------------------------------------------------------
  // getConversation
  // -----------------------------------------------------------------------

  describe('getConversation', () => {
    it('returns session with messages for the owner', async () => {
      const session = { id: 's1', user_id: 'u1' }
      mockChatSessionFindById.mockResolvedValue(session)
      const messages = [{ id: 'm1', content: 'hi' }]
      const msgBuilder = makeBuilder(messages)
      mockChatMessageGetKnex.mockReturnValue(msgBuilder)

      const result = await service.getConversation('s1', 'u1')

      expect(result).toEqual({ ...session, messages })
    })

    it('returns null for non-existent conversation', async () => {
      mockChatSessionFindById.mockResolvedValue(undefined)

      const result = await service.getConversation('s-none', 'u1')

      expect(result).toBeNull()
    })

    it('returns null when user is not the owner', async () => {
      mockChatSessionFindById.mockResolvedValue({ id: 's1', user_id: 'other-user' })

      const result = await service.getConversation('s1', 'u1')

      expect(result).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // listConversations
  // -----------------------------------------------------------------------

  describe('listConversations', () => {
    it('returns conversations for user and dialog', async () => {
      const sessions = [{ id: 's1' }, { id: 's2' }]
      const builder = makeBuilder(sessions)
      mockChatSessionGetKnex.mockReturnValue(builder)

      const result = await service.listConversations('d1', 'u1')

      expect(result).toEqual(sessions)
      expect(builder.where).toHaveBeenCalledWith({ dialog_id: 'd1', user_id: 'u1' })
      expect(builder.orderBy).toHaveBeenCalledWith('created_at', 'desc')
    })

    it('returns empty array when no conversations exist', async () => {
      const builder = makeBuilder([])
      mockChatSessionGetKnex.mockReturnValue(builder)

      const result = await service.listConversations('d1', 'u1')

      expect(result).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // renameConversation
  // -----------------------------------------------------------------------

  describe('renameConversation', () => {
    it('renames and returns updated session', async () => {
      const session = { id: 's1', user_id: 'u1', title: 'Old' }
      const updated = { id: 's1', user_id: 'u1', title: 'New' }
      mockChatSessionFindById
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce(updated)
      mockChatSessionUpdate.mockResolvedValue(undefined)

      const result = await service.renameConversation('s1', 'New', 'u1')

      expect(result).toEqual(updated)
      expect(mockChatSessionUpdate).toHaveBeenCalledWith('s1', expect.objectContaining({ title: 'New' }))
    })

    it('returns null when session does not exist', async () => {
      mockChatSessionFindById.mockResolvedValue(undefined)

      const result = await service.renameConversation('s-none', 'New', 'u1')

      expect(result).toBeNull()
    })

    it('returns null when user is not the owner', async () => {
      mockChatSessionFindById.mockResolvedValue({ id: 's1', user_id: 'other-user' })

      const result = await service.renameConversation('s1', 'New', 'u1')

      expect(result).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // deleteConversations
  // -----------------------------------------------------------------------

  describe('deleteConversations', () => {
    it('deletes owned conversations and their messages', async () => {
      const sessionBuilder = makeBuilder(['s1', 's2'])
      const messageBuilder = makeBuilder(5)
      const deleteBuilder = makeBuilder(2)

      mockChatSessionGetKnex
        .mockReturnValueOnce(sessionBuilder)   // pluck owned IDs
        .mockReturnValueOnce(deleteBuilder)     // delete sessions
      mockChatMessageGetKnex.mockReturnValue(messageBuilder) // delete messages

      const count = await service.deleteConversations(['s1', 's2'], 'u1')

      expect(count).toBe(2)
    })

    it('returns 0 when no owned conversations match', async () => {
      const sessionBuilder = makeBuilder([])
      mockChatSessionGetKnex.mockReturnValue(sessionBuilder)

      const count = await service.deleteConversations(['s-not-mine'], 'u1')

      expect(count).toBe(0)
    })
  })
})
