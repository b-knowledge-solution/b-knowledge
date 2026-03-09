import { api, apiFetch } from '@/lib/api';
import type { Dataset, CreateDatasetDto, UpdateDatasetDto, Document } from '../types';

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
};
