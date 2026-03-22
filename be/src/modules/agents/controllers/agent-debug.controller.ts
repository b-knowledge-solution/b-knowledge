/**
 * @fileoverview Controller for agent debug mode HTTP endpoints.
 *
 * Provides REST handlers for starting debug runs, stepping through nodes,
 * continuing execution, managing breakpoints, and inspecting step details.
 * All endpoints require authentication and tenant context.
 *
 * @module modules/agents/controllers/agent-debug
 */

import { Request, Response } from 'express'
import { agentDebugService } from '../services/agent-debug.service.js'
import { getTenantId } from '@/shared/middleware/tenant.middleware.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * @description Controller handling agent debug mode HTTP endpoints including
 *   starting debug runs, stepping, continuing, breakpoint management, and step inspection.
 */
class AgentDebugController {
  /**
   * @description POST /agents/:id/debug — Start a debug run for an agent.
   *   Creates a run record, computes execution order, and pauses before the first node.
   *   Returns the run_id for subsequent debug control calls.
   * @param {Request} req - Express request with :id param and { input } body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async startDebug(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const userId = (req.session as any)?.user?.id || ''
      const agentId = req.params['id']!
      const { input } = req.body as { input: string }

      // Validate input is provided
      if (!input || typeof input !== 'string') {
        res.status(400).json({ error: 'Input text is required' })
        return
      }

      const runId = await agentDebugService.startDebugRun(agentId, input, tenantId, userId)
      res.status(201).json({ run_id: runId })
    } catch (error: any) {
      log.error('Failed to start debug run', { error: String(error) })
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to start debug run' })
    }
  }

  /**
   * @description POST /agents/:id/debug/:runId/step — Execute the next node in the debug run.
   *   Advances execution by one node and returns when the step completes.
   * @param {Request} req - Express request with :id and :runId params
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async stepNext(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.session as any)?.user?.id || ''
      const runId = req.params['runId']!

      await agentDebugService.stepNext(runId, userId)
      res.json({ ok: true })
    } catch (error: any) {
      log.error('Failed to step debug run', { error: String(error) })
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to step' })
    }
  }

  /**
   * @description POST /agents/:id/debug/:runId/continue — Continue executing all remaining nodes.
   *   Runs until completion or until a breakpoint is hit.
   * @param {Request} req - Express request with :id and :runId params
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async continueDebug(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.session as any)?.user?.id || ''
      const runId = req.params['runId']!

      await agentDebugService.continueRun(runId, userId)
      res.json({ ok: true })
    } catch (error: any) {
      log.error('Failed to continue debug run', { error: String(error) })
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to continue' })
    }
  }

  /**
   * @description POST /agents/:id/debug/:runId/breakpoint — Add a breakpoint on a node.
   *   Execution will pause before this node during continueRun calls.
   * @param {Request} req - Express request with :runId param and { node_id } body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async setBreakpoint(req: Request, res: Response): Promise<void> {
    try {
      const runId = req.params['runId']!
      const { node_id } = req.body as { node_id: string }

      // Validate node_id is provided
      if (!node_id || typeof node_id !== 'string') {
        res.status(400).json({ error: 'node_id is required' })
        return
      }

      agentDebugService.setBreakpoint(runId, node_id)
      res.json({ ok: true })
    } catch (error: any) {
      log.error('Failed to set breakpoint', { error: String(error) })
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to set breakpoint' })
    }
  }

  /**
   * @description DELETE /agents/:id/debug/:runId/breakpoint/:nodeId — Remove a breakpoint from a node.
   * @param {Request} req - Express request with :runId and :nodeId params
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async removeBreakpoint(req: Request, res: Response): Promise<void> {
    try {
      const runId = req.params['runId']!
      const nodeId = req.params['nodeId']!

      agentDebugService.removeBreakpoint(runId, nodeId)
      res.json({ ok: true })
    } catch (error: any) {
      log.error('Failed to remove breakpoint', { error: String(error) })
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to remove breakpoint' })
    }
  }

  /**
   * @description GET /agents/:id/debug/:runId/steps/:nodeId — Get step details for a specific node.
   *   Returns the full step record including input/output data for inspection.
   * @param {Request} req - Express request with :runId and :nodeId params
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async getStepDetails(req: Request, res: Response): Promise<void> {
    try {
      const runId = req.params['runId']!
      const nodeId = req.params['nodeId']!

      const step = await agentDebugService.getStepDetails(runId, nodeId)
      res.json(step)
    } catch (error: any) {
      log.error('Failed to get step details', { error: String(error) })
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to get step details' })
    }
  }
}

/** @description Singleton controller instance for agent debug endpoints */
export const agentDebugController = new AgentDebugController()
