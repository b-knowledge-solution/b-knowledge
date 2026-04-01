
/**
 * @fileoverview Sync controller for handling HTTP requests.
 * @description Maps HTTP endpoints to SyncService methods, handles
 *   request/response formatting and error handling.
 * @module modules/sync/controllers
 */
import { Request, Response } from 'express'
import { syncService } from '../services/sync.service.js'
import { log } from '@/shared/services/logger.service.js'
import { getClientIp } from '@/shared/utils/ip.js'
import { ragService } from '@/modules/rag/index.js'
import type { Connector } from '../models/sync.types.js'
import { ComparisonLiteral, UserRole, SyncStatus } from '@/shared/constants/index.js'

/** Keys in connector config that contain sensitive credentials (SYN-BR-07) */
const SENSITIVE_CONFIG_KEYS = new Set([
  'access_token', 'secret_key', 'api_token', 'password', 'client_secret',
  'service_account_json', 'db_password', 'token', 'api_key', 'secret',
  'refresh_token', 'private_key', 'confluence_token', 'access_key',
  // Connector-specific credential keys
  'slack_bot_token', 'discord_bot_token', 'github_access_token',
  'gitlab_access_token', 'notion_integration_token', 'confluence_access_token',
  'airtable_access_token', 'zendesk_token', 'client_id',
  'access_key_id', 'secret_access_key', 'aws_access_key_id',
  'aws_secret_access_key', 'r2_access_key_id', 'r2_secret_access_key',
])

/** Masked value shown in API responses for sensitive fields */
const MASKED_VALUE = '********'

/**
 * @description Replace sensitive credential values in a connector config
 *   with masked placeholders. Never exposes raw secrets in API responses (SYN-BR-07).
 * @param {Connector} connector - Connector with decrypted config
 * @returns {Connector} Connector with masked config values
 */
function sanitizeConnectorConfig(connector: Connector): Connector {
  if (!connector.config || typeof connector.config !== 'object') return connector

  const sanitized = { ...connector.config } as Record<string, unknown>
  for (const key of Object.keys(sanitized)) {
    // Mask values of known sensitive keys
    if (SENSITIVE_CONFIG_KEYS.has(key) && sanitized[key]) {
      sanitized[key] = MASKED_VALUE
    }
  }
  return { ...connector, config: sanitized }
}

/**
 * @description Sanitize an array of connectors for API response
 * @param {Connector[]} connectors - Array of connectors
 * @returns {Connector[]} Array with masked config values
 */
function sanitizeConnectors(connectors: Connector[]): Connector[] {
  return connectors.map(sanitizeConnectorConfig)
}

/**
 * @description Verify that the current user has access to the KB linked to a connector.
 *   Admins/leaders bypass the check. Returns false if access is denied.
 * @param {Request} req - Express request with user context
 * @param {string} kbId - Knowledge base UUID to check access for
 * @returns {Promise<boolean>} True if user has access
 */
async function checkKbAccess(req: Request, kbId: string): Promise<boolean> {
  const user = req.user as any
  if (!user) return false
  // Admin/leader roles have global KB access
  if (user.role === UserRole.ADMIN || user.role === UserRole.SUPERADMIN || user.role === UserRole.LEADER) return true
  try {
    return await ragService.checkDatasetAccess(kbId, user.id, user.role, user.teamIds || [])
  } catch {
    return false
  }
}

/**
 * SyncController class handling connector and sync task endpoints.
 * @description Class-based controller following project conventions.
 */
