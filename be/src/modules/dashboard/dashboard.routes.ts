
/**
 * Dashboard Routes
 * Admin-only endpoints for activity dashboard statistics and analytics.
 * @module routes/dashboard
 */
import { Router } from 'express'
import { DashboardController } from '@/modules/dashboard/dashboard.controller.js'
import { requireAuth, requireRole } from '@/shared/middleware/auth.middleware.js'
import { requireTenant } from '@/shared/middleware/tenant.middleware.js'

const router = Router()
const controller = new DashboardController()

/**
 * @route GET /api/admin/dashboard/stats
 * @description Retrieve aggregated dashboard statistics (sessions, messages, trends, top users).
 * @access Private (Admin, Leader)
 * @query startDate - Optional ISO date string for range start
 * @query endDate - Optional ISO date string for range end
 */
router.get(
  '/stats',
  requireAuth,
  requireRole('admin', 'leader'),
  controller.getStats.bind(controller)
)

/**
 * @route GET /api/admin/dashboard/analytics/queries
 * @description Retrieve query analytics metrics (volume, latency, quality, trends).
 * @access Private (Admin, Super-Admin)
 * @query startDate - Optional ISO date string for range start
 * @query endDate - Optional ISO date string for range end
 */
router.get(
  '/analytics/queries',
  requireAuth,
  requireTenant,
  requireRole('admin', 'super-admin'),
  controller.getQueryAnalytics.bind(controller)
)

/**
 * @route GET /api/admin/dashboard/analytics/feedback
 * @description Retrieve feedback analytics metrics (satisfaction, worst datasets, negative entries).
 * @access Private (Admin, Super-Admin)
 * @query startDate - Optional ISO date string for range start
 * @query endDate - Optional ISO date string for range end
 */
router.get(
  '/analytics/feedback',
  requireAuth,
  requireTenant,
  requireRole('admin', 'super-admin'),
  controller.getFeedbackAnalytics.bind(controller)
)

export default router
