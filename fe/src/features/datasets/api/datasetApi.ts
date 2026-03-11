import { api, apiFetch } from '@/lib/api';
import type {
  Dataset, CreateDatasetDto, UpdateDatasetDto, Document, ChunksResponse,
  DocumentVersion, CreateVersionDto, UpdateVersionDto, VersionFile, ConverterJob,
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
    params?: { doc_id?: string; page?: number; limit?: number },
  ): Promise<ChunksResponse> => {
    const query = new URLSearchParams();
    if (params?.doc_id) query.set('doc_id', params.doc_id);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api.get<ChunksResponse>(`${BASE_URL}/datasets/${datasetId}/chunks${qs ? `?${qs}` : ''}`);
  },

  // ============================================================================
  // Version CRUD
  // ============================================================================

  /** @description List all versions for a dataset */
  getVersions: async (datasetId: string): Promise<DocumentVersion[]> => {
    return api.get<DocumentVersion[]>(`${BASE_URL}/datasets/${datasetId}/versions`);
  },

  /** @description Create a new version for a dataset */
  createVersion: async (datasetId: string, data: CreateVersionDto): Promise<DocumentVersion> => {
    return api.post<DocumentVersion>(`${BASE_URL}/datasets/${datasetId}/versions`, data);
  },

  /** @description Update a version */
  updateVersion: async (datasetId: string, versionId: string, data: UpdateVersionDto): Promise<DocumentVersion> => {
    return api.put<DocumentVersion>(`${BASE_URL}/datasets/${datasetId}/versions/${versionId}`, data);
  },

  /** @description Delete a version */
  deleteVersion: async (datasetId: string, versionId: string): Promise<void> => {
    return api.delete<void>(`${BASE_URL}/datasets/${datasetId}/versions/${versionId}`);
  },

  // ============================================================================
  // Version Files
  // ============================================================================

  /** @description List files for a version */
  getVersionFiles: async (datasetId: string, versionId: string): Promise<VersionFile[]> => {
    return api.get<VersionFile[]>(`${BASE_URL}/datasets/${datasetId}/versions/${versionId}/files`);
  },

  /** @description Upload files to a version */
  uploadVersionFiles: async (datasetId: string, versionId: string, files: File[]): Promise<VersionFile[]> => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    return apiFetch<VersionFile[]>(`${BASE_URL}/datasets/${datasetId}/versions/${versionId}/files`, {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },

  /** @description Delete files from a version */
  deleteVersionFiles: async (datasetId: string, versionId: string, fileIds: string[]): Promise<void> => {
    return api.post<void>(`${BASE_URL}/datasets/${datasetId}/versions/${versionId}/files/delete`, { file_ids: fileIds });
  },

  // ============================================================================
  // Converter & Parse Operations
  // ============================================================================

  /** @description Start converting files in a version */
  convertFiles: async (datasetId: string, versionId: string): Promise<ConverterJob> => {
    return api.post<ConverterJob>(`${BASE_URL}/datasets/${datasetId}/versions/${versionId}/convert`);
  },

  /** @description Start parsing imported files in RAGFlow */
  parseFiles: async (datasetId: string, versionId: string): Promise<void> => {
    return api.post<void>(`${BASE_URL}/datasets/${datasetId}/versions/${versionId}/parse`);
  },

  /** @description Sync file statuses from RAGFlow */
  syncFileStatus: async (datasetId: string, versionId: string): Promise<VersionFile[]> => {
    return api.post<VersionFile[]>(`${BASE_URL}/datasets/${datasetId}/versions/${versionId}/sync-status`);
  },

  /** @description Re-queue failed files for conversion */
  requeueFiles: async (datasetId: string, versionId: string): Promise<void> => {
    return api.post<void>(`${BASE_URL}/datasets/${datasetId}/versions/${versionId}/requeue`);
  },

  /** @description Get converter jobs for a version */
  getConverterJobs: async (datasetId: string, versionId: string): Promise<ConverterJob[]> => {
    return api.get<ConverterJob[]>(`${BASE_URL}/datasets/${datasetId}/versions/${versionId}/jobs`);
  },
};
