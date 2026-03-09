/**
 * HTTP client for proxying requests to the Python RAG service (py-rag).
 */

const RAG_SERVICE_URL = process.env['RAG_SERVICE_URL'] || 'http://localhost:9380';

interface ProxyOptions {
    method: string;
    path: string;
    body?: any;
    headers?: Record<string, string>;
}

async function proxyRequest<T = any>(options: ProxyOptions): Promise<T> {
    const url = `${RAG_SERVICE_URL}${options.path}`;
    const fetchOptions: RequestInit = {
        method: options.method,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    };

    if (options.body && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
        fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`RAG service error (${response.status}): ${errorText}`);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}

export class RagProxyService {
    // Dataset operations
    async createDataset(data: any): Promise<any> {
        return proxyRequest({ method: 'POST', path: '/api/rag/datasets', body: data });
    }

    async getDataset(id: string): Promise<any> {
        return proxyRequest({ method: 'GET', path: `/api/rag/datasets/${id}` });
    }

    async listDatasets(): Promise<any[]> {
        return proxyRequest({ method: 'GET', path: '/api/rag/datasets' });
    }

    async updateDataset(id: string, data: any): Promise<any> {
        return proxyRequest({ method: 'PUT', path: `/api/rag/datasets/${id}`, body: data });
    }

    async deleteDataset(id: string): Promise<void> {
        return proxyRequest({ method: 'DELETE', path: `/api/rag/datasets/${id}` });
    }

    // Document operations
    async listDocuments(datasetId: string): Promise<any[]> {
        return proxyRequest({ method: 'GET', path: `/api/rag/datasets/${datasetId}/documents` });
    }

    async deleteDocument(datasetId: string, docId: string): Promise<void> {
        return proxyRequest({ method: 'DELETE', path: `/api/rag/datasets/${datasetId}/documents/${docId}` });
    }

    async parseDocument(datasetId: string, docId: string): Promise<any> {
        return proxyRequest({ method: 'POST', path: `/api/rag/datasets/${datasetId}/documents/${docId}/parse` });
    }

    // Model provider operations
    async syncModelProvider(data: any): Promise<any> {
        return proxyRequest({ method: 'POST', path: '/api/rag/models/providers', body: data });
    }

    async getAvailableModels(): Promise<any[]> {
        return proxyRequest({ method: 'GET', path: '/api/rag/models/available' });
    }

    // Search + Chunk operations
    async searchChunks(datasetId: string, body: any): Promise<any> {
        return proxyRequest({ method: 'POST', path: `/api/rag/datasets/${datasetId}/search`, body });
    }

    async listChunks(datasetId: string, query: Record<string, string>): Promise<any> {
        const params = new URLSearchParams(query).toString();
        const path = `/api/rag/datasets/${datasetId}/chunks${params ? `?${params}` : ''}`;
        return proxyRequest({ method: 'GET', path });
    }

    // Health check
    async health(): Promise<any> {
        return proxyRequest({ method: 'GET', path: '/health' });
    }
}

export const ragProxyService = new RagProxyService();
