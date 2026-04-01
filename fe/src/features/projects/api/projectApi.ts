/**
 * @fileoverview API functions for project management.
 * Typed functions for project CRUD, permissions, categories, versions, chats.
 * @module features/projects/api/projectApi
 */
import { api, apiFetch } from "@/lib/api";

// ============================================================================
// Types
// ============================================================================

/** Category type discriminator per D-01: documents (versioned), standard (single dataset), code (code parser) */
export type DocumentCategoryType = 'documents' | 'standard' | 'code'

/**
 * Represents a project (type-agnostic container per D-01).
 */
export interface Project {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  default_embedding_model: string | null;
  default_chunk_method: string;
  default_parser_config: Record<string, unknown> | null;
  status: string;
  is_private: boolean;
  dataset_count?: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Represents a dataset linked to a project.
 */
export interface ProjectDataset {
  id: string;
  project_id: string;
  dataset_id: string;
  auto_created: boolean;
  created_at: string;
  dataset_name?: string;
  dataset_chunk_count?: number;
  dataset_doc_count?: number;
}

/**
 * Represents a project member with user details and role.
 */
export interface ProjectMember {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

/**
 * Represents a single audit-log activity entry for a project.
 */
export interface ActivityEntry {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  user_email: string;
  details: Record<string, unknown>;
  created_at: string;
}

/** Sync source type for datasync projects. */
export type SyncSourceType = 'sharepoint' | 'jira' | 'confluence' | 'gitlab' | 'github';

/**
 * Represents a sync configuration for a datasync project.
 */
export interface ProjectSyncConfig {
  id: string;
  project_id: string;
  source_type: SyncSourceType;
  connection_config: Record<string, unknown>;
  sync_schedule: string | null;
  filter_rules: Record<string, unknown>;
  last_synced_at: string | null;
  status: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Represents a project permission.
 */
export interface ProjectPermission {
  id: string;
  project_id: string;
  grantee_type: "user" | "team";
  grantee_id: string;
  tab_documents: "none" | "view" | "manage";
  tab_chat: "none" | "view" | "manage";
  tab_settings: "none" | "view" | "manage";
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Represents a document category with type discriminator.
 */
export interface DocumentCategory {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  /** Category type: documents (versioned), standard (single dataset), code (code parser) */
  category_type: DocumentCategoryType;
  /** Dataset ID for standard/code categories (null for documents) */
  dataset_id: string | null;
  dataset_config: Record<string, any> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Represents a version of a document category.
 */
export interface DocumentCategoryVersion {
  id: string;
  category_id: string;
  version_label: string;
  ragflow_dataset_id: string | null;
  ragflow_dataset_name: string | null;
  status: string;
  last_synced_at: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Represents a project chat assistant.
 */
export interface ProjectChat {
  id: string;
  project_id: string;
  name: string;
  ragflow_chat_id: string | null;
  dataset_ids: string[];
  ragflow_dataset_ids: string[];
  llm_config: Record<string, unknown>;
  prompt_config: Record<string, unknown>;
  status: string;
  last_synced_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Project API
// ============================================================================

/**
 * @description List projects accessible to the current user
 * @returns {Promise<Project[]>} Array of project records
 */
export const getProjects = (): Promise<Project[]> => api.get("/api/projects");

/**
 * @description Get a project by ID
 * @param {string} id - Project UUID
 * @returns {Promise<Project>} Project record
 */
export const getProjectById = (id: string): Promise<Project> =>
  api.get(`/api/projects/${id}`);

/**
 * @description Create a new project
 * @param {object} data - Project creation payload
 * @returns {Promise<Project>} Created project record
 */
export const createProject = (data: {
  name: string;
  description?: string;
  avatar?: string;
  default_embedding_model?: string;
  default_chunk_method?: string;
  default_parser_config?: Record<string, unknown>;
  is_private?: boolean;
  first_version_label?: string;
}): Promise<Project> => api.post("/api/projects", data);

/**
 * @description Update a project
 * @param {string} id - Project UUID
 * @param {Partial<Project>} data - Fields to update
 * @returns {Promise<Project>} Updated project record
 */
export const updateProject = (
  id: string,
  data: Partial<Project>,
): Promise<Project> => api.put(`/api/projects/${id}`, data);

/**
 * @description Delete a project
 * @param {string} id - Project UUID
 * @returns {Promise<void>}
 */
export const deleteProject = (id: string): Promise<void> =>
  api.delete(`/api/projects/${id}`);

// ============================================================================
// Permissions API
// ============================================================================

/**
 * @description Get permissions for a project
 * @param {string} projectId - Project UUID
 * @returns {Promise<ProjectPermission[]>} Array of permission records
 */
export const getProjectPermissions = (
  projectId: string,
): Promise<ProjectPermission[]> =>
  api.get(`/api/projects/${projectId}/permissions`);

/**
 * @description Set a permission for a grantee on a project
 * @param {string} projectId - Project UUID
 * @param {object} data - Permission data including grantee and tab access levels
 * @returns {Promise<ProjectPermission>} Created or updated permission record
 */
export const setProjectPermission = (
  projectId: string,
  data: {
    grantee_type: string;
    grantee_id: string;
    tab_documents: string;
    tab_chat: string;
    tab_settings: string;
  },
): Promise<ProjectPermission> =>
  api.post(`/api/projects/${projectId}/permissions`, data);

/**
 * @description Remove a permission from a project
 * @param {string} projectId - Project UUID
 * @param {string} permissionId - Permission UUID to remove
 * @returns {Promise<void>}
 */
export const removeProjectPermission = (
  projectId: string,
  permissionId: string,
): Promise<void> =>
  api.delete(`/api/projects/${projectId}/permissions/${permissionId}`);

// ============================================================================
// Document Categories API
// ============================================================================

/**
 * @description List document categories for a project
 * @param {string} projectId - Project UUID
 * @returns {Promise<DocumentCategory[]>} Array of category records
 */
export const getDocumentCategories = (
  projectId: string,
): Promise<DocumentCategory[]> =>
  api.get(`/api/projects/${projectId}/categories`);

/**
 * @description Create a document category within a project
 * @param {string} projectId - Project UUID
 * @param {object} data - Category creation data with name and optional config
 * @returns {Promise<DocumentCategory>} Created category record
 */
export const createDocumentCategory = (
  projectId: string,
  data: {
    name: string;
    description?: string;
    sort_order?: number;
    category_type?: DocumentCategoryType;
    dataset_config?: Record<string, any>;
  },
): Promise<DocumentCategory> =>
  api.post(`/api/projects/${projectId}/categories`, data);

/**
 * @description Update a document category
 * @param {string} projectId - Project UUID
 * @param {string} categoryId - Category UUID
 * @param {Partial<DocumentCategory>} data - Fields to update
 * @returns {Promise<DocumentCategory>} Updated category record
 */
export const updateDocumentCategory = (
  projectId: string,
  categoryId: string,
  data: Partial<DocumentCategory>,
): Promise<DocumentCategory> =>
  api.put(`/api/projects/${projectId}/categories/${categoryId}`, data);

/**
 * @description Delete a document category
 * @param {string} projectId - Project UUID
 * @param {string} categoryId - Category UUID
 * @returns {Promise<void>}
 */
export const deleteDocumentCategory = (
  projectId: string,
  categoryId: string,
): Promise<void> =>
  api.delete(`/api/projects/${projectId}/categories/${categoryId}`);

// ============================================================================
// Document Category Versions API
// ============================================================================

/**
 * @description List versions for a document category
 * @param {string} projectId - Project UUID
 * @param {string} categoryId - Category UUID
 * @returns {Promise<DocumentCategoryVersion[]>} Array of version records
 */
export const getCategoryVersions = (
  projectId: string,
  categoryId: string,
): Promise<DocumentCategoryVersion[]> =>
  api.get(`/api/projects/${projectId}/categories/${categoryId}/versions`);

/**
 * @description Create a new version within a document category
 * @param {string} projectId - Project UUID
 * @param {string} categoryId - Category UUID
 * @param {object} data - Version creation data including label and parser config
 * @returns {Promise<DocumentCategoryVersion>} Created version record
 */
export const createCategoryVersion = (
  projectId: string,
  categoryId: string,
  data: {
    version_label: string;
    language?: string;
    pagerank?: number;
    pipeline_id?: string;
    parse_type?: number;
    chunk_method?: string;
    parser_config?: Record<string, any>;
  },
): Promise<DocumentCategoryVersion> =>
  api.post(
    `/api/projects/${projectId}/categories/${categoryId}/versions`,
    data,
  );

/**
 * @description Sync a version's dataset from RAGFlow
 * @param {string} projectId - Project UUID
 * @param {string} categoryId - Category UUID
 * @param {string} versionId - Version UUID
 * @returns {Promise<DocumentCategoryVersion>} Updated version record
 */
export const syncCategoryVersion = (
  projectId: string,
  categoryId: string,
  versionId: string,
): Promise<DocumentCategoryVersion> =>
  api.post(
    `/api/projects/${projectId}/categories/${categoryId}/versions/${versionId}/sync`,
  );

/**
 * @description Archive (deactivate) a version
 * @param {string} projectId - Project UUID
 * @param {string} categoryId - Category UUID
 * @param {string} versionId - Version UUID
 * @returns {Promise<DocumentCategoryVersion>} Updated version record with archived status
 */
export const archiveCategoryVersion = (
  projectId: string,
  categoryId: string,
  versionId: string,
): Promise<DocumentCategoryVersion> =>
  api.put(
    `/api/projects/${projectId}/categories/${categoryId}/versions/${versionId}/archive`,
  );

/**
 * @description Update a version's metadata (e.g. label, parser config)
 * @param {string} projectId - Project UUID
 * @param {string} categoryId - Category UUID
 * @param {string} versionId - Version UUID
 * @param {object} data - Fields to update
 * @returns {Promise<DocumentCategoryVersion>} Updated version record
 */
export const updateCategoryVersion = (
  projectId: string,
  categoryId: string,
  versionId: string,
  data: {
    version_label?: string;
    pagerank?: number;
    pipeline_id?: string;
    parse_type?: number;
    chunk_method?: string;
    parser_config?: Record<string, any>;
  },
): Promise<DocumentCategoryVersion> =>
  api.put(
    `/api/projects/${projectId}/categories/${categoryId}/versions/${versionId}`,
    data,
  );

/**
 * @description Delete a version and its associated RAGFlow dataset
 * @param {string} projectId - Project UUID
 * @param {string} categoryId - Category UUID
 * @param {string} versionId - Version UUID
 * @returns {Promise<void>}
 */
export const deleteCategoryVersion = (
  projectId: string,
  categoryId: string,
  versionId: string,
): Promise<void> =>
  api.delete(
    `/api/projects/${projectId}/categories/${categoryId}/versions/${versionId}`,
  );

// ============================================================================
// Version Documents API
// ============================================================================

/**
 * Represents a document stored in a RAGFlow dataset.
 */
export interface VersionDocument {
  id: string;
  name: string;
  size: number;
  type: string;
  run: string;
  status: string;
  created_by: string;
  create_time: number;
  update_time: number;
  chunk_count: number;
  token_count: number;
  progress: number;
  progress_msg: string;
}

/**
 * @description List documents in a version's dataset with optional pagination and search
 * @param {string} projectId - Project UUID
 * @param {string} categoryId - Category UUID
 * @param {string} versionId - Version UUID
 * @param {object} [query] - Optional pagination and search parameters
 * @returns {Promise<VersionDocument[]>} Array of document records
 */
export const getVersionDocuments = (
  projectId: string,
  categoryId: string,
  versionId: string,
  query?: {
    page?: number;
    page_size?: number;
    keywords?: string;
  },
): Promise<VersionDocument[]> => {
  // Build query string from optional pagination/search params
  const params = new URLSearchParams();
  if (query?.page) params.set("page", String(query.page));
  if (query?.page_size) params.set("page_size", String(query.page_size));
  if (query?.keywords) params.set("keywords", query.keywords);
  const qs = params.toString();
  return api.get(
    `/api/projects/${projectId}/categories/${categoryId}/versions/${versionId}/documents${qs ? "?" + qs : ""}`,
  );
};

/**
 * Upload a document to a version's dataset.
 * Uses FormData for multipart upload.
 */
export const uploadVersionDocument = (
  projectId: string,
  categoryId: string,
  versionId: string,
  file: File,
): Promise<unknown> => {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch(
    `/api/projects/${projectId}/categories/${categoryId}/versions/${versionId}/documents`,
    {
      method: "POST",
      body: formData,
      headers: {}, // Let browser set multipart content-type
    },
  );
};

/**
 * Delete multiple documents from a version's local storage.
 * @param projectId - Project UUID
 * @param categoryId - Category UUID
 * @param versionId - Version UUID
 * @param fileNames - Array of file names to delete
 * @returns Object with deleted and failed file name arrays
 */
export const deleteVersionDocuments = (
  projectId: string,
  categoryId: string,
  versionId: string,
  fileNames: string[],
): Promise<{ deleted: string[]; failed: string[] }> =>
  apiFetch(
    `/api/projects/${projectId}/categories/${categoryId}/versions/${versionId}/documents`,
    {
      method: "DELETE",
      body: JSON.stringify({ fileNames }),
    },
  );

/**
 * Re-queue local files for conversion.
 * @param projectId - Project UUID
 * @param categoryId - Category UUID
 * @param versionId - Version UUID
 * @param fileNames - Array of file names to re-queue
 * @returns Object with queued and failed file name arrays
 */
export const requeueVersionDocuments = (
  projectId: string,
  categoryId: string,
  versionId: string,
  fileNames: string[],
): Promise<{ queued: string[]; failed: string[] }> =>
  apiFetch(
    `/api/projects/${projectId}/categories/${categoryId}/versions/${versionId}/documents/requeue`,
    {
      method: "POST",
      body: JSON.stringify({ fileNames }),
    },
  );

/**
 * Start parsing selected documents in RAGFlow.
 * @param projectId - Project UUID
 * @param categoryId - Category UUID
 * @param versionId - Version UUID
 * @param fileNames - Array of file names to parse
 * @returns Object with parsed and failed file name arrays
 */
export const parseVersionDocuments = (
  projectId: string,
  categoryId: string,
  versionId: string,
  fileNames: string[],
): Promise<{ parsed: string[]; failed: string[] }> =>
  apiFetch(
    `/api/projects/${projectId}/categories/${categoryId}/versions/${versionId}/documents/parse`,
    {
      method: "POST",
      body: JSON.stringify({ fileNames }),
    },
  );

// ============================================================================
// Code Import API
// ============================================================================

/**
 * @description Import code files from a Git repository into a code category
 * @param {string} projectId - Project UUID
 * @param {string} categoryId - Category UUID
 * @param {object} params - Git import parameters
 * @param {string} params.url - Git repository URL
 * @param {string} [params.branch] - Branch name (defaults to 'main')
 * @param {string} [params.path] - Subdirectory path to import from
 * @param {object} [params.credentials] - Authentication credentials for private repos
 * @returns {Promise<{ taskId: string; fileCount: number }>} Import task info
 */
export const importGitRepo = (
  projectId: string,
  categoryId: string,
  params: { url: string; branch?: string; path?: string; credentials?: { auth_method: string; token?: string; username?: string } },
): Promise<{ taskId: string; fileCount: number }> =>
  api.post(`/api/projects/${projectId}/categories/${categoryId}/import-git`, params)

/**
 * @description Import code files from a ZIP archive into a code category
 * @param {string} projectId - Project UUID
 * @param {string} categoryId - Category UUID
 * @param {File} file - ZIP file to upload
 * @returns {Promise<{ taskId: string; fileCount: number }>} Import task info
 */
export const importZipFile = (
  projectId: string,
  categoryId: string,
  file: File,
): Promise<{ taskId: string; fileCount: number }> => {
  const formData = new FormData()
  formData.append('file', file)
  return apiFetch(`/api/projects/${projectId}/categories/${categoryId}/import-zip`, {
    method: 'POST',
    body: formData,
  })
}

// ============================================================================
// Project Chats API
// ============================================================================

/**
 * @description List chat assistants for a project
 * @param {string} projectId - Project UUID
 * @returns {Promise<ProjectChat[]>} Array of chat assistant records
 */
export const getProjectChats = (projectId: string): Promise<ProjectChat[]> =>
  api.get(`/api/projects/${projectId}/chats`);

/**
 * @description Get a chat assistant by ID
 * @param {string} projectId - Project UUID
 * @param {string} chatId - Chat UUID
 * @returns {Promise<ProjectChat>} Chat assistant record
 */
export const getProjectChatById = (
  projectId: string,
  chatId: string,
): Promise<ProjectChat> =>
  api.get(`/api/projects/${projectId}/chats/${chatId}`);

/**
 * @description Create a chat assistant for a project
 * @param {string} projectId - Project UUID
 * @param {object} data - Chat creation payload including name and dataset IDs
 * @returns {Promise<ProjectChat>} Created chat assistant record
 */
export const createProjectChat = (
  projectId: string,
  data: {
    name: string;
    dataset_ids?: string[];
    ragflow_dataset_ids?: string[];
    llm_config?: Record<string, unknown>;
    prompt_config?: Record<string, unknown>;
  },
): Promise<ProjectChat> => api.post(`/api/projects/${projectId}/chats`, data);

/**
 * @description Update a chat assistant
 * @param {string} projectId - Project UUID
 * @param {string} chatId - Chat UUID
 * @param {Partial<ProjectChat>} data - Fields to update
 * @returns {Promise<ProjectChat>} Updated chat assistant record
 */
export const updateProjectChat = (
  projectId: string,
  chatId: string,
  data: Partial<ProjectChat>,
): Promise<ProjectChat> =>
  api.put(`/api/projects/${projectId}/chats/${chatId}`, data);

/**
 * @description Delete a chat assistant
 * @param {string} projectId - Project UUID
 * @param {string} chatId - Chat UUID
 * @returns {Promise<void>}
 */
export const deleteProjectChat = (
  projectId: string,
  chatId: string,
): Promise<void> => api.delete(`/api/projects/${projectId}/chats/${chatId}`);

/**
 * @description Sync a chat assistant configuration from RAGFlow
 * @param {string} projectId - Project UUID
 * @param {string} chatId - Chat UUID
 * @returns {Promise<ProjectChat>} Updated chat assistant record
 */
export const syncProjectChat = (
  projectId: string,
  chatId: string,
): Promise<ProjectChat> =>
  api.post(`/api/projects/${projectId}/chats/${chatId}/sync`);

// ============================================================================
// Project Searches API
// ============================================================================

/**
 * Represents a project search app.
 */
export interface ProjectSearch {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  ragflow_search_id: string | null;
  dataset_ids: string[];
  ragflow_dataset_ids: string[];
  search_config: Record<string, any>;
  status: string;
  last_synced_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * @description List search apps for a project
 * @param {string} projectId - Project UUID
 * @returns {Promise<ProjectSearch[]>} Array of search app records
 */
export const getProjectSearches = (
  projectId: string,
): Promise<ProjectSearch[]> => api.get(`/api/projects/${projectId}/searches`);

/**
 * @description Get a search app by ID
 * @param {string} projectId - Project UUID
 * @param {string} searchId - Search app UUID
 * @returns {Promise<ProjectSearch>} Search app record
 */
export const getProjectSearchById = (
  projectId: string,
  searchId: string,
): Promise<ProjectSearch> =>
  api.get(`/api/projects/${projectId}/searches/${searchId}`);

/**
 * @description Create a search app for a project
 * @param {string} projectId - Project UUID
 * @param {object} data - Search app creation payload
 * @returns {Promise<ProjectSearch>} Created search app record
 */
export const createProjectSearch = (
  projectId: string,
  data: {
    name: string;
    description?: string;
    dataset_ids?: string[];
    ragflow_dataset_ids?: string[];
    search_config?: Record<string, any>;
  },
): Promise<ProjectSearch> =>
  api.post(`/api/projects/${projectId}/searches`, data);

/**
 * @description Update a search app
 * @param {string} projectId - Project UUID
 * @param {string} searchId - Search app UUID
 * @param {Partial<ProjectSearch>} data - Fields to update
 * @returns {Promise<ProjectSearch>} Updated search app record
 */
export const updateProjectSearch = (
  projectId: string,
  searchId: string,
  data: Partial<ProjectSearch>,
): Promise<ProjectSearch> =>
  api.put(`/api/projects/${projectId}/searches/${searchId}`, data);

/**
 * @description Delete a search app
 * @param {string} projectId - Project UUID
 * @param {string} searchId - Search app UUID
 * @returns {Promise<void>}
 */
export const deleteProjectSearch = (
  projectId: string,
  searchId: string,
): Promise<void> =>
  api.delete(`/api/projects/${projectId}/searches/${searchId}`);

/**
 * @description Sync a search app configuration from RAGFlow
 * @param {string} projectId - Project UUID
 * @param {string} searchId - Search app UUID
 * @returns {Promise<ProjectSearch>} Updated search app record
 */
export const syncProjectSearch = (
  projectId: string,
  searchId: string,
): Promise<ProjectSearch> =>
  api.post(`/api/projects/${projectId}/searches/${searchId}/sync`);

// ============================================================================
// Entity Permissions API
// ============================================================================

/**
 * Represents a per-entity permission (category, chat, or search).
 * Hierarchical levels: delete > edit > create > view > none.
 */
export interface ProjectEntityPermission {
  id: string;
  project_id: string;
  entity_type: "category" | "chat" | "search";
  entity_id: string;
  grantee_type: "user" | "team";
  grantee_id: string;
  permission_level: "none" | "view" | "create" | "edit" | "delete";
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * @description List all entity permissions for a project
 * @param {string} projectId - Project UUID
 * @returns {Promise<ProjectEntityPermission[]>} Array of entity permission records
 */
export const getEntityPermissions = (
  projectId: string,
): Promise<ProjectEntityPermission[]> =>
  api.get(`/api/projects/${projectId}/entity-permissions`);

/**
 * @description List permissions for a specific entity (category, chat, or search)
 * @param {string} projectId - Project UUID
 * @param {string} entityType - Entity type identifier
 * @param {string} entityId - Entity UUID
 * @returns {Promise<ProjectEntityPermission[]>} Array of entity permission records
 */
export const getEntityPermissionsByEntity = (
  projectId: string,
  entityType: string,
  entityId: string,
): Promise<ProjectEntityPermission[]> =>
  api.get(
    `/api/projects/${projectId}/entity-permissions/${entityType}/${entityId}`,
  );

/**
 * @description Set (upsert) a permission for a grantee on an entity
 * @param {string} projectId - Project UUID
 * @param {object} data - Permission data including entity info and permission level
 * @returns {Promise<ProjectEntityPermission>} Created or updated permission record
 */
export const setEntityPermission = (
  projectId: string,
  data: {
    entity_type: string;
    entity_id: string;
    grantee_type: string;
    grantee_id: string;
    permission_level: string;
  },
): Promise<ProjectEntityPermission> =>
  api.post(`/api/projects/${projectId}/entity-permissions`, data);

/**
 * @description Remove an entity permission
 * @param {string} projectId - Project UUID
 * @param {string} permissionId - Permission UUID to remove
 * @returns {Promise<void>}
 */
export const removeEntityPermission = (
  projectId: string,
  permissionId: string,
): Promise<void> =>
  api.delete(`/api/projects/${projectId}/entity-permissions/${permissionId}`);

/**
 * Fetch live RAGFlow parser status for all documents in a version.
 * Triggers an on-demand sync from RAGFlow parser and returns updated statuses.
 * @param projectId - Project UUID
 * @param categoryId - Category UUID
 * @param versionId - Version UUID
 * @returns Array of document parser status snapshots from RAGFlow
 */
export const syncVersionParserStatus = (
  projectId: string,
  categoryId: string,
  versionId: string,
): Promise<
  {
    fileName: string;
    ragflowDocId: string | null;
    ragflowRun: string | null;
    ragflowProgress: number | null;
    ragflowProgressMsg: string | null;
    ragflowChunkCount: number | null;
    name: string;
  }[]
> =>
  api.get(
    `/api/projects/${projectId}/categories/${categoryId}/versions/${versionId}/documents/parser-status`,
  );

// ============================================================================
// Project Datasets API
// ============================================================================

/**
 * @description List datasets linked to a project
 * @param {string} projectId - Project UUID
 * @returns {Promise<ProjectDataset[]>} Array of project dataset records
 */
export const getProjectDatasets = (
  projectId: string,
): Promise<ProjectDataset[]> =>
  api.get(`/api/projects/${projectId}/datasets`);

/**
 * @description Link an existing dataset or create a new one for a project
 * @param {string} projectId - Project UUID
 * @param {object} data - Dataset ID to link or name to create
 * @returns {Promise<ProjectDataset>} Created project-dataset link record
 */
export const linkProjectDataset = (
  projectId: string,
  data: { dataset_id?: string; name?: string },
): Promise<ProjectDataset> =>
  api.post(`/api/projects/${projectId}/datasets`, data);

/**
 * @description Unlink a dataset from a project
 * @param {string} projectId - Project UUID
 * @param {string} datasetId - Dataset UUID to unlink
 * @returns {Promise<void>}
 */
export const unlinkProjectDataset = (
  projectId: string,
  datasetId: string,
): Promise<void> =>
  api.delete(`/api/projects/${projectId}/datasets/${datasetId}`);

// ============================================================================
// Project Members API
// ============================================================================

/**
 * @description Fetch all members of a project
 * @param {string} projectId - Project UUID
 * @returns {Promise<ProjectMember[]>} Array of project member records
 */
export const fetchProjectMembers = (
  projectId: string,
): Promise<ProjectMember[]> =>
  api.get(`/api/projects/${projectId}/members`);

/**
 * @description Add a user as a member to a project
 * @param {string} projectId - Project UUID
 * @param {string} userId - User UUID to add
 * @returns {Promise<void>}
 */
export const addProjectMember = (
  projectId: string,
  userId: string,
): Promise<void> =>
  api.post(`/api/projects/${projectId}/members`, { user_id: userId });

/**
 * @description Remove a member from a project
 * @param {string} projectId - Project UUID
 * @param {string} userId - User UUID to remove
 * @returns {Promise<void>}
 */
export const removeProjectMember = (
  projectId: string,
  userId: string,
): Promise<void> =>
  api.delete(`/api/projects/${projectId}/members/${userId}`);

// ============================================================================
// Project Dataset Binding API
// ============================================================================

/**
 * @description Fetch datasets linked to a project (with dataset metadata)
 * @param {string} projectId - Project UUID
 * @returns {Promise<ProjectDataset[]>} Array of project dataset link records
 */
export const fetchProjectDatasets = (
  projectId: string,
): Promise<ProjectDataset[]> =>
  api.get(`/api/projects/${projectId}/datasets`);

/**
 * @description Bind multiple datasets to a project in a single batch operation
 * @param {string} projectId - Project UUID
 * @param {string[]} datasetIds - Array of dataset UUIDs to bind
 * @returns {Promise<void>}
 */
export const bindProjectDatasets = (
  projectId: string,
  datasetIds: string[],
): Promise<void> =>
  api.post(`/api/projects/${projectId}/datasets`, { dataset_ids: datasetIds });

/**
 * @description Unbind a dataset from a project
 * @param {string} projectId - Project UUID
 * @param {string} datasetId - Dataset UUID to unbind
 * @returns {Promise<void>}
 */
export const unbindProjectDataset = (
  projectId: string,
  datasetId: string,
): Promise<void> =>
  api.delete(`/api/projects/${projectId}/datasets/${datasetId}`);

// ============================================================================
// Project Activity API
// ============================================================================

/**
 * @description Fetch paginated activity feed for a project
 * @param {string} projectId - Project UUID
 * @param {number} [limit=20] - Number of items to fetch
 * @param {number} [offset=0] - Offset for pagination
 * @returns {Promise<{ items: ActivityEntry[], total: number }>} Paginated activity entries
 */
export const fetchProjectActivity = (
  projectId: string,
  limit: number = 20,
  offset: number = 0,
): Promise<{ items: ActivityEntry[]; total: number }> => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return api.get(`/api/projects/${projectId}/activity?${params.toString()}`);
};

// ============================================================================
// Sync Configs API (datasync projects)
// ============================================================================

/**
 * @description List sync configs for a datasync project
 * @param {string} projectId - Project UUID
 * @returns {Promise<ProjectSyncConfig[]>} Array of sync config records
 */
export const getSyncConfigs = (
  projectId: string,
): Promise<ProjectSyncConfig[]> =>
  api.get(`/api/projects/${projectId}/sync-configs`);

/**
 * @description Create a sync config for a datasync project
 * @param {string} projectId - Project UUID
 * @param {object} data - Sync config creation payload
 * @returns {Promise<ProjectSyncConfig>} Created sync config record
 */
export const createSyncConfig = (
  projectId: string,
  data: {
    source_type: SyncSourceType;
    connection_config: Record<string, unknown>;
    sync_schedule?: string;
    filter_rules?: Record<string, unknown>;
  },
): Promise<ProjectSyncConfig> =>
  api.post(`/api/projects/${projectId}/sync-configs`, data);

/**
 * @description Update a sync config
 * @param {string} projectId - Project UUID
 * @param {string} configId - Sync config UUID
 * @param {Partial<ProjectSyncConfig>} data - Fields to update
 * @returns {Promise<ProjectSyncConfig>} Updated sync config record
 */
export const updateSyncConfig = (
  projectId: string,
  configId: string,
  data: Partial<ProjectSyncConfig>,
): Promise<ProjectSyncConfig> =>
  api.put(`/api/projects/${projectId}/sync-configs/${configId}`, data);

/**
 * @description Delete a sync config
 * @param {string} projectId - Project UUID
 * @param {string} configId - Sync config UUID
 * @returns {Promise<void>}
 */
export const deleteSyncConfig = (
  projectId: string,
  configId: string,
): Promise<void> =>
  api.delete(`/api/projects/${projectId}/sync-configs/${configId}`);

/**
 * @description Test a sync connection before saving
 * @param {string} projectId - Project UUID
 * @param {object} data - Connection test payload with source type and config
 * @returns {Promise<{ success: boolean; message: string }>} Test result
 */
export const testSyncConnection = (
  projectId: string,
  data: {
    source_type: SyncSourceType;
    connection_config: Record<string, unknown>;
  },
): Promise<{ success: boolean; message: string }> =>
  api.post(`/api/projects/${projectId}/sync-configs/test`, data);

/**
 * @description Manually trigger a data sync
 * @param {string} projectId - Project UUID
 * @param {string} configId - Sync config UUID
 * @returns {Promise<{ message: string }>} Trigger result message
 */
export const triggerSync = (
  projectId: string,
  configId: string,
): Promise<{ message: string }> =>
  api.post(`/api/projects/${projectId}/sync-configs/${configId}/trigger`);
