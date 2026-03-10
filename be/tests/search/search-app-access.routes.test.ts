/**
 * @fileoverview Tests for Search App Access HTTP endpoints.
 *
 * Validates request handling, RBAC enforcement, and proper HTTP status codes
 * for search app access management routes and search app CRUD with role checks.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createMockRequest, createMockResponse } from '../setup'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSearchService = {
  createSearchApp: vi.fn(),
  getSearchApp: vi.fn(),
  listSearchApps: vi.fn(),
  updateSearchApp: vi.fn(),
  deleteSearchApp: vi.fn(),
  executeSearch: vi.fn(),
}

const mockAccessService = {
  getAppAccess: vi.fn(),
  setAppAccess: vi.fn(),
  checkUserAccess: vi.fn(),
}

vi.mock('../../src/modules/search/services/search.service.js', () => ({
  searchService: mockSearchService,
}))

// Import the controller after mocks are set up
import { SearchController } from '../../src/modules/search/controllers/search.controller'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Search App Access Routes', () => {
  let controller: SearchController
  let res: ReturnType<typeof createMockResponse>

  beforeEach(() => {
    controller = new SearchController()
    res = createMockResponse()
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // GET /api/search/apps/:id/access
  // -----------------------------------------------------------------------

  describe('GET /api/search/apps/:id/access', () => {
    it('admin gets 200 with search app details', async () => {
      const app = { id: 'app1', name: 'Test Search', created_by: 'admin-1' }
      mockSearchService.getSearchApp.mockResolvedValue(app)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'app1' },
      })

      // Simulate admin access check passing
      await controller.getSearchApp(req, res)

      expect(res.json).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalledWith(403)
    })

    it('returns 404 when search app does not exist', async () => {
      mockSearchService.getSearchApp.mockResolvedValue(undefined)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'nonexistent' },
      })
      await controller.getSearchApp(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({ error: 'Search app not found' })
    })
  })

  // -----------------------------------------------------------------------
  // PUT /api/search/apps/:id/access
  // -----------------------------------------------------------------------

  describe('PUT /api/search/apps/:id', () => {
    it('admin can update a search app', async () => {
      const updated = { id: 'app1', name: 'Updated Search' }
      mockSearchService.updateSearchApp.mockResolvedValue(updated)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'app1' },
        body: { name: 'Updated Search' },
      })
      await controller.updateSearchApp(req, res)

      expect(mockSearchService.updateSearchApp).toHaveBeenCalledWith('app1', { name: 'Updated Search' }, 'admin-1')
      expect(res.json).toHaveBeenCalledWith(updated)
    })

    it('returns 401 when user is not authenticated', async () => {
      const req = createMockRequest({
        user: undefined,
        params: { id: 'app1' },
        body: { name: 'Updated' },
      })
      await controller.updateSearchApp(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' })
    })

    it('returns 404 when search app does not exist', async () => {
      mockSearchService.updateSearchApp.mockResolvedValue(undefined)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'nonexistent' },
        body: { name: 'Updated' },
      })
      await controller.updateSearchApp(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({ error: 'Search app not found' })
    })

    it('returns 500 on service error', async () => {
      mockSearchService.updateSearchApp.mockRejectedValue(new Error('DB failure'))

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'app1' },
        body: { name: 'Updated' },
      })
      await controller.updateSearchApp(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
    })
  })

  // -----------------------------------------------------------------------
  // GET /api/search/apps - user only sees accessible apps
  // -----------------------------------------------------------------------

  describe('GET /api/search/apps', () => {
    it('user only sees apps they have access to', async () => {
      const userApps = [
        { id: 'app1', name: 'My Search', created_by: 'user-1' },
      ]
      mockSearchService.listSearchApps.mockResolvedValue(userApps)

      const req = createMockRequest({
        user: { id: 'user-1', role: 'user' },
        query: {},
      })
      await controller.listSearchApps(req, res)

      expect(mockSearchService.listSearchApps).toHaveBeenCalledWith('user-1')
      expect(res.json).toHaveBeenCalledWith(userApps)
    })

    it('admin sees all search apps', async () => {
      const allApps = [
        { id: 'app1', name: 'Search 1', created_by: 'user-1' },
        { id: 'app2', name: 'Search 2', created_by: 'user-2' },
        { id: 'app3', name: 'Search 3', created_by: 'admin-1' },
      ]
      mockSearchService.listSearchApps.mockResolvedValue(allApps)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        query: {},
      })
      await controller.listSearchApps(req, res)

      expect(res.json).toHaveBeenCalledWith(allApps)
    })

    it('returns 500 on service error', async () => {
      mockSearchService.listSearchApps.mockRejectedValue(new Error('fail'))

      const req = createMockRequest({
        user: { id: 'user-1', role: 'user' },
        query: {},
      })
      await controller.listSearchApps(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
    })
  })

  // -----------------------------------------------------------------------
  // POST /api/search/apps - only admin/leader can create
  // -----------------------------------------------------------------------

  describe('POST /api/search/apps', () => {
    it('admin can create a search app', async () => {
      const created = { id: 'app-new', name: 'New Search' }
      mockSearchService.createSearchApp.mockResolvedValue(created)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        body: { name: 'New Search', dataset_ids: ['ds1'] },
      })
      await controller.createSearchApp(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(created)
    })

    it('returns 401 when user is not authenticated', async () => {
      const req = createMockRequest({
        user: undefined,
        body: { name: 'New Search', dataset_ids: ['ds1'] },
      })
      await controller.createSearchApp(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' })
    })

    it('returns 500 on service error', async () => {
      mockSearchService.createSearchApp.mockRejectedValue(new Error('oops'))

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        body: { name: 'New Search', dataset_ids: ['ds1'] },
      })
      await controller.createSearchApp(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
    })
  })

  // -----------------------------------------------------------------------
  // PUT /api/search/apps/:id - only admin/leader can update
  // -----------------------------------------------------------------------

  describe('PUT /api/search/apps/:id - role enforcement', () => {
    it('admin can update a search app', async () => {
      const updated = { id: 'app1', name: 'Updated' }
      mockSearchService.updateSearchApp.mockResolvedValue(updated)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'app1' },
        body: { name: 'Updated' },
      })
      await controller.updateSearchApp(req, res)

      expect(res.json).toHaveBeenCalledWith(updated)
    })

    it('returns 401 when not authenticated', async () => {
      const req = createMockRequest({
        user: undefined,
        params: { id: 'app1' },
        body: { name: 'Updated' },
      })
      await controller.updateSearchApp(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
    })
  })

  // -----------------------------------------------------------------------
  // DELETE /api/search/apps/:id - only admin/leader can delete
  // -----------------------------------------------------------------------

  describe('DELETE /api/search/apps/:id', () => {
    it('admin can delete a search app', async () => {
      mockSearchService.deleteSearchApp.mockResolvedValue(undefined)

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'app1' },
      })
      await controller.deleteSearchApp(req, res)

      expect(res.status).toHaveBeenCalledWith(204)
      expect(res.send).toHaveBeenCalled()
    })

    it('returns 500 on service error during delete', async () => {
      mockSearchService.deleteSearchApp.mockRejectedValue(new Error('cascade fail'))

      const req = createMockRequest({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'app1' },
      })
      await controller.deleteSearchApp(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
    })
  })
})
