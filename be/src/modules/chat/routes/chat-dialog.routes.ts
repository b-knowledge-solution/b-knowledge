
/**
 * @fileoverview Chat dialog routes.
 * Defines endpoints for dialog (chat assistant configuration) CRUD
 * and RBAC access control management.
 *
 * @module routes/chat-dialog
 */
import { Router } from 'express'
import { ChatDialogController } from '../controllers/chat-dialog.controller.js'
import { requireAuth, requirePermission } from '@/shared/middleware/auth.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import {
  createDialogSchema,
  updateDialogSchema,
  dialogIdParamSchema,
  dialogAccessSchema,
} from '../schemas/chat-dialog.schemas.js'

const router = Router()
const controller = new ChatDialogController()

/**
 * @route POST /api/chat/dialogs
 * @description Create a new dialog configuration.
 * @access Admin only (manage_users permission)
 */
router.post(
  '/dialogs',
  requireAuth,
  requirePermission('manage_users'),
  validate(createDialogSchema),
  controller.createDialog.bind(controller)
)

/**
 * @route GET /api/chat/dialogs/:id
 * @description Get a dialog by ID.
 * @access Private
 */
router.get(
  '/dialogs/:id',
  requireAuth,
  validate({ params: dialogIdParamSchema }),
  controller.getDialog.bind(controller)
)

/**
 * @route GET /api/chat/dialogs
 * @description List all accessible dialogs (RBAC-filtered).
 * @access Private
 */
router.get(
  '/dialogs',
  requireAuth,
  controller.listDialogs.bind(controller)
)

/**
 * @route PUT /api/chat/dialogs/:id
 * @description Update an existing dialog.
 * @access Admin only (manage_users permission)
 */
router.put(
  '/dialogs/:id',
  requireAuth,
  requirePermission('manage_users'),
  validate({ body: updateDialogSchema, params: dialogIdParamSchema }),
  controller.updateDialog.bind(controller)
)

/**
 * @route DELETE /api/chat/dialogs/:id
 * @description Delete a dialog by ID.
 * @access Admin only (manage_users permission)
 */
router.delete(
  '/dialogs/:id',
  requireAuth,
  requirePermission('manage_users'),
  validate({ params: dialogIdParamSchema }),
  controller.deleteDialog.bind(controller)
)

/**
 * @route GET /api/chat/dialogs/:id/access
 * @description Get access control entries for a dialog.
 * @access Admin only (manage_users permission)
 */
router.get(
  '/dialogs/:id/access',
  requireAuth,
  requirePermission('manage_users'),
  validate({ params: dialogIdParamSchema }),
  controller.getDialogAccess.bind(controller)
)

/**
 * @route PUT /api/chat/dialogs/:id/access
 * @description Set (replace) access control entries for a dialog.
 * @access Admin only (manage_users permission)
 */
router.put(
  '/dialogs/:id/access',
  requireAuth,
  requirePermission('manage_users'),
  validate({ body: dialogAccessSchema, params: dialogIdParamSchema }),
  controller.setDialogAccess.bind(controller)
)

export default router
