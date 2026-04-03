/**
 * @fileoverview Service for document category and version management within knowledge bases.
 * @module services/knowledge-base-category
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import AdmZip from 'adm-zip'
import { ModelFactory } from '@/shared/models/factory.js'
import { config } from '@/shared/config/index.js'
import { log } from '@/shared/services/logger.service.js'
import { DocumentCategory, DocumentCategoryVersion, DocumentCategoryVersionFile, UserContext } from '@/shared/models/types.js'
import { execFileNoThrow } from '@/shared/utils/execFileNoThrow.js'
import { ragDocumentService, ragStorageService, ragRedisService } from '@/modules/rag/index.js'
import { getUuid } from '@/shared/utils/uuid.js'

/** Code file extensions supported for import (matches advance-rag EXTENSION_MAP) */
const CODE_EXTENSIONS = new Set([
  '.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.go', '.rs',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.lua', '.scala', '.rb',
])

/**
 * @description Service handling document category CRUD, version management,
 *   and version file listing within knowledge bases
 */
export class KnowledgeBaseCategoryService {
  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  /**
   * @description List all document categories for a knowledge base
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<DocumentCategory[]>} Array of category records
   */
  async listCategories(knowledgeBaseId: string): Promise<DocumentCategory[]> {
    return ModelFactory.documentCategory.findByKnowledgeBaseId(knowledgeBaseId)
  }

  /**
   * @description Retrieve a single document category by its UUID
   * @param {string} categoryId - UUID of the category
   * @returns {Promise<DocumentCategory | undefined>} Category record or undefined if not found
   */
  async getCategoryById(categoryId: string): Promise<DocumentCategory | undefined> {
    return ModelFactory.documentCategory.findById(categoryId)
  }

  /**
   * @description Create a new document category within a knowledge base.
   *   For 'standard' and 'code' types, auto-creates a linked dataset.
   *   For 'documents' type, dataset creation is deferred to version creation.
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {any} data - Category creation data including name, description, sort_order, dataset_config, category_type
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<DocumentCategory>} Created category record (with dataset_id if standard/code)
   */
  async createCategory(knowledgeBaseId: string, data: any, user: UserContext): Promise<DocumentCategory> {
    // Default category_type to 'documents' for backward compatibility
    const categoryType = data.category_type || 'documents'

    const category = await ModelFactory.documentCategory.create({
      knowledge_base_id: knowledgeBaseId,
      name: data.name,
      description: data.description || null,
      // Default sort_order to 0 when not specified
      sort_order: data.sort_order ?? 0,
      category_type: categoryType,
      // Serialize dataset_config as JSON string for storage
      dataset_config: JSON.stringify(data.dataset_config || {}),
      created_by: user.id,
      updated_by: user.id,
    })

    // Auto-create a dataset for standard and code category types
    if (categoryType === 'standard' || categoryType === 'code') {
      try {
        // Look up the knowledge base to get default embedding model and parser settings
        const knowledgeBase = await ModelFactory.knowledgeBase.findById(knowledgeBaseId)
        if (!knowledgeBase) throw new Error('Knowledge base not found')

        // Code categories force parser_id='code'; standard uses knowledge base default or 'naive'
        const parserId = categoryType === 'code' ? 'code' : (knowledgeBase.default_chunk_method || 'naive')
        const tenantId = knowledgeBase.tenant_id || config.opensearch.systemTenantId

        // Generate a unique dataset name with timestamp suffix to avoid unique index violation
        // (datasets_name_active_unique partial index enforces LOWER(name) uniqueness among active datasets)
        const timestamp = Date.now().toString(36)
        const datasetName = `${knowledgeBase.name}_${data.name}_${timestamp}`

        // Use embedding model from category config if provided, else fall back to knowledge base default
        const embeddingModel = data.dataset_config?.embedding_model || knowledgeBase.default_embedding_model || null

        // Create a dataset named <knowledgebasename>_<categoryname>_<timestamp>
        const dataset = await ModelFactory.dataset.create({
          name: datasetName,
          description: `Auto-created dataset for knowledge base "${knowledgeBase.name}", category "${data.name}"`,
          language: data.dataset_config?.language || 'English',
          embedding_model: embeddingModel,
          parser_id: parserId,
          parser_config: JSON.stringify(data.dataset_config?.parser_config || {}),
          access_control: JSON.stringify({ public: !knowledgeBase.is_private }),
          status: 'active',
          tenant_id: tenantId,
          created_by: user.id,
          updated_by: user.id,
        })

        // Link the dataset to the knowledge base
        await ModelFactory.knowledgeBaseDataset.create({
          knowledge_base_id: knowledgeBaseId,
          dataset_id: dataset.id,
          auto_created: true,
        })

        // Store the dataset reference on the category
        await ModelFactory.documentCategory.update(category.id, { dataset_id: dataset.id })

        // Return updated category with dataset_id
        return { ...category, dataset_id: dataset.id }
      } catch (dsError) {
        // Dataset creation failed — delete the orphan category and re-throw
        // so the frontend knows the operation failed entirely
        log.error('Failed to auto-create dataset for category, rolling back category', {
          error: String(dsError), knowledgeBaseId, categoryName: data.name, categoryType,
        })
        try {
          await ModelFactory.documentCategory.delete(category.id)
        } catch (cleanupErr) {
          log.error('Failed to cleanup orphan category', { error: String(cleanupErr), categoryId: category.id })
        }
        throw new Error(`Failed to create code category: ${String(dsError)}`)
      }
    }

    return category
  }

