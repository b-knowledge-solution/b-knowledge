/**
 * @fileoverview Unit tests for FeedbackController.
 * Tests authorization, tenant isolation, input validation, error handling,
 * and correct delegation to FeedbackService.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

// ============================================================================
// Mocks
// ============================================================================

const mockFeedbackService = vi.hoisted(() => ({
  createFeedback: vi.fn(),
  listFeedback: vi.fn(),
  getStats: vi.fn(),
  exportFeedback: vi.fn(),
}))

const mockGetTenantId = vi.hoisted(() => vi.fn())

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
}))

vi.mock('../../src/modules/feedback/services/feedback.service.js', () => ({
  feedbackService: mockFeedbackService,
}))

vi.mock('../../src/shared/middleware/tenant.middleware.js', () => ({
  getTenantId: mockGetTenantId,
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: mockLog,
}))

// ============================================================================
// Helpers
// ============================================================================

/** @description Create a mock Express request with user context */
function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    user: { id: 'user-1', email: 'test@example.com' },
    body: {},
    query: {},
    ...overrides,
  } as unknown as Request
}

/** @description Create a mock Express response with spy methods */
function mockResponse(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  return res as unknown as Response
}

// ============================================================================
// Tests
// ============================================================================

describe('FeedbackController', () => {
  let controller: any

  beforeEach(async () => {
    vi.clearAllMocks()
    // Default: getTenantId returns a valid tenant
    mockGetTenantId.mockReturnValue('tenant-1')

    const mod = await import('../../src/modules/feedback/controllers/feedback.controller.js')
    controller = new mod.FeedbackController()
  })

  // ==========================================================================
  // Authentication Guards
  // ==========================================================================

  describe('authentication guards', () => {
    it('create() should return 401 when user is not authenticated', async () => {
      const req = mockRequest({ user: undefined })
      const res = mockResponse()

      await controller.create(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' })
      expect(mockFeedbackService.createFeedback).not.toHaveBeenCalled()
    })

    it('list() should return 401 when user is not authenticated', async () => {
      const req = mockRequest({ user: undefined })
      const res = mockResponse()

      await controller.list(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(mockFeedbackService.listFeedback).not.toHaveBeenCalled()
    })

    it('stats() should return 401 when user is not authenticated', async () => {
      const req = mockRequest({ user: undefined })
      const res = mockResponse()

      await controller.stats(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(mockFeedbackService.getStats).not.toHaveBeenCalled()
    })

    it('export() should return 401 when user is not authenticated', async () => {
      const req = mockRequest({ user: undefined })
      const res = mockResponse()

      await controller.export(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(mockFeedbackService.exportFeedback).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // Tenant Isolation
  // ==========================================================================

  describe('tenant isolation', () => {
    it('create() should return 403 when no tenant is resolved', async () => {
      mockGetTenantId.mockReturnValue(null)
      const req = mockRequest({ body: { source: 'chat', thumbup: true, query: 'q', answer: 'a' } })
      const res = mockResponse()

      await controller.create(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ error: 'No organization selected' })
      expect(mockFeedbackService.createFeedback).not.toHaveBeenCalled()
    })

    it('list() should return 403 when no tenant is resolved', async () => {
      mockGetTenantId.mockReturnValue(null)
      const req = mockRequest({ query: {} })
      const res = mockResponse()

      await controller.list(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(mockFeedbackService.listFeedback).not.toHaveBeenCalled()
    })

    it('stats() should return 403 when no tenant is resolved', async () => {
      mockGetTenantId.mockReturnValue(null)
      const req = mockRequest({ query: {} })
      const res = mockResponse()

      await controller.stats(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(mockFeedbackService.getStats).not.toHaveBeenCalled()
    })

    it('export() should return 403 when no tenant is resolved', async () => {
      mockGetTenantId.mockReturnValue(null)
      const req = mockRequest({ query: {} })
      const res = mockResponse()

      await controller.export(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(mockFeedbackService.exportFeedback).not.toHaveBeenCalled()
    })

    it('create() should pass resolved tenantId to service', async () => {
      mockGetTenantId.mockReturnValue('org-42')
      mockFeedbackService.createFeedback.mockResolvedValueOnce({ id: 'fb-1' })

      const req = mockRequest({
        body: {
          source: 'chat',
          source_id: 'conv-1',
          thumbup: true,
          query: 'How do I?',
          answer: 'You can...',
        },
      })
      const res = mockResponse()

      await controller.create(req, res)

      // Verify tenantId from getTenantId is passed, not a hardcoded 'default'
      expect(mockFeedbackService.createFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: 'org-42' })
      )
      expect(res.status).toHaveBeenCalledWith(201)
    })

    it('list() should pass resolved tenantId to service', async () => {
      mockGetTenantId.mockReturnValue('org-42')
      mockFeedbackService.listFeedback.mockResolvedValueOnce({ data: [], total: 0 })

      const req = mockRequest({ query: { page: '1', limit: '20' } })
      const res = mockResponse()

      await controller.list(req, res)

      expect(mockFeedbackService.listFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'org-42' })
      )
    })
  })

  // ==========================================================================
  // Create Endpoint
  // ==========================================================================

  describe('create()', () => {
    it('should create feedback with all fields', async () => {
      const feedbackData = {
        source: 'agent',
        source_id: 'run-1',
        message_id: 'msg-1',
        thumbup: false,
        comment: 'Wrong answer',
        query: 'What is X?',
        answer: 'X is Y',
        chunks_used: [{ id: 'chunk-1' }],
        trace_id: 'trace-abc',
      }
      mockFeedbackService.createFeedback.mockResolvedValueOnce({ id: 'fb-1', ...feedbackData })

      const req = mockRequest({ body: feedbackData })
      const res = mockResponse()

      await controller.create(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(mockFeedbackService.createFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'agent',
          source_id: 'run-1',
          message_id: 'msg-1',
          thumbup: false,
          comment: 'Wrong answer',
          user_id: 'user-1',
          tenant_id: 'tenant-1',
        })
      )
    })

    it('should default nullable fields to null', async () => {
      mockFeedbackService.createFeedback.mockResolvedValueOnce({ id: 'fb-2' })

      const req = mockRequest({
        body: { source: 'chat', source_id: 'c-1', thumbup: true, query: 'q', answer: 'a' },
      })
      const res = mockResponse()

      await controller.create(req, res)

      expect(mockFeedbackService.createFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          message_id: null,
          comment: null,
          chunks_used: null,
          trace_id: null,
        })
      )
    })
  })

  // ==========================================================================
  // List Endpoint
  // ==========================================================================

  describe('list()', () => {
    it('should return paginated feedback data', async () => {
      const mockResult = {
        data: [{ id: 'fb-1', source: 'chat', thumbup: true }],
        total: 1,
      }
      mockFeedbackService.listFeedback.mockResolvedValueOnce(mockResult)

      const req = mockRequest({ query: { source: 'chat', page: '2', limit: '10' } })
      const res = mockResponse()

      await controller.list(req, res)

      expect(res.json).toHaveBeenCalledWith({
        data: mockResult.data,
        total: 1,
        page: '2',
        limit: '10',
      })
    })

    it('should default page to 1 and limit to 20 when not provided', async () => {
      mockFeedbackService.listFeedback.mockResolvedValueOnce({ data: [], total: 0 })

      const req = mockRequest({ query: {} })
      const res = mockResponse()

      await controller.list(req, res)

      expect(mockFeedbackService.listFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 20 })
      )
    })
  })

  // ==========================================================================
  // Stats Endpoint
  // ==========================================================================

  describe('stats()', () => {
    it('should return feedback statistics', async () => {
      const mockStats = {
        sourceBreakdown: { chat: 10, search: 5, agent: 3 },
        topFlagged: [{ source_id: 'conv-1', negative_count: 5 }],
      }
      mockFeedbackService.getStats.mockResolvedValueOnce(mockStats)

      const req = mockRequest({ query: { startDate: '2026-01-01', endDate: '2026-03-31' } })
      const res = mockResponse()

      await controller.stats(req, res)

      expect(mockFeedbackService.getStats).toHaveBeenCalledWith('tenant-1', '2026-01-01', '2026-03-31')
      expect(res.json).toHaveBeenCalledWith(mockStats)
    })

    it('should work without date range', async () => {
      mockFeedbackService.getStats.mockResolvedValueOnce({ sourceBreakdown: {}, topFlagged: [] })

      const req = mockRequest({ query: {} })
      const res = mockResponse()

      await controller.stats(req, res)

      expect(mockFeedbackService.getStats).toHaveBeenCalledWith('tenant-1', undefined, undefined)
    })
  })

  // ==========================================================================
  // Export Endpoint
  // ==========================================================================

  describe('export()', () => {
    it('should return feedback records array', async () => {
      const mockRecords = [
        { id: '1', source: 'chat', thumbup: true },
        { id: '2', source: 'search', thumbup: false },
      ]
      mockFeedbackService.exportFeedback.mockResolvedValueOnce(mockRecords)

      const req = mockRequest({ query: { source: 'chat' } })
      const res = mockResponse()

      await controller.export(req, res)

      expect(res.json).toHaveBeenCalledWith(mockRecords)
    })

    it('should pass all filter params to service', async () => {
      mockFeedbackService.exportFeedback.mockResolvedValueOnce([])

      const req = mockRequest({
        query: { source: 'agent', thumbup: 'false', startDate: '2026-01-01', endDate: '2026-03-31' },
      })
      const res = mockResponse()

      await controller.export(req, res)

      expect(mockFeedbackService.exportFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'agent',
          thumbup: 'false',
          startDate: '2026-01-01',
          endDate: '2026-03-31',
          tenantId: 'tenant-1',
        })
      )
    })
  })

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('error handling', () => {
    it('create() should return 500 on service error', async () => {
      mockFeedbackService.createFeedback.mockRejectedValueOnce(new Error('DB connection failed'))

      const req = mockRequest({
        body: { source: 'chat', source_id: 'c-1', thumbup: true, query: 'q', answer: 'a' },
      })
      const res = mockResponse()

      await controller.create(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
      expect(mockLog.error).toHaveBeenCalled()
    })

    it('list() should return 500 on service error', async () => {
      mockFeedbackService.listFeedback.mockRejectedValueOnce(new Error('Query timeout'))

      const req = mockRequest({ query: {} })
      const res = mockResponse()

      await controller.list(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(mockLog.error).toHaveBeenCalled()
    })

    it('stats() should return 500 on service error', async () => {
      mockFeedbackService.getStats.mockRejectedValueOnce(new Error('Aggregate failed'))

      const req = mockRequest({ query: {} })
      const res = mockResponse()

      await controller.stats(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })

    it('export() should return 500 on service error', async () => {
      mockFeedbackService.exportFeedback.mockRejectedValueOnce(new Error('Export failed'))

      const req = mockRequest({ query: {} })
      const res = mockResponse()

      await controller.export(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })
})
