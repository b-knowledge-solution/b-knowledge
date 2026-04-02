/**
 * @fileoverview Barrel export for the broadcast module.
 * Public API for broadcast message management -- all external consumers
 * should import from this file only (NX boundary rule).
 * @module modules/broadcast
 */
export { default as broadcastMessageRoutes } from './routes/broadcast-message.routes.js'
export { broadcastMessageService } from './services/broadcast-message.service.js'
