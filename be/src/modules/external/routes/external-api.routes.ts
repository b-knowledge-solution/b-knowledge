/**
 * @fileoverview Routes for the external evaluation API.
 *   All routes require Bearer API key authentication.
 *   Mounted at /api/v1/external/.
 * @module routes/external-api
 */

import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireApiKey, requireScope } from '@/shared/middleware/external-auth.middleware.js'
import { markPublicRoute } from '@/shared/middleware/markPublicRoute.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import { externalApiController } from '../controllers/external-api.controller.js'
import {
  externalChatSchema,
  externalSearchSchema,
  externalRetrievalSchema,
} from '../schemas/external.schemas.js'

const router = Router()

/**
 * @description Rate limiter for external API endpoints: 100 requests per minute per IP.
 *   More permissive than auth endpoints but stricter than general API to prevent abuse.
 */
const externalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Rate limit exceeded. Maximum 100 requests per minute.',
      type: 'rate_limit_error',
    },
  },
})

// Apply rate limiting and API key auth to all external routes
router.use(externalApiLimiter)
router.use(requireApiKey)

/**
 * POST /api/v1/external/chat
 * @description Full RAG chat with structured response for evaluation
 */
router.post(
  '/chat',
  // markPublicRoute: this surface is gated by Bearer API-key auth (requireApiKey)
  // and per-key scope checks, not session permissions. The external.permissions
  // catalog explicitly excludes these endpoints — see external.permissions.ts.
  markPublicRoute(),
  requireScope('chat'),
  validate({ body: externalChatSchema }),
  externalApiController.chat.bind(externalApiController)
)

/**
 * POST /api/v1/external/search
 * @description Search with AI summary and structured response for evaluation
 */
router.post(
  '/search',
  // markPublicRoute: API-key auth surface, see /chat above for rationale.
  markPublicRoute(),
  requireScope('search'),
  validate({ body: externalSearchSchema }),
  externalApiController.search.bind(externalApiController)
)

/**
 * POST /api/v1/external/retrieval
 * @description Retrieval-only endpoint (no LLM generation) for context evaluation
 */
router.post(
  '/retrieval',
  // markPublicRoute: API-key auth surface, see /chat above for rationale.
  markPublicRoute(),
  requireScope('retrieval'),
  validate({ body: externalRetrievalSchema }),
  externalApiController.retrieval.bind(externalApiController)
)

export default router
