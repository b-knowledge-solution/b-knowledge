import { Router } from 'express';
import { LlmProviderController } from './llm-provider.controller.js';
import { requirePermission } from '@/shared/middleware/auth.middleware.js';

const router = Router();
const controller = new LlmProviderController();

// All LLM provider endpoints require admin permission
router.get('/', requirePermission('manage_model_providers'), controller.list.bind(controller));
router.get('/defaults', requirePermission('manage_model_providers'), controller.getDefaults.bind(controller));
router.get('/:id', requirePermission('manage_model_providers'), controller.getById.bind(controller));
router.post('/', requirePermission('manage_model_providers'), controller.create.bind(controller));
router.put('/:id', requirePermission('manage_model_providers'), controller.update.bind(controller));
router.delete('/:id', requirePermission('manage_model_providers'), controller.delete.bind(controller));

export default router;
