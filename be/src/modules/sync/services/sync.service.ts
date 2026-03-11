
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
 * UserContext captures the acting user for audit trails.
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
   * Create a new connector.
   * @param data - Connector creation payload
   * @param user - Optional user context for audit
   * @returns The created connector record
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
   * Get a connector by ID.
   * @param id - Connector UUID
   * @returns The connector or undefined
   */
  async getConnector(id: string): Promise<Connector | undefined> {
    return ModelFactory.connector.findById(id)
  }

  /**
   * List all connectors, optionally filtered by knowledge base.
   * @param kbId - Optional knowledge base ID filter
   * @returns Array of connectors
   */
  async listConnectors(kbId?: string): Promise<Connector[]> {
    // Filter by kb_id if provided, otherwise return all
    const filter = kbId ? { kb_id: kbId } : {}
    return ModelFactory.connector.findAll(filter, { orderBy: { created_at: 'desc' } })
  }

  /**
   * Update an existing connector.
   * @param id - Connector UUID
   * @param data - Partial update data
   * @param user - Optional user context for audit
   * @returns Updated connector or undefined
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
   * Delete a connector and its sync logs.
   * @param id - Connector UUID
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
   * Trigger a manual sync for a connector.
   * @description Creates a sync log entry and enqueues the sync task.
   *   The actual file fetching will be handled by connector-specific logic,
   *   storing raw files to MinIO, then creating parse tasks for advance-rag.
   * @param connectorId - Connector UUID
   * @param pollRangeStart - Optional override for incremental sync start
   * @returns The created sync log entry
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
   * List sync logs for a connector with pagination.
   * @param connectorId - Connector UUID
   * @param page - Page number (1-based)
   * @param limit - Items per page
   * @param status - Optional status filter
   * @returns Array of sync log entries
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
