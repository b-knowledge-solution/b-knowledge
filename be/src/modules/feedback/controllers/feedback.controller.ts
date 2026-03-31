/**
 * @fileoverview Feedback controller.
 * @description Handles HTTP requests for creating and querying answer feedback.
 * @module controllers/feedback
 */
import { Request, Response } from 'express'
import { config } from '@/shared/config/index.js'
import { log } from '@/shared/services/logger.service.js'
import { feedbackService } from '../services/feedback.service.js'

/**
 * @description Controller class for feedback endpoints.
 * Handles creation of feedback records via the generic /api/feedback route.
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

      // Extract tenant_id from user context (defaults to system tenant)
      const tenantId = (req.user as any)?.tenant_id || config.opensearch.systemTenantId

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
}
