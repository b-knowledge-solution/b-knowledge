import { api, apiFetch } from '@/lib/api';
import type {
  Dataset, CreateDatasetDto, UpdateDatasetDto, Document, ChunksResponse, Chunk,
  DatasetSettings, RetrievalTestResult,
} from '../types';

/** @description Response shape from GET /api/rag/datasets/:id/access */
export interface DatasetAccessResponse {
  public: boolean;
  teams: { id: string; name: string }[];
  users: { id: string; display_name: string }[];
}

const BASE_URL = '/api/rag';

export const datasetApi = {
  // Dataset CRUD
  listDatasets: async (): Promise<Dataset[]> => {
    return api.get<Dataset[]>(`${BASE_URL}/datasets`);
  },

  getDataset: async (id: string): Promise<Dataset> => {
    return api.get<Dataset>(`${BASE_URL}/datasets/${id}`);
  },

  createDataset: async (data: CreateDatasetDto): Promise<Dataset> => {
    return api.post<Dataset>(`${BASE_URL}/datasets`, data);
  },

  updateDataset: async (id: string, data: UpdateDatasetDto): Promise<Dataset> => {
    return api.put<Dataset>(`${BASE_URL}/datasets/${id}`, data);
  },

  deleteDataset: async (id: string): Promise<void> => {
    return api.delete<void>(`${BASE_URL}/datasets/${id}`);
  },

  // Document CRUD
  listDocuments: async (datasetId: string): Promise<Document[]> => {
    return api.get<Document[]>(`${BASE_URL}/datasets/${datasetId}/documents`);
  },

  uploadDocuments: async (datasetId: string, files: File[]): Promise<Document[]> => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    return apiFetch<Document[]>(`${BASE_URL}/datasets/${datasetId}/documents`, {
      method: 'POST',
      body: formData,
      headers: {}, // let browser set Content-Type with boundary
    });
  },

  deleteDocument: async (datasetId: string, docId: string): Promise<void> => {
    return api.delete<void>(`${BASE_URL}/datasets/${datasetId}/documents/${docId}`);
  },

  parseDocument: async (datasetId: string, docId: string): Promise<void> => {
    return api.post<void>(`${BASE_URL}/datasets/${datasetId}/documents/${docId}/parse`);
  },

  getDocumentDownloadUrl: (datasetId: string, docId: string): string => {
    const base = import.meta.env.VITE_API_BASE_URL || '';
    return `${base}${BASE_URL}/datasets/${datasetId}/documents/${docId}/download`;
  },

  // Access control
  /** @description Fetch current access control for a dataset */
  getDatasetAccess: async (datasetId: string): Promise<DatasetAccessResponse> => {
    return api.get<DatasetAccessResponse>(`${BASE_URL}/datasets/${datasetId}/access`);
  },

  /** @description Update access control for a dataset */
  setDatasetAccess: async (
    datasetId: string,
    data: { public?: boolean; team_ids?: string[]; user_ids?: string[] },
  ): Promise<void> => {
    return api.put<void>(`${BASE_URL}/datasets/${datasetId}/access`, data);
  },

  // Chunk operations
  listChunks: async (
    datasetId: string,
    params?: { doc_id?: string; page?: number; limit?: number; search?: string },
  ): Promise<ChunksResponse> => {
    const query = new URLSearchParams();
    if (params?.doc_id) query.set('doc_id', params.doc_id);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    const qs = query.toString();
    return api.get<ChunksResponse>(`${BASE_URL}/datasets/${datasetId}/chunks${qs ? `?${qs}` : ''}`);
  },

  /** @description Add a manual chunk to a dataset */
  addChunk: async (datasetId: string, data: { text: string; doc_id?: string }): Promise<Chunk> => {
    return api.post<Chunk>(`${BASE_URL}/datasets/${datasetId}/chunks`, data);
  },

  /** @description Update a chunk */
  updateChunk: async (datasetId: string, chunkId: string, data: { text: string }): Promise<Chunk> => {
    return api.put<Chunk>(`${BASE_URL}/datasets/${datasetId}/chunks/${chunkId}`, data);
  },

  /** @description Delete a chunk */
  deleteChunk: async (datasetId: string, chunkId: string): Promise<void> => {
    return api.delete<void>(`${BASE_URL}/datasets/${datasetId}/chunks/${chunkId}`);
  },

  // ============================================================================
  // Dataset Settings
  // ============================================================================

  /** @description Get dataset settings */
  getDatasetSettings: async (datasetId: string): Promise<DatasetSettings> => {
    return api.get<DatasetSettings>(`${BASE_URL}/datasets/${datasetId}/settings`);
  },

  /** @description Update dataset settings */
  updateDatasetSettings: async (datasetId: string, data: Partial<DatasetSettings>): Promise<DatasetSettings> => {
    return api.put<DatasetSettings>(`${BASE_URL}/datasets/${datasetId}/settings`, data);
  },

  // ============================================================================
  // Retrieval Test
  // ============================================================================

  /** @description Run a retrieval test against a dataset */
  runRetrievalTest: async (
    datasetId: string,
    params: { query: string; method?: string; top_k?: number; similarity_threshold?: number },
  ): Promise<RetrievalTestResult> => {
    return api.post<RetrievalTestResult>(`${BASE_URL}/datasets/${datasetId}/retrieval-test`, params);
  },
};
