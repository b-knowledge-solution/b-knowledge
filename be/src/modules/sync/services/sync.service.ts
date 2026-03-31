
/**
 * @fileoverview Sync service for managing connectors and sync operations.
 * @description Handles CRUD for connectors and orchestrates sync tasks by
 *   pushing sync messages to Redis queue for the Python connector_sync_worker.
 *   Python worker instantiates the appropriate connector, fetches documents,
 *   and ingests them into the knowledge base.
 * @module modules/sync/services
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { getRedisClient } from '@/shared/services/redis.service.js'
import { config } from '@/shared/config/index.js'
import { Connector, SyncLog } from '../models/sync.types.js'
import { syncSchedulerService } from './sync-scheduler.service.js'

/** Redis queue name that the Python connector_sync_worker listens on */
const CONNECTOR_SYNC_QUEUE = 'rag_connector_sync'

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

      // Register scheduled sync if schedule is configured
      if (connector.schedule) {
        syncSchedulerService.updateTask(connector.id, connector.schedule)
      }

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
        // Update scheduled sync if schedule changed
        if (data.schedule !== undefined) {
          syncSchedulerService.updateTask(id, data.schedule ?? null)
        }
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
      // Unregister scheduled sync before deletion
      syncSchedulerService.unregisterTask(id)
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
      // Create sync log entry with running status
      const syncLog = await ModelFactory.syncLog.create({
        connector_id: connectorId,
        kb_id: connector.kb_id,
        status: 'running',
        docs_synced: 0,
        docs_failed: 0,
        progress: 0,
        message: 'Sync queued — waiting for Python worker',
        started_at: new Date(),
      })

      // Parse config (may be stored as JSON string in DB)
      const connectorConfig = typeof connector.config === 'string'
        ? JSON.parse(connector.config)
        : connector.config

      // Build task payload for the Python connector_sync_worker
      const taskPayload = JSON.stringify({
        sync_log_id: syncLog.id,
        connector_id: connectorId,
        kb_id: connector.kb_id,
        source_type: connector.source_type,
        config: connectorConfig,
        tenant_id: config.opensearch.systemTenantId || '00000000000000000000000000000001',
        since: pollRangeStart || connector.last_synced_at?.toISOString() || null,
        auto_parse: true,
      })

      // LPUSH to Redis queue; Python connector_sync_worker BRPOPs from this queue
      const redisClient = getRedisClient()
      if (!redisClient) {
        throw new Error('Redis not available — cannot queue sync task')
      }
      await redisClient.lPush(CONNECTOR_SYNC_QUEUE, taskPayload)

      // Subscribe to progress updates in background (fire-and-forget)
      this.subscribeToSyncProgress(connectorId, syncLog.id).catch((err) => {
        log.warn('Failed to subscribe to sync progress', { connectorId, error: String(err) })
      })

      log.info('Sync task queued to Redis', { connectorId, syncLogId: syncLog.id, sourceType: connector.source_type })
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

  /**
   * @description Subscribe to Redis pub/sub for sync progress updates from the Python worker.
   *   Updates sync_logs table and connector last_synced_at based on progress events.
   *   Caller MUST invoke the returned cleanup function to unsubscribe (e.g. on HTTP request close).
   * @param {string} connectorId - Connector UUID to monitor
   * @param {string} syncLogId - Sync log UUID to update (empty string skips DB updates)
   * @param {(data: Record<string, unknown>) => void} [onProgress] - Optional callback for each progress event
   * @returns {Promise<() => void>} Cleanup function to unsubscribe and close the subscriber connection
   */
  async subscribeToSyncProgress(
    connectorId: string,
    syncLogId: string,
    onProgress?: (data: Record<string, unknown>) => void,
  ): Promise<() => void> {
    const redisClient = getRedisClient()
    if (!redisClient) {
      log.warn('Redis not available for sync progress subscription')
      return () => {}
    }

    // Create a duplicate client for pub/sub (Redis requires separate connection)
    const subscriber = redisClient.duplicate()
    await subscriber.connect()

    const channel = `connector:${connectorId}:progress`
    // Track subscriber state to prevent double-unsubscribe race condition
    let isUnsubscribed = false

    await subscriber.subscribe(channel, async (message) => {
      try {
        const data = JSON.parse(message)

        // Update sync_logs entry with progress from Python worker (skip if no syncLogId)
        if (syncLogId) {
          const updatePayload: Partial<SyncLog> = {
            progress: data.progress ?? 0,
            message: data.message || null,
            docs_synced: data.docs_synced ?? 0,
            docs_failed: data.docs_failed ?? 0,
            docs_skipped: data.docs_skipped ?? 0,
            docs_deleted: data.docs_deleted ?? 0,
          }

          // Handle terminal states
          if (data.status === 'completed') {
            updatePayload.status = 'completed'
            updatePayload.finished_at = new Date()
            // Update connector last_synced_at on success
            await ModelFactory.connector.update(connectorId, {
              last_synced_at: new Date(),
            } as Partial<Connector>)
          } else if (data.status === 'failed' || data.progress < 0) {
            updatePayload.status = 'failed'
            updatePayload.finished_at = new Date()
          }

          await ModelFactory.syncLog.update(syncLogId, updatePayload)
        }

        // Forward progress to optional callback (e.g., SSE stream)
        if (onProgress) onProgress(data)

        // Unsubscribe on terminal state (guard against double-unsubscribe)
        if ((data.status === 'completed' || data.status === 'failed') && !isUnsubscribed) {
          isUnsubscribed = true
          await subscriber.unsubscribe(channel)
          await subscriber.quit()
        }
      } catch (err) {
        log.warn('Failed to process sync progress event', { error: String(err) })
      }
    })

    // Return cleanup function (guarded against double-unsubscribe)
    return async () => {
      if (isUnsubscribed) return
      isUnsubscribed = true
      try {
        await subscriber.unsubscribe(channel)
        await subscriber.quit()
      } catch {
        // Ignore cleanup errors — subscriber may already be closed
      }
    }
  }
}

/** Singleton instance of SyncService */
export const syncService = new SyncService()
