/**
 * @fileoverview API routes for LLM provider management.
 * All endpoints require registry-backed `llm_providers.*` permissions.
 * @module modules/llm-provider/routes
 */
import { Router } from 'express';
import { LlmProviderController } from '../controllers/llm-provider.controller.js';
import { requirePermission } from '@/shared/middleware/auth.middleware.js';
import { validate } from '@/shared/middleware/validate.middleware.js';
import { createProviderSchema, updateProviderSchema, uuidParamSchema } from '../schemas/llm-provider.schemas.js';

const router = Router();
const controller = new LlmProviderController();

// All LLM provider endpoints use registry-backed llm_providers.* keys.

/** @route GET /api/llm-providers - List all active providers */
router.get('/', requirePermission('llm_providers.view'), controller.list.bind(controller));

/** @route GET /api/llm-providers/defaults - Get default providers per model type */
router.get('/defaults', requirePermission('llm_providers.view'), controller.getDefaults.bind(controller));

/** @route GET /api/llm-providers/presets - Get factory preset configurations */
router.get('/presets', requirePermission('llm_providers.view'), controller.getPresets.bind(controller));

/** @route GET /api/llm-providers/:id - Get provider by ID */
router.get('/:id', requirePermission('llm_providers.view'), controller.getById.bind(controller));

/** @route POST /api/llm-providers - Create a new provider */
router.post('/', requirePermission('llm_providers.create'), validate(createProviderSchema), controller.create.bind(controller));

/** @route PUT /api/llm-providers/:id - Update an existing provider */
router.put('/:id', requirePermission('llm_providers.edit'), validate({ params: uuidParamSchema, body: updateProviderSchema }), controller.update.bind(controller));

/** @route DELETE /api/llm-providers/:id - Soft-delete a provider */
router.delete('/:id', requirePermission('llm_providers.delete'), controller.delete.bind(controller));

/** @route POST /api/llm-providers/:id/test-connection - Test provider connectivity */
router.post('/:id/test-connection', requirePermission('llm_providers.test'), controller.testConnection.bind(controller));

export default router;
