/**
 * @fileoverview Route definitions for the Projects module.
 * @module routes/projects
 */
import { Router } from 'express'
import { ProjectsController } from '../controllers/projects.controller.js'
import { requireAuth, requireAbility } from '@/shared/middleware/auth.middleware.js'
import { requireTenant } from '@/shared/middleware/tenant.middleware.js'
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
// Projects CRUD — tenant-scoped with CASL ability checks
// -------------------------------------------------------------------------
router.get('/', requireAuth, requireTenant, requireAbility('read', 'Project'), controller.listProjects.bind(controller))
router.get('/:id', requireAuth, requireTenant, requireAbility('read', 'Project'), controller.getProject.bind(controller))
router.post('/', requireAuth, requireTenant, requireAbility('manage', 'Project'), validate(createProjectSchema), controller.createProject.bind(controller))
router.put('/:id', requireAuth, requireTenant, requireAbility('manage', 'Project'), validate({ params: projectIdParamSchema, body: updateProjectSchema }), controller.updateProject.bind(controller))
router.delete('/:id', requireAuth, requireTenant, requireAbility('manage', 'Project'), controller.deleteProject.bind(controller))

// -------------------------------------------------------------------------
// Permissions — require manage ability for permission operations
// -------------------------------------------------------------------------
router.get('/:id/permissions', requireAuth, requireTenant, requireAbility('read', 'Project'), controller.listPermissions.bind(controller))
router.post('/:id/permissions', requireAuth, requireTenant, requireAbility('manage', 'Project'), validate({ params: projectIdParamSchema, body: setPermissionSchema }), controller.setPermission.bind(controller))
router.delete('/:id/permissions/:permId', requireAuth, requireTenant, requireAbility('manage', 'Project'), controller.deletePermission.bind(controller))

// -------------------------------------------------------------------------
// Project Datasets
// -------------------------------------------------------------------------
router.get('/:id/datasets', requireAuth, requireTenant, requireAbility('read', 'Project'), controller.listDatasets.bind(controller))
router.post('/:id/datasets', requireAuth, requireTenant, requireAbility('manage', 'Project'), validate({ params: projectIdParamSchema, body: linkDatasetSchema }), controller.linkDataset.bind(controller))
router.delete('/:id/datasets/:datasetId', requireAuth, requireTenant, requireAbility('manage', 'Project'), controller.unlinkDataset.bind(controller))

// -------------------------------------------------------------------------
// Categories
// -------------------------------------------------------------------------
router.get('/:id/categories', requireAuth, requireTenant, requireAbility('read', 'Project'), controller.listCategories.bind(controller))
router.get('/:id/categories/:catId', requireAuth, requireTenant, requireAbility('read', 'Project'), controller.getCategory.bind(controller))
router.post('/:id/categories', requireAuth, requireTenant, requireAbility('manage', 'Project'), validate({ params: projectIdParamSchema, body: createCategorySchema }), controller.createCategory.bind(controller))
router.put('/:id/categories/:catId', requireAuth, requireTenant, requireAbility('manage', 'Project'), validate({ params: categoryParamSchema, body: updateCategorySchema }), controller.updateCategory.bind(controller))
router.delete('/:id/categories/:catId', requireAuth, requireTenant, requireAbility('manage', 'Project'), controller.deleteCategory.bind(controller))

// -------------------------------------------------------------------------
// Category Versions
// -------------------------------------------------------------------------
router.get('/:id/categories/:catId/versions', requireAuth, requireTenant, requireAbility('read', 'Project'), controller.listVersions.bind(controller))
router.post('/:id/categories/:catId/versions', requireAuth, requireTenant, requireAbility('manage', 'Project'), validate({ params: categoryParamSchema, body: createCategoryVersionSchema }), controller.createVersion.bind(controller))
router.put('/:id/categories/:catId/versions/:verId', requireAuth, requireTenant, requireAbility('manage', 'Project'), validate({ params: versionParamSchema, body: updateCategoryVersionSchema }), controller.updateVersion.bind(controller))
router.delete('/:id/categories/:catId/versions/:verId', requireAuth, requireTenant, requireAbility('manage', 'Project'), controller.deleteVersion.bind(controller))

