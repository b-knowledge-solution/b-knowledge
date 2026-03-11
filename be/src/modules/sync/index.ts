
/**
 * @fileoverview Barrel export for the Sync module.
 * @description Public API for the sync module. External consumers should
 *   import only from this file, never from internal paths.
 * @module modules/sync
 */
export { default as syncRoutes } from './routes/sync.routes.js'
export { syncService } from './services/sync.service.js'
export { syncWorkerService } from './services/sync-worker.service.js'
export { registerAllAdapters } from './adapters/index.js'
export type { Connector, SyncLog } from './models/sync.types.js'
