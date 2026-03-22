/**
 * @fileoverview Route definitions for the Agents module.
 *
 * All routes require authentication and tenant context.
 * CRUD, versioning, duplication, and export endpoints are mounted under /api/agents.
 *
 * @module modules/agents/routes/agent
 */
import { Router } from 'express'
import { agentController } from '../controllers/agent.controller.js'
import { requireAuth } from '@/shared/middleware/auth.middleware.js'
import { requireTenant } from '@/shared/middleware/tenant.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import {
  createAgentSchema,
  updateAgentSchema,
  saveVersionSchema,
  agentIdParamSchema,
  versionIdParamSchema,
  listAgentsQuerySchema,
} from '../schemas/agent.schemas.js'

const router = Router()

// All routes require authentication and tenant context
router.use(requireAuth)
router.use(requireTenant)

// -------------------------------------------------------------------------
// Agent CRUD
// -------------------------------------------------------------------------

router.get('/', validate({ query: listAgentsQuerySchema }), agentController.listAgents.bind(agentController))
router.post('/', validate(createAgentSchema), agentController.createAgent.bind(agentController))
router.get('/:id', validate({ params: agentIdParamSchema }), agentController.getAgent.bind(agentController))
router.put('/:id', validate({ params: agentIdParamSchema, body: updateAgentSchema }), agentController.updateAgent.bind(agentController))
router.delete('/:id', validate({ params: agentIdParamSchema }), agentController.deleteAgent.bind(agentController))

// -------------------------------------------------------------------------
// Agent Actions
// -------------------------------------------------------------------------

router.post('/:id/duplicate', validate({ params: agentIdParamSchema }), agentController.duplicateAgent.bind(agentController))
router.get('/:id/export', validate({ params: agentIdParamSchema }), agentController.exportAgent.bind(agentController))

// -------------------------------------------------------------------------
// Versioning
// -------------------------------------------------------------------------

router.get('/:id/versions', validate({ params: agentIdParamSchema }), agentController.listVersions.bind(agentController))
router.post('/:id/versions', validate({ params: agentIdParamSchema, body: saveVersionSchema }), agentController.saveVersion.bind(agentController))
router.post('/:id/versions/:versionId/restore', validate({ params: versionIdParamSchema }), agentController.restoreVersion.bind(agentController))
router.delete('/:id/versions/:versionId', validate({ params: versionIdParamSchema }), agentController.deleteVersion.bind(agentController))

export default router
