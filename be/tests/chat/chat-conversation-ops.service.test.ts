/**
 * @fileoverview Tests for ChatConversationService operations.
 *
 * Covers renameConversation, createConversation, deleteMessage ownership,
 * getConversation access control, and deleteConversations bulk operations.
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
  ragSearchService: { search: vi.fn() },
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
  detectLanguage: () => 'en',
  buildLanguageInstruction: () => '',
}))

vi.mock('@/shared/services/ability.service.js', () => ({
  abilityService: { buildAbility: vi.fn() },
  buildOpenSearchAbacFilters: () => [],
}))

vi.mock('@/shared/utils/uuid.js', () => ({
  getUuid: () => 'aabbccdd11223344aabbccdd11223344',
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
    where: vi.fn().mockImplementation(function (...args: any[]) {
      if (typeof args[0] === 'function') {
        args[0].call(this, this)
        return this
      }
      return this
    }),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    delete: vi.fn().mockResolvedValue(result),
    pluck: vi.fn().mockResolvedValue(result),
    count: vi.fn().mockReturnValue({ first: () => Promise.resolve({ count: '0' }) }),
    then: (onFulfilled: any) => Promise.resolve(result).then(onFulfilled),
  }
  return builder
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatConversationService – operations', () => {
  let service: ChatConversationService

  beforeEach(() => {
    service = new ChatConversationService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // renameConversation
  // -----------------------------------------------------------------------

  describe('renameConversation', () => {
    it('renames a conversation when user owns it', async () => {
      const session = { id: 'conv-1', user_id: 'user-1', title: 'Old Name' }
      const updated = { id: 'conv-1', user_id: 'user-1', title: 'New Name' }

      // First findById verifies ownership, second returns updated session
      mockSessionFindById
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce(updated)
      mockSessionUpdate.mockResolvedValue(undefined)

      const result = await service.renameConversation('conv-1', 'New Name', 'user-1')

      expect(result).toEqual(updated)
      expect(mockSessionUpdate).toHaveBeenCalledWith('conv-1', {
        title: 'New Name',
        updated_by: 'user-1',
      })
    })

    it('returns null when conversation not found', async () => {
      mockSessionFindById.mockResolvedValue(undefined)

      const result = await service.renameConversation('conv-nope', 'Name', 'user-1')

      expect(result).toBeNull()
      expect(mockSessionUpdate).not.toHaveBeenCalled()
    })

    it('returns null when user does not own the conversation', async () => {
      const session = { id: 'conv-1', user_id: 'other-user', title: 'Name' }
      mockSessionFindById.mockResolvedValue(session)

      const result = await service.renameConversation('conv-1', 'New Name', 'user-1')

      expect(result).toBeNull()
      expect(mockSessionUpdate).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // createConversation
  // -----------------------------------------------------------------------

  describe('createConversation', () => {
    it('creates a conversation for a valid dialog', async () => {
      const dialog = { id: 'd1', name: 'Bot', prompt_config: {} }
      const session = { id: 'conv-new', dialog_id: 'd1', user_id: 'user-1', title: 'Chat' }

      mockDialogFindById.mockResolvedValue(dialog)
      mockSessionCreate.mockResolvedValue(session)

      const result = await service.createConversation('d1', 'Chat', 'user-1')

      expect(result).toEqual(session)
      expect(mockSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          title: 'Chat',
          dialog_id: 'd1',
          created_by: 'user-1',
        })
      )
    })

    it('throws error when dialog does not exist', async () => {
      mockDialogFindById.mockResolvedValue(undefined)

      await expect(
        service.createConversation('d-nope', 'Chat', 'user-1')
      ).rejects.toThrow('Assistant not found')
    })
  })

  // -----------------------------------------------------------------------
  // deleteMessage
  // -----------------------------------------------------------------------

  describe('deleteMessage', () => {
    it('deletes a message when user owns the conversation', async () => {
      const session = { id: 'conv-1', user_id: 'user-1' }
      mockSessionFindById.mockResolvedValue(session)

      const builder = makeBuilder(1)
      mockMessageGetKnex.mockReturnValue(builder)

      const result = await service.deleteMessage('conv-1', 'msg-1', 'user-1')

      expect(result).toBe(true)
      expect(builder.where).toHaveBeenCalledWith({ id: 'msg-1', session_id: 'conv-1' })
      expect(builder.delete).toHaveBeenCalled()
    })

    it('returns false when conversation not found', async () => {
      mockSessionFindById.mockResolvedValue(undefined)

      const result = await service.deleteMessage('conv-nope', 'msg-1', 'user-1')

      expect(result).toBe(false)
    })

    it('returns false when user does not own the conversation', async () => {
      const session = { id: 'conv-1', user_id: 'other-user' }
      mockSessionFindById.mockResolvedValue(session)

      const result = await service.deleteMessage('conv-1', 'msg-1', 'user-1')

      expect(result).toBe(false)
    })

    it('returns false when message does not exist in conversation', async () => {
      const session = { id: 'conv-1', user_id: 'user-1' }
      mockSessionFindById.mockResolvedValue(session)

      const builder = makeBuilder(0)
      mockMessageGetKnex.mockReturnValue(builder)

      const result = await service.deleteMessage('conv-1', 'msg-nope', 'user-1')

      expect(result).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // getConversation
  // -----------------------------------------------------------------------

  describe('getConversation', () => {
    it('returns conversation with messages for the owner', async () => {
      const session = { id: 'conv-1', user_id: 'user-1', title: 'Test' }
      const messages = [
        { id: 'msg-1', role: 'user', content: 'Hello' },
        { id: 'msg-2', role: 'assistant', content: 'Hi there!' },
      ]

      mockSessionFindById.mockResolvedValue(session)
      const msgBuilder = makeBuilder(messages)
      mockMessageGetKnex.mockReturnValue(msgBuilder)

      const result = await service.getConversation('conv-1', 'user-1')

      expect(result).toBeTruthy()
      expect(result!.messages).toEqual(messages)
      expect(result!.id).toBe('conv-1')
    })

    it('returns null when session not found', async () => {
      mockSessionFindById.mockResolvedValue(null)

      const result = await service.getConversation('conv-nope', 'user-1')
      expect(result).toBeNull()
    })

    it('returns null when user does not own the session', async () => {
      const session = { id: 'conv-1', user_id: 'other-user', title: 'Test' }
      mockSessionFindById.mockResolvedValue(session)

      const result = await service.getConversation('conv-1', 'user-1')
      expect(result).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // deleteConversations (bulk)
  // -----------------------------------------------------------------------

  describe('deleteConversations', () => {
    it('deletes messages and sessions for given IDs', async () => {
      // First call: pluck owned IDs (session getKnex)
      const pluckBuilder = makeBuilder(['c1', 'c2'])
      // Second call: delete messages (message getKnex)
      const msgBuilder = makeBuilder(5)
      // Third call: delete sessions (session getKnex)
      const sessionBuilder = makeBuilder(2)

      mockSessionGetKnex
        .mockReturnValueOnce(pluckBuilder)
        .mockReturnValueOnce(sessionBuilder)
      mockMessageGetKnex.mockReturnValue(msgBuilder)

      const result = await service.deleteConversations(['c1', 'c2'], 'user-1')

      expect(result).toBe(2)
      // Verify ownership check via pluck
      expect(pluckBuilder.whereIn).toHaveBeenCalledWith('id', ['c1', 'c2'])
      expect(pluckBuilder.andWhere).toHaveBeenCalledWith('user_id', 'user-1')
      expect(pluckBuilder.pluck).toHaveBeenCalledWith('id')
      // Verify message deletion
      expect(msgBuilder.whereIn).toHaveBeenCalledWith('session_id', ['c1', 'c2'])
      expect(msgBuilder.delete).toHaveBeenCalled()
      // Verify session deletion
      expect(sessionBuilder.whereIn).toHaveBeenCalledWith('id', ['c1', 'c2'])
    })
  })

  // -----------------------------------------------------------------------
  // sendFeedback
  // -----------------------------------------------------------------------

  describe('sendFeedback', () => {
    it('saves feedback on a message', async () => {
      const message = { id: 'msg-1', citations: {} }
      mockMessageFindById.mockResolvedValue(message)

      const mockUpdate = vi.fn()
      // Need to access ModelFactory.chatMessage.update through the mock
      const { ModelFactory } = await import('@/shared/models/factory.js')
      ;(ModelFactory.chatMessage as any).update = mockUpdate

      await service.sendFeedback('msg-1', true, 'Great answer')

      expect(mockUpdate).toHaveBeenCalledWith('msg-1', expect.objectContaining({
        citations: expect.objectContaining({
          feedback: expect.objectContaining({
            thumbup: true,
            text: 'Great answer',
          }),
        }),
      }))
    })

    it('throws when message not found', async () => {
      mockMessageFindById.mockResolvedValue(null)

      await expect(
        service.sendFeedback('msg-nope', true)
      ).rejects.toThrow('Message not found')
    })
  })
})
