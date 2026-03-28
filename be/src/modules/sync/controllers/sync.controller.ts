
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
      const connectors = await syncService.listConnectors(kbId)
      res.json(connectors)
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
        res.status(404).json({ error: 'Connector not found' })
        return
      }
      res.json(connector)
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
      // Build user context for audit trail
      const user = req.user
        ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
        : undefined

      const connector = await syncService.createConnector(req.body, user)
      res.status(201).json(connector)
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
      const user = req.user
        ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
        : undefined

      const connector = await syncService.updateConnector(id, req.body, user)
      // Guard: return 404 if connector not found
      if (!connector) {
        res.status(404).json({ error: 'Connector not found' })
        return
      }
      res.json(connector)
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
    // Guard: ensure connector ID is provided
    if (!id) {
      res.status(400).json({ error: 'ID is required' })
      return
    }

    try {
      await syncService.deleteConnector(id)
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
    // Guard: ensure connector ID is provided
    if (!id) {
      res.status(400).json({ error: 'Connector ID is required' })
      return
    }

    try {
      const syncLog = await syncService.triggerSync(id, req.body?.poll_range_start)
      res.status(202).json(syncLog)
    } catch (error: any) {
      log.error('Failed to trigger sync', { connectorId: id, error: String(error) })
      const status = error.message === 'Connector not found' ? 404 : 500
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
    // Guard: ensure connector ID is provided
    if (!id) {
      res.status(400).json({ error: 'Connector ID is required' })
      return
    }

    try {
      const { page, limit, status } = req.query as any
      const logs = await syncService.listSyncLogs(id, page, limit, status)
      res.json(logs)
    } catch (error) {
      log.error('Failed to list sync logs', { connectorId: id, error: String(error) })
      res.status(500).json({ error: 'Failed to list sync logs' })
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
    if (!id) {
      res.status(400).json({ error: 'Connector ID is required' })
      return
    }

    // Configure SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    try {
      // Subscribe to progress updates and stream to client
      const cleanup = await syncService.subscribeToSyncProgress(id, '', (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`)

        // Close the stream on terminal status
        if (data.status === 'completed' || data.status === 'failed') {
          res.end()
        }
      })

      // Clean up on client disconnect
      req.on('close', () => {
        cleanup()
      })
    } catch (error) {
      log.error('Failed to stream sync progress', { connectorId: id, error: String(error) })
      res.end()
    }
  }
}
