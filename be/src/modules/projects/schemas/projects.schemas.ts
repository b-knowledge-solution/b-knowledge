/**
 * @fileoverview Zod validation schemas for the Projects module.
 * @module schemas/projects
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------

/** @description Validates project ID path parameter */
export const projectIdParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
})

/** @description Validates project ID and permission ID path parameters */
export const permissionParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  permId: z.string().min(1, 'Permission ID is required'),
})

/** @description Validates project ID and dataset UUID path parameters */
export const projectDatasetParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  datasetId: z.string().uuid('Invalid dataset UUID'),
})

/** @description Validates project ID and category ID path parameters */
export const categoryParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  catId: z.string().min(1, 'Category ID is required'),
})

/** @description Validates project, category, and version ID path parameters */
export const versionParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  catId: z.string().min(1, 'Category ID is required'),
  verId: z.string().min(1, 'Version ID is required'),
})

/** @description Validates project ID and chat ID path parameters */
export const chatParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  chatId: z.string().min(1, 'Chat ID is required'),
})

/** @description Validates project ID and search ID path parameters */
export const searchParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  searchId: z.string().min(1, 'Search ID is required'),
})

/** @description Validates project ID and sync config ID path parameters */
export const syncConfigParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  configId: z.string().min(1, 'Config ID is required'),
})

/** @description Validates project ID and entity permission ID path parameters */
export const entityPermParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  permId: z.string().min(1, 'Entity permission ID is required'),
})

// ---------------------------------------------------------------------------
// Project CRUD schemas
// ---------------------------------------------------------------------------

/** @description Validates POST /api/projects request body for project creation */
export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(255),
  description: z.string().max(2000).optional(),
  avatar: z.string().max(2000).optional(),
  default_embedding_model: z.string().max(255).optional(),
  default_chunk_method: z.string().max(128).optional(),
  default_parser_config: z.record(z.unknown()).optional(),
  is_private: z.boolean().optional(),
})

/** @description Validates PUT /api/projects/:id request body for project updates */
export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  avatar: z.string().max(2000).nullable().optional(),
  default_embedding_model: z.string().max(255).nullable().optional(),
  default_chunk_method: z.string().max(128).nullable().optional(),
  default_parser_config: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'archived']).optional(),
  is_private: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Permission schemas
// ---------------------------------------------------------------------------

/** @description Validates POST /api/projects/:id/permissions body for permission upsert */
export const setPermissionSchema = z.object({
  grantee_type: z.enum(['user', 'team']),
  grantee_id: z.string().min(1, 'Grantee ID is required'),
  tab_documents: z.enum(['none', 'view', 'manage']).optional().default('none'),
  tab_chat: z.enum(['none', 'view', 'manage']).optional().default('none'),
  tab_settings: z.enum(['none', 'view', 'manage']).optional().default('none'),
})

// ---------------------------------------------------------------------------
// Project Datasets schemas
// ---------------------------------------------------------------------------

/** @description Validates POST /api/projects/:id/datasets body for dataset linking */
export const linkDatasetSchema = z.object({
  dataset_id: z.string().uuid('Invalid dataset UUID').optional(),
  create_new: z.boolean().optional(),
  dataset_name: z.string().min(1).max(255).optional(),
})

// ---------------------------------------------------------------------------
// Category schemas
// ---------------------------------------------------------------------------

/** @description Validates POST /api/projects/:id/categories body for category creation */
export const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(255),
  description: z.string().max(2000).optional(),
  sort_order: z.number().int().min(0).optional(),
  dataset_config: z.record(z.unknown()).optional(),
})

/** @description Validates PUT /api/projects/:id/categories/:catId body for category updates */
export const updateCategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  dataset_config: z.record(z.unknown()).optional(),
})

// ---------------------------------------------------------------------------
// Category Version schemas
// ---------------------------------------------------------------------------

/** @description Validates POST body for category version creation */
export const createCategoryVersionSchema = z.object({
  version_label: z.string().min(1, 'Version label is required').max(128),
  metadata: z.record(z.unknown()).optional(),
})

