/**
 * @fileoverview Raw HTTP API functions for dataset feature.
 * Handles all dataset, document, chunk, settings, retrieval test,
 * access control, graph, and metadata endpoints.
 *
 * @module features/datasets/api/datasetApi
 */

import { api, apiFetch } from '@/lib/api';
import type {
  Dataset, CreateDatasetDto, UpdateDatasetDto, Document, ChunksResponse, Chunk,
  DatasetSettings, RetrievalTestResult,
  DocumentLogsResponse, DatasetOverviewStats, DatasetLogsResponse,
  GraphDataResponse, MetadataResponse, MetadataField,
} from '../types';

/**
 * @description Response shape from GET /api/rag/datasets/:id/access
 */
export interface DatasetAccessResponse {
  public: boolean;
  teams: { id: string; name: string }[];
  users: { id: string; display_name: string }[];
}

/** @description Base URL prefix for all RAG API endpoints */
const BASE_URL = '/api/rag';

/**
 * @description Dataset API client containing all raw HTTP calls for the datasets feature.
 * Organized by domain: Dataset CRUD, Document CRUD, Access Control, Chunks,
 * Settings, Retrieval Test, Overview/Logs, Knowledge Graph, and Metadata.
 */
export const datasetApi = {
  // ============================================================================
  // Dataset CRUD
  // ============================================================================

  /**
   * @description Fetch all datasets visible to the current user.
   * @returns {Promise<Dataset[]>} Array of dataset objects
   */
  listDatasets: async (): Promise<Dataset[]> => {
    return api.get<Dataset[]>(`${BASE_URL}/datasets`);
  },

  /**
   * @description Fetch a single dataset by ID.
   * @param {string} id - Dataset UUID
   * @returns {Promise<Dataset>} The dataset object
   */
  getDataset: async (id: string): Promise<Dataset> => {
    return api.get<Dataset>(`${BASE_URL}/datasets/${id}`);
  },

  /**
   * @description Create a new dataset.
   * @param {CreateDatasetDto} data - Dataset creation payload
   * @returns {Promise<Dataset>} The newly created dataset
   */
  createDataset: async (data: CreateDatasetDto): Promise<Dataset> => {
    return api.post<Dataset>(`${BASE_URL}/datasets`, data);
  },

  /**
   * @description Update an existing dataset.
   * @param {string} id - Dataset UUID
   * @param {UpdateDatasetDto} data - Partial update payload
   * @returns {Promise<Dataset>} The updated dataset
   */
  updateDataset: async (id: string, data: UpdateDatasetDto): Promise<Dataset> => {
    return api.put<Dataset>(`${BASE_URL}/datasets/${id}`, data);
  },

  /**
   * @description Delete a dataset and all its associated resources.
   * @param {string} id - Dataset UUID
   * @returns {Promise<void>}
   */
  deleteDataset: async (id: string): Promise<void> => {
    return api.delete<void>(`${BASE_URL}/datasets/${id}`);
  },

  // ============================================================================
  // Document CRUD
  // ============================================================================

  /**
   * @description Fetch all documents belonging to a dataset.
   * @param {string} datasetId - Dataset UUID
   * @returns {Promise<Document[]>} Array of document objects
   */
  listDocuments: async (datasetId: string): Promise<Document[]> => {
    return api.get<Document[]>(`${BASE_URL}/datasets/${datasetId}/documents`);
  },

  /**
   * @description Upload multiple files as documents to a dataset.
   * Uses FormData with empty headers to let the browser set multipart boundary.
   * @param {string} datasetId - Dataset UUID
   * @param {File[]} files - Array of files to upload
   * @returns {Promise<Document[]>} Array of created document objects
   */
  uploadDocuments: async (datasetId: string, files: File[]): Promise<Document[]> => {
    const formData = new FormData();
    // Append each file under the 'files' key for multer-style backend processing
    files.forEach((file) => {
      formData.append('files', file);
    });
    return apiFetch<Document[]>(`${BASE_URL}/datasets/${datasetId}/documents`, {
      method: 'POST',
      body: formData,
      headers: {}, // let browser set Content-Type with boundary
    });
  },

  /**
   * @description Delete a single document from a dataset.
   * @param {string} datasetId - Dataset UUID
   * @param {string} docId - Document UUID
   * @returns {Promise<void>}
   */
  deleteDocument: async (datasetId: string, docId: string): Promise<void> => {
    return api.delete<void>(`${BASE_URL}/datasets/${datasetId}/documents/${docId}`);
  },

  /**
   * @description Trigger parsing for a single document.
   * @param {string} datasetId - Dataset UUID
   * @param {string} docId - Document UUID
   * @returns {Promise<void>}
   */
  parseDocument: async (datasetId: string, docId: string): Promise<void> => {
    return api.post<void>(`${BASE_URL}/datasets/${datasetId}/documents/${docId}/parse`);
  },

  /**
   * @description Toggle document availability (enabled/disabled) for search.
   * @param {string} datasetId - Dataset UUID
   * @param {string} docId - Document UUID
   * @param {boolean} available - Whether the document should be available
   * @returns {Promise<void>}
   */
  toggleDocumentAvailability: async (datasetId: string, docId: string, available: boolean): Promise<void> => {
    return api.patch<void>(`${BASE_URL}/datasets/${datasetId}/documents/${docId}/toggle`, { available });
  },

  /**
   * @description Bulk start or cancel parsing for multiple documents.
   * @param {string} datasetId - Dataset UUID
   * @param {string[]} docIds - Array of document UUIDs
   * @param {number} run - Run flag: 1 = start parsing, 2 = cancel parsing
   * @returns {Promise<{ results: { doc_id: string; status: string }[] }>} Per-document status results
   */
  bulkParseDocuments: async (datasetId: string, docIds: string[], run: number): Promise<{ results: { doc_id: string; status: string }[] }> => {
    return api.post(`${BASE_URL}/datasets/${datasetId}/documents/bulk-parse`, { doc_ids: docIds, run });
  },

  /**
   * @description Bulk toggle availability for multiple documents.
   * @param {string} datasetId - Dataset UUID
   * @param {string[]} docIds - Array of document UUIDs
   * @param {boolean} enabled - Whether documents should be enabled
   * @returns {Promise<void>}
   */
  bulkToggleDocuments: async (datasetId: string, docIds: string[], enabled: boolean): Promise<void> => {
    return api.post<void>(`${BASE_URL}/datasets/${datasetId}/documents/bulk-toggle`, { doc_ids: docIds, enabled });
  },

  /**
   * @description Bulk delete multiple documents from a dataset.
   * @param {string} datasetId - Dataset UUID
   * @param {string[]} docIds - Array of document UUIDs to delete
   * @returns {Promise<void>}
   */
  bulkDeleteDocuments: async (datasetId: string, docIds: string[]): Promise<void> => {
    return api.post<void>(`${BASE_URL}/datasets/${datasetId}/documents/bulk-delete`, { doc_ids: docIds });
  },

  /**
   * @description Build a download URL for a document file.
   * @param {string} datasetId - Dataset UUID
   * @param {string} docId - Document UUID
   * @returns {string} Absolute download URL
   */
  getDocumentDownloadUrl: (datasetId: string, docId: string): string => {
    // Prefix with API base URL from env for proxied/absolute URL construction
    const base = import.meta.env.VITE_API_BASE_URL || '';
    return `${base}${BASE_URL}/datasets/${datasetId}/documents/${docId}/download`;
  },

  // ============================================================================
  // Access Control
  // ============================================================================

  /**
   * @description Fetch current access control settings for a dataset.
   * @param {string} datasetId - Dataset UUID
   * @returns {Promise<DatasetAccessResponse>} Public flag plus assigned teams and users
   */
  getDatasetAccess: async (datasetId: string): Promise<DatasetAccessResponse> => {
    return api.get<DatasetAccessResponse>(`${BASE_URL}/datasets/${datasetId}/access`);
  },

  /**
   * @description Update access control settings for a dataset.
   * @param {string} datasetId - Dataset UUID
   * @param {{ public?: boolean; team_ids?: string[]; user_ids?: string[] }} data - Access control payload
   * @returns {Promise<void>}
   */
  setDatasetAccess: async (
    datasetId: string,
    data: { public?: boolean; team_ids?: string[]; user_ids?: string[] },
  ): Promise<void> => {
    return api.put<void>(`${BASE_URL}/datasets/${datasetId}/access`, data);
  },

  // ============================================================================
  // Chunk Operations
  // ============================================================================

  /**
   * @description Fetch paginated chunks for a dataset, optionally filtered by document and search term.
   * @param {string} datasetId - Dataset UUID
   * @param {{ doc_id?: string; page?: number; limit?: number; search?: string }} params - Query parameters
   * @returns {Promise<ChunksResponse>} Paginated chunks with total count
   */
  /**
   * @description Fetch paginated chunks for a dataset, optionally filtered by document, search term, and availability.
   * @param {string} datasetId - Dataset UUID
   * @param {object} params - Query parameters including optional available filter
   * @returns {Promise<ChunksResponse>} Paginated chunks with total count
   */
  listChunks: async (
    datasetId: string,
    params?: { doc_id?: string; page?: number; limit?: number; search?: string; available?: boolean },
  ): Promise<ChunksResponse> => {
    // Build query string from optional parameters
    const query = new URLSearchParams();
    if (params?.doc_id) query.set('doc_id', params.doc_id);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    // Pass availability filter as '1' or '0' when explicitly set
    if (params?.available !== undefined) query.set('available', params.available ? '1' : '0');
    const qs = query.toString();
    return api.get<ChunksResponse>(`${BASE_URL}/datasets/${datasetId}/chunks${qs ? `?${qs}` : ''}`);
  },

  /**
   * @description Add a manual text chunk to a dataset.
   * @param {string} datasetId - Dataset UUID
   * @param {{ text: string; doc_id?: string }} data - Chunk content and optional document association
   * @returns {Promise<Chunk>} The created chunk
   */
  addChunk: async (datasetId: string, data: { text: string; doc_id?: string }): Promise<Chunk> => {
    return api.post<Chunk>(`${BASE_URL}/datasets/${datasetId}/chunks`, data);
  },

  /**
   * @description Update a chunk's text content.
   * @param {string} datasetId - Dataset UUID
   * @param {string} chunkId - Chunk UUID
   * @param {{ text: string }} data - Updated text content
   * @returns {Promise<Chunk>} The updated chunk
   */
  updateChunk: async (datasetId: string, chunkId: string, data: { text?: string; available?: boolean }): Promise<Chunk> => {
    return api.put<Chunk>(`${BASE_URL}/datasets/${datasetId}/chunks/${chunkId}`, data);
  },

  /**
   * @description Delete a chunk from a dataset.
   * @param {string} datasetId - Dataset UUID
   * @param {string} chunkId - Chunk UUID
   * @returns {Promise<void>}
   */
  deleteChunk: async (datasetId: string, chunkId: string): Promise<void> => {
    return api.delete<void>(`${BASE_URL}/datasets/${datasetId}/chunks/${chunkId}`);
  },

  /**
   * @description Bulk enable/disable chunks by IDs.
   * @param {string} datasetId - Dataset UUID
   * @param {{ chunk_ids: string[]; available: boolean }} data - Chunk IDs and availability status
   * @returns {Promise<{ updated: number }>} Count of updated chunks
   */
  bulkSwitchChunks: async (datasetId: string, data: { chunk_ids: string[]; available: boolean }): Promise<{ updated: number }> => {
    return api.post<{ updated: number }>(`${BASE_URL}/datasets/${datasetId}/chunks/bulk-switch`, data);
  },

  // ============================================================================
  // Dataset Settings
  // ============================================================================

  /**
   * @description Fetch dataset settings including chunking and advanced configuration.
   * @param {string} datasetId - Dataset UUID
   * @returns {Promise<DatasetSettings>} Full settings object
   */
  getDatasetSettings: async (datasetId: string): Promise<DatasetSettings> => {
    return api.get<DatasetSettings>(`${BASE_URL}/datasets/${datasetId}/settings`);
  },

  /**
   * @description Update dataset settings with partial data.
   * @param {string} datasetId - Dataset UUID
   * @param {Partial<DatasetSettings>} data - Fields to update
   * @returns {Promise<DatasetSettings>} The updated settings
   */
  updateDatasetSettings: async (datasetId: string, data: Partial<DatasetSettings>): Promise<DatasetSettings> => {
    return api.put<DatasetSettings>(`${BASE_URL}/datasets/${datasetId}/settings`, data);
  },

  // ============================================================================
  // Retrieval Test
  // ============================================================================

  /**
   * @description Run a retrieval test query against a dataset's indexed chunks.
   * @param {string} datasetId - Dataset UUID
   * @param {{ query: string; method?: string; top_k?: number; similarity_threshold?: number }} params - Test parameters
   * @returns {Promise<RetrievalTestResult>} Matching chunks with scores
   */
  runRetrievalTest: async (
    datasetId: string,
    params: { query: string; method?: string; top_k?: number; similarity_threshold?: number },
  ): Promise<RetrievalTestResult> => {
    return api.post<RetrievalTestResult>(`${BASE_URL}/datasets/${datasetId}/retrieval-test`, params);
  },

  // ============================================================================
  // Dataset Overview & Logs
  // ============================================================================

  /**
   * @description Fetch dataset overview statistics (document counts by status).
   * @param {string} datasetId - Dataset UUID
   * @returns {Promise<DatasetOverviewStats>} Aggregate status counts
   */
  getOverview: async (datasetId: string): Promise<DatasetOverviewStats> => {
    return api.get<DatasetOverviewStats>(`${BASE_URL}/datasets/${datasetId}/overview`);
  },

  /**
   * @description Fetch paginated processing logs for a dataset.
   * @param {string} datasetId - Dataset UUID
   * @param {{ page?: number; limit?: number; status?: string }} params - Pagination and filter params
   * @returns {Promise<DatasetLogsResponse>} Paginated log entries with total count
   */
  getLogs: async (
    datasetId: string,
    params: { page?: number; limit?: number; status?: string } = {},
  ): Promise<DatasetLogsResponse> => {
    // Build query string from pagination and filter parameters
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.status) searchParams.set('status', params.status);
    const qs = searchParams.toString();
    return api.get<DatasetLogsResponse>(`${BASE_URL}/datasets/${datasetId}/logs${qs ? `?${qs}` : ''}`);
  },

  // ============================================================================
  // Document Logs (Process Log Modal)
  // ============================================================================

  /**
   * @description Fetch processing logs for a specific document including task history.
   * @param {string} datasetId - Dataset UUID
   * @param {string} docId - Document UUID
   * @returns {Promise<DocumentLogsResponse>} Document info and array of task logs
   */
  getDocumentLogs: async (datasetId: string, docId: string): Promise<DocumentLogsResponse> => {
    return api.get<DocumentLogsResponse>(`${BASE_URL}/datasets/${datasetId}/documents/${docId}/logs`);
  },

  // ============================================================================
  // Knowledge Graph & RAPTOR
  // ============================================================================

  /**
   * @description Fetch knowledge graph data (nodes and edges) for visualization.
   * @param {string} datasetId - Dataset UUID
   * @returns {Promise<GraphDataResponse>} Graph nodes and edges
   */
  getGraphData: async (datasetId: string): Promise<GraphDataResponse> => {
    return api.get<GraphDataResponse>(`${BASE_URL}/datasets/${datasetId}/graph`);
  },

  /**
   * @description Trigger a GraphRAG entity/relationship extraction task.
   * @param {string} datasetId - Dataset UUID
   * @param {string[]} [docIds] - Optional subset of document IDs to process
   * @returns {Promise<{ task_id: string; task_type: string; doc_count: number }>} Task info
   */
  runGraphRAG: async (datasetId: string, docIds?: string[]): Promise<{ task_id: string; task_type: string; doc_count: number }> => {
    return api.post(`${BASE_URL}/datasets/${datasetId}/graphrag`, docIds ? { doc_ids: docIds } : {});
  },

  /**
   * @description Trigger a RAPTOR recursive summarization task.
   * @param {string} datasetId - Dataset UUID
   * @param {string[]} [docIds] - Optional subset of document IDs to process
   * @returns {Promise<{ task_id: string; task_type: string; doc_count: number }>} Task info
   */
  runRaptor: async (datasetId: string, docIds?: string[]): Promise<{ task_id: string; task_type: string; doc_count: number }> => {
    return api.post(`${BASE_URL}/datasets/${datasetId}/raptor`, docIds ? { doc_ids: docIds } : {});
  },

  /**
   * @description Poll the status of an advanced processing task (GraphRAG, RAPTOR, or Mindmap).
   * @param {string} datasetId - Dataset UUID
   * @param {'graphrag' | 'raptor' | 'mindmap'} taskType - Type of task to check
   * @returns {Promise<{ task_id: string | null; task_type: string; progress?: number; progress_msg?: string; status: string }>} Task status
   */
  getAdvancedTaskStatus: async (
    datasetId: string,
    taskType: 'graphrag' | 'raptor' | 'mindmap',
  ): Promise<{ task_id: string | null; task_type: string; progress?: number; progress_msg?: string; status: string }> => {
    return api.get(`${BASE_URL}/datasets/${datasetId}/${taskType}/status`);
  },

  // ============================================================================
  // Metadata Management
  // ============================================================================

  /**
   * @description Fetch metadata field definitions for a dataset.
   * @param {string} datasetId - Dataset UUID
   * @returns {Promise<MetadataResponse>} Array of metadata field definitions
   */
  getMetadata: async (datasetId: string): Promise<MetadataResponse> => {
    return api.get<MetadataResponse>(`${BASE_URL}/datasets/${datasetId}/metadata`);
  },

  /**
   * @description Replace all metadata field definitions for a dataset.
   * @param {string} datasetId - Dataset UUID
   * @param {MetadataField[]} fields - Complete list of metadata fields
   * @returns {Promise<MetadataResponse>} Updated metadata fields
   */
  updateMetadata: async (datasetId: string, fields: MetadataField[]): Promise<MetadataResponse> => {
    return api.put<MetadataResponse>(`${BASE_URL}/datasets/${datasetId}/metadata`, { fields });
  },
};
