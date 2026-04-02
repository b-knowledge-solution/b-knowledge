/**
 * @fileoverview Controller for all project-related HTTP request handlers.
 * @module controllers/projects
 */
import { Request, Response } from 'express'
import path from 'path'
import { projectsService } from '../services/projects.service.js'
import { projectCategoryService } from '../services/project-category.service.js'
import { projectChatService } from '../services/project-chat.service.js'
import { projectSearchService } from '../services/project-search.service.js'
import { projectSyncService } from '../services/project-sync.service.js'
import { ragDocumentService, ragStorageService, ragRedisService, ragSearchService, converterQueueService } from '@/modules/rag/index.js'
import { RagDocumentService } from '@/modules/rag/services/rag-document.service.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { getClientIp } from '@/shared/utils/ip.js'
import { getTenantId } from '@/shared/middleware/tenant.middleware.js'
import { getUuid } from '@/shared/utils/uuid.js'

/**
 * @description Build a UserContext object from the Express request's authenticated user
 * @param {Request} req - Express request with optional user property
 * @returns {object | undefined} UserContext object or undefined if not authenticated
 */
function getUserContext(req: Request) {
  // Guard: reject unauthenticated requests
  if (!req.user) return undefined
  return { id: req.user.id, email: req.user.email, role: req.user.role, ip: getClientIp(req) }
}

/**
 * @description Controller handling all project-related HTTP endpoints including CRUD,
 *   permissions, datasets, categories, versions, chats, searches, sync configs,
 *   and entity-level permissions
 */
export class ProjectsController {
  // -------------------------------------------------------------------------
  // Projects CRUD
  // -------------------------------------------------------------------------