/** @description Validates PUT body for category version updates */
export const updateCategoryVersionSchema = z.object({
  version_label: z.string().min(1).max(128).optional(),
  status: z.enum(['active', 'archived']).optional(),
  ragflow_dataset_id: z.string().max(255).optional(),
  ragflow_dataset_name: z.string().max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
})

// ---------------------------------------------------------------------------
// Chat schemas
// ---------------------------------------------------------------------------

/** @description Validates POST /api/projects/:id/chats body for chat creation */
export const createChatSchema = z.object({
  name: z.string().min(1, 'Chat name is required').max(255),
  dataset_ids: z.array(z.string()).optional(),
  ragflow_dataset_ids: z.array(z.string()).optional(),
  llm_config: z.record(z.unknown()).optional(),
  prompt_config: z.record(z.unknown()).optional(),
})

/** @description Validates PUT /api/projects/:id/chats/:chatId body for chat updates */
export const updateChatSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  dataset_ids: z.array(z.string()).optional(),
  ragflow_dataset_ids: z.array(z.string()).optional(),
  llm_config: z.record(z.unknown()).optional(),
  prompt_config: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
})

// ---------------------------------------------------------------------------
// Search schemas
// ---------------------------------------------------------------------------

/** @description Validates POST /api/projects/:id/searches body for search creation */
export const createSearchSchema = z.object({
  name: z.string().min(1, 'Search name is required').max(255),
  description: z.string().max(2000).optional(),
  dataset_ids: z.array(z.string()).optional(),
  ragflow_dataset_ids: z.array(z.string()).optional(),
  search_config: z.record(z.unknown()).optional(),
})

/** @description Validates PUT /api/projects/:id/searches/:searchId body for search updates */
export const updateSearchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  dataset_ids: z.array(z.string()).optional(),
  ragflow_dataset_ids: z.array(z.string()).optional(),
  search_config: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
})

// ---------------------------------------------------------------------------
// Sync Config schemas
// ---------------------------------------------------------------------------

/** @description Validates POST /api/projects/:id/sync-configs body for sync config creation */
export const createSyncConfigSchema = z.object({
  source_type: z.enum(['sharepoint', 'jira', 'confluence', 'gitlab', 'github']),
  connection_config: z.string().min(1, 'Connection config is required'),
  sync_schedule: z.string().max(128).optional(),
  filter_rules: z.record(z.unknown()).optional(),
})

/** @description Validates PUT body for sync config updates */
export const updateSyncConfigSchema = z.object({
  connection_config: z.string().optional(),
  sync_schedule: z.string().max(128).nullable().optional(),
  filter_rules: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'paused']).optional(),
})

// ---------------------------------------------------------------------------
// Entity Permission schemas
// ---------------------------------------------------------------------------

/** @description Validates POST body for entity-level permission creation */
export const createEntityPermissionSchema = z.object({
  entity_type: z.enum(['category', 'chat', 'search']),
  entity_id: z.string().min(1, 'Entity ID is required'),
  grantee_type: z.enum(['user', 'team']),
  grantee_id: z.string().min(1, 'Grantee ID is required'),
  permission_level: z.enum(['none', 'view', 'create', 'edit', 'delete']).optional().default('view'),
})

// ---------------------------------------------------------------------------
// Member Management schemas (PROJ-03)
// ---------------------------------------------------------------------------

/** @description Validates POST /api/projects/:id/members body for adding a project member */
export const addMemberSchema = z.object({
  user_id: z.string().uuid('Invalid user UUID'),
})

/** @description Validates project ID and user ID path parameters for member removal */
export const memberParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  userId: z.string().uuid('Invalid user UUID'),
})

// ---------------------------------------------------------------------------
// Dataset Binding schemas (PROJ-02)
// ---------------------------------------------------------------------------

/** @description Validates POST /api/projects/:id/datasets/bind body for batch dataset binding */
export const bindDatasetsSchema = z.object({
  dataset_ids: z.array(z.string().uuid('Invalid dataset UUID')).min(1, 'At least one dataset required').max(50, 'Maximum 50 datasets per request'),
})

// ---------------------------------------------------------------------------
// Activity Feed schemas
// ---------------------------------------------------------------------------

/** @description Validates GET /api/projects/:id/activity query params for pagination */
export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
