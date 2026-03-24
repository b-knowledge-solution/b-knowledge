/**
 * @fileoverview Barrel export for the Projects module.
 * @description Public API surface for the projects module. External modules should
 *   import only from this file, never from internal paths.
 * @module modules/projects
 */

/** @description Project routes for Express router registration */
export { default as projectRoutes } from './routes/projects.routes.js'

/** @description Core project service singleton for CRUD and RBAC operations */
export { projectsService } from './services/projects.service.js'

/** @description Category service singleton for document category management */
export { projectCategoryService } from './services/project-category.service.js'

/** @description Chat service singleton for project chat assistant management */
export { projectChatService } from './services/project-chat.service.js'

/** @description Search service singleton for project search app management */
export { projectSearchService } from './services/project-search.service.js'

/** @description Sync service singleton for external data sync configuration */
export { projectSyncService } from './services/project-sync.service.js'
