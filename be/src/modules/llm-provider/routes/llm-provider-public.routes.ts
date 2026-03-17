/**
 * @fileoverview Public (non-admin) routes for listing available LLM providers.
 * Only exposes safe fields — no API keys or sensitive config.
 * Requires authentication but NOT manage_model_providers permission.
 * @module modules/llm-provider/routes/llm-provider-public
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '@/shared/middleware/auth.middleware.js'
import { llmProviderService } from '../services/llm-provider.service.js'

const router = Router()

// All routes require authentication
router.use(requireAuth)

/**
 * @description List active model providers filtered by model_type.
 * Returns only id, factory_name, model_type, model_name, max_tokens, is_default, vision.
 * @route GET /api/models?type=chat|embedding|rerank|tts|speech2text
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Extract optional model_type filter from query params
    const modelType = req.query.type as string | undefined
    const providers = await llmProviderService.listPublic(modelType)
    res.json(providers)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch model providers' })
  }
})

export default router
