/**
 * @fileoverview Tests for ChatHistoryService conversation operations.
 *
 * Covers createConversation-like behaviour via searchSessions, deleteSession,
 * deleteSessions, and edge cases around filters, pagination, and ownership.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

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
    where: vi.fn().mockImplementation(function (...args: any[]) {
      if (typeof args[0] === 'function') {
        args[0].call(this, this)
        return this
      }
      return this
    }),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    whereRaw: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orWhereExists: vi.fn().mockImplementation(function (fn: any) { fn.call(this); return this }),
    whereIn: vi.fn().mockReturnThis(),
    delete: vi.fn().mockResolvedValue(result),
    count: vi.fn().mockReturnValue({ first: () => Promise.resolve({ total: '0' }) }),
    then: (onFulfilled: any) => Promise.resolve(result).then(onFulfilled),
  }
  return builder
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatHistoryService – conversation operations', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // searchSessions (acts as listConversations)
  // -----------------------------------------------------------------------

  describe('searchSessions', () => {
    it('returns sessions and total count', async () => {
      const { chatHistoryService } = await import('../../src/modules/chat/services/chat-history.service')
      const factory = await import('../../src/shared/models/factory')

      const sessions = [{ id: 's1', title: 'Hello' }, { id: 's2', title: 'World' }]
      const sessionBuilder = makeBuilder(sessions)
      const countBuilder = makeBuilder({})
      countBuilder.count = vi.fn().mockReturnValue({ first: () => Promise.resolve({ total: '2' }) })

      factory.ModelFactory.chatSession.getKnex = vi.fn()
        .mockImplementationOnce(() => sessionBuilder)
        .mockImplementationOnce(() => countBuilder)

      const res = await chatHistoryService.searchSessions('u1', 10, 0, '', '', '')
      expect(res.sessions).toEqual(sessions)
      expect(res.total).toBe(2)
    })

    it('returns empty list when no sessions exist', async () => {
      const { chatHistoryService } = await import('../../src/modules/chat/services/chat-history.service')
      const factory = await import('../../src/shared/models/factory')

      const sessionBuilder = makeBuilder([])
      const countBuilder = makeBuilder({})
      countBuilder.count = vi.fn().mockReturnValue({ first: () => Promise.resolve({ total: '0' }) })

      factory.ModelFactory.chatSession.getKnex = vi.fn()
        .mockImplementationOnce(() => sessionBuilder)
        .mockImplementationOnce(() => countBuilder)

      const res = await chatHistoryService.searchSessions('u1', 10, 0, '', '', '')
      expect(res.sessions).toEqual([])
      expect(res.total).toBe(0)
    })

    it('applies search filter to both data and count queries', async () => {
      const { chatHistoryService } = await import('../../src/modules/chat/services/chat-history.service')
      const factory = await import('../../src/shared/models/factory')

      const sessionBuilder = makeBuilder([{ id: 's3' }])
      const countBuilder = makeBuilder({})
      countBuilder.count = vi.fn().mockReturnValue({ first: () => Promise.resolve({ total: '1' }) })

      factory.ModelFactory.chatSession.getKnex = vi.fn()
        .mockImplementationOnce(() => sessionBuilder)
        .mockImplementationOnce(() => countBuilder)

      await chatHistoryService.searchSessions('u1', 5, 0, 'hello', '', '')

      // Both builders should have received the nested andWhere for message content
      expect(sessionBuilder.andWhere).toHaveBeenCalledWith('content', 'ilike', '%hello%')
      expect(countBuilder.andWhere).toHaveBeenCalledWith('content', 'ilike', '%hello%')
    })

    it('applies date range filters', async () => {
      const { chatHistoryService } = await import('../../src/modules/chat/services/chat-history.service')
      const factory = await import('../../src/shared/models/factory')

      const sessionBuilder = makeBuilder([])
      const countBuilder = makeBuilder({})
      countBuilder.count = vi.fn().mockReturnValue({ first: () => Promise.resolve({ total: '0' }) })

      factory.ModelFactory.chatSession.getKnex = vi.fn()
        .mockImplementationOnce(() => sessionBuilder)
        .mockImplementationOnce(() => countBuilder)

      await chatHistoryService.searchSessions('u1', 10, 0, '', '2025-01-01', '2025-12-31')

      expect(sessionBuilder.where).toHaveBeenCalledWith('created_at', '>=', '2025-01-01')
      expect(sessionBuilder.where).toHaveBeenCalledWith('created_at', '<=', '2025-12-31')
      expect(countBuilder.where).toHaveBeenCalledWith('created_at', '>=', '2025-01-01')
      expect(countBuilder.where).toHaveBeenCalledWith('created_at', '<=', '2025-12-31')
    })

    it('returns total 0 when count query returns null', async () => {
      const { chatHistoryService } = await import('../../src/modules/chat/services/chat-history.service')
      const factory = await import('../../src/shared/models/factory')

      const sessionBuilder = makeBuilder([])
      const countBuilder = makeBuilder({})
      countBuilder.count = vi.fn().mockReturnValue({ first: () => Promise.resolve(null) })

      factory.ModelFactory.chatSession.getKnex = vi.fn()
        .mockImplementationOnce(() => sessionBuilder)
        .mockImplementationOnce(() => countBuilder)

      const res = await chatHistoryService.searchSessions('u1', 10, 0, '', '', '')
      expect(res.total).toBe(0)
    })
  })

  // -----------------------------------------------------------------------
  // deleteSession
  // -----------------------------------------------------------------------

  describe('deleteSession', () => {
    it('returns true when a row is deleted', async () => {
      const { chatHistoryService } = await import('../../src/modules/chat/services/chat-history.service')
      const factory = await import('../../src/shared/models/factory')

      const builder = makeBuilder(1)
      factory.ModelFactory.chatSession.getKnex = vi.fn().mockReturnValue(builder)

      expect(await chatHistoryService.deleteSession('u1', 's1')).toBe(true)
    })

    it('returns false when no row is deleted (not found)', async () => {
      const { chatHistoryService } = await import('../../src/modules/chat/services/chat-history.service')
      const factory = await import('../../src/shared/models/factory')

      const builder = makeBuilder(0)
      factory.ModelFactory.chatSession.getKnex = vi.fn().mockReturnValue(builder)

      expect(await chatHistoryService.deleteSession('u1', 'nonexistent')).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // deleteSessions (bulk)
  // -----------------------------------------------------------------------

  describe('deleteSessions', () => {
    it('deletes all sessions when all=true', async () => {
      const { chatHistoryService } = await import('../../src/modules/chat/services/chat-history.service')
      const factory = await import('../../src/shared/models/factory')

      const builder = makeBuilder(5)
      factory.ModelFactory.chatSession.getKnex = vi.fn().mockReturnValue(builder)

      const count = await chatHistoryService.deleteSessions('u1', [], true)
      expect(count).toBe(5)
    })

    it('deletes specific sessions by IDs', async () => {
      const { chatHistoryService } = await import('../../src/modules/chat/services/chat-history.service')
      const factory = await import('../../src/shared/models/factory')

      const builder = makeBuilder(2)
      factory.ModelFactory.chatSession.getKnex = vi.fn().mockReturnValue(builder)

      const count = await chatHistoryService.deleteSessions('u1', ['a', 'b'], false)
      expect(count).toBe(2)
      expect(builder.whereIn).toHaveBeenCalledWith('id', ['a', 'b'])
    })

    it('returns 0 when no IDs provided and all=false', async () => {
      const { chatHistoryService } = await import('../../src/modules/chat/services/chat-history.service')

      const count = await chatHistoryService.deleteSessions('u1', [], false)
      expect(count).toBe(0)
    })

    it('returns 0 for partial failure (no matching rows)', async () => {
      const { chatHistoryService } = await import('../../src/modules/chat/services/chat-history.service')
      const factory = await import('../../src/shared/models/factory')

      const builder = makeBuilder(0)
      factory.ModelFactory.chatSession.getKnex = vi.fn().mockReturnValue(builder)

      const count = await chatHistoryService.deleteSessions('u1', ['nonexistent'], false)
      expect(count).toBe(0)
    })
  })
})