export class SyncController {
  /**
   * @description List all connectors, optionally filtered by knowledge base ID via query parameter
   * @param {Request} req - Express request (query: { kb_id? })
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listConnectors(req: Request, res: Response): Promise<void> {
    try {
      // Extract optional kb_id filter from query params
      const kbId = req.query.kb_id as string | undefined
      // Verify KB access when filtering by specific KB
      if (kbId && !(await checkKbAccess(req, kbId))) {
        res.status(403).json({ error: 'Access denied to this knowledge base' })
        return
      }
      const connectors = await syncService.listConnectors(kbId)
      // Mask sensitive credentials before sending to client (SYN-BR-07)
      res.json(sanitizeConnectors(connectors))
    } catch (error) {
      log.error('Failed to list connectors', { error: String(error) })
      res.status(500).json({ error: 'Failed to list connectors' })
    }
  }

  /**
   * @description Get a single connector by its UUID
   * @param {Request} req - Express request (params: { id })
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async getConnector(req: Request, res: Response): Promise<void> {
    try {
      const connector = await syncService.getConnector(req.params.id!)
      // Guard: return 404 if connector does not exist
      if (!connector) {
        res.status(404).json({ error: ComparisonLiteral.CONNECTOR_NOT_FOUND })
        return
      }
      // Verify user has access to this connector's KB
      if (!(await checkKbAccess(req, connector.kb_id))) {
        res.status(403).json({ error: 'Access denied' })
        return
      }
      // Mask sensitive credentials before sending to client (SYN-BR-07)
      res.json(sanitizeConnectorConfig(connector))
    } catch (error) {
      log.error('Failed to get connector', { id: req.params.id, error: String(error) })
      res.status(500).json({ error: 'Failed to get connector' })
    }
  }

  /**
   * @description Create a new connector. Body is validated by Zod middleware before reaching this handler.
   * @param {Request} req - Express request (body: CreateConnectorSchema)
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createConnector(req: Request, res: Response): Promise<void> {
    try {
      // Verify user has access to the target KB
      if (req.body.kb_id && !(await checkKbAccess(req, req.body.kb_id))) {
        res.status(403).json({ error: 'Access denied to this knowledge base' })
        return
      }
      // Build user context for audit trail
      const user = req.user
        ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
        : undefined

      const connector = await syncService.createConnector(req.body, user)
      // Mask sensitive credentials before sending to client (SYN-BR-07)
      res.status(201).json(sanitizeConnectorConfig(connector))
    } catch (error: any) {
      log.error('Failed to create connector', { error: String(error) })
      const status = error.message?.includes('already exists') ? 409 : 500
      res.status(status).json({ error: error.message || 'Failed to create connector' })
    }
  }

  /**
   * @description Update an existing connector. Body is validated by Zod middleware.
   * @param {Request} req - Express request (params: { id }, body: UpdateConnectorSchema)
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async updateConnector(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    // Guard: ensure connector ID is provided
    if (!id) {
      res.status(400).json({ error: 'ID is required' })
      return
    }

    try {
      // Verify KB access before updating
      const existing = await syncService.getConnector(id)
      if (!existing) { res.status(404).json({ error: ComparisonLiteral.CONNECTOR_NOT_FOUND }); return }
      if (!(await checkKbAccess(req, existing.kb_id))) { res.status(403).json({ error: 'Access denied' }); return }

      const user = req.user
        ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
        : undefined

      const connector = await syncService.updateConnector(id, req.body, user)
      // Guard: return 404 if connector not found
      if (!connector) {
        res.status(404).json({ error: ComparisonLiteral.CONNECTOR_NOT_FOUND })
        return
      }
      // Mask sensitive credentials before sending to client (SYN-BR-07)
      res.json(sanitizeConnectorConfig(connector))
    } catch (error: any) {
      log.error('Failed to update connector', { id, error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update connector' })
    }
  }

  /**
   * @description Delete a connector by its UUID
   * @param {Request} req - Express request (params: { id })
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async deleteConnector(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    if (!id) { res.status(400).json({ error: 'ID is required' }); return }

    try {
      // Verify KB access before deleting
      const existing = await syncService.getConnector(id)
      if (!existing) { res.status(404).json({ error: ComparisonLiteral.CONNECTOR_NOT_FOUND }); return }
      if (!(await checkKbAccess(req, existing.kb_id))) { res.status(403).json({ error: 'Access denied' }); return }

      // Pass cascade_documents flag from query params
      const cascadeDocuments = (req.query as any).cascade_documents === true
      await syncService.deleteConnector(id, cascadeDocuments)
      res.status(204).send()
    } catch (error: any) {
      log.error('Failed to delete connector', { id, error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to delete connector' })
    }
  }

  /**
   * @description Trigger a manual sync for a connector, creating a task and enqueuing it for background processing
   * @param {Request} req - Express request (params: { id }, body: TriggerSyncSchema)
   * @param {Response} res - Express response (202 Accepted on success)
   * @returns {Promise<void>}
   */
  async triggerSync(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    if (!id) { res.status(400).json({ error: 'Connector ID is required' }); return }

    try {
      // Verify KB access before triggering sync
      const existing = await syncService.getConnector(id)
      if (!existing) { res.status(404).json({ error: ComparisonLiteral.CONNECTOR_NOT_FOUND }); return }
      if (!(await checkKbAccess(req, existing.kb_id))) { res.status(403).json({ error: 'Access denied' }); return }

      const syncLog = await syncService.triggerSync(id, req.body?.poll_range_start)
      res.status(202).json(syncLog)
    } catch (error: any) {
      log.error('Failed to trigger sync', { connectorId: id, error: String(error) })
      // Map known error messages to appropriate HTTP status codes
      const status = error.message === ComparisonLiteral.CONNECTOR_NOT_FOUND ? 404
        : error.message?.includes('already in progress') ? 409
        : error.message?.includes('queue is full') ? 503
        : 500
      res.status(status).json({ error: error.message || 'Failed to trigger sync' })
    }
  }

