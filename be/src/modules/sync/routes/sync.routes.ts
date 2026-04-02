
/**
 * @fileoverview Sync module route definitions.
 * @description Registers all connector and sync task endpoints with
 *   appropriate authentication, permission, and validation middleware.
 * @module modules/sync/routes
 */
import { Router } from 'express'
import { SyncController } from '../controllers/sync.controller.js'
import { requireAuth, requirePermission } from '@/shared/middleware/auth.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import {
  createConnectorSchema,
  updateConnectorSchema,
  uuidParamSchema,
  triggerSyncSchema,
  listSyncLogsQuerySchema,
  testConnectionSchema,
  deleteConnectorQuerySchema,
} from '../schemas/sync.schemas.js'

const router = Router()
const controller = new SyncController()

// ── Test Connection (before :id routes to avoid param collision) ────────────

/** Test connection to an external data source without creating a connector */
router.post(
  '/connectors/test-connection',
  requirePermission('manage_knowledge_base'),
  validate(testConnectionSchema),
  controller.testConnection.bind(controller),
)

// ── Connector CRUD ──────────────────────────────────────────────────────────

/** List all connectors (optionally filter by ?kb_id=) */
router.get('/connectors', requireAuth, controller.listConnectors.bind(controller))

/** Get a single connector by ID */
router.get(
  '/connectors/:id',
  requireAuth,
  validate({ params: uuidParamSchema }),
  controller.getConnector.bind(controller),
)

/** Create a new connector */
router.post(
  '/connectors',
  requirePermission('manage_knowledge_base'),
  validate(createConnectorSchema),
  controller.createConnector.bind(controller),
)

/** Update an existing connector */
router.put(
  '/connectors/:id',
  requirePermission('manage_knowledge_base'),
  validate({ params: uuidParamSchema, body: updateConnectorSchema }),
  controller.updateConnector.bind(controller),
)

/** Delete a connector (optionally cascade-delete synced documents) */
router.delete(
  '/connectors/:id',
  requirePermission('manage_knowledge_base'),
  validate({ params: uuidParamSchema, query: deleteConnectorQuerySchema }),
  controller.deleteConnector.bind(controller),
)

// ── Sync Operations ─────────────────────────────────────────────────────────

/** Trigger a manual sync for a connector */
router.post(
  '/connectors/:id/sync',
  requirePermission('manage_knowledge_base'),
  validate({ params: uuidParamSchema, body: triggerSyncSchema }),
  controller.triggerSync.bind(controller),
)

/** List sync logs for a connector (with pagination) */
router.get(
  '/connectors/:id/logs',
  requireAuth,
  validate({ params: uuidParamSchema, query: listSyncLogsQuerySchema }),
  controller.listSyncLogs.bind(controller),
)

/** Stream sync progress events via SSE */
router.get(
  '/connectors/:id/progress',
  requireAuth,
  validate({ params: uuidParamSchema }),
  controller.streamProgress.bind(controller),
)

export default router
