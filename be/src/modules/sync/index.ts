
/**
 * @fileoverview Barrel export for the Sync module.
 * @description Public API for the sync module. External consumers should
 *   import only from this file, never from internal paths.
 * @module modules/sync
 */
export { default as syncRoutes } from './routes/sync.routes.js'
export { syncService } from './services/sync.service.js'
export { syncSchedulerService } from './services/sync-scheduler.service.js'
export type { Connector, SyncLog } from './models/sync.types.js'
