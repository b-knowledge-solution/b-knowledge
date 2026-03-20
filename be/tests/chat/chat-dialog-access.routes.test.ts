/**
 * @fileoverview Tests for Chat Assistant Access HTTP endpoints.
 *
 * Validates request handling, RBAC enforcement, and proper HTTP status codes
 * for assistant access management routes and assistant CRUD with role checks.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createMockRequest, createMockResponse } from '../setup'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockAssistantService, mockAccessService } = vi.hoisted(() => ({
  mockAssistantService: {
    createAssistant: vi.fn(),
    getAssistant: vi.fn(),
    listAssistants: vi.fn(),
    listAccessibleAssistants: vi.fn(),
    updateAssistant: vi.fn(),
    deleteAssistant: vi.fn(),
  },
  mockAccessService: {
    getAssistantAccess: vi.fn(),
    setAssistantAccess: vi.fn(),
    checkUserAccess: vi.fn(),
  },
}))

vi.mock('@/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../src/modules/chat/services/chat-assistant.service.js', () => ({
  chatAssistantService: mockAssistantService,
}))

vi.mock('@/modules/feedback/services/feedback.service.js', () => ({
  feedbackService: {},
}))

const mockUserTeamFindAll = vi.hoisted(() => vi.fn().mockResolvedValue([]))

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: { userTeam: { findAll: mockUserTeamFindAll } },
}))

vi.mock('@/shared/middleware/tenant.middleware.js', () => ({
  getTenantId: vi.fn().mockReturnValue('default'),
}))

// Import the controller after mocks are set up
import { ChatAssistantController } from '../../src/modules/chat/controllers/chat-assistant.controller'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Chat Assistant Access Routes', () => {
  let controller: ChatAssistantController
  let res: ReturnType<typeof createMockResponse>

  beforeEach(() => {
    controller = new ChatAssistantController()
    res = createMockResponse()
    // Re-establish mock return values after global afterEach resets them
    mockUserTeamFindAll.mockResolvedValue([])
  })

  // -----------------------------------------------------------------------
  // GET /api/chat/assistants/:id/access
  // -----------------------------------------------------------------------

  describe('GET /api/chat/assistants/:id/access', () => {
    it('admin gets 200 with assistant details', async () => {
      const app = { id: 'a1', name: 'Test Assistant', created_by: 'admin-1' }
      mockAssistantService.getAssistant.mockResolvedValue(app)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'a1' },
      })

      // Simulate admin access check passing
      await controller.getAssistant(req, res)

      expect(res.json).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalledWith(403)
    })

    it('returns 404 when assistant does not exist', async () => {
      mockAssistantService.getAssistant.mockResolvedValue(undefined)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'nonexistent' },
      })
      await controller.getAssistant(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({ error: 'Assistant not found' })
    })
  })

  // -----------------------------------------------------------------------
  // PUT /api/chat/assistants/:id
  // -----------------------------------------------------------------------

  describe('PUT /api/chat/assistants/:id', () => {
    it('admin can update an assistant', async () => {
      const updated = { id: 'a1', name: 'Updated Assistant' }
      mockAssistantService.updateAssistant.mockResolvedValue(updated)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'a1' },
        body: { name: 'Updated Assistant' },
      })
      await controller.updateAssistant(req, res)

      expect(mockAssistantService.updateAssistant).toHaveBeenCalledWith('a1', { name: 'Updated Assistant' }, 'admin-1')
      expect(res.json).toHaveBeenCalledWith(updated)
    })

    it('returns 401 when user is not authenticated', async () => {
      const req = createMockRequest({
        user: undefined,
        params: { id: 'a1' },
        body: { name: 'Updated' },
      })
      await controller.updateAssistant(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' })
    })

    it('returns 404 when assistant does not exist', async () => {
      mockAssistantService.updateAssistant.mockResolvedValue(undefined)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'nonexistent' },
        body: { name: 'Updated' },
      })
      await controller.updateAssistant(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({ error: 'Assistant not found' })
    })

    it('returns 500 on service error', async () => {
      mockAssistantService.updateAssistant.mockRejectedValue(new Error('DB failure'))

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'a1' },
        body: { name: 'Updated' },
      })
      await controller.updateAssistant(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
    })
  })

  // -----------------------------------------------------------------------
  // GET /api/chat/assistants - user only sees accessible assistants
  // -----------------------------------------------------------------------

  describe('GET /api/chat/assistants', () => {
    it('user only sees assistants they have access to', async () => {
      const userAssistants = [
        { id: 'a1', name: 'My Assistant', created_by: 'user-1' },
      ]
      mockAssistantService.listAccessibleAssistants.mockResolvedValue(userAssistants)

      const req = createMockRequest({
        user: { id: 'user-1', role: 'user' },
        query: {},
      })
      await controller.listAssistants(req, res)

      // Controller calls listAccessibleAssistants(userId, role, teamIds, options)
      expect(mockAssistantService.listAccessibleAssistants).toHaveBeenCalledWith(
        'user-1', 'user', [],
        expect.objectContaining({}),
      )
      expect(res.json).toHaveBeenCalledWith(userAssistants)
    })

    it('admin sees all assistants', async () => {
      const allAssistants = [
        { id: 'a1', name: 'Assistant 1', created_by: 'user-1' },
        { id: 'a2', name: 'Assistant 2', created_by: 'user-2' },
        { id: 'a3', name: 'Assistant 3', created_by: 'admin-1' },
      ]
      mockAssistantService.listAccessibleAssistants.mockResolvedValue(allAssistants)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        query: {},
      })
      await controller.listAssistants(req, res)

      expect(res.json).toHaveBeenCalledWith(allAssistants)
    })

    it('returns 500 on service error', async () => {
      mockAssistantService.listAccessibleAssistants.mockRejectedValue(new Error('fail'))

      const req = createMockRequest({
        user: { id: 'user-1', role: 'user' },
        query: {},
      })
      await controller.listAssistants(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
    })
  })

  // -----------------------------------------------------------------------
  // POST /api/chat/assistants - only admin/leader can create
  // -----------------------------------------------------------------------

  describe('POST /api/chat/assistants', () => {
    it('admin can create an assistant', async () => {
      const created = { id: 'a-new', name: 'New Assistant' }
      mockAssistantService.createAssistant.mockResolvedValue(created)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        body: { name: 'New Assistant', kb_ids: ['kb1'] },
      })
      await controller.createAssistant(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(created)
    })

    it('returns 401 when user is not authenticated', async () => {
      const req = createMockRequest({
        user: undefined,
        body: { name: 'New Assistant', kb_ids: ['kb1'] },
      })
      await controller.createAssistant(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' })
    })

    it('returns 500 on service error', async () => {
      mockAssistantService.createAssistant.mockRejectedValue(new Error('oops'))

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        body: { name: 'New Assistant', kb_ids: ['kb1'] },
      })
      await controller.createAssistant(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
    })
  })

  // -----------------------------------------------------------------------
  // PUT /api/chat/assistants/:id - only admin/leader can update
  // -----------------------------------------------------------------------

  describe('PUT /api/chat/assistants/:id - role enforcement', () => {
    it('admin can update an assistant', async () => {
      const updated = { id: 'a1', name: 'Updated' }
      mockAssistantService.updateAssistant.mockResolvedValue(updated)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'a1' },
        body: { name: 'Updated' },
      })
      await controller.updateAssistant(req, res)

      expect(res.json).toHaveBeenCalledWith(updated)
    })

    it('returns 401 when not authenticated', async () => {
      const req = createMockRequest({
        user: undefined,
        params: { id: 'a1' },
        body: { name: 'Updated' },
      })
      await controller.updateAssistant(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
    })
  })

  // -----------------------------------------------------------------------
  // DELETE /api/chat/assistants/:id - only admin/leader can delete
  // -----------------------------------------------------------------------

  describe('DELETE /api/chat/assistants/:id', () => {
    it('admin can delete an assistant', async () => {
      mockAssistantService.deleteAssistant.mockResolvedValue(undefined)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'a1' },
      })
      await controller.deleteAssistant(req, res)

      expect(res.status).toHaveBeenCalledWith(204)
      expect(res.send).toHaveBeenCalled()
    })

    it('returns 500 on service error during delete', async () => {
      mockAssistantService.deleteAssistant.mockRejectedValue(new Error('cascade fail'))

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'a1' },
      })
      await controller.deleteAssistant(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
    })
  })
})
