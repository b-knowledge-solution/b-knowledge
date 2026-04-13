
/**
 * @fileoverview OpenAI-compatible search API routes.
 *
 * Provides an endpoint matching the OpenAI chat completion format but
 * routed to the search pipeline:
 * - POST /api/v1/search/completions — Search completion (streaming or non-streaming)
 *
 * Auth is via Bearer token (API key from search_embed_tokens), not session auth.
 *
 * @module routes/search-openai
 */

import { Router } from 'express'
import { searchOpenaiController } from '../controllers/search-openai.controller.js'
import { markPublicRoute } from '@/shared/middleware/markPublicRoute.js'

const router = Router()

/**
 * @route POST /api/v1/search/completions
 * @description OpenAI-compatible search completion endpoint.
 * @access Bearer token auth (search embed token)
 */
router.post(
  '/search/completions',
  // OpenAI-compatible endpoint: auth via Bearer API key (search_embed_tokens table),
  // not session. Controller extracts/validates the token; no session permission applies.
  markPublicRoute(),
  searchOpenaiController.completion.bind(searchOpenaiController)
)

export default router
