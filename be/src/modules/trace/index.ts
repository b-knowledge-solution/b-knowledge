/**
 * @fileoverview Barrel export for the trace module.
 *
 * Public API for the trace module — all external consumers
 * should import from this file only (NX boundary rule).
 *
 * @module modules/trace
 */
export { default as traceRoutes } from './routes/trace.routes.js'
export { default as historyRoutes } from './routes/history.routes.js'
export { traceAuthService } from './services/trace-auth.service.js'
export { traceHistoryService } from './services/trace-history.service.js'
export { checkTraceEnabled } from './middleware/trace-enabled.middleware.js'
export { requireTraceApiKey } from './middleware/auth-trace.middleware.js'
