/**
 * @fileoverview Feedback controller.
 * @description Handles HTTP requests for creating, listing, aggregating, and exporting answer feedback.
 * @module controllers/feedback
 */
import { Request, Response } from 'express'
import { log } from '@/shared/services/logger.service.js'
import { getTenantId } from '@/shared/middleware/tenant.middleware.js'
import { feedbackService } from '../services/feedback.service.js'

/**
 * @description Controller class for feedback endpoints.
 * Handles creation, listing, stats, and export of feedback records.
 */
export class FeedbackController {
  /**
   * @description Create a new feedback record.
   * Extracts userId and tenantId from the authenticated request.
   * @param {Request} req - Express request with feedback data in body
   * @param {Response} res - Express response
   * @returns {Promise<void>} 201 with created feedback record
   */
  async create(req: Request, res: Response): Promise<void> {
    try {
      // Guard: ensure authenticated user context
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Extract tenant_id from authenticated request context
      const tenantId = getTenantId(req)
      if (!tenantId) {
        res.status(403).json({ error: 'No organization selected' })
        return
      }

      const { source, source_id, message_id, thumbup, comment, query, answer, chunks_used, trace_id } = req.body

      // Create feedback record with user and tenant context
      const feedback = await feedbackService.createFeedback({
        source,
        source_id,
        message_id: message_id || null,
        user_id: userId,
        thumbup,
        comment: comment || null,
        query,
        answer,
        chunks_used: chunks_used || null,
        trace_id: trace_id || null,
        tenant_id: tenantId,
      })

      res.status(201).json(feedback)
    } catch (error) {
      log.error('Error creating feedback', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description List feedback records with filters and pagination for admin view.
   * Parses query parameters for source, thumbup, date range, page, and limit.
   * @param {Request} req - Express request with filter query params
   * @param {Response} res - Express response
   * @returns {Promise<void>} 200 with paginated feedback data
   */
  async list(req: Request, res: Response): Promise<void> {
    try {
      // Guard: ensure authenticated user context
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Extract tenant_id from authenticated request context
      const tenantId = getTenantId(req)
      if (!tenantId) {
        res.status(403).json({ error: 'No organization selected' })
        return
      }

      // Query params are already parsed/transformed by validate middleware
      const { source, thumbup, startDate, endDate, page, limit } = req.query as any

      const result = await feedbackService.listFeedback({
        source,
        thumbup,
        startDate,
        endDate,
        tenantId,
        page: page || 1,
        limit: limit || 20,
      })

      res.json({
        data: result.data,
        total: result.total,
        page: page || 1,
        limit: limit || 20,
      })
    } catch (error) {
      log.error('Error listing feedback', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Get aggregated feedback statistics for admin analytics.
   * Returns source breakdown counts and top flagged sessions.
   * @param {Request} req - Express request with optional date range query params
   * @param {Response} res - Express response
   * @returns {Promise<void>} 200 with feedback stats
   */
  async stats(req: Request, res: Response): Promise<void> {
    try {
      // Guard: ensure authenticated user context
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Extract tenant_id from authenticated request context
      const tenantId = getTenantId(req)
      if (!tenantId) {
        res.status(403).json({ error: 'No organization selected' })
        return
      }

      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string }

      const stats = await feedbackService.getStats(tenantId, startDate, endDate)

      res.json(stats)
    } catch (error) {
      log.error('Error getting feedback stats', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Export feedback records as JSON array for CSV conversion on frontend.
   * Returns all matching records (capped at 10000) without pagination.
   * @param {Request} req - Express request with optional filter query params
   * @param {Response} res - Express response
   * @returns {Promise<void>} 200 with feedback records array
   */
  async export(req: Request, res: Response): Promise<void> {
    try {
      // Guard: ensure authenticated user context
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Extract tenant_id from authenticated request context
      const tenantId = getTenantId(req)
      if (!tenantId) {
        res.status(403).json({ error: 'No organization selected' })
        return
      }

      const { source, thumbup, startDate, endDate } = req.query as any

      const data = await feedbackService.exportFeedback({
        source,
        thumbup,
        startDate,
        endDate,
        tenantId,
      })

      res.json(data)
    } catch (error) {
      log.error('Error exporting feedback', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
