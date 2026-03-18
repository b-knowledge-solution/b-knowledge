/**
 * @fileoverview API helper for E2E test setup and teardown.
 *
 * Wraps Playwright's APIRequestContext to make direct HTTP calls to the
 * backend API, bypassing the UI. Used for:
 * - Creating test fixtures (datasets, documents) before tests
 * - Cleaning up test data after tests
 * - Verifying backend state without UI assertions
 *
 * All methods use the authenticated session from Playwright's storageState.
 *
 * @module e2e/helpers/api.helper
 */

import { APIRequestContext } from '@playwright/test'

/** Base URL for backend API calls */
const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001'

/**
 * @description Response shape for dataset list endpoint
 */
interface DatasetListResponse {
  data: Array<{
    id: string
    name: string
    description?: string
    status: string
    doc_count: number
    chunk_count: number
    parser_id: string
  }>
}

/**
 * @description Response shape for single dataset endpoint
 */
interface DatasetResponse {
  data: {
    id: string
    name: string
    description?: string
    status: string
    doc_count: number
    chunk_count: number
    parser_id: string
  }
}

/**
 * @description Response shape for document list endpoint
 */
interface DocumentListResponse {
  data: Array<{
    id: string
    name: string
    status: string
    run: string
    progress: number
    progress_msg: string
  }>
}

/**
 * @description Response shape for single document endpoint
 */
interface DocumentResponse {
  data: {
    id: string
    name: string
    run: string
    progress: number
    progress_msg: string
  }
}

/**
 * @description Helper class wrapping Playwright's APIRequestContext for
 * direct backend API calls during E2E test setup/teardown.
 */
export class ApiHelper {
  private request: APIRequestContext

  /**
   * @param {APIRequestContext} request - Playwright API request context
   *   (shares authenticated session from browser context)
   */
  constructor(request: APIRequestContext) {
    this.request = request
  }

  // ==========================================================================
  // Dataset operations
  // ==========================================================================

