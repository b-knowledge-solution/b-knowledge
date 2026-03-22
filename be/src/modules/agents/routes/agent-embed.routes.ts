/**
 * @fileoverview Agent embed widget routes.
 * Public endpoints use embed token in URL path for authentication (no session required).
 * Follows the chat-embed.routes.ts pattern.
 *
 * @module modules/agents/routes/agent-embed
 */
import { Router } from 'express'
import { agentEmbedController } from '../controllers/agent-embed.controller.js'

const router = Router()

// ============================================================================
// Public embed endpoints (token-based auth via URL parameter)
// ============================================================================

/**
 * @route GET /api/agents/embed/:token/:agentId/config
 * @description Get agent info for embed widget display.
 * @access Public (embed token in URL)
 */
router.get(
  '/:token/:agentId/config',
  agentEmbedController.getConfig.bind(agentEmbedController),
)

/**
 * @route POST /api/agents/embed/:token/:agentId/run
 * @description Stream an agent run via SSE for embed widget.
 * @access Public (embed token in URL)
 */
router.post(
  '/:token/:agentId/run',
  agentEmbedController.runEmbed.bind(agentEmbedController),
)

export default router
