/**
 * @fileoverview Route definitions for the Knowledge Base module.
 * @module routes/knowledge-base
 */
import { Router } from 'express'
import multer from 'multer'
import { KnowledgeBaseController } from '../controllers/knowledge-base.controller.js'
import { requireAuth, requireAbility, requireRole } from '@/shared/middleware/auth.middleware.js'
import { requireTenant } from '@/shared/middleware/tenant.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import {
  knowledgeBaseIdParamSchema,
  permissionParamSchema,
  knowledgeBaseDatasetParamSchema,
  categoryParamSchema,
  versionParamSchema,
  chatParamSchema,
  searchParamSchema,
  syncConfigParamSchema,
  entityPermParamSchema,
  createKnowledgeBaseSchema,
  updateKnowledgeBaseSchema,
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
  addMemberSchema,
  memberParamSchema,
  bindDatasetsSchema,
  activityQuerySchema,
  importGitSchema,
} from '../schemas/knowledge-base.schemas.js'

const router = Router()
const controller = new KnowledgeBaseController()
// Use memory storage for file uploads — files are forwarded to S3 immediately
const upload = multer({ storage: multer.memoryStorage() })

// -------------------------------------------------------------------------
// Cross-Knowledge-Base Dataset Resolver — must be before /:id to avoid param collision
// -------------------------------------------------------------------------
router.get('/cross-knowledge-base-datasets', requireAuth, requireTenant, controller.getCrossKnowledgeBaseDatasets.bind(controller))

// -------------------------------------------------------------------------
// Knowledge Base CRUD — tenant-scoped with CASL ability checks
// -------------------------------------------------------------------------
router.get('/', requireAuth, requireTenant, requireAbility('read', 'KnowledgeBase'), controller.listKnowledgeBases.bind(controller))
router.get('/:id', requireAuth, requireTenant, requireAbility('read', 'KnowledgeBase'), controller.getKnowledgeBase.bind(controller))
router.post('/', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), validate(createKnowledgeBaseSchema), controller.createKnowledgeBase.bind(controller))
router.put('/:id', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), validate({ params: knowledgeBaseIdParamSchema, body: updateKnowledgeBaseSchema }), controller.updateKnowledgeBase.bind(controller))
router.delete('/:id', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), controller.deleteKnowledgeBase.bind(controller))

// -------------------------------------------------------------------------
// Permissions — require manage ability for permission operations
// -------------------------------------------------------------------------
router.get('/:id/permissions', requireAuth, requireTenant, requireAbility('read', 'KnowledgeBase'), controller.listPermissions.bind(controller))
router.post('/:id/permissions', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), validate({ params: knowledgeBaseIdParamSchema, body: setPermissionSchema }), controller.setPermission.bind(controller))
router.delete('/:id/permissions/:permId', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), controller.deletePermission.bind(controller))

// -------------------------------------------------------------------------
// Knowledge Base Datasets
// -------------------------------------------------------------------------
router.get('/:id/datasets', requireAuth, requireTenant, requireAbility('read', 'KnowledgeBase'), controller.listDatasets.bind(controller))
router.post('/:id/datasets', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), validate({ params: knowledgeBaseIdParamSchema, body: linkDatasetSchema }), controller.linkDataset.bind(controller))
router.delete('/:id/datasets/:datasetId', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), controller.unlinkDataset.bind(controller))

// -------------------------------------------------------------------------
// Categories
// -------------------------------------------------------------------------
router.get('/:id/categories', requireAuth, requireTenant, requireAbility('read', 'KnowledgeBase'), controller.listCategories.bind(controller))
router.get('/:id/categories/:catId', requireAuth, requireTenant, requireAbility('read', 'KnowledgeBase'), controller.getCategory.bind(controller))
router.post('/:id/categories', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), validate({ params: knowledgeBaseIdParamSchema, body: createCategorySchema }), controller.createCategory.bind(controller))
router.put('/:id/categories/:catId', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), validate({ params: categoryParamSchema, body: updateCategorySchema }), controller.updateCategory.bind(controller))
router.delete('/:id/categories/:catId', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), controller.deleteCategory.bind(controller))

// -------------------------------------------------------------------------
// Category Versions
// -------------------------------------------------------------------------
router.get('/:id/categories/:catId/versions', requireAuth, requireTenant, requireAbility('read', 'KnowledgeBase'), controller.listVersions.bind(controller))
router.post('/:id/categories/:catId/versions', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), validate({ params: categoryParamSchema, body: createCategoryVersionSchema }), controller.createVersion.bind(controller))
router.put('/:id/categories/:catId/versions/:verId', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), validate({ params: versionParamSchema, body: updateCategoryVersionSchema }), controller.updateVersion.bind(controller))
router.delete('/:id/categories/:catId/versions/:verId', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), controller.deleteVersion.bind(controller))

// -------------------------------------------------------------------------
// Code Import — Git clone and ZIP upload into code categories
// -------------------------------------------------------------------------
router.post('/:id/categories/:catId/import-git', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), validate({ params: categoryParamSchema, body: importGitSchema }), controller.importGitRepo.bind(controller))
router.post('/:id/categories/:catId/import-zip', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), upload.single('file'), controller.importZipFile.bind(controller))

