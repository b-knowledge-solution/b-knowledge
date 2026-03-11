/**
 * @fileoverview Controller for all project-related HTTP request handlers.
 * @module controllers/projects
 */
import { Request, Response } from 'express'
import { projectsService } from '../services/projects.service.js'
import { projectCategoryService } from '../services/project-category.service.js'
import { projectChatService } from '../services/project-chat.service.js'
import { projectSearchService } from '../services/project-search.service.js'
import { projectSyncService } from '../services/project-sync.service.js'
import { log } from '@/shared/services/logger.service.js'
import { getClientIp } from '@/shared/utils/ip.js'

/**
 * Helper to build UserContext from the request.
 * @param req - Express request
 * @returns UserContext object or undefined if not authenticated
 */
function getUserContext(req: Request) {
  if (!req.user) return undefined
  return { id: req.user.id, email: req.user.email, role: req.user.role, ip: getClientIp(req) }
}

/**
 * ProjectsController handles all project HTTP endpoints.
 */
export class ProjectsController {
  // -------------------------------------------------------------------------
  // Projects CRUD
  // -------------------------------------------------------------------------

  /**
   * GET /projects - List accessible projects for the current user.
   * @param req - Express request
   * @param res - Express response
   */
  async listProjects(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const projects = await projectsService.getAccessibleProjects(user)
      res.json(projects)
    } catch (error) {
      log.error('Failed to list projects', { error: String(error) })
      res.status(500).json({ error: 'Failed to list projects' })
    }
  }

  /**
   * GET /projects/:id - Get a single project by ID.
   * @param req - Express request with project ID param
   * @param res - Express response
   */
  async getProject(req: Request, res: Response): Promise<void> {
    try {
      const project = await projectsService.getProjectById(req.params['id']!)
      if (!project) { res.status(404).json({ error: 'Project not found' }); return }
      res.json(project)
    } catch (error) {
      log.error('Failed to get project', { error: String(error) })
      res.status(500).json({ error: 'Failed to get project' })
    }
  }

  /**
   * POST /projects - Create a new project with auto-created dataset.
   * @param req - Express request with project body
   * @param res - Express response
   */
  async createProject(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const project = await projectsService.createProject(req.body, user)
      res.status(201).json(project)
    } catch (error: any) {
      log.error('Failed to create project', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create project' })
    }
  }

  /**
   * PUT /projects/:id - Update a project.
   * @param req - Express request with project ID and update body
   * @param res - Express response
   */
  async updateProject(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const project = await projectsService.updateProject(req.params['id']!, req.body, user)
      if (!project) { res.status(404).json({ error: 'Project not found' }); return }
      res.json(project)
    } catch (error: any) {
      log.error('Failed to update project', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update project' })
    }
  }

  /**
   * DELETE /projects/:id - Delete a project and cascade auto-created datasets.
   * @param req - Express request with project ID
   * @param res - Express response (204 on success)
   */
  async deleteProject(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      await projectsService.deleteProject(req.params['id']!, user)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to delete project', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete project' })
    }
  }

  // -------------------------------------------------------------------------
  // Permissions
  // -------------------------------------------------------------------------

  /**
   * GET /projects/:id/permissions - List project permissions.
   * @param req - Express request with project ID
   * @param res - Express response
   */
  async listPermissions(req: Request, res: Response): Promise<void> {
    try {
      const perms = await projectsService.getPermissions(req.params['id']!)
      res.json(perms)
    } catch (error) {
      log.error('Failed to list permissions', { error: String(error) })
      res.status(500).json({ error: 'Failed to list permissions' })
    }
  }

  /**
   * POST /projects/:id/permissions - Set (upsert) a permission.
   * @param req - Express request with permission body
   * @param res - Express response
   */
  async setPermission(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const perm = await projectsService.setPermission(req.params['id']!, req.body, user)
      res.status(201).json(perm)
    } catch (error: any) {
      log.error('Failed to set permission', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to set permission' })
    }
  }

  /**
   * DELETE /projects/:id/permissions/:permId - Delete a permission.
   * @param req - Express request with permission ID
   * @param res - Express response (204 on success)
   */
  async deletePermission(req: Request, res: Response): Promise<void> {
    try {
      await projectsService.deletePermission(req.params['permId']!)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to delete permission', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete permission' })
    }
  }

  // -------------------------------------------------------------------------
  // Project Datasets
  // -------------------------------------------------------------------------

  /**
   * GET /projects/:id/datasets - List linked datasets.
   * @param req - Express request with project ID
   * @param res - Express response
   */
  async listDatasets(req: Request, res: Response): Promise<void> {
    try {
      const datasets = await projectsService.getProjectDatasets(req.params['id']!)
      res.json(datasets)
    } catch (error) {
      log.error('Failed to list project datasets', { error: String(error) })
      res.status(500).json({ error: 'Failed to list datasets' })
    }
  }

  /**
   * POST /projects/:id/datasets - Link or create a dataset.
   * @param req - Express request with link/create body
   * @param res - Express response
   */
  async linkDataset(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const link = await projectsService.linkDataset(req.params['id']!, req.body, user)
      res.status(201).json(link)
    } catch (error: any) {
      log.error('Failed to link dataset', { error: String(error) })
      const status = error.message?.includes('duplicate') ? 409 : 500
      res.status(status).json({ error: error.message || 'Failed to link dataset' })
    }
  }

  /**
   * DELETE /projects/:id/datasets/:datasetId - Unlink a dataset.
   * @param req - Express request with project and dataset IDs
   * @param res - Express response (204 on success)
   */
  async unlinkDataset(req: Request, res: Response): Promise<void> {
    try {
      await projectsService.unlinkDataset(req.params['id']!, req.params['datasetId']!)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to unlink dataset', { error: String(error) })
      res.status(500).json({ error: 'Failed to unlink dataset' })
    }
  }

  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  /**
   * GET /projects/:id/categories - List project categories.
   * @param req - Express request with project ID
   * @param res - Express response
   */
  async listCategories(req: Request, res: Response): Promise<void> {
    try {
      const categories = await projectCategoryService.listCategories(req.params['id']!)
      res.json(categories)
    } catch (error) {
      log.error('Failed to list categories', { error: String(error) })
      res.status(500).json({ error: 'Failed to list categories' })
    }
  }

  /**
   * GET /projects/:id/categories/:catId - Get a single category.
   * @param req - Express request with category ID
   * @param res - Express response
   */
  async getCategory(req: Request, res: Response): Promise<void> {
    try {
      const category = await projectCategoryService.getCategoryById(req.params['catId']!)
      if (!category) { res.status(404).json({ error: 'Category not found' }); return }
      res.json(category)
    } catch (error) {
      log.error('Failed to get category', { error: String(error) })
      res.status(500).json({ error: 'Failed to get category' })
    }
  }

  /**
   * POST /projects/:id/categories - Create a category.
   * @param req - Express request with category body
   * @param res - Express response
   */
  async createCategory(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const category = await projectCategoryService.createCategory(req.params['id']!, req.body, user)
      res.status(201).json(category)
    } catch (error: any) {
      log.error('Failed to create category', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create category' })
    }
  }

  /**
   * PUT /projects/:id/categories/:catId - Update a category.
   * @param req - Express request with category ID and update body
   * @param res - Express response
   */
  async updateCategory(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const category = await projectCategoryService.updateCategory(req.params['catId']!, req.body, user)
      if (!category) { res.status(404).json({ error: 'Category not found' }); return }
      res.json(category)
    } catch (error: any) {
      log.error('Failed to update category', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update category' })
    }
  }

  /**
   * DELETE /projects/:id/categories/:catId - Delete a category.
   * @param req - Express request with category ID
   * @param res - Express response (204 on success)
   */
  async deleteCategory(req: Request, res: Response): Promise<void> {
    try {
      await projectCategoryService.deleteCategory(req.params['catId']!)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to delete category', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete category' })
    }
  }

  // -------------------------------------------------------------------------
  // Category Versions
  // -------------------------------------------------------------------------

  /**
   * GET /projects/:id/categories/:catId/versions - List category versions.
   * @param req - Express request with category ID
   * @param res - Express response
   */
  async listVersions(req: Request, res: Response): Promise<void> {
    try {
      const versions = await projectCategoryService.listVersions(req.params['catId']!)
      res.json(versions)
    } catch (error) {
      log.error('Failed to list versions', { error: String(error) })
      res.status(500).json({ error: 'Failed to list versions' })
    }
  }

  /**
   * POST /projects/:id/categories/:catId/versions - Create a version.
   * @param req - Express request with version body
   * @param res - Express response
   */
  async createVersion(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const version = await projectCategoryService.createVersion(req.params['catId']!, req.body, user)
      res.status(201).json(version)
    } catch (error: any) {
      log.error('Failed to create version', { error: String(error) })
      const status = error.message?.includes('already exists') ? 409 : 500
      res.status(status).json({ error: error.message || 'Failed to create version' })
    }
  }

  /**
   * PUT /projects/:id/categories/:catId/versions/:verId - Update a version.
   * @param req - Express request with version ID and update body
   * @param res - Express response
   */
  async updateVersion(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const version = await projectCategoryService.updateVersion(req.params['verId']!, req.body, user)
      if (!version) { res.status(404).json({ error: 'Version not found' }); return }
      res.json(version)
    } catch (error: any) {
      log.error('Failed to update version', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update version' })
    }
  }

  /**
   * DELETE /projects/:id/categories/:catId/versions/:verId - Delete a version.
   * @param req - Express request with version ID
   * @param res - Express response (204 on success)
   */
  async deleteVersion(req: Request, res: Response): Promise<void> {
    try {
      await projectCategoryService.deleteVersion(req.params['verId']!)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to delete version', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete version' })
    }
  }

  /**
   * GET /projects/:id/categories/:catId/versions/:verId/documents - List version files.
   * @param req - Express request with version ID
   * @param res - Express response
   */
  async listVersionDocuments(req: Request, res: Response): Promise<void> {
    try {
      const files = await projectCategoryService.listVersionFiles(req.params['verId']!)
      res.json(files)
    } catch (error) {
      log.error('Failed to list version documents', { error: String(error) })
      res.status(500).json({ error: 'Failed to list version documents' })
    }
  }

  // -------------------------------------------------------------------------
  // Chats
  // -------------------------------------------------------------------------

  /**
   * GET /projects/:id/chats - List project chats.
   * @param req - Express request with project ID
   * @param res - Express response
   */
  async listChats(req: Request, res: Response): Promise<void> {
    try {
      const chats = await projectChatService.listChats(req.params['id']!)
      res.json(chats)
    } catch (error) {
      log.error('Failed to list chats', { error: String(error) })
      res.status(500).json({ error: 'Failed to list chats' })
    }
  }

  /**
   * GET /projects/:id/chats/:chatId - Get a single chat.
   * @param req - Express request with chat ID
   * @param res - Express response
   */
  async getChat(req: Request, res: Response): Promise<void> {
    try {
      const chat = await projectChatService.getChatById(req.params['chatId']!)
      if (!chat) { res.status(404).json({ error: 'Chat not found' }); return }
      res.json(chat)
    } catch (error) {
      log.error('Failed to get chat', { error: String(error) })
      res.status(500).json({ error: 'Failed to get chat' })
    }
  }

  /**
   * POST /projects/:id/chats - Create a project chat.
   * @param req - Express request with chat body
   * @param res - Express response
   */
  async createChat(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const chat = await projectChatService.createChat(req.params['id']!, req.body, user)
      res.status(201).json(chat)
    } catch (error: any) {
      log.error('Failed to create chat', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create chat' })
    }
  }

  /**
   * PUT /projects/:id/chats/:chatId - Update a project chat.
   * @param req - Express request with chat ID and update body
   * @param res - Express response
   */
  async updateChat(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const chat = await projectChatService.updateChat(req.params['chatId']!, req.body, user)
      if (!chat) { res.status(404).json({ error: 'Chat not found' }); return }
      res.json(chat)
    } catch (error: any) {
      log.error('Failed to update chat', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update chat' })
    }
  }

  /**
   * DELETE /projects/:id/chats/:chatId - Delete a project chat.
   * @param req - Express request with chat ID
   * @param res - Express response (204 on success)
   */
  async deleteChat(req: Request, res: Response): Promise<void> {
    try {
      await projectChatService.deleteChat(req.params['chatId']!)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to delete chat', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete chat' })
    }
  }

  // -------------------------------------------------------------------------
  // Searches
  // -------------------------------------------------------------------------

  /**
   * GET /projects/:id/searches - List project searches.
   * @param req - Express request with project ID
   * @param res - Express response
   */
  async listSearches(req: Request, res: Response): Promise<void> {
    try {
      const searches = await projectSearchService.listSearches(req.params['id']!)
      res.json(searches)
    } catch (error) {
      log.error('Failed to list searches', { error: String(error) })
      res.status(500).json({ error: 'Failed to list searches' })
    }
  }

  /**
   * GET /projects/:id/searches/:searchId - Get a single search.
   * @param req - Express request with search ID
   * @param res - Express response
   */
  async getSearch(req: Request, res: Response): Promise<void> {
    try {
      const search = await projectSearchService.getSearchById(req.params['searchId']!)
      if (!search) { res.status(404).json({ error: 'Search not found' }); return }
      res.json(search)
    } catch (error) {
      log.error('Failed to get search', { error: String(error) })
      res.status(500).json({ error: 'Failed to get search' })
    }
  }

  /**
   * POST /projects/:id/searches - Create a project search.
   * @param req - Express request with search body
   * @param res - Express response
   */
  async createSearch(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const search = await projectSearchService.createSearch(req.params['id']!, req.body, user)
      res.status(201).json(search)
    } catch (error: any) {
      log.error('Failed to create search', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create search' })
    }
  }

  /**
   * PUT /projects/:id/searches/:searchId - Update a project search.
   * @param req - Express request with search ID and update body
   * @param res - Express response
   */
  async updateSearch(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const search = await projectSearchService.updateSearch(req.params['searchId']!, req.body, user)
      if (!search) { res.status(404).json({ error: 'Search not found' }); return }
      res.json(search)
    } catch (error: any) {
      log.error('Failed to update search', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update search' })
    }
  }

  /**
   * DELETE /projects/:id/searches/:searchId - Delete a project search.
   * @param req - Express request with search ID
   * @param res - Express response (204 on success)
   */
  async deleteSearch(req: Request, res: Response): Promise<void> {
    try {
      await projectSearchService.deleteSearch(req.params['searchId']!)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to delete search', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete search' })
    }
  }

  // -------------------------------------------------------------------------
  // Sync Configs
  // -------------------------------------------------------------------------

  /**
   * GET /projects/:id/sync-configs - List sync configs.
   * @param req - Express request with project ID
   * @param res - Express response
   */
  async listSyncConfigs(req: Request, res: Response): Promise<void> {
    try {
      const configs = await projectSyncService.listSyncConfigs(req.params['id']!)
      res.json(configs)
    } catch (error) {
      log.error('Failed to list sync configs', { error: String(error) })
      res.status(500).json({ error: 'Failed to list sync configs' })
    }
  }

  /**
   * POST /projects/:id/sync-configs - Create a sync config.
   * @param req - Express request with sync config body
   * @param res - Express response
   */
  async createSyncConfig(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const config = await projectSyncService.createSyncConfig(req.params['id']!, req.body, user)
      res.status(201).json(config)
    } catch (error: any) {
      log.error('Failed to create sync config', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create sync config' })
    }
  }

  /**
   * PUT /projects/:id/sync-configs/:configId - Update a sync config.
   * @param req - Express request with config ID and update body
   * @param res - Express response
   */
  async updateSyncConfig(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const config = await projectSyncService.updateSyncConfig(req.params['configId']!, req.body, user)
      if (!config) { res.status(404).json({ error: 'Sync config not found' }); return }
      res.json(config)
    } catch (error: any) {
      log.error('Failed to update sync config', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update sync config' })
    }
  }

  /**
   * DELETE /projects/:id/sync-configs/:configId - Delete a sync config.
   * @param req - Express request with config ID
   * @param res - Express response (204 on success)
   */
  async deleteSyncConfig(req: Request, res: Response): Promise<void> {
    try {
      await projectSyncService.deleteSyncConfig(req.params['configId']!)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to delete sync config', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete sync config' })
    }
  }

  // -------------------------------------------------------------------------
  // Entity Permissions
  // -------------------------------------------------------------------------

  /**
   * GET /projects/:id/entity-permissions - List entity permissions.
   * @param req - Express request with project ID
   * @param res - Express response
   */
  async listEntityPermissions(req: Request, res: Response): Promise<void> {
    try {
      const perms = await projectsService.getEntityPermissions(req.params['id']!)
      res.json(perms)
    } catch (error) {
      log.error('Failed to list entity permissions', { error: String(error) })
      res.status(500).json({ error: 'Failed to list entity permissions' })
    }
  }

  /**
   * POST /projects/:id/entity-permissions - Create an entity permission.
   * @param req - Express request with entity permission body
   * @param res - Express response
   */
  async createEntityPermission(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const perm = await projectsService.createEntityPermission(req.params['id']!, req.body, user)
      res.status(201).json(perm)
    } catch (error: any) {
      log.error('Failed to create entity permission', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create entity permission' })
    }
  }

  /**
   * DELETE /projects/:id/entity-permissions/:permId - Delete an entity permission.
   * @param req - Express request with permission ID
   * @param res - Express response (204 on success)
   */
  async deleteEntityPermission(req: Request, res: Response): Promise<void> {
    try {
      await projectsService.deleteEntityPermission(req.params['permId']!)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to delete entity permission', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete entity permission' })
    }
  }
}
