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
import { agentToolController } from '../controllers/agent-tool.controller.js'
import { requireAuth, requireAbility } from '@/shared/middleware/auth.middleware.js'
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
  createCredentialSchema,
  updateCredentialSchema,
} from '../schemas/agent.schemas.js'

const router = Router()

// All routes require authentication and tenant context
router.use(requireAuth)
router.use(requireTenant)

// -------------------------------------------------------------------------
// Tool Credentials (placed BEFORE /:id routes to avoid param collision)
// -------------------------------------------------------------------------

router.get('/tools/credentials', requireAbility('manage', 'Agent'), agentToolController.listCredentials.bind(agentToolController))
router.post('/tools/credentials', requireAbility('manage', 'Agent'), validate(createCredentialSchema), agentToolController.createCredential.bind(agentToolController))
router.put('/tools/credentials/:id', requireAbility('manage', 'Agent'), validate({ params: agentIdParamSchema, body: updateCredentialSchema }), agentToolController.updateCredential.bind(agentToolController))
router.delete('/tools/credentials/:id', requireAbility('manage', 'Agent'), validate({ params: agentIdParamSchema }), agentToolController.deleteCredential.bind(agentToolController))

// -------------------------------------------------------------------------
// Agent CRUD (ABAC-protected: read for GET, manage for mutations)
// -------------------------------------------------------------------------

router.get('/', requireAbility('read', 'Agent'), validate({ query: listAgentsQuerySchema }), agentController.listAgents.bind(agentController))
router.post('/', requireAbility('manage', 'Agent'), validate(createAgentSchema), agentController.createAgent.bind(agentController))
router.get('/:id', requireAbility('read', 'Agent'), validate({ params: agentIdParamSchema }), agentController.getAgent.bind(agentController))
router.put('/:id', requireAbility('manage', 'Agent'), validate({ params: agentIdParamSchema, body: updateAgentSchema }), agentController.updateAgent.bind(agentController))
router.delete('/:id', requireAbility('manage', 'Agent'), validate({ params: agentIdParamSchema }), agentController.deleteAgent.bind(agentController))

// -------------------------------------------------------------------------
// Agent Actions
// -------------------------------------------------------------------------

router.post('/:id/duplicate', requireAbility('manage', 'Agent'), validate({ params: agentIdParamSchema }), agentController.duplicateAgent.bind(agentController))
router.get('/:id/export', requireAbility('read', 'Agent'), validate({ params: agentIdParamSchema }), agentController.exportAgent.bind(agentController))

// -------------------------------------------------------------------------
// Execution
// -------------------------------------------------------------------------

router.post('/:id/run', requireAbility('read', 'Agent'), validate({ params: agentIdParamSchema, body: agentRunBodySchema }), agentController.runAgent.bind(agentController))
router.get('/:id/run/:runId/stream', requireAbility('read', 'Agent'), validate({ params: agentRunIdParamSchema }), agentController.streamAgent.bind(agentController))
router.post('/:id/run/:runId/cancel', requireAbility('manage', 'Agent'), validate({ params: agentRunIdParamSchema }), agentController.cancelRun.bind(agentController))
router.get('/:id/runs', requireAbility('read', 'Agent'), validate({ params: agentIdParamSchema }), agentController.listRuns.bind(agentController))

// -------------------------------------------------------------------------
// Debug Mode
// -------------------------------------------------------------------------

router.post('/:id/debug', requireAbility('manage', 'Agent'), agentDebugController.startDebug.bind(agentDebugController))
router.post('/:id/debug/:runId/step', requireAbility('manage', 'Agent'), agentDebugController.stepNext.bind(agentDebugController))
router.post('/:id/debug/:runId/continue', requireAbility('manage', 'Agent'), agentDebugController.continueDebug.bind(agentDebugController))
router.post('/:id/debug/:runId/breakpoint', requireAbility('manage', 'Agent'), agentDebugController.setBreakpoint.bind(agentDebugController))
router.delete('/:id/debug/:runId/breakpoint/:nodeId', requireAbility('manage', 'Agent'), agentDebugController.removeBreakpoint.bind(agentDebugController))
router.get('/:id/debug/:runId/steps/:nodeId', requireAbility('manage', 'Agent'), agentDebugController.getStepDetails.bind(agentDebugController))

// -------------------------------------------------------------------------
// Versioning
// -------------------------------------------------------------------------

router.get('/:id/versions', requireAbility('read', 'Agent'), validate({ params: agentIdParamSchema }), agentController.listVersions.bind(agentController))
router.post('/:id/versions', requireAbility('manage', 'Agent'), validate({ params: agentIdParamSchema, body: saveVersionSchema }), agentController.saveVersion.bind(agentController))
router.post('/:id/versions/:versionId/restore', requireAbility('manage', 'Agent'), validate({ params: versionIdParamSchema }), agentController.restoreVersion.bind(agentController))
router.delete('/:id/versions/:versionId', requireAbility('manage', 'Agent'), validate({ params: versionIdParamSchema }), agentController.deleteVersion.bind(agentController))

export default router