// Version Documents
router.get('/:id/categories/:catId/versions/:verId/documents', requireAuth, requireTenant, requireAbility('read', 'Project'), controller.listVersionDocuments.bind(controller))

// -------------------------------------------------------------------------
// Chats
// -------------------------------------------------------------------------
router.get('/:id/chats', requireAuth, requireTenant, requireAbility('read', 'Project'), controller.listChats.bind(controller))
router.get('/:id/chats/:chatId', requireAuth, requireTenant, requireAbility('read', 'Project'), controller.getChat.bind(controller))
router.post('/:id/chats', requireAuth, requireTenant, requireAbility('manage', 'Project'), validate({ params: projectIdParamSchema, body: createChatSchema }), controller.createChat.bind(controller))
router.put('/:id/chats/:chatId', requireAuth, requireTenant, requireAbility('manage', 'Project'), validate({ params: chatParamSchema, body: updateChatSchema }), controller.updateChat.bind(controller))
router.delete('/:id/chats/:chatId', requireAuth, requireTenant, requireAbility('manage', 'Project'), controller.deleteChat.bind(controller))

// -------------------------------------------------------------------------
// Searches
// -------------------------------------------------------------------------
router.get('/:id/searches', requireAuth, requireTenant, requireAbility('read', 'Project'), controller.listSearches.bind(controller))
router.get('/:id/searches/:searchId', requireAuth, requireTenant, requireAbility('read', 'Project'), controller.getSearch.bind(controller))
router.post('/:id/searches', requireAuth, requireTenant, requireAbility('manage', 'Project'), validate({ params: projectIdParamSchema, body: createSearchSchema }), controller.createSearch.bind(controller))
router.put('/:id/searches/:searchId', requireAuth, requireTenant, requireAbility('manage', 'Project'), validate({ params: searchParamSchema, body: updateSearchSchema }), controller.updateSearch.bind(controller))
router.delete('/:id/searches/:searchId', requireAuth, requireTenant, requireAbility('manage', 'Project'), controller.deleteSearch.bind(controller))

// -------------------------------------------------------------------------
// Sync Configs
// -------------------------------------------------------------------------
router.get('/:id/sync-configs', requireAuth, requireTenant, requireAbility('read', 'Project'), controller.listSyncConfigs.bind(controller))
router.post('/:id/sync-configs', requireAuth, requireTenant, requireAbility('manage', 'Project'), validate({ params: projectIdParamSchema, body: createSyncConfigSchema }), controller.createSyncConfig.bind(controller))
router.put('/:id/sync-configs/:configId', requireAuth, requireTenant, requireAbility('manage', 'Project'), validate({ params: syncConfigParamSchema, body: updateSyncConfigSchema }), controller.updateSyncConfig.bind(controller))
router.delete('/:id/sync-configs/:configId', requireAuth, requireTenant, requireAbility('manage', 'Project'), controller.deleteSyncConfig.bind(controller))

// -------------------------------------------------------------------------
// Entity Permissions
// -------------------------------------------------------------------------
router.get('/:id/entity-permissions', requireAuth, requireTenant, requireAbility('read', 'Project'), controller.listEntityPermissions.bind(controller))
router.post('/:id/entity-permissions', requireAuth, requireTenant, requireAbility('manage', 'Project'), validate({ params: projectIdParamSchema, body: createEntityPermissionSchema }), controller.createEntityPermission.bind(controller))
router.delete('/:id/entity-permissions/:permId', requireAuth, requireTenant, requireAbility('manage', 'Project'), controller.deleteEntityPermission.bind(controller))

export default router
