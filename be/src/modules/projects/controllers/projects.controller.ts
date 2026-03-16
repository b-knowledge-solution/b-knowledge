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
 * @description Build a UserContext object from the Express request's authenticated user
 * @param {Request} req - Express request with optional user property
 * @returns {object | undefined} UserContext object or undefined if not authenticated
 */
function getUserContext(req: Request) {
  // Guard: reject unauthenticated requests
  if (!req.user) return undefined
  return { id: req.user.id, email: req.user.email, role: req.user.role, ip: getClientIp(req) }
}

/**
 * @description Controller handling all project-related HTTP endpoints including CRUD,
 *   permissions, datasets, categories, versions, chats, searches, sync configs,
 *   and entity-level permissions
 */
export class ProjectsController {
  // -------------------------------------------------------------------------
  // Projects CRUD
  // -------------------------------------------------------------------------

  /**
   * @description GET /projects - List accessible projects for the current user
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listProjects(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication before listing projects
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const projects = await projectsService.getAccessibleProjects(user)
      res.json(projects)
    } catch (error) {
      log.error('Failed to list projects', { error: String(error) })
      res.status(500).json({ error: 'Failed to list projects' })
    }
  }

  /**
   * @description GET /projects/:id - Retrieve a single project by its UUID
   * @param {Request} req - Express request with project ID param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async getProject(req: Request, res: Response): Promise<void> {
    try {
      const project = await projectsService.getProjectById(req.params['id']!)
      // Guard: return 404 if project does not exist
      if (!project) { res.status(404).json({ error: 'Project not found' }); return }
      res.json(project)
    } catch (error) {
      log.error('Failed to get project', { error: String(error) })
      res.status(500).json({ error: 'Failed to get project' })
    }
  }

  /**
   * @description POST /projects - Create a new project with an auto-created linked dataset
   * @param {Request} req - Express request with project body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createProject(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for project creation
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const project = await projectsService.createProject(req.body, user)
      res.status(201).json(project)
    } catch (error: any) {
      log.error('Failed to create project', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create project' })
    }
  }

  /**
   * @description PUT /projects/:id - Update an existing project by UUID
   * @param {Request} req - Express request with project ID and update body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async updateProject(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for project updates
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const project = await projectsService.updateProject(req.params['id']!, req.body, user)
      // Guard: return 404 if project not found
      if (!project) { res.status(404).json({ error: 'Project not found' }); return }
      res.json(project)
    } catch (error: any) {
      log.error('Failed to update project', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update project' })
    }
  }

  /**
   * @description DELETE /projects/:id - Delete a project and cascade-delete auto-created datasets
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
   */
  async deleteProject(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for project deletion
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
   * @description GET /projects/:id/permissions - List all permission entries for a project
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
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
   * @description POST /projects/:id/permissions - Create or update a permission entry for a project
   * @param {Request} req - Express request with permission body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async setPermission(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for permission changes
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const perm = await projectsService.setPermission(req.params['id']!, req.body, user)
      res.status(201).json(perm)
    } catch (error: any) {
      log.error('Failed to set permission', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to set permission' })
    }
  }

  /**
   * @description DELETE /projects/:id/permissions/:permId - Remove a permission entry
   * @param {Request} req - Express request with permission ID
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
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
   * @description GET /projects/:id/datasets - List all datasets linked to a project
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
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
   * @description POST /projects/:id/datasets - Link an existing dataset or create a new one for a project
   * @param {Request} req - Express request with link/create body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async linkDataset(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for dataset linking
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const link = await projectsService.linkDataset(req.params['id']!, req.body, user)
      res.status(201).json(link)
    } catch (error: any) {
      log.error('Failed to link dataset', { error: String(error) })
      // Return 409 for duplicate dataset links, 500 for other errors
      const status = error.message?.includes('duplicate') ? 409 : 500
      res.status(status).json({ error: error.message || 'Failed to link dataset' })
    }
  }

  /**
   * @description DELETE /projects/:id/datasets/:datasetId - Remove a dataset link from a project
   * @param {Request} req - Express request with project and dataset IDs
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
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
   * @description GET /projects/:id/categories - List all document categories for a project
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
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
   * @description GET /projects/:id/categories/:catId - Retrieve a single category by UUID
   * @param {Request} req - Express request with category ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async getCategory(req: Request, res: Response): Promise<void> {
    try {
      const category = await projectCategoryService.getCategoryById(req.params['catId']!)
      // Guard: return 404 if category does not exist
      if (!category) { res.status(404).json({ error: 'Category not found' }); return }
      res.json(category)
    } catch (error) {
      log.error('Failed to get category', { error: String(error) })
      res.status(500).json({ error: 'Failed to get category' })
    }
  }

  /**
   * @description POST /projects/:id/categories - Create a new document category in a project
   * @param {Request} req - Express request with category body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createCategory(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for category creation
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const category = await projectCategoryService.createCategory(req.params['id']!, req.body, user)
      res.status(201).json(category)
    } catch (error: any) {
      log.error('Failed to create category', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create category' })
    }
  }

  /**
   * @description PUT /projects/:id/categories/:catId - Update an existing document category
   * @param {Request} req - Express request with category ID and update body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async updateCategory(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for category updates
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const category = await projectCategoryService.updateCategory(req.params['catId']!, req.body, user)
      // Guard: return 404 if category not found
      if (!category) { res.status(404).json({ error: 'Category not found' }); return }
      res.json(category)
    } catch (error: any) {
      log.error('Failed to update category', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update category' })
    }
  }

  /**
   * @description DELETE /projects/:id/categories/:catId - Delete a document category and cascade to versions/files
   * @param {Request} req - Express request with category ID
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
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
   * @description GET /projects/:id/categories/:catId/versions - List all versions for a document category
   * @param {Request} req - Express request with category ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
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
   * @description POST /projects/:id/categories/:catId/versions - Create a new category version
   * @param {Request} req - Express request with version body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createVersion(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for version creation
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const version = await projectCategoryService.createVersion(req.params['catId']!, req.body, user)
      res.status(201).json(version)
    } catch (error: any) {
      log.error('Failed to create version', { error: String(error) })
      // Return 409 for duplicate version labels, 500 for other errors
      const status = error.message?.includes('already exists') ? 409 : 500
      res.status(status).json({ error: error.message || 'Failed to create version' })
    }
  }

  /**
   * @description PUT /projects/:id/categories/:catId/versions/:verId - Update a category version
   * @param {Request} req - Express request with version ID and update body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async updateVersion(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for version updates
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const version = await projectCategoryService.updateVersion(req.params['verId']!, req.body, user)
      // Guard: return 404 if version not found
      if (!version) { res.status(404).json({ error: 'Version not found' }); return }
      res.json(version)
    } catch (error: any) {
      log.error('Failed to update version', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update version' })
    }
  }

  /**
   * @description DELETE /projects/:id/categories/:catId/versions/:verId - Delete a category version and its files
   * @param {Request} req - Express request with version ID
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
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
   * @description GET /projects/:id/categories/:catId/versions/:verId/documents - List files attached to a category version
   * @param {Request} req - Express request with version ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
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
   * @description GET /projects/:id/chats - List all chat assistants configured for a project
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
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
   * @description GET /projects/:id/chats/:chatId - Retrieve a single chat assistant by UUID
   * @param {Request} req - Express request with chat ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async getChat(req: Request, res: Response): Promise<void> {
    try {
      const chat = await projectChatService.getChatById(req.params['chatId']!)
      // Guard: return 404 if chat does not exist
      if (!chat) { res.status(404).json({ error: 'Chat not found' }); return }
      res.json(chat)
    } catch (error) {
      log.error('Failed to get chat', { error: String(error) })
      res.status(500).json({ error: 'Failed to get chat' })
    }
  }

  /**
   * @description POST /projects/:id/chats - Create a new chat assistant for a project
   * @param {Request} req - Express request with chat body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createChat(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for chat creation
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const chat = await projectChatService.createChat(req.params['id']!, req.body, user)
      res.status(201).json(chat)
    } catch (error: any) {
      log.error('Failed to create chat', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create chat' })
    }
  }

  /**
   * @description PUT /projects/:id/chats/:chatId - Update an existing project chat assistant
   * @param {Request} req - Express request with chat ID and update body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async updateChat(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for chat updates
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const chat = await projectChatService.updateChat(req.params['chatId']!, req.body, user)
      // Guard: return 404 if chat not found
      if (!chat) { res.status(404).json({ error: 'Chat not found' }); return }
      res.json(chat)
    } catch (error: any) {
      log.error('Failed to update chat', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update chat' })
    }
  }

  /**
   * @description DELETE /projects/:id/chats/:chatId - Delete a project chat assistant
   * @param {Request} req - Express request with chat ID
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
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
   * @description GET /projects/:id/searches - List all search apps configured for a project
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
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
   * @description GET /projects/:id/searches/:searchId - Retrieve a single search app by UUID
   * @param {Request} req - Express request with search ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async getSearch(req: Request, res: Response): Promise<void> {
    try {
      const search = await projectSearchService.getSearchById(req.params['searchId']!)
      // Guard: return 404 if search app does not exist
      if (!search) { res.status(404).json({ error: 'Search not found' }); return }
      res.json(search)
    } catch (error) {
      log.error('Failed to get search', { error: String(error) })
      res.status(500).json({ error: 'Failed to get search' })
    }
  }

  /**
   * @description POST /projects/:id/searches - Create a new search app for a project
   * @param {Request} req - Express request with search body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createSearch(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for search creation
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const search = await projectSearchService.createSearch(req.params['id']!, req.body, user)
      res.status(201).json(search)
    } catch (error: any) {
      log.error('Failed to create search', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create search' })
    }
  }

  /**
   * @description PUT /projects/:id/searches/:searchId - Update an existing project search app
   * @param {Request} req - Express request with search ID and update body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async updateSearch(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for search updates
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const search = await projectSearchService.updateSearch(req.params['searchId']!, req.body, user)
      // Guard: return 404 if search app not found
      if (!search) { res.status(404).json({ error: 'Search not found' }); return }
      res.json(search)
    } catch (error: any) {
      log.error('Failed to update search', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update search' })
    }
  }

  /**
   * @description DELETE /projects/:id/searches/:searchId - Delete a project search app
   * @param {Request} req - Express request with search ID
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
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
   * @description GET /projects/:id/sync-configs - List all external data sync configurations for a project
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
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
   * @description POST /projects/:id/sync-configs - Create a new external data sync configuration
   * @param {Request} req - Express request with sync config body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createSyncConfig(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for sync config creation
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const config = await projectSyncService.createSyncConfig(req.params['id']!, req.body, user)
      res.status(201).json(config)
    } catch (error: any) {
      log.error('Failed to create sync config', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create sync config' })
    }
  }

  /**
   * @description PUT /projects/:id/sync-configs/:configId - Update an existing sync configuration
   * @param {Request} req - Express request with config ID and update body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async updateSyncConfig(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for sync config updates
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const config = await projectSyncService.updateSyncConfig(req.params['configId']!, req.body, user)
      // Guard: return 404 if sync config not found
      if (!config) { res.status(404).json({ error: 'Sync config not found' }); return }
      res.json(config)
    } catch (error: any) {
      log.error('Failed to update sync config', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update sync config' })
    }
  }

  /**
   * @description DELETE /projects/:id/sync-configs/:configId - Delete an external data sync configuration
   * @param {Request} req - Express request with config ID
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
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
   * @description GET /projects/:id/entity-permissions - List fine-grained entity-level permissions for a project
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
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
   * @description POST /projects/:id/entity-permissions - Create a new entity-level permission grant
   * @param {Request} req - Express request with entity permission body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createEntityPermission(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for entity permission creation
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const perm = await projectsService.createEntityPermission(req.params['id']!, req.body, user)
      res.status(201).json(perm)
    } catch (error: any) {
      log.error('Failed to create entity permission', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create entity permission' })
    }
  }

  /**
   * @description DELETE /projects/:id/entity-permissions/:permId - Remove an entity-level permission grant
   * @param {Request} req - Express request with permission ID
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
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
