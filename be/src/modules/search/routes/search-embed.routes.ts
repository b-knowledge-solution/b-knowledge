/**
 * @fileoverview Search embed routes.
 * Defines endpoints for embed token management (admin) and
 * public token-based search endpoints for embedded widgets.
 *
 * @module routes/search-embed
 */
import { Router } from 'express'
import { SearchEmbedController } from '../controllers/search-embed.controller.js'
import { requireAuth, requirePermission } from '@/shared/middleware/auth.middleware.js'
import { markPublicRoute } from '@/shared/middleware/markPublicRoute.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import {
  createEmbedTokenSchema,
  embedAppIdParamSchema,
  embedTokenIdParamSchema,
  embedTokenParamSchema,
  embedAskSchema,
  embedSearchSchema,
  embedRelatedQuestionsSchema,
  embedMindmapSchema,
} from '../schemas/search-embed.schemas.js'

const router = Router()
const controller = new SearchEmbedController()

// ============================================================================
// Admin Token Management (requires authentication + search_apps.embed permission)
// ============================================================================

/**
 * @route POST /api/search/apps/:id/embed-tokens
 * @description Create a new embed token for a search app.
 * @access Admin only (search_apps.embed permission)
 */
router.post(
  '/apps/:id/embed-tokens',
  requireAuth,
  requirePermission('search_apps.embed'),
  validate({ body: createEmbedTokenSchema, params: embedAppIdParamSchema }),
  controller.createToken.bind(controller)
)

/**
 * @route GET /api/search/apps/:id/embed-tokens
 * @description List all embed tokens for a search app.
 * @access Admin only (search_apps.embed permission)
 */
router.get(
  '/apps/:id/embed-tokens',
  requireAuth,
  requirePermission('search_apps.embed'),
  validate({ params: embedAppIdParamSchema }),
  controller.listTokens.bind(controller)
)

/**
 * @route DELETE /api/search/embed-tokens/:tokenId
 * @description Revoke (delete) an embed token.
 * @access Admin only (search_apps.embed permission)
 */
router.delete(
  '/embed-tokens/:tokenId',
  requireAuth,
  requirePermission('search_apps.embed'),
  validate({ params: embedTokenIdParamSchema }),
  controller.revokeToken.bind(controller)
)

// ============================================================================
// Public Embed Endpoints (token-based auth, no session required)
// ============================================================================

/**
 * @route GET /api/search/embed/:token/info
 * @description Get public search app info (name, description) for a token.
 * @access Public (token-based)
 */
router.get(
  '/embed/:token/info',
  validate({ params: embedTokenParamSchema }),
  controller.getInfo.bind(controller)
)

/**
 * @route GET /api/search/embed/:token/config
 * @description Get public search app config (name, description, avatar, empty_response, filtered search_config).
 * @access Public (token-based)
 */
router.get(
  '/embed/:token/config',
  validate({ params: embedTokenParamSchema }),
  controller.getConfig.bind(controller)
)

/**
 * @route POST /api/search/embed/:token/search
 * @description Execute a non-streaming search query using a token.
 * @access Public (token-based)
 */
router.post(
  '/embed/:token/search',
  // Public embed endpoint: auth via signed embed token in the URL path, not session.
  // The controller resolves the token and enforces its allow-list; no user permission applies.
  markPublicRoute(),
  validate({ body: embedSearchSchema.shape.body, params: embedSearchSchema.shape.params }),
  controller.executeSearch.bind(controller)
)

/**
 * @route POST /api/search/embed/:token/ask
 * @description Stream an AI-generated search answer via SSE using a token.
 * @access Public (token-based)
 */
router.post(
  '/embed/:token/ask',
  // Public embed endpoint: auth via signed embed token in the URL path, not session.
  markPublicRoute(),
  validate({ body: embedAskSchema, params: embedTokenParamSchema }),
  controller.askSearch.bind(controller)
)

/**
 * @route POST /api/search/embed/:token/related-questions
 * @description Generate related questions from a user query using a token.
 * @access Public (token-based)
 */
router.post(
  '/embed/:token/related-questions',
  // Public embed endpoint: auth via signed embed token in the URL path, not session.
  markPublicRoute(),
  validate({ body: embedRelatedQuestionsSchema.shape.body, params: embedRelatedQuestionsSchema.shape.params }),
  controller.relatedQuestions.bind(controller)
)

/**
 * @route POST /api/search/embed/:token/mindmap
 * @description Generate a mind map JSON tree from search results using a token.
 * @access Public (token-based)
 */
router.post(
  '/embed/:token/mindmap',
  // Public embed endpoint: auth via signed embed token in the URL path, not session.
  markPublicRoute(),
  validate({ body: embedMindmapSchema.shape.body, params: embedMindmapSchema.shape.params }),
  controller.mindmap.bind(controller)
)

export default router
