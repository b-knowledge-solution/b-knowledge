/**
 * @fileoverview Barrel exports for the users module.
 * Exposes user routes and the user service singleton as the module's public API.
 * @module modules/users
 */
export { default as userRoutes } from './routes/users.routes.js'
export { userService } from './services/user.service.js'
