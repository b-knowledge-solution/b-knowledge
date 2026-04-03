/**
 * @fileoverview Barrel export for the Search module.
 * @description Public API surface for the search module. External modules should
 *   import only from this file, never from internal paths.
 * @module modules/search
 */

/** @description Main search routes for app CRUD and query execution */
export { default as searchRoutes } from './routes/search.routes.js'

/** @description Embed/widget routes for token management and public search */
export { default as searchEmbedRoutes } from './routes/search-embed.routes.js'

/** @description OpenAI-compatible search completion routes */
export { default as searchOpenaiRoutes } from './routes/search-openai.routes.js'

/** @description Search service singleton for app CRUD and search execution */
export { searchService } from './services/search.service.js'