  /**
   * @description GET /projects - List accessible projects for the current user
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listProjects(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication before listing projects
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      // Extract tenant ID from request context for multi-tenant isolation
      const tenantId = getTenantId(req) || ''
      const projects = await projectsService.getAccessibleProjects(user, tenantId)
      res.json(projects)
    } catch (error) {
      log.error('Failed to list projects', { error: String(error) })
      res.status(500).json({ error: 'Failed to list projects' })
    }
  }

  /**
   * @description GET /projects/:id - Retrieve a single project by its UUID
   * @param {Request} req - Express request with project ID param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async getProject(req: Request, res: Response): Promise<void> {
    try {
      const project = await projectsService.getProjectById(req.params['id']!)
      // Guard: return 404 if project does not exist
      if (!project) { res.status(404).json({ error: 'Project not found' }); return }
      res.json(project)
    } catch (error) {
      log.error('Failed to get project', { error: String(error) })
      res.status(500).json({ error: 'Failed to get project' })
    }
  }

  /**
   * @description POST /projects - Create a new project with an auto-created linked dataset
   * @param {Request} req - Express request with project body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createProject(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for project creation
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const tenantId = getTenantId(req) || ''
      const project = await projectsService.createProject(req.body, user, tenantId)
      res.status(201).json(project)
    } catch (error: any) {
      log.error('Failed to create project', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create project' })
    }
  }

  /**
   * @description PUT /projects/:id - Update an existing project by UUID
   * @param {Request} req - Express request with project ID and update body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async updateProject(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for project updates
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const project = await projectsService.updateProject(req.params['id']!, req.body, user)
      // Guard: return 404 if project not found
      if (!project) { res.status(404).json({ error: 'Project not found' }); return }
      res.json(project)
    } catch (error: any) {
      log.error('Failed to update project', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update project' })
    }
  }

  /**
   * @description DELETE /projects/:id - Delete a project and cascade-delete auto-created datasets
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
   */
  async deleteProject(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for project deletion
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      await projectsService.deleteProject(req.params['id']!, user)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to delete project', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete project' })
    }
  }

  // -------------------------------------------------------------------------
  // Permissions
  // -------------------------------------------------------------------------

  /**
   * @description GET /projects/:id/permissions - List all permission entries for a project
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listPermissions(req: Request, res: Response): Promise<void> {
    try {
      const perms = await projectsService.getPermissions(req.params['id']!)
      res.json(perms)
    } catch (error) {
      log.error('Failed to list permissions', { error: String(error) })
      res.status(500).json({ error: 'Failed to list permissions' })
    }
  }

  /**
   * @description POST /projects/:id/permissions - Create or update a permission entry for a project
   * @param {Request} req - Express request with permission body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async setPermission(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for permission changes
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const perm = await projectsService.setPermission(req.params['id']!, req.body, user)
      res.status(201).json(perm)
    } catch (error: any) {
      log.error('Failed to set permission', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to set permission' })
    }
  }

  /**
   * @description DELETE /projects/:id/permissions/:permId - Remove a permission entry
   * @param {Request} req - Express request with permission ID
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
   */
  async deletePermission(req: Request, res: Response): Promise<void> {
    try {
      await projectsService.deletePermission(req.params['permId']!)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to delete permission', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete permission' })
    }
  }

  // -------------------------------------------------------------------------
  // Project Datasets
  // -------------------------------------------------------------------------

  /**
   * @description GET /projects/:id/datasets - List all datasets linked to a project
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listDatasets(req: Request, res: Response): Promise<void> {
    try {
      const datasets = await projectsService.getProjectDatasets(req.params['id']!)
      res.json(datasets)
    } catch (error) {
      log.error('Failed to list project datasets', { error: String(error) })
      res.status(500).json({ error: 'Failed to list datasets' })
    }
  }

  /**
   * @description POST /projects/:id/datasets - Link an existing dataset or create a new one for a project
   * @param {Request} req - Express request with link/create body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async linkDataset(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for dataset linking
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const link = await projectsService.linkDataset(req.params['id']!, req.body, user)
      res.status(201).json(link)
    } catch (error: any) {
      log.error('Failed to link dataset', { error: String(error) })
      // Return 409 for duplicate dataset links, 500 for other errors
      const status = error.message?.includes('duplicate') ? 409 : 500
      res.status(status).json({ error: error.message || 'Failed to link dataset' })
    }
  }

  /**
   * @description DELETE /projects/:id/datasets/:datasetId - Remove a dataset link from a project
   * @param {Request} req - Express request with project and dataset IDs
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
   */
  async unlinkDataset(req: Request, res: Response): Promise<void> {
    try {
      await projectsService.unlinkDataset(req.params['id']!, req.params['datasetId']!)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to unlink dataset', { error: String(error) })
      res.status(500).json({ error: 'Failed to unlink dataset' })
    }
  }

  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  /**
   * @description GET /projects/:id/categories - List all document categories for a project
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listCategories(req: Request, res: Response): Promise<void> {
    try {
      const categories = await projectCategoryService.listCategories(req.params['id']!)
      res.json(categories)
    } catch (error) {
      log.error('Failed to list categories', { error: String(error) })
      res.status(500).json({ error: 'Failed to list categories' })
    }
  }

  /**
   * @description GET /projects/:id/categories/:catId - Retrieve a single category by UUID
   * @param {Request} req - Express request with category ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async getCategory(req: Request, res: Response): Promise<void> {
    try {
      const category = await projectCategoryService.getCategoryById(req.params['catId']!)
      // Guard: return 404 if category does not exist
      if (!category) { res.status(404).json({ error: 'Category not found' }); return }
      res.json(category)
    } catch (error) {
      log.error('Failed to get category', { error: String(error) })
      res.status(500).json({ error: 'Failed to get category' })
    }
  }

  /**
   * @description POST /projects/:id/categories - Create a new document category in a project
   * @param {Request} req - Express request with category body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createCategory(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for category creation
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const category = await projectCategoryService.createCategory(req.params['id']!, req.body, user)
      res.status(201).json(category)
    } catch (error: any) {
      log.error('Failed to create category', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create category' })
    }
  }

  /**
   * @description PUT /projects/:id/categories/:catId - Update an existing document category
   * @param {Request} req - Express request with category ID and update body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async updateCategory(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for category updates
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const category = await projectCategoryService.updateCategory(req.params['catId']!, req.body, user)
      // Guard: return 404 if category not found
      if (!category) { res.status(404).json({ error: 'Category not found' }); return }
      res.json(category)
    } catch (error: any) {
      log.error('Failed to update category', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update category' })
    }
  }

  /**
   * @description DELETE /projects/:id/categories/:catId - Delete a document category and cascade to versions/files
   * @param {Request} req - Express request with category ID
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
   */
  async deleteCategory(req: Request, res: Response): Promise<void> {
    try {
      await projectCategoryService.deleteCategory(req.params['catId']!)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to delete category', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete category' })
    }
  }

  // -------------------------------------------------------------------------
  // Category Versions
  // -------------------------------------------------------------------------

  /**
   * @description GET /projects/:id/categories/:catId/versions - List all versions for a document category
   * @param {Request} req - Express request with category ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listVersions(req: Request, res: Response): Promise<void> {
    try {
      const versions = await projectCategoryService.listVersions(req.params['catId']!)
      res.json(versions)
    } catch (error) {
      log.error('Failed to list versions', { error: String(error) })
      res.status(500).json({ error: 'Failed to list versions' })
    }
  }

  /**
   * @description POST /projects/:id/categories/:catId/versions - Create a new category version
   * @param {Request} req - Express request with version body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createVersion(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for version creation
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const version = await projectCategoryService.createVersion(req.params['catId']!, req.body, user)
      res.status(201).json(version)
    } catch (error: any) {
      log.error('Failed to create version', { error: String(error) })
      // Return 409 for duplicate version labels, 500 for other errors
      const status = error.message?.includes('already exists') ? 409 : 500
      res.status(status).json({ error: error.message || 'Failed to create version' })
    }
  }

  /**
   * @description PUT /projects/:id/categories/:catId/versions/:verId - Update a category version
   * @param {Request} req - Express request with version ID and update body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async updateVersion(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for version updates
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const version = await projectCategoryService.updateVersion(req.params['verId']!, req.body, user)
      // Guard: return 404 if version not found
      if (!version) { res.status(404).json({ error: 'Version not found' }); return }
      res.json(version)
    } catch (error: any) {
      log.error('Failed to update version', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update version' })
    }
  }

  /**
   * @description DELETE /projects/:id/categories/:catId/versions/:verId - Delete a category version and its files
   * @param {Request} req - Express request with version ID
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
   */
  async deleteVersion(req: Request, res: Response): Promise<void> {
    try {
      await projectCategoryService.deleteVersion(req.params['verId']!)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to delete version', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete version' })
    }
  }

  /**
   * @description GET /projects/:id/categories/:catId/versions/:verId/documents - List files attached to a category version
   * @param {Request} req - Express request with version ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listVersionDocuments(req: Request, res: Response): Promise<void> {
    try {
      const versionId = req.params['verId']!

      // Look up the version to get its linked RAG dataset
      const version = await projectCategoryService.getVersionById(versionId)
      if (!version?.ragflow_dataset_id) {
        // Fall back to local version files if no dataset is linked
        const files = await projectCategoryService.listVersionFiles(versionId)
        res.json(files)
        return
      }

      // Query RAG documents from the linked dataset for full document metadata
      const docs = await ragDocumentService.listDocuments(version.ragflow_dataset_id)
      res.json(docs)
    } catch (error) {
      log.error('Failed to list version documents', { error: String(error) })
      res.status(500).json({ error: 'Failed to list version documents' })
    }
  }

  /**
   * @description POST /projects/:id/categories/:catId/versions/:verId/documents - Upload documents to a version's linked RAG dataset.
   *   Resolves the version's ragflow_dataset_id, stores files in MinIO, and creates File/Document/File2Document records.
   * @param {Request} req - Express request with multer files
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async uploadVersionDocuments(req: Request, res: Response): Promise<void> {
    try {
      const versionId = req.params['verId']!

      // Resolve the version's linked RAG dataset
      const version = await projectCategoryService.getVersionById(versionId)
      if (!version) { res.status(404).json({ error: 'Version not found' }); return }
      if (!version.ragflow_dataset_id) { res.status(400).json({ error: 'Version has no linked dataset' }); return }

      const datasetId = version.ragflow_dataset_id

      // Verify the dataset exists
      const dataset = await ModelFactory.dataset.findById(datasetId)
      if (!dataset) { res.status(404).json({ error: 'Linked dataset not found' }); return }

      const files = req.files as Express.Multer.File[] | undefined
      if (!files || files.length === 0) { res.status(400).json({ error: 'No files provided' }); return }

      // Allow per-upload parser override via form field; fall back to dataset default
      const uploadParserId = req.body?.parser_id || dataset.parser_id || 'naive'

      const results: { id: string; name: string; size: number; type: string; suffix: string; status: string; run: string }[] = []
      for (const file of files) {
        const fileId = getUuid()
        const docId = getUuid()
        const filename = file.originalname || 'unknown'
        const suffix = path.extname(filename).toLowerCase().replace('.', '')
        const fileType = ragStorageService.getFileType(suffix)

        // Store file in MinIO under the version's dataset storage path
        const storagePath = ragStorageService.buildStoragePath(datasetId, fileId, filename)
        await ragStorageService.putFile(storagePath, file.buffer)

        // Create File record in PostgreSQL
        await ragDocumentService.createFile({
          id: fileId,
          name: filename,
          location: storagePath,
          size: file.size,
          type: fileType,
        })

        // Create Document record using upload parser override or dataset default
        const parserConfig = typeof dataset.parser_config === 'string'
          ? JSON.parse(dataset.parser_config)
          : dataset.parser_config
        await ragDocumentService.createDocument({
          id: docId,
          kb_id: datasetId,
          parser_id: uploadParserId,
          parser_config: parserConfig || { pages: [[1, 1000000]] },
          name: filename,
          location: storagePath,
          size: file.size,
          suffix,
          type: fileType,
        })

        // Create File2Document link
        await ragDocumentService.createFile2Document(fileId, docId)

        // Track the file in version_files table for project-level bookkeeping
        await ModelFactory.documentCategoryVersionFile.create({
          version_id: versionId,
          file_name: filename,
          ragflow_doc_id: docId,
          status: 'imported',
        })

        results.push({
          id: docId,
          name: filename,
          size: file.size,
          type: fileType,
          suffix,
          status: '1',
          run: '0',
        })
      }

      // Update doc count on the dataset
      await ragDocumentService.incrementDocCount(datasetId, results.length)

      // Split results into Office files (need conversion) vs direct-parseable
      const officeFiles: { docId: string; fileName: string }[] = []
      const directParseFiles: { docId: string }[] = []

      for (const result of results) {
        if (RagDocumentService.isOfficeFile(result.suffix)) {
          officeFiles.push({ docId: result.id, fileName: result.name })
        } else {
          directParseFiles.push({ docId: result.id })
        }
      }

      // Auto-trigger parsing for non-Office files (PDF, text, images, etc.)
      for (const { docId } of directParseFiles) {
        try {
          await ragDocumentService.beginParse(docId)
          await ragRedisService.queueParseInit(docId)
          // Update version file status to 'parsing'
          await ModelFactory.documentCategoryVersionFile.getKnex()
            .where({ version_id: versionId, ragflow_doc_id: docId })
            .update({ status: 'parsing', updated_at: new Date() })
        } catch (parseErr) {
          log.warn('Failed to auto-trigger parsing', { docId, error: String(parseErr) })
        }
      }

      // Create converter job for Office files if any exist
      if (officeFiles.length > 0) {
        try {
          const projectId = req.params['id']!
          const catId = req.params['catId']!
          await converterQueueService.createJob({
            datasetId,
            versionId,
            projectId,
            categoryId: catId,
            files: officeFiles.map(f => ({
              fileName: f.fileName,
              filePath: `${projectId}/${catId}/${versionId}/${f.fileName}`,
            })),
          })
          // Trigger manual conversion so worker picks up immediately
          await converterQueueService.triggerManualConversion()
          // Update version file statuses to 'converting'
          for (const { docId } of officeFiles) {
            await ModelFactory.documentCategoryVersionFile.getKnex()
              .where({ version_id: versionId, ragflow_doc_id: docId })
              .update({ status: 'converting', updated_at: new Date() })
          }
        } catch (convErr) {
          log.warn('Failed to create converter job', { versionId, error: String(convErr) })
        }
      }

      res.status(201).json(results)
    } catch (error) {
      log.error('Failed to upload version documents', { error: String(error) })
      res.status(500).json({ error: 'Failed to upload version documents' })
    }
  }

  /**
   * @description DELETE /projects/:id/categories/:catId/versions/:verId/documents - Delete documents from a version's linked RAG dataset by file names.
   *   Resolves documents by name, deletes from S3, OpenSearch, and PostgreSQL.
   * @param {Request} req - Express request with { fileNames: string[] } body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async deleteVersionDocuments(req: Request, res: Response): Promise<void> {
    try {
      const versionId = req.params['verId']!
      const { fileNames } = req.body as { fileNames: string[] }
      if (!Array.isArray(fileNames) || fileNames.length === 0) {
        res.status(400).json({ error: 'fileNames must be a non-empty array' }); return
      }

      // Resolve the version's linked RAG dataset
      const version = await projectCategoryService.getVersionById(versionId)
      if (!version?.ragflow_dataset_id) { res.status(404).json({ error: 'Version or linked dataset not found' }); return }

      const datasetId = version.ragflow_dataset_id
      const tenantId = getTenantId(req) || ''

      // List all documents in the dataset to match by name
      const allDocs = await ragDocumentService.listDocuments(datasetId)
      const deleted: string[] = []
      const failed: string[] = []

      for (const fileName of fileNames) {
        // Find the document matching this file name
        const doc = allDocs.find((d: any) => d.name === fileName)
        if (!doc) { failed.push(fileName); continue }

        try {
          // Delete file from S3 storage
          if (doc.location) {
            try { await ragStorageService.deleteFile(doc.location) } catch { /* best-effort */ }
          }
          // Delete chunks from OpenSearch
          try { await ragSearchService.deleteDocumentChunks(tenantId, doc.id) } catch { /* best-effort */ }
          // Delete file and file2document records
          try { await ragDocumentService.deleteFileRecords(doc.id) } catch { /* best-effort */ }
          // Soft-delete the document row
          await ragDocumentService.softDeleteDocument(doc.id)
          deleted.push(fileName)
        } catch {
          failed.push(fileName)
        }
      }

      // Decrement dataset doc count
      if (deleted.length > 0) {
        try { await ragDocumentService.incrementDocCount(datasetId, -deleted.length) } catch { /* best-effort */ }
      }

      res.json({ deleted, failed })
    } catch (error) {
      log.error('Failed to delete version documents', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete version documents' })
    }
  }

  /**
   * @description POST /projects/:id/categories/:catId/versions/:verId/documents/requeue - Re-queue documents for conversion.
   *   Resets document status to allow re-processing by the converter worker.
   * @param {Request} req - Express request with { fileNames: string[] } body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async requeueVersionDocuments(req: Request, res: Response): Promise<void> {
    try {
      const versionId = req.params['verId']!
      const { fileNames } = req.body as { fileNames: string[] }
      if (!Array.isArray(fileNames) || fileNames.length === 0) {
        res.status(400).json({ error: 'fileNames must be a non-empty array' }); return
      }

      // Resolve the version's linked RAG dataset
      const version = await projectCategoryService.getVersionById(versionId)
      if (!version?.ragflow_dataset_id) { res.status(404).json({ error: 'Version or linked dataset not found' }); return }

      const allDocs = await ragDocumentService.listDocuments(version.ragflow_dataset_id)
      const queued: string[] = []
      const failed: string[] = []

      for (const fileName of fileNames) {
        const doc = allDocs.find((d: any) => d.name === fileName)
        if (!doc) { failed.push(fileName); continue }

        try {
          // Reset document to unstarted state for re-processing
          await ragDocumentService.beginParse(doc.id)
          await ragRedisService.queueParseInit(doc.id)
          queued.push(fileName)
        } catch {
          failed.push(fileName)
        }
      }

      res.json({ queued, failed })
    } catch (error) {
      log.error('Failed to requeue version documents', { error: String(error) })
      res.status(500).json({ error: 'Failed to requeue version documents' })
    }
  }

  /**
   * @description POST /projects/:id/categories/:catId/versions/:verId/documents/parse - Trigger parsing for selected documents.
   *   Queues documents for the RAG parse pipeline via Redis stream.
   * @param {Request} req - Express request with { fileNames: string[] } body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async parseVersionDocuments(req: Request, res: Response): Promise<void> {
    try {
      const versionId = req.params['verId']!
      const { fileNames } = req.body as { fileNames: string[] }
      if (!Array.isArray(fileNames) || fileNames.length === 0) {
        res.status(400).json({ error: 'fileNames must be a non-empty array' }); return
      }

      // Resolve the version's linked RAG dataset
      const version = await projectCategoryService.getVersionById(versionId)
      if (!version?.ragflow_dataset_id) { res.status(404).json({ error: 'Version or linked dataset not found' }); return }

      const allDocs = await ragDocumentService.listDocuments(version.ragflow_dataset_id)
      const parsed: string[] = []
      const failed: string[] = []

      for (const fileName of fileNames) {
        const doc = allDocs.find((d: any) => d.name === fileName)
        if (!doc) { failed.push(fileName); continue }

        try {
          // Mark document as queued and send parse_init task to Redis stream
          await ragDocumentService.beginParse(doc.id)
          await ragRedisService.queueParseInit(doc.id)
          parsed.push(fileName)
        } catch {
          failed.push(fileName)
        }
      }

      res.json({ parsed, failed })
    } catch (error) {
      log.error('Failed to parse version documents', { error: String(error) })
      res.status(500).json({ error: 'Failed to parse version documents' })
    }
  }

  /**
   * @description POST /projects/:id/categories/:catId/versions/:verId/documents/sync-status - Sync parser status from RAG documents back to version files.
   *   Returns the latest parsing status for each file in the version.
   * @param {Request} req - Express request with version ID param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async syncVersionParserStatus(req: Request, res: Response): Promise<void> {
    try {
      const versionId = req.params['verId']!

      // Resolve the version's linked RAG dataset
      const version = await projectCategoryService.getVersionById(versionId)
      if (!version?.ragflow_dataset_id) { res.status(404).json({ error: 'Version or linked dataset not found' }); return }

      // Fetch all RAG documents for the dataset
      const docs = await ragDocumentService.listDocuments(version.ragflow_dataset_id)

      // Return status for each document
      const results = docs.map((doc: any) => ({
        fileName: doc.name,
        ragflowDocId: doc.id,
        ragflowRun: doc.run ?? null,
        ragflowProgress: doc.progress ?? null,
        ragflowProgressMsg: doc.progress_msg ?? null,
        ragflowChunkCount: doc.chunk_count ?? null,
        name: doc.name,
      }))

      res.json(results)
    } catch (error) {
      log.error('Failed to sync version parser status', { error: String(error) })
      res.status(500).json({ error: 'Failed to sync version parser status' })
    }
  }

  // -------------------------------------------------------------------------
  // Chats
  // -------------------------------------------------------------------------

  /**
   * @description GET /projects/:id/chats - List all chat assistants configured for a project
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listChats(req: Request, res: Response): Promise<void> {
    try {
      const chats = await projectChatService.listChats(req.params['id']!)
      res.json(chats)
    } catch (error) {
      log.error('Failed to list chats', { error: String(error) })
      res.status(500).json({ error: 'Failed to list chats' })
    }
  }

  /**
   * @description GET /projects/:id/chats/:chatId - Retrieve a single chat assistant by UUID
   * @param {Request} req - Express request with chat ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async getChat(req: Request, res: Response): Promise<void> {
    try {
      const chat = await projectChatService.getChatById(req.params['chatId']!)
      // Guard: return 404 if chat does not exist
      if (!chat) { res.status(404).json({ error: 'Chat not found' }); return }
      res.json(chat)
    } catch (error) {
      log.error('Failed to get chat', { error: String(error) })
      res.status(500).json({ error: 'Failed to get chat' })
    }
  }

  /**
   * @description POST /projects/:id/chats - Create a new chat assistant for a project
   * @param {Request} req - Express request with chat body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createChat(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for chat creation
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const chat = await projectChatService.createChat(req.params['id']!, req.body, user)
      res.status(201).json(chat)
    } catch (error: any) {
      log.error('Failed to create chat', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create chat' })
    }
  }

  /**
   * @description PUT /projects/:id/chats/:chatId - Update an existing project chat assistant
   * @param {Request} req - Express request with chat ID and update body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async updateChat(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for chat updates
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const chat = await projectChatService.updateChat(req.params['chatId']!, req.body, user)
      // Guard: return 404 if chat not found
      if (!chat) { res.status(404).json({ error: 'Chat not found' }); return }
      res.json(chat)
    } catch (error: any) {
      log.error('Failed to update chat', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update chat' })
    }
  }

  /**
   * @description DELETE /projects/:id/chats/:chatId - Delete a project chat assistant
   * @param {Request} req - Express request with chat ID
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
   */
  async deleteChat(req: Request, res: Response): Promise<void> {
    try {
      await projectChatService.deleteChat(req.params['chatId']!)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to delete chat', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete chat' })
    }
  }

  // -------------------------------------------------------------------------
  // Searches
  // -------------------------------------------------------------------------

  /**
   * @description GET /projects/:id/searches - List all search apps configured for a project
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listSearches(req: Request, res: Response): Promise<void> {
    try {
      const searches = await projectSearchService.listSearches(req.params['id']!)
      res.json(searches)
    } catch (error) {
      log.error('Failed to list searches', { error: String(error) })
      res.status(500).json({ error: 'Failed to list searches' })
    }
  }

  /**
   * @description GET /projects/:id/searches/:searchId - Retrieve a single search app by UUID
   * @param {Request} req - Express request with search ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async getSearch(req: Request, res: Response): Promise<void> {
    try {
      const search = await projectSearchService.getSearchById(req.params['searchId']!)
      // Guard: return 404 if search app does not exist
      if (!search) { res.status(404).json({ error: 'Search not found' }); return }
      res.json(search)
    } catch (error) {
      log.error('Failed to get search', { error: String(error) })
      res.status(500).json({ error: 'Failed to get search' })
    }
  }

  /**
   * @description POST /projects/:id/searches - Create a new search app for a project
   * @param {Request} req - Express request with search body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createSearch(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for search creation
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const search = await projectSearchService.createSearch(req.params['id']!, req.body, user)
      res.status(201).json(search)
    } catch (error: any) {
      log.error('Failed to create search', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create search' })
    }
  }

  /**
   * @description PUT /projects/:id/searches/:searchId - Update an existing project search app
   * @param {Request} req - Express request with search ID and update body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async updateSearch(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for search updates
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const search = await projectSearchService.updateSearch(req.params['searchId']!, req.body, user)
      // Guard: return 404 if search app not found
      if (!search) { res.status(404).json({ error: 'Search not found' }); return }
      res.json(search)
    } catch (error: any) {
      log.error('Failed to update search', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update search' })
    }
  }

  /**
   * @description DELETE /projects/:id/searches/:searchId - Delete a project search app
   * @param {Request} req - Express request with search ID
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
   */
  async deleteSearch(req: Request, res: Response): Promise<void> {
    try {
      await projectSearchService.deleteSearch(req.params['searchId']!)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to delete search', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete search' })
    }
  }

  // -------------------------------------------------------------------------
  // Sync Configs
  // -------------------------------------------------------------------------

  /**
   * @description GET /projects/:id/sync-configs - List all external data sync configurations for a project
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listSyncConfigs(req: Request, res: Response): Promise<void> {
    try {
      const configs = await projectSyncService.listSyncConfigs(req.params['id']!)
      res.json(configs)
    } catch (error) {
      log.error('Failed to list sync configs', { error: String(error) })
      res.status(500).json({ error: 'Failed to list sync configs' })
    }
  }

  /**
   * @description POST /projects/:id/sync-configs - Create a new external data sync configuration
   * @param {Request} req - Express request with sync config body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createSyncConfig(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for sync config creation
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const config = await projectSyncService.createSyncConfig(req.params['id']!, req.body, user)
      res.status(201).json(config)
    } catch (error: any) {
      log.error('Failed to create sync config', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create sync config' })
    }
  }

  /**
   * @description PUT /projects/:id/sync-configs/:configId - Update an existing sync configuration
   * @param {Request} req - Express request with config ID and update body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async updateSyncConfig(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for sync config updates
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const config = await projectSyncService.updateSyncConfig(req.params['configId']!, req.body, user)
      // Guard: return 404 if sync config not found
      if (!config) { res.status(404).json({ error: 'Sync config not found' }); return }
      res.json(config)
    } catch (error: any) {
      log.error('Failed to update sync config', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to update sync config' })
    }
  }

  /**
   * @description DELETE /projects/:id/sync-configs/:configId - Delete an external data sync configuration
   * @param {Request} req - Express request with config ID
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
   */
  async deleteSyncConfig(req: Request, res: Response): Promise<void> {
    try {
      await projectSyncService.deleteSyncConfig(req.params['configId']!)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to delete sync config', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete sync config' })
    }
  }

  // -------------------------------------------------------------------------
  // Entity Permissions
  // -------------------------------------------------------------------------

  /**
   * @description GET /projects/:id/entity-permissions - List fine-grained entity-level permissions for a project
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listEntityPermissions(req: Request, res: Response): Promise<void> {
    try {
      const perms = await projectsService.getEntityPermissions(req.params['id']!)
      res.json(perms)
    } catch (error) {
      log.error('Failed to list entity permissions', { error: String(error) })
      res.status(500).json({ error: 'Failed to list entity permissions' })
    }
  }

  /**
   * @description POST /projects/:id/entity-permissions - Create a new entity-level permission grant
   * @param {Request} req - Express request with entity permission body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createEntityPermission(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for entity permission creation
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const perm = await projectsService.createEntityPermission(req.params['id']!, req.body, user)
      res.status(201).json(perm)
    } catch (error: any) {
      log.error('Failed to create entity permission', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to create entity permission' })
    }
  }

  /**
   * @description DELETE /projects/:id/entity-permissions/:permId - Remove an entity-level permission grant
   * @param {Request} req - Express request with permission ID
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
   */
  async deleteEntityPermission(req: Request, res: Response): Promise<void> {
    try {
      await projectsService.deleteEntityPermission(req.params['permId']!)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to delete entity permission', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete entity permission' })
    }
  }

  // -------------------------------------------------------------------------
  // Member Management (PROJ-03)
  // -------------------------------------------------------------------------

  /**
   * @description GET /projects/:id/members - List all user members of a project with profile details
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response with members array
   * @returns {Promise<void>}
   */
  async getMembers(req: Request, res: Response): Promise<void> {
    try {
      const members = await projectsService.getProjectMembers(req.params['id']!)
      res.json(members)
    } catch (error) {
      log.error('Failed to list project members', { error: String(error) })
      res.status(500).json({ error: 'Failed to list project members' })
    }
  }

  /**
   * @description POST /projects/:id/members - Add a user as a project member with default view permissions
   * @param {Request} req - Express request with project ID and { user_id } body
   * @param {Response} res - Express response (201 with created permission)
   * @returns {Promise<void>}
   */
  async addMember(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for member management
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const tenantId = getTenantId(req) || ''
      const permission = await projectsService.addMember(req.params['id']!, req.body.user_id, user.id, tenantId)
      res.status(201).json(permission)
    } catch (error: any) {
      log.error('Failed to add project member', { error: String(error) })
      // Return 404 for user-not-found errors, 500 otherwise
      const status = error.message?.includes('not found') ? 404 : 500
      res.status(status).json({ error: error.message || 'Failed to add member' })
    }
  }

  /**
   * @description DELETE /projects/:id/members/:userId - Remove a user from a project
   * @param {Request} req - Express request with project ID and user ID params
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
   */
  async removeMember(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for member removal
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const tenantId = getTenantId(req) || ''
      await projectsService.removeMember(req.params['id']!, req.params['userId']!, user.id, tenantId)
      res.status(204).send()
    } catch (error: any) {
      log.error('Failed to remove project member', { error: String(error) })
      // Return 403 if trying to remove project creator
      const status = error.message?.includes('Cannot remove') ? 403 : 500
      res.status(status).json({ error: error.message || 'Failed to remove member' })
    }
  }

  // -------------------------------------------------------------------------
  // Dataset Binding (PROJ-02)
  // -------------------------------------------------------------------------

  /**
   * @description POST /projects/:id/datasets/bind - Bind multiple datasets to a project in one request
   * @param {Request} req - Express request with project ID and { dataset_ids } body
   * @param {Response} res - Express response (200 on success)
   * @returns {Promise<void>}
   */
  async bindDatasets(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for dataset binding
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const tenantId = getTenantId(req) || ''
      await projectsService.bindDatasets(req.params['id']!, req.body.dataset_ids, user.id, tenantId)
      res.json({ message: 'Datasets bound successfully' })
    } catch (error: any) {
      log.error('Failed to bind datasets', { error: String(error) })
      res.status(500).json({ error: error.message || 'Failed to bind datasets' })
    }
  }

  /**
   * @description DELETE /projects/:id/datasets/:datasetId/unbind - Unbind a dataset from a project
   * @param {Request} req - Express request with project ID and dataset ID params
   * @param {Response} res - Express response (204 on success)
   * @returns {Promise<void>}
   */
  async unbindDataset(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for dataset unbinding
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const tenantId = getTenantId(req) || ''
      await projectsService.unbindDataset(req.params['id']!, req.params['datasetId']!, user.id, tenantId)
      res.status(204).send()
    } catch (error) {
      log.error('Failed to unbind dataset', { error: String(error) })
      res.status(500).json({ error: 'Failed to unbind dataset' })
    }
  }

  // -------------------------------------------------------------------------
  // Activity Feed
  // -------------------------------------------------------------------------

  /**
   * @description GET /projects/:id/activity - Get paginated audit activity feed for a project
   * @param {Request} req - Express request with project ID and optional limit/offset query params
   * @param {Response} res - Express response with { data, total } payload
   * @returns {Promise<void>}
   */
  async getActivity(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const limit = Number(req.query['limit']) || 20
      const offset = Number(req.query['offset']) || 0
      const result = await projectsService.getProjectActivity(req.params['id']!, tenantId, limit, offset)
      res.json(result)
    } catch (error) {
      log.error('Failed to get project activity', { error: String(error) })
      res.status(500).json({ error: 'Failed to get project activity' })
    }
  }

  // -------------------------------------------------------------------------
  // Code Import
  // -------------------------------------------------------------------------

  /**
   * @description POST /projects/:id/categories/:catId/import-git - Import code files
   *   from a Git repository URL into a code category. Clones the repo, filters by code
   *   extensions, and triggers the parse pipeline. Returns 202 Accepted.
   * @param {Request} req - Express request with project ID, category ID, and git params in body
   * @param {Response} res - Express response with taskId and fileCount
   * @returns {Promise<void>}
   */
  async importGitRepo(req: Request, res: Response): Promise<void> {
    try {
      const projectId = req.params['id']!
      const categoryId = req.params['catId']!
      const tenantId = getTenantId(req) || ''

      const result = await projectCategoryService.importGitRepo(
        projectId, categoryId, tenantId, req.body,
      )
      res.status(202).json({ ...result, message: 'Import started' })
    } catch (error) {
      log.error('Failed to import git repo', { error: String(error) })
      res.status(500).json({ error: String(error) })
    }
  }

  /**
   * @description POST /projects/:id/categories/:catId/import-zip - Import code files
   *   from a ZIP archive uploaded via multipart. Extracts the archive, filters by code
   *   extensions, and triggers the parse pipeline. Returns 202 Accepted.
   * @param {Request} req - Express request with uploaded file via multer
   * @param {Response} res - Express response with taskId and fileCount
   * @returns {Promise<void>}
   */
  async importZipFile(req: Request, res: Response): Promise<void> {
    try {
      const projectId = req.params['id']!
      const categoryId = req.params['catId']!
      const tenantId = getTenantId(req) || ''

      // Guard: ensure a file was uploaded
      const file = req.file as Express.Multer.File | undefined
      if (!file) {
        res.status(400).json({ error: 'No file provided' })
        return
      }

      const result = await projectCategoryService.importZipFile(
        projectId, categoryId, tenantId, file.buffer, file.originalname,
      )
      res.status(202).json({ ...result, message: 'Import started' })
    } catch (error) {
      log.error('Failed to import zip file', { error: String(error) })
      res.status(500).json({ error: String(error) })
    }
  }

  // -------------------------------------------------------------------------
  // Project Datasets (enhanced listing with dataset name)
  // -------------------------------------------------------------------------

  /**
   * @description GET /projects/:id/datasets/details - Get project datasets with dataset name via JOIN.
   *   Returns richer dataset info than the basic listDatasets endpoint.
   * @param {Request} req - Express request with project ID
   * @param {Response} res - Express response with enriched dataset link records
   * @returns {Promise<void>}
   */
  async getProjectDatasets(req: Request, res: Response): Promise<void> {
    try {
      const datasets = await ModelFactory.projectDataset.findByProjectId(req.params['id']!)
      res.json(datasets)
    } catch (error) {
      log.error('Failed to get project datasets', { error: String(error) })
      res.status(500).json({ error: 'Failed to get project datasets' })
    }
  }

  // -------------------------------------------------------------------------
  // Cross-Project Dataset Resolver (PROJ-04)
  // -------------------------------------------------------------------------

  /**
   * @description GET /cross-project-datasets - Resolve all dataset IDs accessible to the current user
   *   across all their projects. Used by search/chat to determine searchable scope.
   * @param {Request} req - Express request with authenticated user
   * @param {Response} res - Express response with { dataset_ids: string[] }
   * @returns {Promise<void>}
   */
  async getCrossProjectDatasets(req: Request, res: Response): Promise<void> {
    try {
      const user = getUserContext(req)
      // Guard: require authentication for cross-project resolution
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return }
      const tenantId = getTenantId(req) || ''
      const datasetIds = await projectsService.resolveProjectDatasets(user.id, tenantId)
      res.json({ dataset_ids: datasetIds })
    } catch (error) {
      log.error('Failed to resolve cross-project datasets', { error: String(error) })
      res.status(500).json({ error: 'Failed to resolve cross-project datasets' })
    }
  }
}
