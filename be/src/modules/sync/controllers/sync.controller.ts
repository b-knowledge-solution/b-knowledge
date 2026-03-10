
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
   * List all connectors.
   * @description Optionally filter by knowledge base ID via query parameter.
   * @param req - Express request (query: { kb_id? })
   * @param res - Express response
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
   * Get a single connector by ID.
   * @param req - Express request (params: { id })
   * @param res - Express response
   */
  async getConnector(req: Request, res: Response): Promise<void> {
    try {
      const connector = await syncService.getConnector(req.params.id!)
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
   * Create a new connector.
   * @description Body is validated by Zod middleware before reaching this handler.
   * @param req - Express request (body: CreateConnectorSchema)
   * @param res - Express response
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
   * Update an existing connector.
   * @description Body is validated by Zod middleware before reaching this handler.
   * @param req - Express request (params: { id }, body: UpdateConnectorSchema)
   * @param res - Express response
   */
  async updateConnector(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    if (!id) {
      res.status(400).json({ error: 'ID is required' })
      return
    }

    try {
      const user = req.user
        ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
        : undefined

      const connector = await syncService.updateConnector(id, req.body, user)
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
   * Delete a connector.
   * @param req - Express request (params: { id })
   * @param res - Express response
   */
  async deleteConnector(req: Request, res: Response): Promise<void> {
    const { id } = req.params
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
   * Trigger a manual sync for a connector.
   * @description Creates a sync task and enqueues it for background processing.
   * @param req - Express request (params: { id }, body: TriggerSyncSchema)
   * @param res - Express response
   */
  async triggerSync(req: Request, res: Response): Promise<void> {
    const { id } = req.params
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
   * List sync logs for a connector.
   * @description Supports pagination and status filtering via query params.
   * @param req - Express request (params: { id }, query: ListSyncLogsQuery)
   * @param res - Express response
   */
  async listSyncLogs(req: Request, res: Response): Promise<void> {
    const { id } = req.params
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
}