  /**
   * @description List sync logs for a connector with pagination and optional status filtering
   * @param {Request} req - Express request (params: { id }, query: ListSyncLogsQuery)
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listSyncLogs(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    if (!id) { res.status(400).json({ error: 'Connector ID is required' }); return }

    try {
      // Verify KB access before listing logs
      const existing = await syncService.getConnector(id)
      if (!existing) { res.status(404).json({ error: ComparisonLiteral.CONNECTOR_NOT_FOUND }); return }
      if (!(await checkKbAccess(req, existing.kb_id))) { res.status(403).json({ error: 'Access denied' }); return }

      const { page, limit, status } = req.query as any
      const logs = await syncService.listSyncLogs(id, page, limit, status)
      res.json(logs)
    } catch (error) {
      log.error('Failed to list sync logs', { connectorId: id, error: String(error) })
      res.status(500).json({ error: 'Failed to list sync logs' })
    }
  }

  /**
   * @description Test connection to an external data source without creating a connector.
   *   Validates credentials by sending a test task to the Python worker (SYN-FR-31).
   * @param {Request} req - Express request (body: { source_type, config })
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async testConnection(req: Request, res: Response): Promise<void> {
    try {
      // Prevent caching of credential-related responses
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
      const { source_type, config: connConfig } = req.body
      const result = await syncService.testConnection(source_type, connConfig)
      res.json(result)
    } catch (error: any) {
      log.error('Failed to test connection', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to test connection' })
    }
  }

  /**
   * @description SSE endpoint streaming sync progress events from the Python connector worker.
   *   Subscribes to Redis pub/sub channel for the connector and streams events to the client.
   * @param {Request} req - Express request (params: { id })
   * @param {Response} res - Express response configured as SSE stream
   * @returns {Promise<void>}
   */
  async streamProgress(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    if (!id) { res.status(400).json({ error: 'Connector ID is required' }); return }

    // Verify KB access before streaming progress
    try {
      const existing = await syncService.getConnector(id)
      if (!existing) { res.status(404).json({ error: ComparisonLiteral.CONNECTOR_NOT_FOUND }); return }
      if (!(await checkKbAccess(req, existing.kb_id))) { res.status(403).json({ error: 'Access denied' }); return }
    } catch {
      res.status(500).json({ error: 'Access check failed' })
      return
    }

    // Configure SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-store')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    try {
      // Subscribe to progress updates and stream to client
      const cleanup = await syncService.subscribeToSyncProgress(id, '', (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`)

        // Close the stream on terminal status
        if (data.status === SyncStatus.COMPLETED || data.status === SyncStatus.FAILED) {
          res.end()
        }
      })

      // Auto-close SSE stream after 10 minutes to prevent leaked connections
      const maxStreamTimeout = setTimeout(async () => {
        await cleanup()
        res.end()
      }, 10 * 60 * 1000)

      // Clean up Redis subscriber on client disconnect
      req.on('close', async () => {
        clearTimeout(maxStreamTimeout)
        await cleanup()
      })
    } catch (error) {
      log.error('Failed to stream sync progress', { connectorId: id, error: String(error) })
      res.end()
    }
  }
}
