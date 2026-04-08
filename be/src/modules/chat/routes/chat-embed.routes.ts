
/**
 * @fileoverview Chat embed routes.
 * Defines endpoints for embed token management (admin) and
 * public embed widget access (token-based auth).
 *
 * @module routes/chat-embed
 */
import { Router } from 'express'
import { ChatEmbedController } from '../controllers/chat-embed.controller.js'
import { requireAuth, requirePermission } from '@/shared/middleware/auth.middleware.js'
import { markPublicRoute } from '@/shared/middleware/markPublicRoute.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import {
  createEmbedTokenSchema,
  embedDialogIdParamSchema,
  embedTokenIdParamSchema,
  embedTokenParamSchema,
  embedCompletionSchema,
  embedCreateSessionSchema,
} from '../schemas/chat-embed.schemas.js'

const router = Router()
const controller = new ChatEmbedController()

// ============================================================================
// Admin endpoints (authenticated + manage_users permission)
// ============================================================================

/**
 * @route POST /api/chat/dialogs/:id/embed-tokens
 * @description Create a new embed token for a dialog.
 * @access Admin only (manage_users permission)
 */
router.post(
  '/dialogs/:id/embed-tokens',
  requireAuth,
  requirePermission('manage_users'),
  validate({ body: createEmbedTokenSchema, params: embedDialogIdParamSchema }),
  controller.createToken.bind(controller)
)

/**
 * @route GET /api/chat/dialogs/:id/embed-tokens
 * @description List all embed tokens for a dialog.
 * @access Admin only (manage_users permission)
 */
router.get(
  '/dialogs/:id/embed-tokens',
  requireAuth,
  requirePermission('manage_users'),
  validate({ params: embedDialogIdParamSchema }),
  controller.listTokens.bind(controller)
)

/**
 * @route DELETE /api/chat/embed-tokens/:tokenId
 * @description Revoke (delete) an embed token.
 * @access Admin only (manage_users permission)
 */
router.delete(
  '/embed-tokens/:tokenId',
  requireAuth,
  requirePermission('manage_users'),
  validate({ params: embedTokenIdParamSchema }),
  controller.revokeToken.bind(controller)
)

// ============================================================================
// Public embed endpoints (API key auth via token in URL)
// ============================================================================

/**
 * @route GET /api/chat/embed/:token/info
 * @description Get dialog info for embed widget display.
 * @access Public (token-based)
 */
router.get(
  '/embed/:token/info',
  validate({ params: embedTokenParamSchema }),
  controller.getInfo.bind(controller)
)

/**
 * @route POST /api/chat/embed/:token/sessions
 * @description Create an anonymous session for embed widget.
 * @access Public (token-based)
 */
// Public embed session creation — authenticated by the opaque `:token` path
// parameter (validated against `chat_embed_tokens` by the controller). No
// session/user auth applies here; anonymous visitors to an embed widget use
// this endpoint. Marked public so the route-sweep gate recognizes the intent.
router.post(
  '/embed/:token/sessions',
  markPublicRoute(),
  validate({ body: embedCreateSessionSchema, params: embedTokenParamSchema }),
  controller.createSession.bind(controller)
)

/**
 * @route POST /api/chat/embed/:token/completions
 * @description Stream a chat completion via SSE for embed widget.
 * @access Public (token-based)
 */
// Public embed completion stream — authenticated by the opaque `:token` path
// parameter (validated against `chat_embed_tokens` by the controller). This is
// the anonymous widget-visitor streaming endpoint; no session/user auth is
// possible. Marked public so the route-sweep gate recognizes the intent.
router.post(
  '/embed/:token/completions',
  markPublicRoute(),
  validate({ body: embedCompletionSchema, params: embedTokenParamSchema }),
  controller.streamCompletion.bind(controller)
)

export default router
