/**
 * @fileoverview Routes for API key CRUD operations.
 *   All routes require session-based authentication.
 *   Mounted at /api/external/api-keys.
 * @module routes/api-key
 */

import { Router } from 'express'
import { requireAuth } from '@/shared/middleware/auth.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import { apiKeyController } from '../controllers/api-key.controller.js'
import {
  createApiKeySchema,
  updateApiKeySchema,
  uuidParamSchema,
} from '../schemas/external.schemas.js'

const router = Router()

/**
 * POST /api/external/api-keys
 * @description Create a new API key for the authenticated user
 */
router.post(
  '/',
  requireAuth,
  validate({ body: createApiKeySchema }),
  apiKeyController.create.bind(apiKeyController)
)

/**
 * GET /api/external/api-keys
 * @description List all API keys for the authenticated user
 */
router.get(
  '/',
  requireAuth,
  apiKeyController.list.bind(apiKeyController)
)

/**
 * PATCH /api/external/api-keys/:id
 * @description Update an API key (name, scopes, active status)
 */
router.patch(
  '/:id',
  requireAuth,
  validate({ params: uuidParamSchema, body: updateApiKeySchema }),
  apiKeyController.update.bind(apiKeyController)
)

/**
 * DELETE /api/external/api-keys/:id
 * @description Permanently delete an API key
 */
router.delete(
  '/:id',
  requireAuth,
  validate({ params: uuidParamSchema }),
  apiKeyController.remove.bind(apiKeyController)
)

export default router
