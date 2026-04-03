
/**
 * Dashboard Controller
 * Handles admin requests for activity dashboard statistics and analytics.
 * @module controllers/dashboard
 */
import { Request, Response } from 'express'
import { log } from '@/shared/services/logger.service.js'
import { config } from '@/shared/config/index.js'
import { dashboardService } from '@/modules/dashboard/dashboard.service.js'
import { getTenantId } from '@/shared/middleware/tenant.middleware.js'

/**
 * @description Exposes endpoints for dashboard statistics, query analytics, and feedback analytics
 */
export class DashboardController {
  /**
   * @description Get dashboard statistics with optional date range filtering
   * @param {Request} req - Express request with optional startDate/endDate query params
   * @param {Response} res - Express response returning DashboardStats JSON
   * @returns {Promise<void>}
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      // Parse optional date range from query parameters
      const startDate = req.query.startDate as string || undefined
      const endDate = req.query.endDate as string || undefined

      // Fetch aggregated stats from service
      const stats = await dashboardService.getStats(startDate, endDate)
      res.json(stats)
    } catch (error) {
      // Log error details and return 500 status
      log.error('Error fetching dashboard stats', error as Record<string, unknown>)
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Get query analytics metrics (volume, latency, quality) scoped to the user's tenant.
   *   Requires admin/super-admin role and tenant context.
   * @param {Request} req - Express request with optional startDate/endDate query params
   * @param {Response} res - Express response returning QueryAnalytics JSON
   * @returns {Promise<void>}
   */
  async getQueryAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req)
      if (!tenantId) {
        res.status(403).json({ error: 'No organization selected' })
        return
      }

      // Parse optional date range from query parameters
      const startDate = req.query.startDate as string || undefined
      const endDate = req.query.endDate as string || undefined

      // Fetch tenant-scoped query analytics
      const analytics = await dashboardService.getQueryAnalytics(tenantId, startDate, endDate)
      res.json(analytics)
    } catch (error) {
      log.error('Error fetching query analytics', error as Record<string, unknown>)
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Get feedback analytics metrics (satisfaction, worst datasets, negative entries)
   *   scoped to the user's tenant. Includes Langfuse base URL for frontend deep-link construction.
   * @param {Request} req - Express request with optional startDate/endDate query params
   * @param {Response} res - Express response returning FeedbackAnalytics JSON with langfuseBaseUrl
   * @returns {Promise<void>}
   */
  async getFeedbackAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req)
      if (!tenantId) {
        res.status(403).json({ error: 'No organization selected' })
        return
      }

      // Parse optional date range from query parameters
      const startDate = req.query.startDate as string || undefined
      const endDate = req.query.endDate as string || undefined

      // Fetch tenant-scoped feedback analytics
      const analytics = await dashboardService.getFeedbackAnalytics(tenantId, startDate, endDate)

      // Include Langfuse base URL for frontend to construct trace deep-links
      res.json({
        ...analytics,
        langfuseBaseUrl: config.langfuse.baseUrl.replace(/\/$/, ''),
      })
    } catch (error) {
      log.error('Error fetching feedback analytics', error as Record<string, unknown>)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
