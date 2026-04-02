/**
 * @fileoverview Unit tests for UserHistoryService.
 * Mocks ModelFactory to verify delegating calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mocks
const { mockChatSession, mockChatMessage, mockSearchSession, mockSearchRecord } = vi.hoisted(() => ({
  mockChatSession: { findHistoryByUser: vi.fn() },
  mockChatMessage: { findBySessionIdAndUserEmail: vi.fn() },
  mockSearchSession: { findHistoryByUser: vi.fn() },
  mockSearchRecord: { findBySessionIdAndUserEmail: vi.fn() },
}))

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    historyChatSession: mockChatSession,
    historyChatMessage: mockChatMessage,
    historySearchSession: mockSearchSession,
    historySearchRecord: mockSearchRecord,
  },
}))

// Mock db for internal chat history queries (getInternalChatHistory, getInternalChatSessionDetails)
vi.mock('@/shared/db/knex.js', () => {
  const createChain = (): any => new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (resolve: any) => Promise.resolve(resolve([]))
      if (prop === 'first') return () => Promise.resolve(undefined)
      return () => createChain()
    },
  })
  const dbFn: any = () => createChain()
  dbFn.raw = vi.fn((...args: any[]) => args[0])
  return { db: dbFn }
})

import { userHistoryService } from '../../src/modules/user-history/user-history.service.js'

describe('UserHistoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getChatHistory', () => {
    it('calculates offset correctly and calls model method', async () => {
      mockChatSession.findHistoryByUser.mockResolvedValueOnce([])
      
      const result = await userHistoryService.getChatHistory(
        'u@test.com', 2, 10, 'search', '2023-01-01', '2023-01-31'
      )

      expect(mockChatSession.findHistoryByUser).toHaveBeenCalledWith(
        'u@test.com', 10, 10, 'search', '2023-01-01', '2023-01-31'
      )
      expect(result).toEqual([])
    })
  })

  describe('getChatSessionDetails', () => {
    it('calls model method with sessionId and userEmail', async () => {
      mockChatMessage.findBySessionIdAndUserEmail.mockResolvedValueOnce([])
      const result = await userHistoryService.getChatSessionDetails('s1', 'u@test.com')
      
      expect(mockChatMessage.findBySessionIdAndUserEmail).toHaveBeenCalledWith('s1', 'u@test.com')
    })
  })

  describe('getSearchHistory', () => {
    it('calculates offset and calls search session model', async () => {
      mockSearchSession.findHistoryByUser.mockResolvedValueOnce([])
      await userHistoryService.getSearchHistory('u@test.com', 1, 20, '', '', '')
      
      expect(mockSearchSession.findHistoryByUser).toHaveBeenCalledWith(
        'u@test.com', 20, 0, '', '', ''
      )
    })
  })

  describe('getSearchSessionDetails', () => {
    it('calls search record model', async () => {
      mockSearchRecord.findBySessionIdAndUserEmail.mockResolvedValueOnce([])
      await userHistoryService.getSearchSessionDetails('s2', 'u@test.com')
      
      expect(mockSearchRecord.findBySessionIdAndUserEmail).toHaveBeenCalledWith('s2', 'u@test.com')
    })
  })
})
