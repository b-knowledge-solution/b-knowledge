/**
 * @fileoverview Barrel export for the preview module.
 * Public API for document preview generation -- all external consumers
 * should import from this file only (NX boundary rule).
 * @module modules/preview
 */
export { default as previewRoutes } from './preview.routes.js'
export { previewService } from './preview.service.js'
