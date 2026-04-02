/**
 * @fileoverview API functions for RAGFlow dataset operations.
 * Typed functions for dataset CRUD and future RAGFlow features
 * via knowledge-base-scoped endpoints.
 * Based on the RAGFlow backend Python dataset.py contract.
 * @module features/knowledge-base/api/ragflowApi
 */
import { api } from "@/lib/api";

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a RAGFlow dataset.
 * Mirrors the response shape from the RAGFlow API.
 */
export interface Dataset {
  id: string;
  name: string;
  avatar: string | null;
  description: string | null;
  language: string | null;
  embedding_model: string | null;
  permission: "me" | "team";
  chunk_method: string;
  parser_config: Record<string, unknown> | null;
  chunk_num: number;
  document_count: number;
  status: string;
  create_time: number;
  update_time: number;
}

/**
 * Parameters for creating a new dataset.
 * Only `name` is required; all other fields are optional.
 */
export interface CreateDatasetParams {
  /** Dataset name (required) */
  name: string;
  /** Optional base64-encoded avatar image */
  avatar?: string;
  /** Optional dataset description */
  description?: string;
  /** Optional language (e.g. "English", "Chinese", "Japanese") */
  language?: string;
  /** Optional embedding model name (format: model_name@provider) */
  embedding_model?: string;
  /** Visibility: private ("me") or shared ("team"). Defaults to "me" */
  permission?: "me" | "team";
  /**
   * Chunking method. Defaults to "naive".
   * Allowed: naive, book, email, laws, manual, one, paper,
   *          picture, presentation, qa, table, tag
   */
  chunk_method?: string;
  /** Optional parser configuration */
  parser_config?: Record<string, unknown>;
}

/**
 * Parameters for updating an existing dataset.
 */
export interface UpdateDatasetParams extends Partial<CreateDatasetParams> {
  /** Optional page rank (0-100) */
  pagerank?: number;
}

/**
 * Query parameters for listing datasets.
 */
export interface ListDatasetsParams {
  /** Dataset ID to filter */
  id?: string;
  /** Dataset name to filter */
  name?: string;
  /** Page number (default: 1) */
  page?: number;
  /** Items per page (default: 30) */
  page_size?: number;
  /** Field to order by: "create_time" or "update_time" */
  orderby?: "create_time" | "update_time";
  /** Order descending (default: true) */
  desc?: boolean;
}

// ============================================================================
// Dataset API
// ============================================================================

/**
 * Create a new dataset within a knowledge base's RAGFlow server.
 *
 * @param knowledgeBaseId - Knowledge Base UUID (used to resolve RAGFlow server)
 * @param params - Dataset creation parameters
 * @returns Created dataset object
 */
export const createDataset = (
  knowledgeBaseId: string,
  params: CreateDatasetParams,
): Promise<Dataset> => api.post(`/api/knowledge-base/${knowledgeBaseId}/datasets`, params);

/**
 * List datasets from a knowledge base's RAGFlow server.
 *
 * @param knowledgeBaseId - Knowledge Base UUID
 * @param query - Optional search/filter/pagination parameters
 * @returns Array of dataset objects
 */
export const listDatasets = (
  knowledgeBaseId: string,
  query?: ListDatasetsParams,
): Promise<Dataset[]> => {
  // Build query string from optional filter/pagination params
  const params = new URLSearchParams();
  if (query?.id) params.set("id", query.id);
  if (query?.name) params.set("name", query.name);
  if (query?.page) params.set("page", String(query.page));
  if (query?.page_size) params.set("page_size", String(query.page_size));
  if (query?.orderby) params.set("orderby", query.orderby);
  if (query?.desc !== undefined) params.set("desc", String(query.desc));
  const qs = params.toString();
  return api.get(`/api/knowledge-base/${knowledgeBaseId}/datasets${qs ? "?" + qs : ""}`);
};

/**
 * Update a dataset on a knowledge base's RAGFlow server.
 *
 * @param knowledgeBaseId - Knowledge Base UUID
 * @param datasetId - RAGFlow dataset ID
 * @param params - Fields to update
 * @returns Updated dataset object
 */
export const updateDataset = (
  knowledgeBaseId: string,
  datasetId: string,
  params: UpdateDatasetParams,
): Promise<Dataset> =>
  api.put(`/api/knowledge-base/${knowledgeBaseId}/datasets/${datasetId}`, params);

/**
 * Delete one or more datasets from a knowledge base's RAGFlow server.
 *
 * @param knowledgeBaseId - Knowledge Base UUID
 * @param ids - Array of dataset IDs to delete (null = delete all)
 * @returns void
 */
export const deleteDatasets = (
  knowledgeBaseId: string,
  ids: string[] | null,
): Promise<void> =>
  api.delete(`/api/knowledge-base/${knowledgeBaseId}/datasets`, {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
