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
import { agentDebugController } from '../controllers/agent-debug.controller.js'
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
  agentRunBodySchema,
  agentRunIdParamSchema,
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
// Execution
// -------------------------------------------------------------------------

router.post('/:id/run', validate({ params: agentIdParamSchema, body: agentRunBodySchema }), agentController.runAgent.bind(agentController))
router.get('/:id/run/:runId/stream', validate({ params: agentRunIdParamSchema }), agentController.streamAgent.bind(agentController))
router.post('/:id/run/:runId/cancel', validate({ params: agentRunIdParamSchema }), agentController.cancelRun.bind(agentController))
router.get('/:id/runs', validate({ params: agentIdParamSchema }), agentController.listRuns.bind(agentController))

// -------------------------------------------------------------------------
// Debug Mode
// -------------------------------------------------------------------------

router.post('/:id/debug', agentDebugController.startDebug.bind(agentDebugController))
router.post('/:id/debug/:runId/step', agentDebugController.stepNext.bind(agentDebugController))
router.post('/:id/debug/:runId/continue', agentDebugController.continueDebug.bind(agentDebugController))
router.post('/:id/debug/:runId/breakpoint', agentDebugController.setBreakpoint.bind(agentDebugController))
router.delete('/:id/debug/:runId/breakpoint/:nodeId', agentDebugController.removeBreakpoint.bind(agentDebugController))
router.get('/:id/debug/:runId/steps/:nodeId', agentDebugController.getStepDetails.bind(agentDebugController))

// -------------------------------------------------------------------------
// Versioning
// -------------------------------------------------------------------------

router.get('/:id/versions', validate({ params: agentIdParamSchema }), agentController.listVersions.bind(agentController))
router.post('/:id/versions', validate({ params: agentIdParamSchema, body: saveVersionSchema }), agentController.saveVersion.bind(agentController))
router.post('/:id/versions/:versionId/restore', validate({ params: versionIdParamSchema }), agentController.restoreVersion.bind(agentController))
router.delete('/:id/versions/:versionId', validate({ params: versionIdParamSchema }), agentController.deleteVersion.bind(agentController))

export default router
