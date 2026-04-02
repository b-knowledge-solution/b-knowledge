/**
 * @fileoverview API functions for knowledge base management.
 * Typed functions for knowledge base CRUD, permissions, categories, versions, chats.
 * @module features/knowledge-base/api/knowledgeBaseApi
 */
import { api, apiFetch } from "@/lib/api";

// ============================================================================
// Types
// ============================================================================

/** Category type discriminator per D-01: documents (versioned), standard (single dataset), code (code parser) */
export type DocumentCategoryType = 'documents' | 'standard' | 'code'

/**
 * Represents a knowledge base (type-agnostic container per D-01).
 */
export interface KnowledgeBase {
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
 * Represents a dataset linked to a knowledge base.
 */
export interface KnowledgeBaseDataset {
  id: string;
  knowledge_base_id: string;
  dataset_id: string;
  auto_created: boolean;
  created_at: string;
  dataset_name?: string;
  dataset_chunk_count?: number;
  dataset_doc_count?: number;
}

/**
 * Represents a knowledge base member with user details and role.
 */
export interface KnowledgeBaseMember {
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

/** Sync source type for datasync knowledge bases. */
export type SyncSourceType = 'sharepoint' | 'jira' | 'confluence' | 'gitlab' | 'github';

/**
 * Represents a sync configuration for a datasync knowledge base.
 */
export interface KnowledgeBaseSyncConfig {
  id: string;
  knowledge_base_id: string;
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
 * Represents a knowledge base permission.
 */
export interface KnowledgeBasePermission {
  id: string;
  knowledge_base_id: string;
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
  knowledge_base_id: string;
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
 * Represents a knowledge base chat assistant.
 */
export interface KnowledgeBaseChat {
  id: string;
  knowledge_base_id: string;
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
// Knowledge Base API
// ============================================================================

/**
 * @description List knowledge bases accessible to the current user
 * @returns {Promise<KnowledgeBase[]>} Array of knowledge base records
 */
export const getKnowledgeBases = (): Promise<KnowledgeBase[]> => api.get("/api/knowledge-base");

/**
 * @description Get a knowledge base by ID
 * @param {string} id - Knowledge Base UUID
 * @returns {Promise<KnowledgeBase>} Knowledge base record
 */
export const getKnowledgeBaseById = (id: string): Promise<KnowledgeBase> =>
  api.get(`/api/knowledge-base/${id}`);

/**
 * @description Create a new knowledge base
 * @param {object} data - Knowledge base creation payload
 * @returns {Promise<KnowledgeBase>} Created knowledge base record
 */
export const createKnowledgeBase = (data: {
  name: string;
  description?: string;
  avatar?: string;
  default_embedding_model?: string;
  default_chunk_method?: string;
  default_parser_config?: Record<string, unknown>;
  is_private?: boolean;
  first_version_label?: string;
}): Promise<KnowledgeBase> => api.post("/api/knowledge-base", data);

/**
 * @description Update a knowledge base
 * @param {string} id - Knowledge Base UUID
 * @param {Partial<KnowledgeBase>} data - Fields to update
 * @returns {Promise<KnowledgeBase>} Updated knowledge base record
 */
export const updateKnowledgeBase = (
  id: string,
  data: Partial<KnowledgeBase>,
): Promise<KnowledgeBase> => api.put(`/api/knowledge-base/${id}`, data);

/**
 * @description Delete a knowledge base
 * @param {string} id - Knowledge Base UUID
 * @returns {Promise<void>}
 */
export const deleteKnowledgeBase = (id: string): Promise<void> =>
  api.delete(`/api/knowledge-base/${id}`);

// ============================================================================
// Permissions API
// ============================================================================

/**
 * @description Get permissions for a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @returns {Promise<KnowledgeBasePermission[]>} Array of permission records
 */
export const getKnowledgeBasePermissions = (
  knowledgeBaseId: string,
): Promise<KnowledgeBasePermission[]> =>
  api.get(`/api/knowledge-base/${knowledgeBaseId}/permissions`);

/**
 * @description Set a permission for a grantee on a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {object} data - Permission data including grantee and tab access levels
 * @returns {Promise<KnowledgeBasePermission>} Created or updated permission record
 */
export const setKnowledgeBasePermission = (
  knowledgeBaseId: string,
  data: {
    grantee_type: string;
    grantee_id: string;
    tab_documents: string;
    tab_chat: string;
    tab_settings: string;
  },
): Promise<KnowledgeBasePermission> =>
  api.post(`/api/knowledge-base/${knowledgeBaseId}/permissions`, data);

/**
 * @description Remove a permission from a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} permissionId - Permission UUID to remove
 * @returns {Promise<void>}
 */
export const removeKnowledgeBasePermission = (
  knowledgeBaseId: string,
  permissionId: string,
): Promise<void> =>
  api.delete(`/api/knowledge-base/${knowledgeBaseId}/permissions/${permissionId}`);

// ============================================================================
// Document Categories API
// ============================================================================

/**
 * @description List document categories for a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @returns {Promise<DocumentCategory[]>} Array of category records
 */
export const getDocumentCategories = (
  knowledgeBaseId: string,
): Promise<DocumentCategory[]> =>
  api.get(`/api/knowledge-base/${knowledgeBaseId}/categories`);

/**
 * @description Create a document category within a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {object} data - Category creation data with name and optional config
 * @returns {Promise<DocumentCategory>} Created category record
 */
export const createDocumentCategory = (
  knowledgeBaseId: string,
  data: {
    name: string;
    description?: string;
    sort_order?: number;
    category_type?: DocumentCategoryType;
    dataset_config?: Record<string, any>;
  },
): Promise<DocumentCategory> =>
  api.post(`/api/knowledge-base/${knowledgeBaseId}/categories`, data);

/**
 * @description Update a document category
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} categoryId - Category UUID
 * @param {Partial<DocumentCategory>} data - Fields to update
 * @returns {Promise<DocumentCategory>} Updated category record
 */
export const updateDocumentCategory = (
  knowledgeBaseId: string,
  categoryId: string,
  data: Partial<DocumentCategory>,
): Promise<DocumentCategory> =>
  api.put(`/api/knowledge-base/${knowledgeBaseId}/categories/${categoryId}`, data);

/**
 * @description Delete a document category
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} categoryId - Category UUID
 * @returns {Promise<void>}
 */
export const deleteDocumentCategory = (
  knowledgeBaseId: string,
  categoryId: string,
): Promise<void> =>
  api.delete(`/api/knowledge-base/${knowledgeBaseId}/categories/${categoryId}`);

// ============================================================================
// Document Category Versions API
// ============================================================================

/**
 * @description List versions for a document category
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} categoryId - Category UUID
 * @returns {Promise<DocumentCategoryVersion[]>} Array of version records
 */
export const getCategoryVersions = (
  knowledgeBaseId: string,
  categoryId: string,
): Promise<DocumentCategoryVersion[]> =>
  api.get(`/api/knowledge-base/${knowledgeBaseId}/categories/${categoryId}/versions`);

/**
 * @description Create a new version within a document category
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} categoryId - Category UUID
 * @param {object} data - Version creation data including label and parser config
 * @returns {Promise<DocumentCategoryVersion>} Created version record
 */
export const createCategoryVersion = (
  knowledgeBaseId: string,
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
    `/api/knowledge-base/${knowledgeBaseId}/categories/${categoryId}/versions`,
    data,
  );

/**
 * @description Sync a version's dataset from RAGFlow
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} categoryId - Category UUID
 * @param {string} versionId - Version UUID
 * @returns {Promise<DocumentCategoryVersion>} Updated version record
 */
export const syncCategoryVersion = (
  knowledgeBaseId: string,
  categoryId: string,
  versionId: string,
): Promise<DocumentCategoryVersion> =>
  api.post(
    `/api/knowledge-base/${knowledgeBaseId}/categories/${categoryId}/versions/${versionId}/sync`,
  );

/**
 * @description Archive (deactivate) a version
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} categoryId - Category UUID
 * @param {string} versionId - Version UUID
 * @returns {Promise<DocumentCategoryVersion>} Updated version record with archived status
 */
export const archiveCategoryVersion = (
  knowledgeBaseId: string,
  categoryId: string,
  versionId: string,
): Promise<DocumentCategoryVersion> =>
  api.put(
    `/api/knowledge-base/${knowledgeBaseId}/categories/${categoryId}/versions/${versionId}/archive`,
  );

/**
 * @description Update a version's metadata (e.g. label, parser config)
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} categoryId - Category UUID
 * @param {string} versionId - Version UUID
 * @param {object} data - Fields to update
 * @returns {Promise<DocumentCategoryVersion>} Updated version record
 */
export const updateCategoryVersion = (
  knowledgeBaseId: string,
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
    `/api/knowledge-base/${knowledgeBaseId}/categories/${categoryId}/versions/${versionId}`,
    data,
  );

/**
 * @description Delete a version and its associated RAGFlow dataset
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} categoryId - Category UUID
 * @param {string} versionId - Version UUID
 * @returns {Promise<void>}
 */
export const deleteCategoryVersion = (
  knowledgeBaseId: string,
  categoryId: string,
  versionId: string,
): Promise<void> =>
  api.delete(
    `/api/knowledge-base/${knowledgeBaseId}/categories/${categoryId}/versions/${versionId}`,
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
  chunk_num?: number;
  token_count: number;
  token_num?: number;
  progress: number;
  progress_msg: string;
  /** Parser ID (e.g., 'naive', 'pdf', 'table') — returned from RAG document table */
  parser_id?: string;
  /** Parser configuration */
  parser_config?: Record<string, unknown>;
  /** Processing duration in seconds */
  process_duration?: number;
  /** Source type (e.g., 'local', 'web_crawl') */
  source_type?: string;
  /** Source URL for web-crawled documents */
  source_url?: string;
  /** Document knowledgebase/dataset ID */
  kb_id?: string;
  /** Update date as ISO string */
  update_date?: string | number;
  /** Creation date as ISO string */
  create_date?: string;
  /** Created at ISO string */
  created_at?: string;
  /** Updated at ISO string */
  updated_at?: string;
}

/**
 * @description List documents in a version's dataset with optional pagination and search
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} categoryId - Category UUID
 * @param {string} versionId - Version UUID
 * @param {object} [query] - Optional pagination and search parameters
 * @returns {Promise<VersionDocument[]>} Array of document records
 */
export const getVersionDocuments = (
  knowledgeBaseId: string,
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
    `/api/knowledge-base/${knowledgeBaseId}/categories/${categoryId}/versions/${versionId}/documents${qs ? "?" + qs : ""}`,
  );
};

/**
 * Upload a document to a version's dataset.
 * Uses FormData for multipart upload.
 */
export const uploadVersionDocument = (
  knowledgeBaseId: string,
  categoryId: string,
  versionId: string,
  file: File,
): Promise<unknown> => {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch(
    `/api/knowledge-base/${knowledgeBaseId}/categories/${categoryId}/versions/${versionId}/documents`,
    {
      method: "POST",
      body: formData,
      headers: {}, // Let browser set multipart content-type
    },
  );
};

/**
 * Delete multiple documents from a version's local storage.
 * @param knowledgeBaseId - Knowledge Base UUID
 * @param categoryId - Category UUID
 * @param versionId - Version UUID
 * @param fileNames - Array of file names to delete
 * @returns Object with deleted and failed file name arrays
 */
export const deleteVersionDocuments = (
  knowledgeBaseId: string,
  categoryId: string,
  versionId: string,
  fileNames: string[],
): Promise<{ deleted: string[]; failed: string[] }> =>
  apiFetch(
    `/api/knowledge-base/${knowledgeBaseId}/categories/${categoryId}/versions/${versionId}/documents`,
    {
      method: "DELETE",
      body: JSON.stringify({ fileNames }),
    },
  );

/**
 * Re-queue local files for conversion.
 * @param knowledgeBaseId - Knowledge Base UUID
 * @param categoryId - Category UUID
 * @param versionId - Version UUID
 * @param fileNames - Array of file names to re-queue
 * @returns Object with queued and failed file name arrays
 */
export const requeueVersionDocuments = (
  knowledgeBaseId: string,
  categoryId: string,
  versionId: string,
  fileNames: string[],
): Promise<{ queued: string[]; failed: string[] }> =>
  apiFetch(
    `/api/knowledge-base/${knowledgeBaseId}/categories/${categoryId}/versions/${versionId}/documents/requeue`,
    {
      method: "POST",
      body: JSON.stringify({ fileNames }),
    },
  );

/**
 * Start parsing selected documents in RAGFlow.
 * @param knowledgeBaseId - Knowledge Base UUID
 * @param categoryId - Category UUID
 * @param versionId - Version UUID
 * @param fileNames - Array of file names to parse
 * @returns Object with parsed and failed file name arrays
 */
export const parseVersionDocuments = (
  knowledgeBaseId: string,
  categoryId: string,
  versionId: string,
  fileNames: string[],
): Promise<{ parsed: string[]; failed: string[] }> =>
  apiFetch(
    `/api/knowledge-base/${knowledgeBaseId}/categories/${categoryId}/versions/${versionId}/documents/parse`,
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
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} categoryId - Category UUID
 * @param {object} params - Git import parameters
 * @param {string} params.url - Git repository URL
 * @param {string} [params.branch] - Branch name (defaults to 'main')
 * @param {string} [params.path] - Subdirectory path to import from
 * @param {object} [params.credentials] - Authentication credentials for private repos
 * @returns {Promise<{ taskId: string; fileCount: number }>} Import task info
 */
export const importGitRepo = (
  knowledgeBaseId: string,
  categoryId: string,
  params: { url: string; branch?: string; path?: string; credentials?: { auth_method: string; token?: string; username?: string } },
): Promise<{ taskId: string; fileCount: number }> =>
  api.post(`/api/knowledge-base/${knowledgeBaseId}/categories/${categoryId}/import-git`, params)

/**
 * @description Import code files from a ZIP archive into a code category
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} categoryId - Category UUID
 * @param {File} file - ZIP file to upload
 * @returns {Promise<{ taskId: string; fileCount: number }>} Import task info
 */
export const importZipFile = (
  knowledgeBaseId: string,
  categoryId: string,
  file: File,
): Promise<{ taskId: string; fileCount: number }> => {
  const formData = new FormData()
  formData.append('file', file)
  return apiFetch(`/api/knowledge-base/${knowledgeBaseId}/categories/${categoryId}/import-zip`, {
    method: 'POST',
    body: formData,
  })
}

// ============================================================================
// Knowledge Base Chats API
// ============================================================================

/**
 * @description List chat assistants for a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @returns {Promise<KnowledgeBaseChat[]>} Array of chat assistant records
 */
export const getKnowledgeBaseChats = (knowledgeBaseId: string): Promise<KnowledgeBaseChat[]> =>
  api.get(`/api/knowledge-base/${knowledgeBaseId}/chats`);

/**
 * @description Get a chat assistant by ID
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} chatId - Chat UUID
 * @returns {Promise<KnowledgeBaseChat>} Chat assistant record
 */
export const getKnowledgeBaseChatById = (
  knowledgeBaseId: string,
  chatId: string,
): Promise<KnowledgeBaseChat> =>
  api.get(`/api/knowledge-base/${knowledgeBaseId}/chats/${chatId}`);

/**
 * @description Create a chat assistant for a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {object} data - Chat creation payload including name and dataset IDs
 * @returns {Promise<KnowledgeBaseChat>} Created chat assistant record
 */
export const createKnowledgeBaseChat = (
  knowledgeBaseId: string,
  data: {
    name: string;
    dataset_ids?: string[];
    ragflow_dataset_ids?: string[];
    llm_config?: Record<string, unknown>;
    prompt_config?: Record<string, unknown>;
  },
): Promise<KnowledgeBaseChat> => api.post(`/api/knowledge-base/${knowledgeBaseId}/chats`, data);

/**
 * @description Update a chat assistant
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} chatId - Chat UUID
 * @param {Partial<KnowledgeBaseChat>} data - Fields to update
 * @returns {Promise<KnowledgeBaseChat>} Updated chat assistant record
 */
export const updateKnowledgeBaseChat = (
  knowledgeBaseId: string,
  chatId: string,
  data: Partial<KnowledgeBaseChat>,
): Promise<KnowledgeBaseChat> =>
  api.put(`/api/knowledge-base/${knowledgeBaseId}/chats/${chatId}`, data);

/**
 * @description Delete a chat assistant
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} chatId - Chat UUID
 * @returns {Promise<void>}
 */
export const deleteKnowledgeBaseChat = (
  knowledgeBaseId: string,
  chatId: string,
): Promise<void> => api.delete(`/api/knowledge-base/${knowledgeBaseId}/chats/${chatId}`);

/**
 * @description Sync a chat assistant configuration from RAGFlow
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} chatId - Chat UUID
 * @returns {Promise<KnowledgeBaseChat>} Updated chat assistant record
 */
export const syncKnowledgeBaseChat = (
  knowledgeBaseId: string,
  chatId: string,
): Promise<KnowledgeBaseChat> =>
  api.post(`/api/knowledge-base/${knowledgeBaseId}/chats/${chatId}/sync`);

// ============================================================================
// Knowledge Base Searches API
// ============================================================================

/**
 * Represents a knowledge base search app.
 */
export interface KnowledgeBaseSearch {
  id: string;
  knowledge_base_id: string;
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
 * @description List search apps for a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @returns {Promise<KnowledgeBaseSearch[]>} Array of search app records
 */
export const getKnowledgeBaseSearches = (
  knowledgeBaseId: string,
): Promise<KnowledgeBaseSearch[]> => api.get(`/api/knowledge-base/${knowledgeBaseId}/searches`);

/**
 * @description Get a search app by ID
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} searchId - Search app UUID
 * @returns {Promise<KnowledgeBaseSearch>} Search app record
 */
export const getKnowledgeBaseSearchById = (
  knowledgeBaseId: string,
  searchId: string,
): Promise<KnowledgeBaseSearch> =>
  api.get(`/api/knowledge-base/${knowledgeBaseId}/searches/${searchId}`);

/**
 * @description Create a search app for a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {object} data - Search app creation payload
 * @returns {Promise<KnowledgeBaseSearch>} Created search app record
 */
export const createKnowledgeBaseSearch = (
  knowledgeBaseId: string,
  data: {
    name: string;
    description?: string;
    dataset_ids?: string[];
    ragflow_dataset_ids?: string[];
    search_config?: Record<string, any>;
  },
): Promise<KnowledgeBaseSearch> =>
  api.post(`/api/knowledge-base/${knowledgeBaseId}/searches`, data);

/**
 * @description Update a search app
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} searchId - Search app UUID
 * @param {Partial<KnowledgeBaseSearch>} data - Fields to update
 * @returns {Promise<KnowledgeBaseSearch>} Updated search app record
 */
export const updateKnowledgeBaseSearch = (
  knowledgeBaseId: string,
  searchId: string,
  data: Partial<KnowledgeBaseSearch>,
): Promise<KnowledgeBaseSearch> =>
  api.put(`/api/knowledge-base/${knowledgeBaseId}/searches/${searchId}`, data);

/**
 * @description Delete a search app
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} searchId - Search app UUID
 * @returns {Promise<void>}
 */
export const deleteKnowledgeBaseSearch = (
  knowledgeBaseId: string,
  searchId: string,
): Promise<void> =>
  api.delete(`/api/knowledge-base/${knowledgeBaseId}/searches/${searchId}`);

/**
 * @description Sync a search app configuration from RAGFlow
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} searchId - Search app UUID
 * @returns {Promise<KnowledgeBaseSearch>} Updated search app record
 */
export const syncKnowledgeBaseSearch = (
  knowledgeBaseId: string,
  searchId: string,
): Promise<KnowledgeBaseSearch> =>
  api.post(`/api/knowledge-base/${knowledgeBaseId}/searches/${searchId}/sync`);

// ============================================================================
// Entity Permissions API
// ============================================================================

/**
 * Represents a per-entity permission (category, chat, or search).
 * Hierarchical levels: delete > edit > create > view > none.
 */
export interface KnowledgeBaseEntityPermission {
  id: string;
  knowledge_base_id: string;
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
 * @description List all entity permissions for a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @returns {Promise<KnowledgeBaseEntityPermission[]>} Array of entity permission records
 */
export const getEntityPermissions = (
  knowledgeBaseId: string,
): Promise<KnowledgeBaseEntityPermission[]> =>
  api.get(`/api/knowledge-base/${knowledgeBaseId}/entity-permissions`);

/**
 * @description List permissions for a specific entity (category, chat, or search)
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} entityType - Entity type identifier
 * @param {string} entityId - Entity UUID
 * @returns {Promise<KnowledgeBaseEntityPermission[]>} Array of entity permission records
 */
export const getEntityPermissionsByEntity = (
  knowledgeBaseId: string,
  entityType: string,
  entityId: string,
): Promise<KnowledgeBaseEntityPermission[]> =>
  api.get(
    `/api/knowledge-base/${knowledgeBaseId}/entity-permissions/${entityType}/${entityId}`,
  );

/**
 * @description Set (upsert) a permission for a grantee on an entity
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {object} data - Permission data including entity info and permission level
 * @returns {Promise<KnowledgeBaseEntityPermission>} Created or updated permission record
 */
export const setEntityPermission = (
  knowledgeBaseId: string,
  data: {
    entity_type: string;
    entity_id: string;
    grantee_type: string;
    grantee_id: string;
    permission_level: string;
  },
): Promise<KnowledgeBaseEntityPermission> =>
  api.post(`/api/knowledge-base/${knowledgeBaseId}/entity-permissions`, data);

/**
 * @description Remove an entity permission
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} permissionId - Permission UUID to remove
 * @returns {Promise<void>}
 */
export const removeEntityPermission = (
  knowledgeBaseId: string,
  permissionId: string,
): Promise<void> =>
  api.delete(`/api/knowledge-base/${knowledgeBaseId}/entity-permissions/${permissionId}`);

/**
 * Fetch live RAGFlow parser status for all documents in a version.
 * Triggers an on-demand sync from RAGFlow parser and returns updated statuses.
 * @param knowledgeBaseId - Knowledge Base UUID
 * @param categoryId - Category UUID
 * @param versionId - Version UUID
 * @returns Array of document parser status snapshots from RAGFlow
 */
export const syncVersionParserStatus = (
  knowledgeBaseId: string,
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
    `/api/knowledge-base/${knowledgeBaseId}/categories/${categoryId}/versions/${versionId}/documents/parser-status`,
  );

/**
 * @description Parse a single document in a version's dataset via the RAG parse endpoint.
 * Triggers beginParse + queueParseInit on the backend.
 * @param {string} datasetId - The RAG dataset UUID (version's ragflow_dataset_id)
 * @param {string} docId - Document UUID
 * @returns {Promise<{ status: string; doc_id: string }>} Parse status
 */
export const parseVersionSingleDocument = (
  datasetId: string,
  docId: string,
): Promise<{ status: string; doc_id: string }> =>
  api.post(`/api/rag/datasets/${datasetId}/documents/${docId}/parse`);

/**
 * @description Bulk start or cancel parsing for multiple documents.
 * @param {string} datasetId - The RAG dataset UUID
 * @param {string[]} docIds - Array of document UUIDs
 * @param {number} run - 1 to start parsing, 2 to cancel
 * @returns {Promise<{ results: Array<{ doc_id: string; status: string }> }>} Per-document results
 */
export const bulkParseVersionDocuments = (
  datasetId: string,
  docIds: string[],
  run: number,
): Promise<{ results: Array<{ doc_id: string; status: string }> }> =>
  api.post(`/api/rag/datasets/${datasetId}/documents/bulk-parse`, { doc_ids: docIds, run });

/**
 * @description Get document process logs including task history.
 * @param {string} datasetId - The RAG dataset UUID
 * @param {string} docId - Document UUID
 * @returns {Promise<{ document: Record<string, unknown>; tasks: Array<Record<string, unknown>> }>} Document with task history
 */
export const getVersionDocumentLogs = (
  datasetId: string,
  docId: string,
): Promise<{ document: Record<string, unknown>; tasks: Array<Record<string, unknown>> }> =>
  api.get(`/api/rag/datasets/${datasetId}/documents/${docId}/logs`);

/**
 * @description Toggle document availability (enabled/disabled) for search.
 * Calls the RAG toggle endpoint directly since version documents are RAG documents.
 * @param {string} datasetId - The RAG dataset UUID
 * @param {string} docId - Document UUID
 * @param {boolean} available - Whether the document should be available
 * @returns {Promise<void>}
 */
export const toggleVersionDocumentAvailability = (
  datasetId: string,
  docId: string,
  available: boolean,
): Promise<void> =>
  api.patch(`/api/rag/datasets/${datasetId}/documents/${docId}/toggle`, { available });

/**
 * @description Change a document's parser method. Deletes existing chunks and resets for re-parsing.
 * @param {string} datasetId - The RAG dataset UUID
 * @param {string} docId - Document UUID
 * @param {object} data - New parser settings
 * @param {string} data.parser_id - New parser ID
 * @param {Record<string, unknown>} [data.parser_config] - Optional parser config override
 * @returns {Promise<Record<string, unknown>>} Updated document
 */
export const changeVersionDocumentParser = (
  datasetId: string,
  docId: string,
  data: { parser_id: string; parser_config?: Record<string, unknown> },
): Promise<Record<string, unknown>> =>
  api.put(`/api/rag/datasets/${datasetId}/documents/${docId}/parser`, data);

/**
 * @description Delete a single document from a RAG dataset.
 * @param {string} datasetId - The RAG dataset UUID
 * @param {string} docId - Document UUID
 * @returns {Promise<void>}
 */
export const deleteVersionSingleDocument = (
  datasetId: string,
  docId: string,
): Promise<void> =>
  api.delete(`/api/rag/datasets/${datasetId}/documents/${docId}`);

// ============================================================================
// Knowledge Base Datasets API
// ============================================================================

/**
 * @description List datasets linked to a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @returns {Promise<KnowledgeBaseDataset[]>} Array of project dataset records
 */
export const getKnowledgeBaseDatasets = (
  knowledgeBaseId: string,
): Promise<KnowledgeBaseDataset[]> =>
  api.get(`/api/knowledge-base/${knowledgeBaseId}/datasets`);

/**
 * @description Link an existing dataset or create a new one for a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {object} data - Dataset ID to link or name to create
 * @returns {Promise<KnowledgeBaseDataset>} Created project-dataset link record
 */
export const linkKnowledgeBaseDataset = (
  knowledgeBaseId: string,
  data: { dataset_id?: string; name?: string },
): Promise<KnowledgeBaseDataset> =>
  api.post(`/api/knowledge-base/${knowledgeBaseId}/datasets`, data);

/**
 * @description Unlink a dataset from a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} datasetId - Dataset UUID to unlink
 * @returns {Promise<void>}
 */
export const unlinkKnowledgeBaseDataset = (
  knowledgeBaseId: string,
  datasetId: string,
): Promise<void> =>
  api.delete(`/api/knowledge-base/${knowledgeBaseId}/datasets/${datasetId}`);

// ============================================================================
// Knowledge Base Members API
// ============================================================================

/**
 * @description Fetch all members of a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @returns {Promise<KnowledgeBaseMember[]>} Array of project member records
 */
export const fetchKnowledgeBaseMembers = (
  knowledgeBaseId: string,
): Promise<KnowledgeBaseMember[]> =>
  api.get(`/api/knowledge-base/${knowledgeBaseId}/members`);

/**
 * @description Add a user as a member to a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} userId - User UUID to add
 * @returns {Promise<void>}
 */
export const addKnowledgeBaseMember = (
  knowledgeBaseId: string,
  userId: string,
): Promise<void> =>
  api.post(`/api/knowledge-base/${knowledgeBaseId}/members`, { user_id: userId });

/**
 * @description Remove a member from a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} userId - User UUID to remove
 * @returns {Promise<void>}
 */
export const removeKnowledgeBaseMember = (
  knowledgeBaseId: string,
  userId: string,
): Promise<void> =>
  api.delete(`/api/knowledge-base/${knowledgeBaseId}/members/${userId}`);

// ============================================================================
// Knowledge Base Dataset Binding API
// ============================================================================

/**
 * @description Fetch datasets linked to a knowledge base (with dataset metadata)
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @returns {Promise<KnowledgeBaseDataset[]>} Array of project dataset link records
 */
export const fetchKnowledgeBaseDatasets = (
  knowledgeBaseId: string,
): Promise<KnowledgeBaseDataset[]> =>
  api.get(`/api/knowledge-base/${knowledgeBaseId}/datasets`);

/**
 * @description Bind multiple datasets to a knowledge base in a single batch operation
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string[]} datasetIds - Array of dataset UUIDs to bind
 * @returns {Promise<void>}
 */
export const bindKnowledgeBaseDatasets = (
  knowledgeBaseId: string,
  datasetIds: string[],
): Promise<void> =>
  api.post(`/api/knowledge-base/${knowledgeBaseId}/datasets`, { dataset_ids: datasetIds });

/**
 * @description Unbind a dataset from a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} datasetId - Dataset UUID to unbind
 * @returns {Promise<void>}
 */
export const unbindKnowledgeBaseDataset = (
  knowledgeBaseId: string,
  datasetId: string,
): Promise<void> =>
  api.delete(`/api/knowledge-base/${knowledgeBaseId}/datasets/${datasetId}`);

// ============================================================================
// Knowledge Base Activity API
// ============================================================================

/**
 * @description Fetch paginated activity feed for a knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {number} [limit=20] - Number of items to fetch
 * @param {number} [offset=0] - Offset for pagination
 * @returns {Promise<{ items: ActivityEntry[], total: number }>} Paginated activity entries
 */
export const fetchKnowledgeBaseActivity = (
  knowledgeBaseId: string,
  limit: number = 20,
  offset: number = 0,
): Promise<{ items: ActivityEntry[]; total: number }> => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return api.get(`/api/knowledge-base/${knowledgeBaseId}/activity?${params.toString()}`);
};

// ============================================================================
// Sync Configs API (datasync projects)
// ============================================================================

/**
 * @description List sync configs for a datasync knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @returns {Promise<KnowledgeBaseSyncConfig[]>} Array of sync config records
 */
export const getSyncConfigs = (
  knowledgeBaseId: string,
): Promise<KnowledgeBaseSyncConfig[]> =>
  api.get(`/api/knowledge-base/${knowledgeBaseId}/sync-configs`);

/**
 * @description Create a sync config for a datasync knowledge base
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {object} data - Sync config creation payload
 * @returns {Promise<KnowledgeBaseSyncConfig>} Created sync config record
 */
export const createSyncConfig = (
  knowledgeBaseId: string,
  data: {
    source_type: SyncSourceType;
    connection_config: Record<string, unknown>;
    sync_schedule?: string;
    filter_rules?: Record<string, unknown>;
  },
): Promise<KnowledgeBaseSyncConfig> =>
  api.post(`/api/knowledge-base/${knowledgeBaseId}/sync-configs`, data);

/**
 * @description Update a sync config
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} configId - Sync config UUID
 * @param {Partial<KnowledgeBaseSyncConfig>} data - Fields to update
 * @returns {Promise<KnowledgeBaseSyncConfig>} Updated sync config record
 */
export const updateSyncConfig = (
  knowledgeBaseId: string,
  configId: string,
  data: Partial<KnowledgeBaseSyncConfig>,
): Promise<KnowledgeBaseSyncConfig> =>
  api.put(`/api/knowledge-base/${knowledgeBaseId}/sync-configs/${configId}`, data);

/**
 * @description Delete a sync config
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} configId - Sync config UUID
 * @returns {Promise<void>}
 */
export const deleteSyncConfig = (
  knowledgeBaseId: string,
  configId: string,
): Promise<void> =>
  api.delete(`/api/knowledge-base/${knowledgeBaseId}/sync-configs/${configId}`);

/**
 * @description Test a sync connection before saving
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {object} data - Connection test payload with source type and config
 * @returns {Promise<{ success: boolean; message: string }>} Test result
 */
export const testSyncConnection = (
  knowledgeBaseId: string,
  data: {
    source_type: SyncSourceType;
    connection_config: Record<string, unknown>;
  },
): Promise<{ success: boolean; message: string }> =>
  api.post(`/api/knowledge-base/${knowledgeBaseId}/sync-configs/test`, data);

/**
 * @description Manually trigger a data sync
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {string} configId - Sync config UUID
 * @returns {Promise<{ message: string }>} Trigger result message
 */
export const triggerSync = (
  knowledgeBaseId: string,
  configId: string,
): Promise<{ message: string }> =>
  api.post(`/api/knowledge-base/${knowledgeBaseId}/sync-configs/${configId}/trigger`);
