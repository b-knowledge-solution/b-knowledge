import { Router } from 'express';
import { LlmProviderController } from '../controllers/llm-provider.controller.js';
import { requirePermission } from '@/shared/middleware/auth.middleware.js';
import { validate } from '@/shared/middleware/validate.middleware.js';
import { createProviderSchema, updateProviderSchema, uuidParamSchema } from '../schemas/llm-provider.schemas.js';

const router = Router();
const controller = new LlmProviderController();

// All LLM provider endpoints require admin permission
router.get('/', requirePermission('manage_model_providers'), controller.list.bind(controller));
router.get('/defaults', requirePermission('manage_model_providers'), controller.getDefaults.bind(controller));
router.get('/:id', requirePermission('manage_model_providers'), controller.getById.bind(controller));
router.post('/', requirePermission('manage_model_providers'), validate(createProviderSchema), controller.create.bind(controller));
router.put('/:id', requirePermission('manage_model_providers'), validate({ params: uuidParamSchema, body: updateProviderSchema }), controller.update.bind(controller));
router.delete('/:id', requirePermission('manage_model_providers'), controller.delete.bind(controller));

export default router;
