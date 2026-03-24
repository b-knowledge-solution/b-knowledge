/**
 * @fileoverview Barrel export for the glossary module.
 * Public API for glossary task and keyword management -- all external consumers
 * should import from this file only (NX boundary rule).
 * @module modules/glossary
 */
export { default as glossaryRoutes } from './routes/glossary.routes.js'
export { glossaryService } from './services/glossary.service.js'