  /**
   * @description Update a document category with partial data
   * @param {string} categoryId - UUID of the category
   * @param {any} data - Partial update data
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<DocumentCategory | undefined>} Updated category or undefined if not found
   */
  async updateCategory(categoryId: string, data: any, user: UserContext): Promise<DocumentCategory | undefined> {
    // Build update payload including only provided fields
    const updateData: any = { updated_by: user.id }
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.sort_order !== undefined) updateData.sort_order = data.sort_order
    // Serialize dataset_config as JSON string if provided
    if (data.dataset_config !== undefined) updateData.dataset_config = JSON.stringify(data.dataset_config)

    return ModelFactory.documentCategory.update(categoryId, updateData)
  }

  /**
   * @description Delete a document category by ID. For standard/code categories with a linked
   *   dataset, soft-deletes the dataset first. Cascades to versions and files via DB constraints.
   * @param {string} categoryId - UUID of the category
   * @returns {Promise<void>}
   */
  async deleteCategory(categoryId: string): Promise<void> {
    // Look up the category to check for linked dataset before deletion
    const category = await ModelFactory.documentCategory.findById(categoryId)

    // Soft-delete linked dataset if this is a standard/code category with a dataset_id
    if (category?.dataset_id) {
      try {
        await ModelFactory.dataset.update(category.dataset_id, { status: 'inactive' })
      } catch (err) {
        // Non-blocking: proceed with category deletion even if dataset cleanup fails
        log.warn('Failed to soft-delete linked dataset for category', {
          error: String(err), categoryId, datasetId: category.dataset_id,
        })
      }
    }

    await ModelFactory.documentCategory.delete(categoryId)
  }

  // -------------------------------------------------------------------------
  // Versions
  // -------------------------------------------------------------------------

  /**
   * @description List all versions for a document category
   * @param {string} categoryId - UUID of the category
   * @returns {Promise<DocumentCategoryVersion[]>} Array of version records
   */
  async listVersions(categoryId: string): Promise<DocumentCategoryVersion[]> {
    return ModelFactory.documentCategoryVersion.findByCategoryId(categoryId)
  }

  /**
   * @description Retrieve a single category version by its UUID
   * @param {string} versionId - UUID of the version
   * @returns {Promise<DocumentCategoryVersion | undefined>} Version record or undefined if not found
   */
  async getVersionById(versionId: string): Promise<DocumentCategoryVersion | undefined> {
    return ModelFactory.documentCategoryVersion.findById(versionId)
  }

  /**
   * @description Create a new version snapshot for a document category.
   *   Auto-creates a dataset named `<knowledgebasename>_<version_label>` and links it to the knowledge base.
   * @param {string} categoryId - UUID of the category
   * @param {any} data - Version creation data including version_label, optional metadata, optional knowledge_base_id
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<DocumentCategoryVersion>} Created version record with linked dataset
   * @throws {Error} If the parent category or knowledge base is not found
   */
  async createVersion(categoryId: string, data: any, user: UserContext): Promise<DocumentCategoryVersion> {
    // Look up the parent category to resolve the knowledge_base_id
    const category = await ModelFactory.documentCategory.findById(categoryId)
    if (!category) throw new Error('Category not found')

    // Use provided knowledge_base_id or resolve from the category
    const knowledgeBaseId = data.knowledge_base_id || category.knowledge_base_id

    // Look up the knowledge base to build the dataset name
    const knowledgeBase = await ModelFactory.knowledgeBase.findById(knowledgeBaseId)
    if (!knowledgeBase) throw new Error('Knowledge base not found')

    // Build dataset name as <knowledgebasename>_<version_label>
    const datasetName = `${knowledgeBase.name}_${data.version_label}`

    // Auto-create a dataset for this version
    let datasetId: string | null = null
    try {
      // Use version-level overrides if provided, otherwise fall back to knowledge base defaults
      const language = data.language || 'English'
      const parserId = data.chunk_method || knowledgeBase.default_chunk_method || 'naive'
      const parserConfig = data.parser_config ? JSON.stringify(data.parser_config) : JSON.stringify({})
      const tenantId = knowledgeBase.tenant_id || config.opensearch.systemTenantId

      const dataset = await ModelFactory.dataset.create({
        name: datasetName,
        description: `Auto-created dataset for knowledge base "${knowledgeBase.name}", version "${data.version_label}"`,
        language,
        embedding_model: knowledgeBase.default_embedding_model || null,
        parser_id: parserId,
        parser_config: parserConfig,
        pagerank: data.pagerank ?? 0,
        pipeline_id: data.pipeline_id || null,
        access_control: JSON.stringify({ public: !knowledgeBase.is_private }),
        status: 'active',
        tenant_id: tenantId,
        created_by: user.id,
        updated_by: user.id,
      })
      datasetId = dataset.id

      // Link the dataset to the knowledge base
      await ModelFactory.knowledgeBaseDataset.create({
        knowledge_base_id: knowledgeBaseId,
        dataset_id: dataset.id,
        auto_created: true,
      })
    } catch (dsError) {
      // Non-blocking: version is still created even if dataset creation fails
      log.error('Failed to auto-create dataset for version', {
        error: String(dsError), categoryId, versionLabel: data.version_label,
      })
    }

    // Create the version record with the linked dataset ID
    return ModelFactory.documentCategoryVersion.create({
      category_id: categoryId,
      version_label: data.version_label,
      ragflow_dataset_id: datasetId,
      ragflow_dataset_name: datasetId ? datasetName : null,
      status: 'active',
      // Serialize metadata as JSON string for storage
      metadata: JSON.stringify(data.metadata || {}),
      created_by: user.id,
      updated_by: user.id,
    })
  }

  /**
   * @description Update a category version with partial data
   * @param {string} versionId - UUID of the version
   * @param {any} data - Partial update data
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<DocumentCategoryVersion | undefined>} Updated version or undefined if not found
   */
  async updateVersion(versionId: string, data: any, user: UserContext): Promise<DocumentCategoryVersion | undefined> {
    // Build update payload including only provided fields
    const updateData: any = { updated_by: user.id }
    if (data.version_label !== undefined) updateData.version_label = data.version_label
    if (data.status !== undefined) updateData.status = data.status
    if (data.ragflow_dataset_id !== undefined) updateData.ragflow_dataset_id = data.ragflow_dataset_id
    if (data.ragflow_dataset_name !== undefined) updateData.ragflow_dataset_name = data.ragflow_dataset_name
    // Serialize metadata as JSON string if provided
    if (data.metadata !== undefined) updateData.metadata = JSON.stringify(data.metadata)

    return ModelFactory.documentCategoryVersion.update(versionId, updateData)
  }

  /**
   * @description Delete a category version by ID, cascading to version files via DB constraints
   * @param {string} versionId - UUID of the version
   * @returns {Promise<void>}
   */
  async deleteVersion(versionId: string): Promise<void> {
    await ModelFactory.documentCategoryVersion.delete(versionId)
  }

  // -------------------------------------------------------------------------
  // Version Files
  // -------------------------------------------------------------------------

  /**
   * @description List all files attached to a specific category version
   * @param {string} versionId - UUID of the version
   * @returns {Promise<DocumentCategoryVersionFile[]>} Array of file records
   */
  async listVersionFiles(versionId: string): Promise<DocumentCategoryVersionFile[]> {
    return ModelFactory.documentCategoryVersionFile.findByVersionId(versionId)
  }

  /**
   * @description Retrieve a dataset by its UUID. Used by controllers that need to verify
   *   a version's linked dataset exists before uploading documents.
   * @param {string} datasetId - UUID of the dataset
   * @returns {Promise<any | undefined>} Dataset record or undefined if not found
   */
  async getDatasetById(datasetId: string): Promise<any | undefined> {
    return ModelFactory.dataset.findById(datasetId)
  }

  /**
   * @description Create a version file record to track a document uploaded to a category version.
   *   Links the RAG document ID to the version for knowledge-base-level bookkeeping.
   * @param {object} data - Version file creation data
   * @param {string} data.version_id - UUID of the category version
   * @param {string} data.file_name - Original file name
   * @param {string} data.ragflow_doc_id - UUID of the RAG document record
   * @param {string} data.status - Initial status (e.g. 'imported', 'parsing', 'converting')
   * @returns {Promise<DocumentCategoryVersionFile>} Created version file record
   */
  async createVersionFile(data: {
    version_id: string
    file_name: string
    ragflow_doc_id: string
    status: string
  }): Promise<DocumentCategoryVersionFile> {
    return ModelFactory.documentCategoryVersionFile.create(data)
  }

  /**
   * @description Update the status of a version file identified by version ID and RAG document ID.
   *   Used to transition files through processing states (imported -> parsing -> ready, etc.)
   * @param {string} versionId - UUID of the category version
   * @param {string} ragflowDocId - UUID of the RAG document
   * @param {string} status - New status value (e.g. 'parsing', 'converting', 'ready', 'error')
   * @returns {Promise<void>}
   */
  async updateVersionFileStatus(versionId: string, ragflowDocId: string, status: string): Promise<void> {
    return ModelFactory.documentCategoryVersionFile.updateStatusByVersionAndDocId(versionId, ragflowDocId, status)
  }

  // -------------------------------------------------------------------------
  // Code Import
  // -------------------------------------------------------------------------

  /**
   * @description Import code files from a Git repository into a code category's dataset.
   *   Clones the repo (shallow, single branch), filters by code extensions, creates document
   *   entries, and triggers the RAG parse pipeline. Requires `git` CLI on the host.
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {string} categoryId - UUID of the code category
   * @param {string} tenantId - Tenant ID for dataset scoping
   * @param {object} params - Git import parameters
   * @param {string} params.url - Git repository URL
   * @param {string} [params.branch] - Branch to clone (default 'main')
   * @param {string} [params.path] - Subdirectory to import from (default '/')
   * @returns {Promise<{ taskId: string; fileCount: number }>} Import task info
   * @throws {Error} If category not found, not type='code', or git clone fails
   */
  /**
   * @description Build an authenticated git clone URL by embedding credentials into the HTTPS URL.
   *   Supports token-only auth (GitHub PAT, GitLab PAT) and username+password auth (Bitbucket, custom).
   *   Credentials are URL-encoded to handle special characters safely.
   * @param {string} url - Original repository HTTPS URL
   * @param {{ auth_method: string; token?: string; username?: string }} credentials - Auth config
   * @returns {string} URL with embedded credentials, or original URL if auth_method is 'none'
   */
  private buildAuthenticatedUrl(
    url: string,
    credentials?: { auth_method: string; token?: string; username?: string },
  ): string {
    // No credentials or public auth — return URL as-is
    if (!credentials || credentials.auth_method === 'none') return url

    try {
      const parsed = new URL(url)

      if (credentials.auth_method === 'token' && credentials.token) {
        // Token-only: use token as password with 'oauth2' or 'x-token-auth' as username
        // GitHub/GitLab accept any non-empty username with PAT as password
        parsed.username = 'oauth2'
        parsed.password = encodeURIComponent(credentials.token)
      } else if (credentials.auth_method === 'username_password' && credentials.token) {
        // Username + password/token: embed both
        parsed.username = encodeURIComponent(credentials.username || 'git')
        parsed.password = encodeURIComponent(credentials.token)
      }

      return parsed.toString()
    } catch {
      // URL parsing failed — return original, let git clone handle the error
      return url
    }
  }

  async importGitRepo(
    knowledgeBaseId: string,
    categoryId: string,
    tenantId: string,
    params: { url: string; branch?: string; path?: string; credentials?: { auth_method: string; token?: string; username?: string } },
  ): Promise<{ taskId: string; fileCount: number }> {
    // Verify category exists, is type='code', and has a dataset
    const category = await ModelFactory.documentCategory.findById(categoryId)
    if (!category) throw new Error('Category not found')
    if (category.category_type !== 'code') throw new Error('Category must be type "code"')
    if (!category.dataset_id) throw new Error('Category has no linked dataset')

    const datasetId = category.dataset_id
    const branch = params.branch || 'main'
    const subPath = params.path || '/'

    // Build clone URL with embedded credentials for private repos
    const cloneUrl = this.buildAuthenticatedUrl(params.url, params.credentials)

    // Create temp directory for git clone
    const tempDir = path.join(os.tmpdir(), `git-import-${getUuid()}`)
    fs.mkdirSync(tempDir, { recursive: true })

    try {
      // Shallow clone the repository using execFileNoThrow for shell-injection safety
      const cloneResult = await execFileNoThrow('git', [
        'clone', '--depth', '1', '--branch', branch, cloneUrl, tempDir,
      ], { timeout: 120_000 })

      if (cloneResult.code !== 0) {
        throw new Error(`Git clone failed: ${cloneResult.stderr}`)
      }

      // Determine the root directory to scan
      const scanRoot = subPath === '/'
        ? tempDir
        : path.join(tempDir, subPath.replace(/^\//, ''))

      // Collect code files matching supported extensions
      const codeFiles = this.collectCodeFiles(scanRoot)

      // Import each code file into the dataset
      const taskId = getUuid()
      const dataset = await ModelFactory.dataset.findById(datasetId)
      for (const filePath of codeFiles) {
        await this.importSingleFile(datasetId, filePath, dataset)
      }

      // Update document count and trigger parsing for all imported files
      if (codeFiles.length > 0) {
        await ragDocumentService.incrementDocCount(datasetId, codeFiles.length)
      }

      return { taskId, fileCount: codeFiles.length }
    } finally {
      // Clean up temp directory regardless of success or failure
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }

  /**
   * @description Import code files from a ZIP archive into a code category's dataset.
   *   Extracts the archive, filters by code extensions, creates document entries,
   *   and triggers the RAG parse pipeline.
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {string} categoryId - UUID of the code category
   * @param {string} tenantId - Tenant ID for dataset scoping
   * @param {Buffer} fileBuffer - ZIP file contents as a Buffer
   * @param {string} fileName - Original file name of the uploaded ZIP
   * @returns {Promise<{ taskId: string; fileCount: number }>} Import task info
   * @throws {Error} If category not found, not type='code', or extraction fails
   */
  async importZipFile(
    knowledgeBaseId: string,
    categoryId: string,
    tenantId: string,
    fileBuffer: Buffer,
    fileName: string,
  ): Promise<{ taskId: string; fileCount: number }> {
    // Verify category exists, is type='code', and has a dataset
    const category = await ModelFactory.documentCategory.findById(categoryId)
    if (!category) throw new Error('Category not found')
    if (category.category_type !== 'code') throw new Error('Category must be type "code"')
    if (!category.dataset_id) throw new Error('Category has no linked dataset')

    const datasetId = category.dataset_id

    // Create temp directory for ZIP extraction
    const tempDir = path.join(os.tmpdir(), `zip-import-${getUuid()}`)
    fs.mkdirSync(tempDir, { recursive: true })

    try {
      // Extract ZIP using adm-zip
      const zip = new AdmZip(fileBuffer)
      zip.extractAllTo(tempDir, true)

      // Collect code files matching supported extensions
      const codeFiles = this.collectCodeFiles(tempDir)

      // Import each code file into the dataset
      const taskId = getUuid()
      const dataset = await ModelFactory.dataset.findById(datasetId)
      for (const filePath of codeFiles) {
        await this.importSingleFile(datasetId, filePath, dataset)
      }

      // Update document count
      if (codeFiles.length > 0) {
        await ragDocumentService.incrementDocCount(datasetId, codeFiles.length)
      }

      return { taskId, fileCount: codeFiles.length }
    } finally {
      // Clean up temp directory regardless of success or failure
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }

  /**
   * @description Recursively collect all code files from a directory tree,
   *   filtering by the supported CODE_EXTENSIONS set.
   * @param {string} dir - Root directory to scan
   * @returns {string[]} Array of absolute file paths for code files
   */
  private collectCodeFiles(dir: string): string[] {
    const results: string[] = []

    // Guard: skip if directory does not exist
    if (!fs.existsSync(dir)) return results

    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        // Skip hidden directories (e.g. .git, .idea)
        if (entry.name.startsWith('.')) continue
        results.push(...this.collectCodeFiles(fullPath))
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        // Only include files with recognized code extensions
        if (CODE_EXTENSIONS.has(ext)) {
          results.push(fullPath)
        }
      }
    }

    return results
  }

  /**
   * @description Import a single code file into a dataset: upload to S3, create
   *   File + Document records, link them, and queue for parsing.
   * @param {string} datasetId - Target dataset UUID
   * @param {string} filePath - Absolute path to the file on disk
   * @param {any} dataset - Dataset record for parser settings
   * @returns {Promise<void>}
   */
  private async importSingleFile(datasetId: string, filePath: string, dataset: any): Promise<void> {
    const fileId = getUuid()
    const docId = getUuid()
    const filename = path.basename(filePath)
    const suffix = path.extname(filename).toLowerCase().replace('.', '')
    const fileType = ragStorageService.getFileType(suffix)
    const fileBuffer = fs.readFileSync(filePath)

    // Upload file to S3/MinIO storage
    const storagePath = ragStorageService.buildStoragePath(datasetId, fileId, filename)
    await ragStorageService.putFile(storagePath, fileBuffer)

    // Create File record in PostgreSQL
    await ragDocumentService.createFile({
      id: fileId,
      name: filename,
      location: storagePath,
      size: fileBuffer.length,
      type: fileType,
    })

    // Parse dataset parser config from string if needed
    const parserConfig = typeof dataset?.parser_config === 'string'
      ? JSON.parse(dataset.parser_config)
      : dataset?.parser_config

    // Create Document record using parser settings from the dataset
    await ragDocumentService.createDocument({
      id: docId,
      kb_id: datasetId,
      parser_id: dataset?.parser_id || 'code',
      parser_config: parserConfig || { pages: [[1, 1000000]] },
      name: filename,
      location: storagePath,
      size: fileBuffer.length,
      suffix,
      type: fileType,
    })

    // Link file to document
    await ragDocumentService.createFile2Document(fileId, docId)

    // Queue the document for parsing
    try {
      await ragDocumentService.beginParse(docId)
      await ragRedisService.queueParseInit(docId)
    } catch (err) {
      // Non-blocking: file is imported even if parse queueing fails
      log.warn('Failed to queue parse for imported file', {
        error: String(err), docId, filename,
      })
    }
  }
}

/** Singleton instance */
export const knowledgeBaseCategoryService = new KnowledgeBaseCategoryService()
