/**
 * @fileoverview Public barrel for the permissions admin module (P3.4a-d).
 *
 * Exposes the routes (mounted at `/api/permissions` from `app/routes.ts`) and
 * the singleton service so other modules can introspect permissions if needed.
 * The permission catalog file (`permissions.permissions.ts`) is intentionally
 * NOT re-exported here — it is eager-imported by the shared registry index.
 *
 * @module modules/permissions
 */
export { default as permissionsRoutes } from './routes/permissions.routes.js'
export { permissionsService } from './services/permissions.service.js'
