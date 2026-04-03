/**
 * @fileoverview Admin controller: surfaces lightweight stats for the admin dashboard.
 * Extend with additional metrics as needed; keeps DB/service calls minimal.
 */
import { Request, Response } from 'express'
import { userService } from '@/modules/users/index.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * @description Provides admin dashboard statistics and system overview metrics
 */
export class AdminController {
  /**
   * @description Gather and return aggregated dashboard statistics including user count
   * @param {Request} req - Express request object
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  async getDashboardStats(req: Request, res: Response): Promise<void> {
    try {
      // Gather placeholder dashboard stats
      const stats = {
        // Count total users
        userCount: (await userService.getAllUsers()).length,
        // Add other stats as needed
      };
      res.json(stats);
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to fetch dashboard stats', { error: String(error) });
      res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
  }
}
