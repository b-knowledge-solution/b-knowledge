/**
 * @fileoverview Service for document category and version management within projects.
 * @module services/project-category
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
 *   and version file listing within projects
 */
export class ProjectCategoryService {
  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  /**
   * @description List all document categories for a project
   * @param {string} projectId - UUID of the project
   * @returns {Promise<DocumentCategory[]>} Array of category records
   */
  async listCategories(projectId: string): Promise<DocumentCategory[]> {
    return ModelFactory.documentCategory.findByProjectId(projectId)
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
   * @description Create a new document category within a project.
   *   For 'standard' and 'code' types, auto-creates a linked dataset.
   *   For 'documents' type, dataset creation is deferred to version creation.
   * @param {string} projectId - UUID of the project
   * @param {any} data - Category creation data including name, description, sort_order, dataset_config, category_type
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<DocumentCategory>} Created category record (with dataset_id if standard/code)
   */
  async createCategory(projectId: string, data: any, user: UserContext): Promise<DocumentCategory> {
    // Default category_type to 'documents' for backward compatibility
    const categoryType = data.category_type || 'documents'

    const category = await ModelFactory.documentCategory.create({
      project_id: projectId,
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
        // Look up the project to get default embedding model and parser settings
        const project = await ModelFactory.project.findById(projectId)
        if (!project) throw new Error('Project not found')

        // Code categories force parser_id='code'; standard uses project default or 'naive'
        const parserId = categoryType === 'code' ? 'code' : (project.default_chunk_method || 'naive')
        const tenantId = project.tenant_id || config.opensearch.systemTenantId

        // Create a dataset named <projectname>_<categoryname>
        const dataset = await ModelFactory.dataset.create({
          name: `${project.name}_${data.name}`,
          description: `Auto-created dataset for project "${project.name}", category "${data.name}"`,
          language: 'English',
          embedding_model: project.default_embedding_model || null,
          parser_id: parserId,
          parser_config: JSON.stringify(data.dataset_config?.parser_config || {}),
          access_control: JSON.stringify({ public: !project.is_private }),
          status: 'active',
          tenant_id: tenantId,
          created_by: user.id,
          updated_by: user.id,
        })

        // Link the dataset to the project
        await ModelFactory.projectDataset.create({
          project_id: projectId,
          dataset_id: dataset.id,
          auto_created: true,
        })

        // Store the dataset reference on the category
        await ModelFactory.documentCategory.update(category.id, { dataset_id: dataset.id })

        // Return updated category with dataset_id
        return { ...category, dataset_id: dataset.id }
      } catch (dsError) {
        // Non-blocking: category is still created even if dataset creation fails
        log.warn('Failed to auto-create dataset for category', {
          error: String(dsError), projectId, categoryName: data.name, categoryType,
        })
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
   *   Auto-creates a dataset named `<projectname>_<version_label>` and links it to the project.
   * @param {string} categoryId - UUID of the category
   * @param {any} data - Version creation data including version_label, optional metadata, optional project_id
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<DocumentCategoryVersion>} Created version record with linked dataset
   * @throws {Error} If the parent category or project is not found
   */
  async createVersion(categoryId: string, data: any, user: UserContext): Promise<DocumentCategoryVersion> {
    // Look up the parent category to resolve the project_id
    const category = await ModelFactory.documentCategory.findById(categoryId)
    if (!category) throw new Error('Category not found')

    // Use provided project_id or resolve from the category
    const projectId = data.project_id || category.project_id

    // Look up the project to build the dataset name
    const project = await ModelFactory.project.findById(projectId)
    if (!project) throw new Error('Project not found')

    // Build dataset name as <projectname>_<version_label>
    const datasetName = `${project.name}_${data.version_label}`

    // Auto-create a dataset for this version
    let datasetId: string | null = null
    try {
      // Use version-level overrides if provided, otherwise fall back to project defaults
      const language = data.language || 'English'
      const parserId = data.chunk_method || project.default_chunk_method || 'naive'
      const parserConfig = data.parser_config ? JSON.stringify(data.parser_config) : JSON.stringify({})
      const tenantId = project.tenant_id || config.opensearch.systemTenantId

      const dataset = await ModelFactory.dataset.create({
        name: datasetName,
        description: `Auto-created dataset for project "${project.name}", version "${data.version_label}"`,
        language,
        embedding_model: project.default_embedding_model || null,
        parser_id: parserId,
        parser_config: parserConfig,
        pagerank: data.pagerank ?? 0,
        pipeline_id: data.pipeline_id || null,
        access_control: JSON.stringify({ public: !project.is_private }),
        status: 'active',
        tenant_id: tenantId,
        created_by: user.id,
        updated_by: user.id,
      })
      datasetId = dataset.id

      // Link the dataset to the project
      await ModelFactory.projectDataset.create({
        project_id: projectId,
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

  // -------------------------------------------------------------------------
  // Code Import
  // -------------------------------------------------------------------------

  /**
   * @description Import code files from a Git repository into a code category's dataset.
   *   Clones the repo (shallow, single branch), filters by code extensions, creates document
   *   entries, and triggers the RAG parse pipeline. Requires `git` CLI on the host.
   * @param {string} projectId - UUID of the project
   * @param {string} categoryId - UUID of the code category
   * @param {string} tenantId - Tenant ID for dataset scoping
   * @param {object} params - Git import parameters
   * @param {string} params.url - Git repository URL
   * @param {string} [params.branch] - Branch to clone (default 'main')
   * @param {string} [params.path] - Subdirectory to import from (default '/')
   * @returns {Promise<{ taskId: string; fileCount: number }>} Import task info
   * @throws {Error} If category not found, not type='code', or git clone fails
   */
  async importGitRepo(
    projectId: string,
    categoryId: string,
    tenantId: string,
    params: { url: string; branch?: string; path?: string },
  ): Promise<{ taskId: string; fileCount: number }> {
    // Verify category exists, is type='code', and has a dataset
    const category = await ModelFactory.documentCategory.findById(categoryId)
    if (!category) throw new Error('Category not found')
    if (category.category_type !== 'code') throw new Error('Category must be type "code"')
    if (!category.dataset_id) throw new Error('Category has no linked dataset')

    const datasetId = category.dataset_id
    const branch = params.branch || 'main'
    const subPath = params.path || '/'

    // Create temp directory for git clone
    const tempDir = path.join(os.tmpdir(), `git-import-${getUuid()}`)
    fs.mkdirSync(tempDir, { recursive: true })

    try {
      // Shallow clone the repository using execFileNoThrow for shell-injection safety
      const cloneResult = await execFileNoThrow('git', [
        'clone', '--depth', '1', '--branch', branch, params.url, tempDir,
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
   * @param {string} projectId - UUID of the project
   * @param {string} categoryId - UUID of the code category
   * @param {string} tenantId - Tenant ID for dataset scoping
   * @param {Buffer} fileBuffer - ZIP file contents as a Buffer
   * @param {string} fileName - Original file name of the uploaded ZIP
   * @returns {Promise<{ taskId: string; fileCount: number }>} Import task info
   * @throws {Error} If category not found, not type='code', or extraction fails
   */
  async importZipFile(
    projectId: string,
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
export const projectCategoryService = new ProjectCategoryService()
