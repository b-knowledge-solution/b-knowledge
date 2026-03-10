/**
 * @fileoverview Tests for ChatHistoryController.
 *
 * Validates request handling, auth checks, Zod validation integration,
 * and proper HTTP status codes for all chat history routes.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createMockRequest, createMockResponse } from '../setup'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockService = {
  searchSessions: vi.fn(),
  deleteSession: vi.fn(),
  deleteSessions: vi.fn(),
}

vi.mock('../../src/modules/chat/services/chat-history.service.js', () => ({
  chatHistoryService: mockService,
}))

import { ChatHistoryController } from '../../src/modules/chat/controllers/chat-history.controller'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatHistoryController', () => {
  let controller: ChatHistoryController
  let res: ReturnType<typeof createMockResponse>

  beforeEach(() => {
    controller = new ChatHistoryController()
    res = createMockResponse()
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // searchSessions
  // -----------------------------------------------------------------------

  describe('searchSessions', () => {
    it('returns 401 when user is not authenticated', async () => {
      const req = createMockRequest({ user: undefined })
      await controller.searchSessions(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' })
    })

    it('returns sessions with default pagination', async () => {
      const data = { sessions: [{ id: 's1' }], total: 1 }
      mockService.searchSessions.mockResolvedValue(data)

      const req = createMockRequest({
        user: { id: 'u1' },
        query: {},
      })
      await controller.searchSessions(req, res)

      expect(mockService.searchSessions).toHaveBeenCalledWith('u1', 50, 0, '', undefined, undefined)
      expect(res.json).toHaveBeenCalledWith(data)
    })

    it('passes query params to service', async () => {
      mockService.searchSessions.mockResolvedValue({ sessions: [], total: 0 })

      const req = createMockRequest({
        user: { id: 'u1' },
        query: { limit: '20', offset: '5', q: 'test', startDate: '2025-01-01', endDate: '2025-12-31' },
      })
      await controller.searchSessions(req, res)

      expect(mockService.searchSessions).toHaveBeenCalledWith('u1', 20, 5, 'test', '2025-01-01', '2025-12-31')
    })

    it('returns 500 on service error', async () => {
      mockService.searchSessions.mockRejectedValue(new Error('DB down'))

      const req = createMockRequest({ user: { id: 'u1' }, query: {} })
      await controller.searchSessions(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
    })
  })

  // -----------------------------------------------------------------------
  // deleteSession
  // -----------------------------------------------------------------------

  describe('deleteSession', () => {
    it('returns 401 when user is not authenticated', async () => {
      const req = createMockRequest({ user: undefined, params: { id: 's1' } })
      await controller.deleteSession(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
    })

    it('returns 204 on successful delete', async () => {
      mockService.deleteSession.mockResolvedValue(true)

      const req = createMockRequest({ user: { id: 'u1' }, params: { id: 's1' } })
      await controller.deleteSession(req, res)

      expect(res.status).toHaveBeenCalledWith(204)
      expect(res.send).toHaveBeenCalled()
    })

    it('returns 404 when session not found', async () => {
      mockService.deleteSession.mockResolvedValue(false)

      const req = createMockRequest({ user: { id: 'u1' }, params: { id: 'bad' } })
      await controller.deleteSession(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({ error: 'Session not found' })
    })

    it('returns 500 on service error', async () => {
      mockService.deleteSession.mockRejectedValue(new Error('oops'))

      const req = createMockRequest({ user: { id: 'u1' }, params: { id: 's1' } })
      await controller.deleteSession(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  // -----------------------------------------------------------------------
  // deleteSessions (bulk)
  // -----------------------------------------------------------------------

  describe('deleteSessions', () => {
    it('returns 401 when user is not authenticated', async () => {
      const req = createMockRequest({ user: undefined, body: { sessionIds: ['a'], all: false } })
      await controller.deleteSessions(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
    })

    it('returns 400 when no sessions specified and all is false', async () => {
      const req = createMockRequest({ user: { id: 'u1' }, body: { sessionIds: [], all: false } })
      await controller.deleteSessions(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'No sessions specified' })
    })

    it('returns deleted count on success', async () => {
      mockService.deleteSessions.mockResolvedValue(3)

      const req = createMockRequest({ user: { id: 'u1' }, body: { sessionIds: ['a', 'b', 'c'], all: false } })
      await controller.deleteSessions(req, res)

      expect(res.json).toHaveBeenCalledWith({ deleted: 3 })
    })

    it('handles all=true', async () => {
      mockService.deleteSessions.mockResolvedValue(10)

      const req = createMockRequest({ user: { id: 'u1' }, body: { sessionIds: [], all: true } })
      await controller.deleteSessions(req, res)

      expect(res.json).toHaveBeenCalledWith({ deleted: 10 })
    })

    it('returns 500 on service error', async () => {
      mockService.deleteSessions.mockRejectedValue(new Error('fail'))

      const req = createMockRequest({ user: { id: 'u1' }, body: { sessionIds: ['a'], all: false } })
      await controller.deleteSessions(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })
})
