/**
 * @fileoverview API helper for E2E test setup and teardown.
 *
 * Wraps Playwright's APIRequestContext to make direct HTTP calls to the
 * backend API, bypassing the UI. Used for:
 * - Creating test fixtures (datasets, documents, projects) before tests
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
    parser_config?: Record<string, unknown>
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
    chunk_count?: number
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
    chunk_count?: number
  }
}

/**
 * @description Response shape for project endpoints
 */
interface ProjectResponse {
  id: string
  name: string
  description: string | null
  category: string
  status: string
  dataset_count?: number
  created_at: string
  updated_at: string
}

/**
 * @description Response shape for project dataset link
 */
interface ProjectDatasetResponse {
  id: string
  project_id: string
  dataset_id: string
  dataset_name?: string
}

/**
 * @description Response shape for chat assistant
 */
interface ChatAssistantResponse {
  id: string
  name: string
  dataset_ids?: string[]
  llm_setting?: Record<string, unknown>
}

/**
 * @description Response shape for conversation
 */
interface ConversationResponse {
  id: string
  name: string
  dialog_id?: string
}

/**
 * @description Response shape for search app
 */
interface SearchAppResponse {
  id: string
  name: string
  dataset_ids?: string[]
}

/**
 * @description Response shape for chunks list endpoint
 */
interface ChunksListResponse {
  data: Array<{
    id: string
    content: string
    doc_id: string
    available: boolean
  }>
  total: number
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
   * @param {Record<string, unknown>} [parserConfig] - Optional parser configuration
   * @returns {Promise<DatasetResponse['data']>} Created dataset
   */
  async createDataset(
    name: string,
    description?: string,
    parserConfig?: Record<string, unknown>,
  ): Promise<DatasetResponse['data']> {
    const response = await this.request.post(`${API_BASE}/api/rag/datasets`, {
      data: {
        name,
        description: description || '',
        parser_id: 'naive',
        language: 'English',
        permission: 'me',
        ...(parserConfig ? { parser_config: parserConfig } : {}),
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

  /**
   * @description Update a dataset's settings (parser config, embedding model, etc.).
   * @param {string} id - Dataset UUID
   * @param {Record<string, unknown>} data - Fields to update
   * @returns {Promise<DatasetResponse['data']>} Updated dataset
   */
  async updateDatasetSettings(id: string, data: Record<string, unknown>): Promise<DatasetResponse['data']> {
    const response = await this.request.put(`${API_BASE}/api/rag/datasets/${id}/settings`, {
      data,
    })

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`updateDatasetSettings failed (${response.status()}): ${body}`)
    }

    const json = await response.json()
    return json.data || json
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
   * @description Upload a text document to a dataset by creating a buffer.
   * @param {string} datasetId - Target dataset UUID
   * @param {string} fileName - Name for the uploaded file
   * @param {Buffer} buffer - File content buffer
   * @param {string} [mimeType='text/plain'] - MIME type of the file
   * @returns {Promise<DocumentListResponse['data']>} List of uploaded documents
   */
  async uploadDocumentBuffer(
    datasetId: string,
    fileName: string,
    buffer: Buffer,
    mimeType = 'text/plain',
  ): Promise<DocumentListResponse['data']> {
    const response = await this.request.post(
      `${API_BASE}/api/rag/datasets/${datasetId}/documents`,
      {
        multipart: {
          files: {
            name: fileName,
            mimeType,
            buffer,
          },
        },
      }
    )

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`uploadDocumentBuffer failed (${response.status()}): ${body}`)
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
   * @description List all documents in a dataset.
   * @param {string} datasetId - Dataset UUID
   * @returns {Promise<DocumentListResponse['data']>} Array of documents
   */
  async listDocuments(datasetId: string): Promise<DocumentListResponse['data']> {
    const response = await this.request.get(
      `${API_BASE}/api/rag/datasets/${datasetId}/documents`
    )

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`listDocuments failed (${response.status()}): ${body}`)
    }

    const json = await response.json() as DocumentListResponse
    return json.data
  }

  /**
   * @description Delete a single document from a dataset.
   * @param {string} datasetId - Dataset UUID
   * @param {string} docId - Document UUID
   * @returns {Promise<void>}
   */
  async deleteDocument(datasetId: string, docId: string): Promise<void> {
    const response = await this.request.delete(
      `${API_BASE}/api/rag/datasets/${datasetId}/documents/${docId}`
    )

    // Ignore 404 -- document may already be deleted
    if (!response.ok() && response.status() !== 404) {
      const body = await response.text()
      throw new Error(`deleteDocument failed (${response.status()}): ${body}`)
    }
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

  /**
   * @description List chunks for a document within a dataset.
   * @param {string} datasetId - Dataset UUID
   * @param {string} [docId] - Optional document UUID to filter by
   * @returns {Promise<ChunksListResponse>} Chunks list with total count
   */
  async listChunks(datasetId: string, docId?: string): Promise<ChunksListResponse> {
    const params: Record<string, string> = {}
    if (docId) params.doc_id = docId

    const response = await this.request.get(
      `${API_BASE}/api/rag/datasets/${datasetId}/chunks`,
      { params }
    )

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`listChunks failed (${response.status()}): ${body}`)
    }

    return response.json() as Promise<ChunksListResponse>
  }

