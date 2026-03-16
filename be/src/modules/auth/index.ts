/**
 * @fileoverview Barrel exports for the auth module.
 * Exposes auth routes and the auth service singleton as the module's public API.
 * @module modules/auth
 */
export { default as authRoutes } from './auth.routes.js'
export { authService } from './auth.service.js'
