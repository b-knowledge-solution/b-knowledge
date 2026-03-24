
/**
 * @fileoverview Chat assistant routes.
 * Defines endpoints for assistant (chat configuration) CRUD
 * and RBAC access control management.
 *
 * @module routes/chat-assistant
 */
import { Router } from 'express'
import { ChatAssistantController } from '../controllers/chat-assistant.controller.js'
import { requireAuth, requirePermission, checkSession } from '@/shared/middleware/auth.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import {
  createAssistantSchema,
  updateAssistantSchema,
  assistantIdParamSchema,
  assistantAccessSchema,
  listAssistantsQuerySchema,
} from '../schemas/chat-assistant.schemas.js'

const router = Router()
const controller = new ChatAssistantController()

/**
 * @route POST /api/chat/assistants
 * @description Create a new assistant configuration.
 * @access Admin only (manage_users permission)
 */
router.post(
  '/assistants',
  requireAuth,
  requirePermission('manage_users'),
  validate(createAssistantSchema),
  controller.createAssistant.bind(controller)
)

/**
 * @route GET /api/chat/assistants/:id
 * @description Get an assistant by ID.
 * @access Private
 */
router.get(
  '/assistants/:id',
  checkSession,
  validate({ params: assistantIdParamSchema }),
  controller.getAssistant.bind(controller)
)

/**
 * @route GET /api/chat/assistants
 * @description List all accessible assistants (RBAC-filtered) with pagination and search.
 * @access Private
 */
router.get(
  '/assistants',
  checkSession,
  validate({ query: listAssistantsQuerySchema }),
  controller.listAssistants.bind(controller)
)

/**
 * @route PUT /api/chat/assistants/:id
 * @description Update an existing assistant.
 * @access Admin only (manage_users permission)
 */
router.put(
  '/assistants/:id',
  requireAuth,
  requirePermission('manage_users'),
  validate({ body: updateAssistantSchema, params: assistantIdParamSchema }),
  controller.updateAssistant.bind(controller)
)

/**
 * @route DELETE /api/chat/assistants/:id
 * @description Delete an assistant by ID.
 * @access Admin only (manage_users permission)
 */
router.delete(
  '/assistants/:id',
  requireAuth,
  requirePermission('manage_users'),
  validate({ params: assistantIdParamSchema }),
  controller.deleteAssistant.bind(controller)
)

/**
 * @route GET /api/chat/assistants/:id/access
 * @description Get access control entries for an assistant.
 * @access Admin only (manage_users permission)
 */
router.get(
  '/assistants/:id/access',
  requireAuth,
  requirePermission('manage_users'),
  validate({ params: assistantIdParamSchema }),
  controller.getAssistantAccess.bind(controller)
)

/**
 * @route PUT /api/chat/assistants/:id/access
 * @description Set (replace) access control entries for an assistant.
 * @access Admin only (manage_users permission)
 */
router.put(
  '/assistants/:id/access',
  requireAuth,
  requirePermission('manage_users'),
  validate({ body: assistantAccessSchema, params: assistantIdParamSchema }),
  controller.setAssistantAccess.bind(controller)
)

export default router
