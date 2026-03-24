/**
 * @fileoverview Barrel export for the system-tools module.
 * Public API for system diagnostics and maintenance tools -- all external consumers
 * should import from this file only (NX boundary rule).
 * @module modules/system-tools
 */
export { default as systemToolsRoutes } from './system-tools.routes.js'
export { systemToolsService } from './system-tools.service.js'
