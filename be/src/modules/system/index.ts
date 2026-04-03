/**
 * @fileoverview Barrel exports for the system module.
 * Exposes system routes and the system history service as the module's public API.
 * @module modules/system
 */
export { default as systemRoutes } from './routes/system.routes.js'
export { default as systemHistoryRoutes } from './routes/system-history.routes.js'
export { systemHistoryService } from './services/system-history.service.js'
