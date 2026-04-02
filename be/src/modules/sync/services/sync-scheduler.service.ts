
/**
 * @fileoverview Sync scheduler for automatic connector synchronization.
 * @description Manages cron-based scheduled sync for connectors that have
 *   a schedule configured. On each cron tick, pushes a sync task to Redis
 *   for the Python connector_sync_worker.
 * @module modules/sync/services/sync-scheduler
 */
import cron from 'node-cron'
import type { ScheduledTask } from 'node-cron'
import { log } from '@/shared/services/logger.service.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { syncService } from './sync.service.js'

/**
 * @description Manages scheduled sync jobs for connectors with cron schedules.
 *   On startup, loads all connectors with a schedule and registers cron tasks.
 *   When connectors are created/updated/deleted, the registry is updated accordingly.
 */
export class SyncSchedulerService {
  /** Map of connector ID → active cron task */
  private tasks = new Map<string, ScheduledTask>()

  /**
   * @description Initialize the scheduler by loading all connectors with schedules
   *   from the database and registering cron tasks for each.
   * @returns {Promise<void>}
   */
  async init(): Promise<void> {
    try {
      // Load all active connectors that have a schedule configured
      const connectors = await ModelFactory.connector.findAll(
        { status: 'active' },
        { orderBy: { created_at: 'desc' } },
      )

      let registered = 0
      for (const connector of connectors) {
        // Only register connectors with a valid cron schedule
        if (connector.schedule && cron.validate(connector.schedule)) {
          this.registerTask(connector.id, connector.schedule)
          registered++
        }
      }

      if (registered > 0) {
        log.info('Sync scheduler initialized', { registeredTasks: registered })
      }
    } catch (error) {
      log.warn('Failed to initialize sync scheduler', { error: String(error) })
    }
  }

  /**
   * @description Register a cron task for a connector. Stops any existing task
   *   for the same connector before registering the new one.
   * @param {string} connectorId - Connector UUID
   * @param {string} schedule - Valid cron expression
   * @returns {void}
   */
  registerTask(connectorId: string, schedule: string): void {
    // Stop existing task if re-registering
    this.unregisterTask(connectorId)

    // Validate the cron expression
    if (!cron.validate(schedule)) {
      log.warn('Invalid cron schedule for connector, skipping', { connectorId, schedule })
      return
    }

    const task = cron.schedule(schedule, async () => {
      log.info('Scheduled sync triggered', { connectorId, schedule })
      try {
        await syncService.triggerSync(connectorId)
      } catch (err) {
        log.error('Scheduled sync failed', { connectorId, error: String(err) })
      }
    })

    this.tasks.set(connectorId, task)
    log.debug('Registered sync schedule', { connectorId, schedule })
  }

  /**
   * @description Unregister and stop a cron task for a connector.
   * @param {string} connectorId - Connector UUID
   * @returns {void}
   */
  unregisterTask(connectorId: string): void {
    const existing = this.tasks.get(connectorId)
    if (existing) {
      existing.stop()
      this.tasks.delete(connectorId)
      log.debug('Unregistered sync schedule', { connectorId })
    }
  }

  /**
   * @description Update the schedule for a connector. If schedule is null/empty,
   *   unregisters the task. Otherwise, re-registers with the new schedule.
   * @param {string} connectorId - Connector UUID
   * @param {string | null} schedule - New cron expression, or null to disable
   * @returns {void}
   */
  updateTask(connectorId: string, schedule: string | null): void {
    if (schedule && cron.validate(schedule)) {
      this.registerTask(connectorId, schedule)
    } else {
      this.unregisterTask(connectorId)
    }
  }

  /**
   * @description Stop all registered cron tasks. Called during graceful shutdown.
   * @returns {void}
   */
  stopAll(): void {
    for (const [connectorId, task] of this.tasks) {
      task.stop()
    }
    this.tasks.clear()
    log.info('All sync scheduler tasks stopped')
  }
}

/** Singleton instance of the sync scheduler service */
export const syncSchedulerService = new SyncSchedulerService()
