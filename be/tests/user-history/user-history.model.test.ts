/**
 * @fileoverview Unit tests for History Session and Message Models.
 * Mocks Knex to verify SQL query structure for complex history searches.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HistoryChatSessionModel } from '../../src/shared/models/history-chat-session.model.js'
import { HistoryChatMessageModel } from '../../src/shared/models/history-chat-message.model.js'
import { db } from '../../src/shared/db/knex.js'

vi.mock('../../src/shared/db/knex.js', () => ({
  db: vi.fn(),
}))

describe('History Models', () => {
  let mockQuery: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      whereRaw: vi.fn().mockReturnThis(),
      orWhereRaw: vi.fn().mockReturnThis(),
      whereNot: vi.fn().mockReturnThis(),
      whereExists: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(undefined),
      then: vi.fn(function(this: any, cb: any) { return Promise.resolve(this._results || []).then(cb) }),
      _results: []
    }
    const mk = db as any
    // Reset mock function
    vi.mocked(db).mockReturnValue(mockQuery as any)
    
    // Improved where mock to handle callbacks for nested queries
    mockQuery.where.mockImplementation(function(this: any, arg1: any) {
      if (typeof arg1 === 'function') {
        arg1.call(this, this)
      }
      return this
    })

    // Add methods to the function object itself for direct calls like knex.select()
    Object.assign(mk, mockQuery)
    mk.raw = vi.fn((sql: any) => ({ sql }))
  })

  describe('HistoryChatSessionModel', () => {
    it('findHistoryByUser builds complex history query', async () => {
      const model = new HistoryChatSessionModel()
      await model.findHistoryByUser('u@test.com', 10, 0, 'test', '2023-01-01')

      expect(mockQuery.select).toHaveBeenCalled()
      expect(mockQuery.from).toHaveBeenCalledWith('history_chat_sessions')
      expect(mockQuery.leftJoin).toHaveBeenCalledWith(
        'knowledge_base_sources', 
        'history_chat_sessions.share_id', 
        'knowledge_base_sources.share_id'
      )
      expect(mockQuery.where).toHaveBeenCalledWith('history_chat_sessions.user_email', 'u@test.com')
      expect(mockQuery.where).toHaveBeenCalledWith('history_chat_sessions.updated_at', '>=', '2023-01-01')
      expect(mockQuery.whereExists).toHaveBeenCalled()
      expect(mockQuery.limit).toHaveBeenCalledWith(10)
    })
  })

  describe('HistoryChatMessageModel', () => {
    it('findBySessionIdAndUserEmail joins with sessions to verify ownership', async () => {
      const model = new HistoryChatMessageModel()
      await model.findBySessionIdAndUserEmail('s1', 'u@test.com')

      expect(mockQuery.join).toHaveBeenCalledWith(
        'history_chat_sessions',
        'history_chat_messages.session_id',
        'history_chat_sessions.session_id'
      )
      expect(mockQuery.where).toHaveBeenCalledWith('history_chat_messages.session_id', 's1')
      expect(mockQuery.andWhere).toHaveBeenCalledWith('history_chat_sessions.user_email', 'u@test.com')
      expect(mockQuery.orderBy).toHaveBeenCalledWith('history_chat_messages.created_at', 'asc')
    })
  })
})
