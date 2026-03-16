/**
 * @fileoverview Barrel exports for the admin module.
 * Exposes admin routes and the admin history service as the module's public API.
 * @module modules/admin
 */
export { default as adminRoutes } from './routes/admin.routes.js'
export { default as adminHistoryRoutes } from './routes/admin-history.routes.js'
export { adminHistoryService } from './services/admin-history.service.js'
