
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

const router = Router()

/**
 * @route POST /api/v1/search/completions
 * @description OpenAI-compatible search completion endpoint.
 * @access Bearer token auth (search embed token)
 */
router.post(
  '/search/completions',
  searchOpenaiController.completion.bind(searchOpenaiController)
)

export default router
