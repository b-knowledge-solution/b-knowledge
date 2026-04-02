/**
 * @fileoverview Controller for agent embed widget HTTP endpoints.
 *
 * Handles embed token management (authenticated) and public widget
 * endpoints (token-based auth via URL parameter).
 *
 * @module modules/agents/controllers/agent-embed
 */
import { Request, Response } from 'express'
import { agentEmbedService } from '../services/agent-embed.service.js'
import { getTenantId } from '@/shared/middleware/tenant.middleware.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * @description Controller handling agent embed widget endpoints including
 *   token generation (authenticated), widget config retrieval, and
 *   SSE-streamed agent execution (token-based public access).
 */
class AgentEmbedController {
  /**
   * @description POST /agents/:id/embed-token — Generate an embed token for an agent.
   *   Requires authentication and tenant context.
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async getEmbedToken(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const userId = req.user?.id || ''
      const agentId = req.params['id']!
      const name = (req.body as Record<string, unknown>)?.name as string | undefined

      const result = await agentEmbedService.generateEmbedToken(agentId, tenantId, userId, name)
      res.status(201).json(result)
    } catch (error: any) {
      log.error('Failed to generate agent embed token', { error: String(error) })
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to generate embed token' })
    }
  }

  /**
   * @description GET /agents/embed/:token/:agentId/config — Get agent info for widget display.
   *   Public endpoint authenticated via embed token in URL.
   * @param {Request} req - Express request with :token and :agentId params
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const { token, agentId } = req.params as { token: string; agentId: string }
      const config = await agentEmbedService.getAgentConfig(agentId, token)
      res.json(config)
    } catch (error: any) {
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to get agent config' })
    }
  }

  /**
   * @description POST /agents/embed/:token/:agentId/run — Run agent from embed widget via SSE.
   *   Public endpoint authenticated via embed token in URL.
   *   Accepts { input } body and streams SSE response.
   * @param {Request} req - Express request with :token and :agentId params, { input } body
   * @param {Response} res - Express response for SSE streaming
   * @returns {Promise<void>}
   */
  async runEmbed(req: Request, res: Response): Promise<void> {
    try {
      const { token, agentId } = req.params as { token: string; agentId: string }
      const { input } = req.body as { input: string }

      await agentEmbedService.runFromEmbed(agentId, input, token, res)
    } catch (error: any) {
      log.error('Failed to run agent from embed', { error: String(error) })
      // If headers already sent (SSE started), we cannot change status
      if (!res.headersSent) {
        const status = error.statusCode || 500
        res.status(status).json({ error: error.message || 'Failed to run agent' })
      }
    }
  }

  /**
   * @description GET /agents/:id/embed-tokens — List embed tokens for an agent.
   *   Requires authentication and tenant context.
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listTokens(req: Request, res: Response): Promise<void> {
    try {
      const agentId = req.params['id']!
      const tokens = await agentEmbedService.listTokens(agentId)
      res.json(tokens)
    } catch (error: any) {
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to list embed tokens' })
    }
  }

  /**
   * @description DELETE /agents/embed-tokens/:tokenId — Revoke an embed token.
   *   Requires authentication.
   * @param {Request} req - Express request with :tokenId param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async revokeToken(req: Request, res: Response): Promise<void> {
    try {
      const tokenId = req.params['tokenId']!
      await agentEmbedService.revokeToken(tokenId)
      res.status(204).send()
    } catch (error: any) {
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to revoke embed token' })
    }
  }
}

/** @description Singleton controller instance */
export const agentEmbedController = new AgentEmbedController()
