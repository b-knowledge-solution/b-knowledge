/**
 * @fileoverview Route definitions for the Projects module.
 * @module routes/projects
 */
import { Router } from 'express'
import { ProjectsController } from '../controllers/projects.controller.js'
import { requireAuth, requirePermission } from '@/shared/middleware/auth.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import {
  projectIdParamSchema,
  permissionParamSchema,
  projectDatasetParamSchema,
  categoryParamSchema,
  versionParamSchema,
  chatParamSchema,
  searchParamSchema,
  syncConfigParamSchema,
  entityPermParamSchema,
  createProjectSchema,
  updateProjectSchema,
  setPermissionSchema,
  linkDatasetSchema,
  createCategorySchema,
  updateCategorySchema,
  createCategoryVersionSchema,
  updateCategoryVersionSchema,
  createChatSchema,
  updateChatSchema,
  createSearchSchema,
  updateSearchSchema,
  createSyncConfigSchema,
  updateSyncConfigSchema,
  createEntityPermissionSchema,
} from '../schemas/projects.schemas.js'

const router = Router()
const controller = new ProjectsController()

// -------------------------------------------------------------------------
// Projects CRUD
// -------------------------------------------------------------------------
router.get('/', requireAuth, controller.listProjects.bind(controller))
router.get('/:id', requireAuth, controller.getProject.bind(controller))
router.post('/', requireAuth, validate(createProjectSchema), controller.createProject.bind(controller))
router.put('/:id', requireAuth, validate({ params: projectIdParamSchema, body: updateProjectSchema }), controller.updateProject.bind(controller))
router.delete('/:id', requireAuth, controller.deleteProject.bind(controller))

// -------------------------------------------------------------------------
// Permissions
// -------------------------------------------------------------------------
router.get('/:id/permissions', requireAuth, controller.listPermissions.bind(controller))
router.post('/:id/permissions', requireAuth, validate({ params: projectIdParamSchema, body: setPermissionSchema }), controller.setPermission.bind(controller))
router.delete('/:id/permissions/:permId', requireAuth, controller.deletePermission.bind(controller))

// -------------------------------------------------------------------------
// Project Datasets
// -------------------------------------------------------------------------
router.get('/:id/datasets', requireAuth, controller.listDatasets.bind(controller))
router.post('/:id/datasets', requireAuth, validate({ params: projectIdParamSchema, body: linkDatasetSchema }), controller.linkDataset.bind(controller))
router.delete('/:id/datasets/:datasetId', requireAuth, controller.unlinkDataset.bind(controller))

// -------------------------------------------------------------------------
// Categories
// -------------------------------------------------------------------------
router.get('/:id/categories', requireAuth, controller.listCategories.bind(controller))
router.get('/:id/categories/:catId', requireAuth, controller.getCategory.bind(controller))
router.post('/:id/categories', requireAuth, validate({ params: projectIdParamSchema, body: createCategorySchema }), controller.createCategory.bind(controller))
router.put('/:id/categories/:catId', requireAuth, validate({ params: categoryParamSchema, body: updateCategorySchema }), controller.updateCategory.bind(controller))
router.delete('/:id/categories/:catId', requireAuth, controller.deleteCategory.bind(controller))

// -------------------------------------------------------------------------
// Category Versions
// -------------------------------------------------------------------------
router.get('/:id/categories/:catId/versions', requireAuth, controller.listVersions.bind(controller))
router.post('/:id/categories/:catId/versions', requireAuth, validate({ params: categoryParamSchema, body: createCategoryVersionSchema }), controller.createVersion.bind(controller))
router.put('/:id/categories/:catId/versions/:verId', requireAuth, validate({ params: versionParamSchema, body: updateCategoryVersionSchema }), controller.updateVersion.bind(controller))
router.delete('/:id/categories/:catId/versions/:verId', requireAuth, controller.deleteVersion.bind(controller))

// Version Documents
router.get('/:id/categories/:catId/versions/:verId/documents', requireAuth, controller.listVersionDocuments.bind(controller))

// -------------------------------------------------------------------------
// Chats
// -------------------------------------------------------------------------
router.get('/:id/chats', requireAuth, controller.listChats.bind(controller))
router.get('/:id/chats/:chatId', requireAuth, controller.getChat.bind(controller))
router.post('/:id/chats', requireAuth, validate({ params: projectIdParamSchema, body: createChatSchema }), controller.createChat.bind(controller))
router.put('/:id/chats/:chatId', requireAuth, validate({ params: chatParamSchema, body: updateChatSchema }), controller.updateChat.bind(controller))
router.delete('/:id/chats/:chatId', requireAuth, controller.deleteChat.bind(controller))

// -------------------------------------------------------------------------
// Searches
// -------------------------------------------------------------------------
router.get('/:id/searches', requireAuth, controller.listSearches.bind(controller))
router.get('/:id/searches/:searchId', requireAuth, controller.getSearch.bind(controller))
router.post('/:id/searches', requireAuth, validate({ params: projectIdParamSchema, body: createSearchSchema }), controller.createSearch.bind(controller))
router.put('/:id/searches/:searchId', requireAuth, validate({ params: searchParamSchema, body: updateSearchSchema }), controller.updateSearch.bind(controller))
router.delete('/:id/searches/:searchId', requireAuth, controller.deleteSearch.bind(controller))

// -------------------------------------------------------------------------
// Sync Configs
// -------------------------------------------------------------------------
router.get('/:id/sync-configs', requireAuth, controller.listSyncConfigs.bind(controller))
router.post('/:id/sync-configs', requireAuth, validate({ params: projectIdParamSchema, body: createSyncConfigSchema }), controller.createSyncConfig.bind(controller))
router.put('/:id/sync-configs/:configId', requireAuth, validate({ params: syncConfigParamSchema, body: updateSyncConfigSchema }), controller.updateSyncConfig.bind(controller))
router.delete('/:id/sync-configs/:configId', requireAuth, controller.deleteSyncConfig.bind(controller))

// -------------------------------------------------------------------------
// Entity Permissions
// -------------------------------------------------------------------------
router.get('/:id/entity-permissions', requireAuth, controller.listEntityPermissions.bind(controller))
router.post('/:id/entity-permissions', requireAuth, validate({ params: projectIdParamSchema, body: createEntityPermissionSchema }), controller.createEntityPermission.bind(controller))
router.delete('/:id/entity-permissions/:permId', requireAuth, controller.deleteEntityPermission.bind(controller))

export default router