// Version Document sub-routes — registered before base /documents to avoid ambiguity
router.post('/:id/categories/:catId/versions/:verId/documents/requeue', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), controller.requeueVersionDocuments.bind(controller))
router.post('/:id/categories/:catId/versions/:verId/documents/parse', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), controller.parseVersionDocuments.bind(controller))
router.get('/:id/categories/:catId/versions/:verId/documents/parser-status', requireAuth, requireTenant, requireAbility('read', 'KnowledgeBase'), controller.syncVersionParserStatus.bind(controller))

// Version Documents — CRUD
router.get('/:id/categories/:catId/versions/:verId/documents', requireAuth, requireTenant, requireAbility('read', 'KnowledgeBase'), controller.listVersionDocuments.bind(controller))
router.post('/:id/categories/:catId/versions/:verId/documents', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), upload.array('file'), controller.uploadVersionDocuments.bind(controller))
router.delete('/:id/categories/:catId/versions/:verId/documents', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), controller.deleteVersionDocuments.bind(controller))

// -------------------------------------------------------------------------
// Chats
// -------------------------------------------------------------------------
router.get('/:id/chats', requireAuth, requireTenant, requireAbility('read', 'KnowledgeBase'), controller.listChats.bind(controller))
router.get('/:id/chats/:chatId', requireAuth, requireTenant, requireAbility('read', 'KnowledgeBase'), controller.getChat.bind(controller))
router.post('/:id/chats', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), validate({ params: knowledgeBaseIdParamSchema, body: createChatSchema }), controller.createChat.bind(controller))
router.put('/:id/chats/:chatId', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), validate({ params: chatParamSchema, body: updateChatSchema }), controller.updateChat.bind(controller))
router.delete('/:id/chats/:chatId', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), controller.deleteChat.bind(controller))

// -------------------------------------------------------------------------
// Searches
// -------------------------------------------------------------------------
router.get('/:id/searches', requireAuth, requireTenant, requireAbility('read', 'KnowledgeBase'), controller.listSearches.bind(controller))
router.get('/:id/searches/:searchId', requireAuth, requireTenant, requireAbility('read', 'KnowledgeBase'), controller.getSearch.bind(controller))
router.post('/:id/searches', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), validate({ params: knowledgeBaseIdParamSchema, body: createSearchSchema }), controller.createSearch.bind(controller))
router.put('/:id/searches/:searchId', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), validate({ params: searchParamSchema, body: updateSearchSchema }), controller.updateSearch.bind(controller))
router.delete('/:id/searches/:searchId', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), controller.deleteSearch.bind(controller))

// -------------------------------------------------------------------------
// Sync Configs
// -------------------------------------------------------------------------
router.get('/:id/sync-configs', requireAuth, requireTenant, requireAbility('read', 'KnowledgeBase'), controller.listSyncConfigs.bind(controller))
router.post('/:id/sync-configs', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), validate({ params: knowledgeBaseIdParamSchema, body: createSyncConfigSchema }), controller.createSyncConfig.bind(controller))
router.put('/:id/sync-configs/:configId', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), validate({ params: syncConfigParamSchema, body: updateSyncConfigSchema }), controller.updateSyncConfig.bind(controller))
router.delete('/:id/sync-configs/:configId', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), controller.deleteSyncConfig.bind(controller))

// -------------------------------------------------------------------------
// Entity Permissions
// -------------------------------------------------------------------------
router.get('/:id/entity-permissions', requireAuth, requireTenant, requireAbility('read', 'KnowledgeBase'), controller.listEntityPermissions.bind(controller))
router.post('/:id/entity-permissions', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), validate({ params: knowledgeBaseIdParamSchema, body: createEntityPermissionSchema }), controller.createEntityPermission.bind(controller))
router.delete('/:id/entity-permissions/:permId', requireAuth, requireTenant, requireAbility('manage', 'KnowledgeBase'), controller.deleteEntityPermission.bind(controller))

// -------------------------------------------------------------------------
// Members — admin/leader can add/remove, all auth users can list
// -------------------------------------------------------------------------
router.get('/:id/members', requireAuth, requireTenant, requireAbility('read', 'KnowledgeBase'), controller.getMembers.bind(controller))
router.post('/:id/members', requireAuth, requireTenant, requireRole('admin', 'leader'), validate({ params: knowledgeBaseIdParamSchema, body: addMemberSchema }), controller.addMember.bind(controller))
router.delete('/:id/members/:userId', requireAuth, requireTenant, requireRole('admin', 'leader'), controller.removeMember.bind(controller))

// -------------------------------------------------------------------------
// Dataset Binding — admin/leader can bind/unbind
// -------------------------------------------------------------------------
router.post('/:id/datasets/bind', requireAuth, requireTenant, requireRole('admin', 'leader'), validate({ params: knowledgeBaseIdParamSchema, body: bindDatasetsSchema }), controller.bindDatasets.bind(controller))
router.delete('/:id/datasets/:datasetId/unbind', requireAuth, requireTenant, requireRole('admin', 'leader'), controller.unbindDataset.bind(controller))

// -------------------------------------------------------------------------
// Activity Feed — paginated audit log scoped to knowledge base
// -------------------------------------------------------------------------
router.get('/:id/activity', requireAuth, requireTenant, validate({ query: activityQuerySchema }), controller.getActivity.bind(controller))

export default router
