/**
 * @fileoverview Zod validation schemas for the Projects module.
 * @module schemas/projects
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------

/** Text ID param schema for project IDs */
export const projectIdParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
})

/** Project + permission ID params */
export const permissionParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  permId: z.string().min(1, 'Permission ID is required'),
})

/** Project + dataset ID params */
export const projectDatasetParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  datasetId: z.string().uuid('Invalid dataset UUID'),
})

/** Project + category ID params */
export const categoryParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  catId: z.string().min(1, 'Category ID is required'),
})

/** Project + category + version ID params */
export const versionParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  catId: z.string().min(1, 'Category ID is required'),
  verId: z.string().min(1, 'Version ID is required'),
})

/** Project + chat ID params */
export const chatParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  chatId: z.string().min(1, 'Chat ID is required'),
})

/** Project + search ID params */
export const searchParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  searchId: z.string().min(1, 'Search ID is required'),
})

/** Project + sync config ID params */
export const syncConfigParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  configId: z.string().min(1, 'Config ID is required'),
})

/** Project + entity permission ID params */
export const entityPermParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  permId: z.string().min(1, 'Entity permission ID is required'),
})

// ---------------------------------------------------------------------------
// Project CRUD schemas
// ---------------------------------------------------------------------------

/** POST /api/projects - body */
export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(255),
  description: z.string().max(2000).optional(),
  avatar: z.string().max(2000).optional(),
  ragflow_server_id: z.string().max(255).optional(),
  default_embedding_model: z.string().max(255).optional(),
  default_chunk_method: z.string().max(128).optional(),
  default_parser_config: z.record(z.unknown()).optional(),
  is_private: z.boolean().optional(),
})

/** PUT /api/projects/:id - body */
export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  avatar: z.string().max(2000).nullable().optional(),
  ragflow_server_id: z.string().max(255).nullable().optional(),
  default_embedding_model: z.string().max(255).nullable().optional(),
  default_chunk_method: z.string().max(128).nullable().optional(),
  default_parser_config: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'archived']).optional(),
  is_private: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Permission schemas
// ---------------------------------------------------------------------------

/** POST /api/projects/:id/permissions - body */
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

/** POST /api/projects/:id/datasets - body */
export const linkDatasetSchema = z.object({
  dataset_id: z.string().uuid('Invalid dataset UUID').optional(),
  create_new: z.boolean().optional(),
  dataset_name: z.string().min(1).max(255).optional(),
})

// ---------------------------------------------------------------------------
// Category schemas
// ---------------------------------------------------------------------------

/** POST /api/projects/:id/categories - body */
export const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(255),
  description: z.string().max(2000).optional(),
  sort_order: z.number().int().min(0).optional(),
  dataset_config: z.record(z.unknown()).optional(),
})

/** PUT /api/projects/:id/categories/:catId - body */
export const updateCategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  dataset_config: z.record(z.unknown()).optional(),
})

// ---------------------------------------------------------------------------
// Category Version schemas
// ---------------------------------------------------------------------------

/** POST /api/projects/:id/categories/:catId/versions - body */
export const createCategoryVersionSchema = z.object({
  version_label: z.string().min(1, 'Version label is required').max(128),
  metadata: z.record(z.unknown()).optional(),
})

/** PUT /api/projects/:id/categories/:catId/versions/:verId - body */
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

/** POST /api/projects/:id/chats - body */
export const createChatSchema = z.object({
  name: z.string().min(1, 'Chat name is required').max(255),
  dataset_ids: z.array(z.string()).optional(),
  ragflow_dataset_ids: z.array(z.string()).optional(),
  llm_config: z.record(z.unknown()).optional(),
  prompt_config: z.record(z.unknown()).optional(),
})

/** PUT /api/projects/:id/chats/:chatId - body */
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

/** POST /api/projects/:id/searches - body */
export const createSearchSchema = z.object({
  name: z.string().min(1, 'Search name is required').max(255),
  description: z.string().max(2000).optional(),
  dataset_ids: z.array(z.string()).optional(),
  ragflow_dataset_ids: z.array(z.string()).optional(),
  search_config: z.record(z.unknown()).optional(),
})

/** PUT /api/projects/:id/searches/:searchId - body */
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

/** POST /api/projects/:id/sync-configs - body */
export const createSyncConfigSchema = z.object({
  source_type: z.enum(['sharepoint', 'jira', 'confluence', 'gitlab', 'github']),
  connection_config: z.string().min(1, 'Connection config is required'),
  sync_schedule: z.string().max(128).optional(),
  filter_rules: z.record(z.unknown()).optional(),
})

/** PUT /api/projects/:id/sync-configs/:configId - body */
export const updateSyncConfigSchema = z.object({
  connection_config: z.string().optional(),
  sync_schedule: z.string().max(128).nullable().optional(),
  filter_rules: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'paused']).optional(),
})

// ---------------------------------------------------------------------------
// Entity Permission schemas
// ---------------------------------------------------------------------------

/** POST /api/projects/:id/entity-permissions - body */
export const createEntityPermissionSchema = z.object({
  entity_type: z.enum(['category', 'chat', 'search']),
  entity_id: z.string().min(1, 'Entity ID is required'),
  grantee_type: z.enum(['user', 'team']),
  grantee_id: z.string().min(1, 'Grantee ID is required'),
  permission_level: z.enum(['none', 'view', 'create', 'edit', 'delete']).optional().default('view'),
})
