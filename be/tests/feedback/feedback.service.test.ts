/**
 * @fileoverview Unit tests for FeedbackService.
 * Tests listFeedback, getStats, and exportFeedback methods with mocked model.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAnswerFeedbackModel = vi.hoisted(() => ({
  create: vi.fn(),
  findBySource: vi.fn(),
  findPaginated: vi.fn(),
  countBySource: vi.fn(),
  getTopFlaggedSessions: vi.fn(),
}))

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    answerFeedback: mockAnswerFeedbackModel,
  },
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: mockLog,
}))

describe('FeedbackService', () => {
  let feedbackService: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../../src/modules/feedback/services/feedback.service.js')
    feedbackService = mod.feedbackService
  })

  describe('listFeedback', () => {
    it('should delegate to model findPaginated with all filters', async () => {
      const mockResult = {
        data: [{ id: '1', source: 'chat', thumbup: true }],
        total: 1,
      }
      mockAnswerFeedbackModel.findPaginated.mockResolvedValueOnce(mockResult)

      const result = await feedbackService.listFeedback({
        source: 'chat',
        thumbup: true,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        tenantId: 'tenant-1',
        page: 1,
        limit: 20,
      })

      // Should pass all filters through to the model
      expect(mockAnswerFeedbackModel.findPaginated).toHaveBeenCalledWith({
        source: 'chat',
        thumbup: true,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        tenantId: 'tenant-1',
        page: 1,
        limit: 20,
      })
      expect(result.data).toHaveLength(1)
      expect(result.total).toBe(1)
    })

    it('should work with minimal filters (tenant + pagination only)', async () => {
      mockAnswerFeedbackModel.findPaginated.mockResolvedValueOnce({ data: [], total: 0 })

      const result = await feedbackService.listFeedback({
        tenantId: 'tenant-1',
        page: 1,
        limit: 20,
      })

      expect(result.data).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('should filter by agent source', async () => {
      mockAnswerFeedbackModel.findPaginated.mockResolvedValueOnce({
        data: [{ id: '2', source: 'agent', thumbup: false }],
        total: 1,
      })

      const result = await feedbackService.listFeedback({
        source: 'agent',
        tenantId: 'tenant-1',
        page: 1,
        limit: 20,
      })

      expect(mockAnswerFeedbackModel.findPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'agent' })
      )
      expect(result.data[0].source).toBe('agent')
    })
  })

  describe('getStats', () => {
    it('should return sourceBreakdown and topFlagged', async () => {
      // Mock both aggregate queries
      mockAnswerFeedbackModel.countBySource.mockResolvedValueOnce({
        chat: 10,
        search: 5,
        agent: 3,
      })
      mockAnswerFeedbackModel.getTopFlaggedSessions.mockResolvedValueOnce([
        { source: 'chat', source_id: 'conv-1', negative_count: 5, total_count: 10 },
      ])

      const result = await feedbackService.getStats('tenant-1')

      expect(result.sourceBreakdown).toEqual({ chat: 10, search: 5, agent: 3 })
      expect(result.topFlagged).toHaveLength(1)
      expect(result.topFlagged[0].negative_count).toBe(5)
    })

    it('should pass date range to aggregate queries', async () => {
      mockAnswerFeedbackModel.countBySource.mockResolvedValueOnce({ chat: 0, search: 0, agent: 0 })
      mockAnswerFeedbackModel.getTopFlaggedSessions.mockResolvedValueOnce([])

      await feedbackService.getStats('tenant-1', '2026-01-01', '2026-03-31')

      // Verify date range passed to both queries
      expect(mockAnswerFeedbackModel.countBySource).toHaveBeenCalledWith('tenant-1', '2026-01-01', '2026-03-31')
      expect(mockAnswerFeedbackModel.getTopFlaggedSessions).toHaveBeenCalledWith('tenant-1', 10, '2026-01-01', '2026-03-31')
    })

    it('should run aggregate queries in parallel', async () => {
      // Both should be called (Promise.all)
      mockAnswerFeedbackModel.countBySource.mockResolvedValueOnce({ chat: 0, search: 0, agent: 0 })
      mockAnswerFeedbackModel.getTopFlaggedSessions.mockResolvedValueOnce([])

      await feedbackService.getStats('tenant-1')

      expect(mockAnswerFeedbackModel.countBySource).toHaveBeenCalledTimes(1)
      expect(mockAnswerFeedbackModel.getTopFlaggedSessions).toHaveBeenCalledTimes(1)
    })
  })

  describe('exportFeedback', () => {
    it('should return all matching records without pagination metadata', async () => {
      const mockRecords = [
        { id: '1', source: 'chat', thumbup: true },
        { id: '2', source: 'search', thumbup: false },
      ]
      mockAnswerFeedbackModel.findPaginated.mockResolvedValueOnce({
        data: mockRecords,
        total: 2,
      })

      const result = await feedbackService.exportFeedback({ tenantId: 'tenant-1' })

      // Should return just the data array, not the pagination wrapper
      expect(result).toEqual(mockRecords)
      expect(result).toHaveLength(2)
    })

    it('should use limit of 10000 for export', async () => {
      mockAnswerFeedbackModel.findPaginated.mockResolvedValueOnce({ data: [], total: 0 })

      await feedbackService.exportFeedback({ tenantId: 'tenant-1' })

      // Export uses page 1 with limit 10000
      expect(mockAnswerFeedbackModel.findPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 10000 })
      )
    })

    it('should pass filter options through to findPaginated', async () => {
      mockAnswerFeedbackModel.findPaginated.mockResolvedValueOnce({ data: [], total: 0 })

      await feedbackService.exportFeedback({
        source: 'agent',
        thumbup: false,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        tenantId: 'tenant-1',
      })

      expect(mockAnswerFeedbackModel.findPaginated).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'agent',
          thumbup: false,
          startDate: '2026-01-01',
          endDate: '2026-03-31',
        })
      )
    })
  })
})