  // ==========================================================================
  // Chat assistant operations
  // ==========================================================================

  /**
   * @description Create a new chat assistant via the backend API.
   * @param {string} name - Assistant name
   * @param {string[]} datasetIds - Array of dataset IDs to link to the assistant
   * @param {Record<string, unknown>} [llmSetting] - Optional LLM configuration
   * @returns {Promise<ChatAssistantResponse>} Created assistant
   */
  async createChatAssistant(
    name: string,
    datasetIds: string[],
    llmSetting?: Record<string, unknown>,
  ): Promise<ChatAssistantResponse> {
    const response = await this.request.post(`${API_BASE}/api/chat/assistants`, {
      data: {
        name,
        dataset_ids: datasetIds,
        llm_setting: llmSetting || {},
      },
    })

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`createChatAssistant failed (${response.status()}): ${body}`)
    }

    return response.json()
  }

  /**
   * @description Get a chat assistant by ID.
   * @param {string} id - Assistant UUID
   * @returns {Promise<ChatAssistantResponse | null>} Assistant or null if not found
   */
  async getChatAssistant(id: string): Promise<ChatAssistantResponse | null> {
    const response = await this.request.get(`${API_BASE}/api/chat/assistants/${id}`)

    if (response.status() === 404) return null
    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`getChatAssistant failed (${response.status()}): ${body}`)
    }

    return response.json()
  }

  /**
   * @description Update a chat assistant's configuration.
   * @param {string} id - Assistant UUID
   * @param {Record<string, unknown>} data - Fields to update
   * @returns {Promise<ChatAssistantResponse>} Updated assistant
   */
  async updateChatAssistant(id: string, data: Record<string, unknown>): Promise<ChatAssistantResponse> {
    const response = await this.request.put(`${API_BASE}/api/chat/assistants/${id}`, {
      data,
    })

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`updateChatAssistant failed (${response.status()}): ${body}`)
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
   * @returns {Promise<ConversationResponse>} Created conversation
   */
  async createConversation(dialogId: string, name: string): Promise<ConversationResponse> {
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
   * @description List conversations for an assistant.
   * @param {string} assistantId - Assistant UUID
   * @returns {Promise<ConversationResponse[]>} Array of conversations
   */
  async listConversations(assistantId: string): Promise<ConversationResponse[]> {
    const response = await this.request.get(
      `${API_BASE}/api/chat/assistants/${assistantId}/conversations`
    )

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`listConversations failed (${response.status()}): ${body}`)
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
   * @returns {Promise<SearchAppResponse>} Created search app
   */
  async createSearchApp(name: string, datasetIds: string[]): Promise<SearchAppResponse> {
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
   * @description Get a search app by ID.
   * @param {string} id - Search app UUID
   * @returns {Promise<SearchAppResponse | null>} Search app or null if not found
   */
  async getSearchApp(id: string): Promise<SearchAppResponse | null> {
    const response = await this.request.get(`${API_BASE}/api/search/apps/${id}`)

    if (response.status() === 404) return null
    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`getSearchApp failed (${response.status()}): ${body}`)
    }

    return response.json()
  }

  /**
   * @description Update a search app's configuration.
   * @param {string} id - Search app UUID
   * @param {Record<string, unknown>} data - Fields to update
   * @returns {Promise<SearchAppResponse>} Updated search app
   */
  async updateSearchApp(id: string, data: Record<string, unknown>): Promise<SearchAppResponse> {
    const response = await this.request.put(`${API_BASE}/api/search/apps/${id}`, {
      data,
    })

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`updateSearchApp failed (${response.status()}): ${body}`)
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

  // ==========================================================================
  // Project operations
  // ==========================================================================

  /**
   * @description Create a new project via the backend API.
   * @param {string} name - Project name
   * @param {string} [description] - Optional project description
   * @param {string} [category='office'] - Project category
   * @returns {Promise<ProjectResponse>} Created project
   */
  async createProject(
    name: string,
    description?: string,
    category = 'office',
  ): Promise<ProjectResponse> {
    const response = await this.request.post(`${API_BASE}/api/projects`, {
      data: {
        name,
        description: description || '',
        category,
      },
    })

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`createProject failed (${response.status()}): ${body}`)
    }

    return response.json()
  }

  /**
   * @description Get a project by ID.
   * @param {string} id - Project UUID
   * @returns {Promise<ProjectResponse | null>} Project or null if not found
   */
  async getProject(id: string): Promise<ProjectResponse | null> {
    const response = await this.request.get(`${API_BASE}/api/projects/${id}`)

    if (response.status() === 404) return null
    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`getProject failed (${response.status()}): ${body}`)
    }

    return response.json()
  }

  /**
   * @description List all projects accessible to the authenticated user.
   * @returns {Promise<ProjectResponse[]>} Array of projects
   */
  async listProjects(): Promise<ProjectResponse[]> {
    const response = await this.request.get(`${API_BASE}/api/projects`)

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`listProjects failed (${response.status()}): ${body}`)
    }

    return response.json()
  }

  /**
   * @description Update a project.
   * @param {string} id - Project UUID
   * @param {Record<string, unknown>} data - Fields to update
   * @returns {Promise<ProjectResponse>} Updated project
   */
  async updateProject(id: string, data: Record<string, unknown>): Promise<ProjectResponse> {
    const response = await this.request.put(`${API_BASE}/api/projects/${id}`, {
      data,
    })

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`updateProject failed (${response.status()}): ${body}`)
    }

    return response.json()
  }

  /**
   * @description Delete a project by ID.
   * @param {string} id - Project UUID
   * @returns {Promise<void>}
   */
  async deleteProject(id: string): Promise<void> {
    const response = await this.request.delete(`${API_BASE}/api/projects/${id}`)

    // Ignore 404 -- project may already be deleted
    if (!response.ok() && response.status() !== 404) {
      const body = await response.text()
      throw new Error(`deleteProject failed (${response.status()}): ${body}`)
    }
  }

  /**
   * @description Link datasets to a project.
   * @param {string} projectId - Project UUID
   * @param {string[]} datasetIds - Array of dataset UUIDs to bind
   * @returns {Promise<void>}
   */
  async bindProjectDatasets(projectId: string, datasetIds: string[]): Promise<void> {
    const response = await this.request.post(`${API_BASE}/api/projects/${projectId}/datasets`, {
      data: { dataset_ids: datasetIds },
    })

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`bindProjectDatasets failed (${response.status()}): ${body}`)
    }
  }

  /**
   * @description Unlink a dataset from a project.
   * @param {string} projectId - Project UUID
   * @param {string} datasetId - Dataset UUID to unbind
   * @returns {Promise<void>}
   */
  async unbindProjectDataset(projectId: string, datasetId: string): Promise<void> {
    const response = await this.request.delete(
      `${API_BASE}/api/projects/${projectId}/datasets/${datasetId}`
    )

    // Ignore 404 -- link may already be removed
    if (!response.ok() && response.status() !== 404) {
      const body = await response.text()
      throw new Error(`unbindProjectDataset failed (${response.status()}): ${body}`)
    }
  }

  /**
   * @description List datasets linked to a project.
   * @param {string} projectId - Project UUID
   * @returns {Promise<ProjectDatasetResponse[]>} Array of project-dataset links
   */
  async listProjectDatasets(projectId: string): Promise<ProjectDatasetResponse[]> {
    const response = await this.request.get(
      `${API_BASE}/api/projects/${projectId}/datasets`
    )

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`listProjectDatasets failed (${response.status()}): ${body}`)
    }

    return response.json()
  }

  // ==========================================================================
  // Dataset versioning operations
  // ==========================================================================

  /**
   * @description Create a new version of a dataset with uploaded files.
   * @param {string} datasetId - Parent dataset UUID
   * @param {string} filePath - Path to the file to upload in the new version
   * @param {string} [changeSummary] - Optional change summary
   * @param {string} [versionLabel] - Optional version label (e.g., 'v2')
   * @returns {Promise<DatasetResponse['data']>} The newly created version dataset
   */
  async createDatasetVersion(
    datasetId: string,
    filePath: string,
    changeSummary?: string,
    versionLabel?: string,
  ): Promise<DatasetResponse['data']> {
    const multipart: Record<string, unknown> = {
      files: {
        name: filePath.split('/').pop() || 'file',
        mimeType: 'application/pdf',
        buffer: require('fs').readFileSync(filePath),
      },
    }

    // Attach optional metadata as form fields
    if (changeSummary) multipart.change_summary = changeSummary
    if (versionLabel) multipart.version_label = versionLabel

    const response = await this.request.post(
      `${API_BASE}/api/rag/datasets/${datasetId}/versions`,
      { multipart }
    )

    if (!response.ok()) {
      const body = await response.text()
      throw new Error(`createDatasetVersion failed (${response.status()}): ${body}`)
    }

    const json = await response.json()
    return json.data || json
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
