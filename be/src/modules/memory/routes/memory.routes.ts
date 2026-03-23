/**
 * @fileoverview Route definitions for the Memory module.
 *
 * All routes require authentication, tenant context, and ABAC authorization.
 * Mounted under /api/memory by the central route registration.
 *
 * @module modules/memory/routes/memory
 */
import { Router } from 'express'
import { memoryController } from '../controllers/memory.controller.js'
import { requireAuth, requireAbility } from '@/shared/middleware/auth.middleware.js'
import { requireTenant } from '@/shared/middleware/tenant.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import {
  createMemorySchema,
  updateMemorySchema,
  queryMemoryMessagesSchema,
  memoryIdParamSchema,
} from '../schemas/memory.schemas.js'

const router = Router()

// All routes require authentication, tenant context, and Memory ABAC permission
router.use(requireAuth)
router.use(requireTenant)
router.use(requireAbility('manage', 'Memory'))

// -------------------------------------------------------------------------
// Memory Pool CRUD
// -------------------------------------------------------------------------

/** POST / -- Create a new memory pool */
router.post('/', validate(createMemorySchema), memoryController.create.bind(memoryController))

/** GET / -- List memory pools visible to the current user */
router.get('/', memoryController.list.bind(memoryController))

/** GET /:id -- Retrieve a single memory pool by UUID */
router.get('/:id', validate({ params: memoryIdParamSchema }), memoryController.getById.bind(memoryController))

/** PUT /:id -- Update an existing memory pool */
router.put('/:id', validate({ params: memoryIdParamSchema, body: updateMemorySchema }), memoryController.update.bind(memoryController))

/** DELETE /:id -- Delete a memory pool and all its messages */
router.delete('/:id', validate({ params: memoryIdParamSchema }), memoryController.remove.bind(memoryController))

// -------------------------------------------------------------------------
// Memory Messages
// -------------------------------------------------------------------------

/** GET /:id/messages -- List messages with pagination and optional filters */
router.get('/:id/messages', validate({ params: memoryIdParamSchema, query: queryMemoryMessagesSchema }), memoryController.listMessages.bind(memoryController))

/** DELETE /:id/messages/:messageId -- Delete a single memory message */
router.delete('/:id/messages/:messageId', memoryController.deleteMessage.bind(memoryController))

/** POST /:id/search -- Hybrid vector+text search over memory messages */
router.post('/:id/search', validate({ params: memoryIdParamSchema }), memoryController.searchMessages.bind(memoryController))

/** PUT /:id/messages/:messageId/forget -- Mark a memory message as forgotten */
router.put('/:id/messages/:messageId/forget', memoryController.forgetMessage.bind(memoryController))

export default router
