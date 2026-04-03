
/**
 * @fileoverview OpenAI-compatible chat API routes.
 *
 * Provides endpoints matching the OpenAI API format:
 * - POST /api/v1/chat/completions — Chat completion (streaming or non-streaming)
 * - GET  /api/v1/models            — List available models
 *
 * Auth is via Bearer token (API key from chat_embed_tokens), not session auth.
 *
 * @module routes/chat-openai
 */

import { Router } from 'express'
import { chatOpenaiController } from '../controllers/chat-openai.controller.js'

const router = Router()

/**
 * @route POST /api/v1/chat/completions
 * @description OpenAI-compatible chat completion endpoint.
 * @access Bearer token auth (chat embed token)
 */
router.post(
  '/chat/completions',
  chatOpenaiController.chatCompletion.bind(chatOpenaiController)
)

/**
 * @route GET /api/v1/models
 * @description List available models in OpenAI format.
 * @access Public
 */
router.get(
  '/models',
  chatOpenaiController.listModels.bind(chatOpenaiController)
)

export default router
