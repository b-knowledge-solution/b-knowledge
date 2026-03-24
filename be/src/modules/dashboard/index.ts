/**
 * @fileoverview Barrel export for the dashboard module.
 * Public API for admin activity dashboard -- all external consumers
 * should import from this file only (NX boundary rule).
 * @module modules/dashboard
 */
export { default as dashboardRoutes } from './dashboard.routes.js'
export { dashboardService } from './dashboard.service.js'
