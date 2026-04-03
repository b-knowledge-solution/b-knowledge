/**
 * System tools controller: lists tools, reports health, and executes tools by id for operators.
 */
import { Request, Response } from 'express'
import { systemToolsService } from '@/modules/system-tools/system-tools.service.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * @description Controller for listing, health-checking, and executing system maintenance tools
 */
export class SystemToolsController {
  /**
   * @description Get list of available and enabled system tools
   * @param {Request} req - Express request object
   * @param {Response} res - Express response with tools array and count
   * @returns {Promise<void>}
   */
  async getTools(req: Request, res: Response): Promise<void> {
    try {
      // Fetch tools from service
      const tools = await systemToolsService.getTools();
      res.json({ tools, count: tools.length });
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to fetch system tools', { error: String(error) });
      res.status(500).json({ error: 'Failed to fetch system tools' });
    }
  }

  /**
   * @description Get system health status including DB, Redis, and Langfuse connectivity
   * @param {Request} req - Express request object
   * @param {Response} res - Express response with health status
   * @returns {Promise<void>}
   */
  async getHealth(req: Request, res: Response): Promise<void> {
    try {
      // Fetch health stats from service
      const health = await systemToolsService.getSystemHealth();
      res.json(health);
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to fetch system health', { error: String(error) });
      res.status(500).json({ error: 'Failed to fetch system health' });
    }
  }

  /**
   * @description Execute a specific system tool by ID with provided parameters
   * @param {Request} req - Express request with tool ID param and execution params in body
   * @param {Response} res - Express response with execution result
   * @returns {Promise<void>}
   */
  async runTool(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    // Validate tool ID
    if (!id) {
      res.status(400).json({ error: 'Tool ID is required' });
      return;
    }
    try {
      // Execute tool via service
      const result = await systemToolsService.runTool(id, req.body);
      res.json(result);
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to run system tool', { error: String(error) });
      res.status(500).json({ error: 'Failed to run system tool' });
    }
  }
}
