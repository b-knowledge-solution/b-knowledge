
/**
 * @fileoverview Sync service for managing connectors and sync operations.
 * @description Handles CRUD for connectors and orchestrates sync tasks that
 *   fetch files from external sources, store them in MinIO, then trigger
 *   advance-rag parsing via Redis task queue.
 * @module modules/sync/services
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { Connector, SyncLog } from '../models/sync.types.js'
import { syncWorkerService } from './sync-worker.service.js'

/**
 * @description Captures the acting user for audit trails on connector operations
 */
interface UserContext {
  id: string
  email: string
  ip?: string
}

/**
 * SyncService class implementing Singleton Pattern.
 * @description Manages connector lifecycle and sync task orchestration.
 *   Flow: External Source → MinIO (raw files) → Redis task → advance-rag parses
 */
export class SyncService {
  /**
   * @description Create a new connector with default active status
   * @param {Partial<Connector>} data - Connector creation payload
   * @param {UserContext} [user] - Optional user context for audit trail
   * @returns {Promise<Connector>} The created connector record
   * @throws {Error} If creation fails
   */
  async createConnector(data: Partial<Connector>, user?: UserContext): Promise<Connector> {
    try {
      // Build connector record with defaults
      const connector = await ModelFactory.connector.create({
        ...data,
        status: 'active',
        created_by: user?.id || null,
        updated_by: user?.id || null,
      } as Partial<Connector>)

      log.info('Connector created', { id: connector.id, source_type: connector.source_type })
      return connector
    } catch (error) {
      log.error('Failed to create connector', { error: String(error) })
      throw error
    }
  }

  /**
   * @description Retrieve a connector by its UUID
   * @param {string} id - Connector UUID
   * @returns {Promise<Connector | undefined>} The connector or undefined if not found
   */
  async getConnector(id: string): Promise<Connector | undefined> {
    return ModelFactory.connector.findById(id)
  }

  /**
   * @description List all connectors, optionally filtered by knowledge base ID
   * @param {string} [kbId] - Optional knowledge base ID filter
   * @returns {Promise<Connector[]>} Array of connectors ordered newest first
   */
  async listConnectors(kbId?: string): Promise<Connector[]> {
    // Filter by kb_id if provided, otherwise return all
    const filter = kbId ? { kb_id: kbId } : {}
    return ModelFactory.connector.findAll(filter, { orderBy: { created_at: 'desc' } })
  }

  /**
   * @description Update an existing connector with partial data, serializing config if present
   * @param {string} id - Connector UUID
   * @param {Partial<Connector>} data - Partial update data
   * @param {UserContext} [user] - Optional user context for audit trail
   * @returns {Promise<Connector | undefined>} Updated connector or undefined if not found
   * @throws {Error} If update fails
   */
  async updateConnector(id: string, data: Partial<Connector>, user?: UserContext): Promise<Connector | undefined> {
    try {
      // Build update payload, stringify config if present
      const updateData: Record<string, unknown> = {}
      if (data.name !== undefined) updateData.name = data.name
      if (data.source_type !== undefined) updateData.source_type = data.source_type
      if (data.kb_id !== undefined) updateData.kb_id = data.kb_id
      if (data.config !== undefined) updateData.config = JSON.stringify(data.config)
      if (data.description !== undefined) updateData.description = data.description
      if (data.schedule !== undefined) updateData.schedule = data.schedule
      if (user) updateData.updated_by = user.id

      const connector = await ModelFactory.connector.update(id, updateData as Partial<Connector>)
      if (connector) {
        log.info('Connector updated', { id })
      }
      return connector
    } catch (error) {
      log.error('Failed to update connector', { id, error: String(error) })
      throw error
    }
  }

  /**
   * @description Delete a connector and its associated sync logs
   * @param {string} id - Connector UUID
   * @returns {Promise<void>}
   * @throws {Error} If deletion fails
   */
  async deleteConnector(id: string): Promise<void> {
    try {
      await ModelFactory.connector.delete(id)
      log.info('Connector deleted', { id })
    } catch (error) {
      log.error('Failed to delete connector', { id, error: String(error) })
      throw error
    }
  }

  /**
   * @description Trigger a manual sync for a connector by creating a sync log entry
   *   and launching the background worker. File fetching is connector-specific,
   *   storing raw files in MinIO and enqueuing parse tasks for advance-rag.
   * @param {string} connectorId - Connector UUID
   * @param {string} [pollRangeStart] - Optional override for incremental sync start
   * @returns {Promise<SyncLog>} The created sync log entry with pending status
   * @throws {Error} If connector not found or sync creation fails
   */
  async triggerSync(connectorId: string, pollRangeStart?: string): Promise<SyncLog> {
    // Verify connector exists
    const connector = await ModelFactory.connector.findById(connectorId)
    if (!connector) {
      throw new Error('Connector not found')
    }

    try {
      // Create sync log entry with pending status
      const syncLog = await ModelFactory.syncLog.create({
        connector_id: connectorId,
        kb_id: connector.kb_id,
        status: 'pending',
        docs_synced: 0,
        docs_failed: 0,
        progress: 0,
        message: 'Sync queued',
      })

      // Execute sync in background (fire-and-forget)
      syncWorkerService.execute(connectorId, syncLog.id).catch((err) => {
        log.error('Background sync worker failed', { connectorId, syncLogId: syncLog.id, error: String(err) })
      })

      log.info('Sync triggered', { connectorId, syncLogId: syncLog.id })
      return syncLog
    } catch (error) {
      log.error('Failed to trigger sync', { connectorId, error: String(error) })
      throw error
    }
  }

  /**
   * @description List sync logs for a connector with pagination and optional status filtering
   * @param {string} connectorId - Connector UUID
   * @param {number} [page=1] - Page number (1-based)
   * @param {number} [limit=20] - Items per page
   * @param {string} [status] - Optional sync status filter
   * @returns {Promise<SyncLog[]>} Array of sync log entries ordered newest first
   */
  async listSyncLogs(
    connectorId: string,
    page: number = 1,
    limit: number = 20,
    status?: string,
  ): Promise<SyncLog[]> {
    // Build filter with connector_id and optional status
    const filter: Record<string, unknown> = { connector_id: connectorId }
    if (status) filter.status = status

    return ModelFactory.syncLog.findAll(filter, {
      orderBy: { created_at: 'desc' },
      limit,
      offset: (page - 1) * limit,
    })
  }
}

/** Singleton instance of SyncService */
export const syncService = new SyncService()
