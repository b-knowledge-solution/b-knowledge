/**
 * @fileoverview Feedback routes.
 * @description Defines endpoints for creating, listing, aggregating, and exporting answer feedback.
 *   Mounted under /api/feedback by the central route registration.
 * @module routes/feedback
 */
import { Router } from 'express'
import { FeedbackController } from '../controllers/feedback.controller.js'
import { requireAuth, requireRole, requirePermission } from '@/shared/middleware/auth.middleware.js'
import { requireTenant } from '@/shared/middleware/tenant.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import { createFeedbackSchema, listFeedbackQuerySchema, feedbackStatsQuerySchema } from '../schemas/feedback.schemas.js'

const router = Router()
const controller = new FeedbackController()

// ============================================================================
// GET routes (defined before POST to avoid path matching conflicts)
// ============================================================================

/**
 * @route GET /api/feedback/stats
 * @description Get aggregated feedback statistics (source breakdown, top flagged sessions).
 * @access Private (admin, leader)
 * @query startDate - Optional ISO date string for range start
 * @query endDate - Optional ISO date string for range end
 */
router.get(
  '/stats',
  requireAuth,
  requireTenant,
  requireRole('admin', 'leader'),
  validate({ query: feedbackStatsQuerySchema }),
  controller.stats.bind(controller)
)

/**
 * @route GET /api/feedback/export
 * @description Export feedback records as JSON array (max 10000 records).
 * @access Private (admin, leader)
 * @query source - Optional filter by source type (chat/search/agent)
 * @query thumbup - Optional filter by thumbup value (true/false)
 * @query startDate - Optional ISO date string for range start
 * @query endDate - Optional ISO date string for range end
 */
router.get(
  '/export',
  requireAuth,
  requireTenant,
  requireRole('admin', 'leader'),
  validate({ query: listFeedbackQuerySchema }),
  controller.export.bind(controller)
)

/**
 * @route GET /api/feedback
 * @description List feedback records with filters and pagination.
 * @access Private (admin, leader)
 * @query source - Optional filter by source type (chat/search/agent)
 * @query thumbup - Optional filter by thumbup value (true/false string)
 * @query startDate - Optional ISO date string for range start
 * @query endDate - Optional ISO date string for range end
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 20)
 */
router.get(
  '/',
  requireAuth,
  requireTenant,
  requireRole('admin', 'leader'),
  validate({ query: listFeedbackQuerySchema }),
  controller.list.bind(controller)
)

// ============================================================================
// POST routes
// ============================================================================

/**
 * @route POST /api/feedback
 * @description Create a new answer feedback record (chat, search, or agent).
 * @access Private (authenticated users)
 */
router.post(
  '/',
  requireAuth,
  requirePermission('feedback.submit'),
  validate(createFeedbackSchema),
  controller.create.bind(controller)
)

export default router