  /**
   * @description Create a new dataset via the backend API.
   * @param {string} name - Dataset name
   * @param {string} [description] - Optional dataset description
   * @returns {Promise<DatasetResponse['data']>} Created dataset
   */
  async createDataset(name: string, description?: string): Promise<DatasetResponse['data']> {
    const response = await this.request.post(`${API_BASE}/api/rag/datasets`, {
      data: {
        name,
        description: description || '',
        parser_id: 'naive',
        language: 'English',
        permission: 'me',
      },
    })

    // Throw on non-2xx to surface API errors in test output
    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`createDataset failed (${response.status()}): ${body}`)
    }

    const json = await response.json() as DatasetResponse
    return json.data
  }

  /**
   * @description Delete a dataset by ID.
   * @param {string} id - Dataset UUID
   * @returns {Promise<void>}
   */
  async deleteDataset(id: string): Promise<void> {
    const response = await this.request.delete(`${API_BASE}/api/rag/datasets/${id}`)

    // Ignore 404 -- dataset may already be deleted by the test
    if (!response.ok() && response.status() !== 404) {
      const body = await response.text()
      throw new Error(`deleteDataset failed (${response.status()}): ${body}`)
    }
  }

  /**
   * @description Get a single dataset by ID.
   * @param {string} id - Dataset UUID
   * @returns {Promise<DatasetResponse['data'] | null>} Dataset or null if not found
   */
  async getDataset(id: string): Promise<DatasetResponse['data'] | null> {
    const response = await this.request.get(`${API_BASE}/api/rag/datasets/${id}`)

    if (response.status() === 404) return null
    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`getDataset failed (${response.status()}): ${body}`)
    }

    const json = await response.json() as DatasetResponse
    return json.data
  }

  /**
   * @description List all datasets accessible to the authenticated user.
   * @returns {Promise<DatasetListResponse['data']>} Array of datasets
   */
  async listDatasets(): Promise<DatasetListResponse['data']> {
    const response = await this.request.get(`${API_BASE}/api/rag/datasets`)

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`listDatasets failed (${response.status()}): ${body}`)
    }

    const json = await response.json() as DatasetListResponse
    return json.data
  }

  // ==========================================================================
  // Document operations
  // ==========================================================================

  /**
   * @description Upload a document file to a dataset.
   * @param {string} datasetId - Target dataset UUID
   * @param {string} filePath - Absolute path to the file to upload
   * @returns {Promise<DocumentListResponse['data']>} List of uploaded documents
   */
  async uploadDocument(datasetId: string, filePath: string): Promise<DocumentListResponse['data']> {
    const response = await this.request.post(
      `${API_BASE}/api/rag/datasets/${datasetId}/documents`,
      {
        multipart: {
          files: {
            name: filePath.split('/').pop() || 'file',
            mimeType: 'application/pdf',
            buffer: require('fs').readFileSync(filePath),
          },
        },
      }
    )

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`uploadDocument failed (${response.status()}): ${body}`)
    }

    const json = await response.json() as DocumentListResponse
    return json.data
  }

  /**
   * @description Get a single document's status and metadata.
   * @param {string} datasetId - Parent dataset UUID
   * @param {string} docId - Document UUID
   * @returns {Promise<DocumentResponse['data'] | null>} Document or null if not found
   */
  async getDocument(datasetId: string, docId: string): Promise<DocumentResponse['data'] | null> {
    const response = await this.request.get(
      `${API_BASE}/api/rag/datasets/${datasetId}/documents`
    )

    if (response.status() === 404) return null
    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`getDocument failed (${response.status()}): ${body}`)
    }

    // Document list endpoint returns array; find the specific doc
    const json = await response.json() as DocumentListResponse
    const doc = json.data.find((d) => d.id === docId)
    return doc ? (doc as unknown as DocumentResponse['data']) : null
  }

  /**
   * @description Trigger parsing for one or more documents in a dataset.
   * @param {string} datasetId - Dataset UUID
   * @param {string[]} docIds - Array of document UUIDs to parse
   * @returns {Promise<void>}
   */
  async triggerParse(datasetId: string, docIds: string[]): Promise<void> {
    const response = await this.request.post(
      `${API_BASE}/api/rag/datasets/${datasetId}/documents/bulk-parse`,
      { data: { document_ids: docIds } }
    )

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`triggerParse failed (${response.status()}): ${body}`)
    }
  }
}

  // ==========================================================================
  // Chat assistant operations
  // ==========================================================================

  /**
   * @description Create a new chat assistant via the backend API.
   * @param {string} name - Assistant name
   * @param {string[]} datasetIds - Array of dataset IDs to link to the assistant
   * @returns {Promise<{ id: string; name: string }>} Created assistant
   */
  async createChatAssistant(name: string, datasetIds: string[]): Promise<{ id: string; name: string }> {
    const response = await this.request.post(`${API_BASE}/api/chat/assistants`, {
      data: {
        name,
        dataset_ids: datasetIds,
        llm_setting: {},
      },
    })

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`createChatAssistant failed (${response.status()}): ${body}`)
    }

    return response.json()
  }

  /**
   * @description Delete a chat assistant by ID.
   * @param {string} id - Assistant UUID
   * @returns {Promise<void>}
   */
  async deleteChatAssistant(id: string): Promise<void> {
    const response = await this.request.delete(`${API_BASE}/api/chat/assistants/${id}`)

    // Ignore 404 -- assistant may already be deleted
    if (!response.ok() && response.status() !== 404) {
      const body = await response.text()
      throw new Error(`deleteChatAssistant failed (${response.status()}): ${body}`)
    }
  }

  // ==========================================================================
  // Conversation operations
  // ==========================================================================

  /**
   * @description Create a new chat conversation via the backend API.
   * @param {string} dialogId - Assistant (dialog) ID
   * @param {string} name - Conversation name
   * @returns {Promise<{ id: string; name: string }>} Created conversation
   */
  async createConversation(dialogId: string, name: string): Promise<{ id: string; name: string }> {
    const response = await this.request.post(`${API_BASE}/api/chat/conversations`, {
      data: { name, dialog_id: dialogId },
    })

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`createConversation failed (${response.status()}): ${body}`)
    }

    return response.json()
  }

  /**
   * @description Delete a conversation by ID.
   * @param {string} id - Conversation UUID
   * @returns {Promise<void>}
   */
  async deleteConversation(id: string): Promise<void> {
    const response = await this.request.delete(`${API_BASE}/api/chat/conversations`, {
      data: { ids: [id] },
    })

    // Ignore 404 -- conversation may already be deleted
    if (!response.ok() && response.status() !== 404) {
      const body = await response.text()
      throw new Error(`deleteConversation failed (${response.status()}): ${body}`)
    }
  }

  // ==========================================================================
  // Search app operations
  // ==========================================================================

  /**
   * @description Create a new search app via the backend API.
   * @param {string} name - Search app name
   * @param {string[]} datasetIds - Array of dataset IDs to link
   * @returns {Promise<{ id: string; name: string }>} Created search app
   */
  async createSearchApp(name: string, datasetIds: string[]): Promise<{ id: string; name: string }> {
    const response = await this.request.post(`${API_BASE}/api/search/apps`, {
      data: {
        name,
        dataset_ids: datasetIds,
      },
    })

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`createSearchApp failed (${response.status()}): ${body}`)
    }

    return response.json()
  }

  /**
   * @description Delete a search app by ID.
   * @param {string} id - Search app UUID
   * @returns {Promise<void>}
   */
  async deleteSearchApp(id: string): Promise<void> {
    const response = await this.request.delete(`${API_BASE}/api/search/apps/${id}`)

    // Ignore 404 -- app may already be deleted
    if (!response.ok() && response.status() !== 404) {
      const body = await response.text()
      throw new Error(`deleteSearchApp failed (${response.status()}): ${body}`)
    }
  }
}

/**
 * @description Factory function to create an ApiHelper from a Playwright request context.
 * @param {APIRequestContext} request - Playwright API request context
 * @returns {ApiHelper} Configured API helper instance
 */
export function apiHelper(request: APIRequestContext): ApiHelper {
  return new ApiHelper(request)
}
