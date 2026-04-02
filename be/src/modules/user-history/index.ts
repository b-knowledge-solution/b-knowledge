/**
 * @fileoverview Barrel export for the user-history module.
 * Public API for user-specific chat and search history -- all external consumers
 * should import from this file only (NX boundary rule).
 * @module modules/user-history
 */
export { default as userHistoryRoutes } from './user-history.routes.js'
export { userHistoryService } from './user-history.service.js'
