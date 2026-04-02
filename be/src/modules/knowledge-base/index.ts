/**
 * @fileoverview Barrel export for the Knowledge Base module.
 * @description Public API surface for the knowledge-base module. External modules should
 *   import only from this file, never from internal paths.
 * @module modules/knowledge-base
 */

/** @description Knowledge base routes for Express router registration */
export { default as knowledgeBaseRoutes } from './routes/knowledge-base.routes.js'

/** @description Core knowledge base service singleton for CRUD and RBAC operations */
export { knowledgeBaseService } from './services/knowledge-base.service.js'

/** @description Category service singleton for document category management */
export { knowledgeBaseCategoryService } from './services/knowledge-base-category.service.js'

/** @description Chat service singleton for knowledge base chat assistant management */
export { knowledgeBaseChatService } from './services/knowledge-base-chat.service.js'

/** @description Search service singleton for knowledge base search app management */
export { knowledgeBaseSearchService } from './services/knowledge-base-search.service.js'

/** @description Sync service singleton for external data sync configuration */
export { knowledgeBaseSyncService } from './services/knowledge-base-sync.service.js'
