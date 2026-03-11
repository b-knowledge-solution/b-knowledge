/**
 * @fileoverview Barrel export for the Projects module.
 * @module modules/projects
 */
export { default as projectRoutes } from './routes/projects.routes.js'
export { projectsService } from './services/projects.service.js'
export { projectCategoryService } from './services/project-category.service.js'
export { projectChatService } from './services/project-chat.service.js'
export { projectSearchService } from './services/project-search.service.js'
export { projectSyncService } from './services/project-sync.service.js'
