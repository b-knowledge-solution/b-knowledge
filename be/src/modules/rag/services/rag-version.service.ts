/**
 * @fileoverview RAG Version Service — manages document version lifecycle.
 *
 * Handles version CRUD, RAGFlow dataset creation per version, and
 * coordinating version status transitions.
 *
 * @description Implements Singleton Pattern per coding guidelines.
 * @module modules/rag/services/rag-version
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { DocumentVersion, DocumentVersionFile, UserContext } from '@/shared/models/types.js'
import { ragDocumentService } from './rag-document.service.js'
import { log } from '@/shared/services/logger.service.js'
import { db } from '@/shared/db/knex.js'

/**
 * Service managing document version lifecycle within datasets.
 * @description Singleton pattern — use exported instance.
 */
export class RagVersionService {
  private static instance: RagVersionService

  /**
   * Get the shared singleton instance.
   * @returns RagVersionService singleton
   */
  static getSharedInstance(): RagVersionService {
    if (!this.instance) {
      this.instance = new RagVersionService()
    }
    return this.instance
  }

  // --------------------------------------------------------------------------
  // Version CRUD
  // --------------------------------------------------------------------------

  /**
   * List all versions for a dataset.
   * @param datasetId - UUID of the parent dataset
   * @returns Array of DocumentVersion records
   */
  async listVersions(datasetId: string): Promise<DocumentVersion[]> {
    return ModelFactory.documentVersion.findByDatasetId(datasetId)
  }

  /**
   * Get a single version by ID.
   * @param versionId - UUID of the version
   * @returns DocumentVersion or undefined
   */
  async getVersion(versionId: string): Promise<DocumentVersion | undefined> {
    return ModelFactory.documentVersion.findById(versionId)
  }

  /**
   * Create a new document version for a dataset.
   * Optionally creates a corresponding RAGFlow dataset for the version.
   * @param datasetId - UUID of the parent dataset
   * @param data - Version creation data
   * @param user - Authenticated user context
   * @returns The created DocumentVersion record
   */
  async createVersion(
    datasetId: string,
    data: {
      version_label: string
      metadata?: Record<string, unknown>
    },
    user?: UserContext
  ): Promise<DocumentVersion> {
    // Check for duplicate version label
    const existing = await ModelFactory.documentVersion.findByLabel(datasetId, data.version_label)
    if (existing) {
      throw new Error(`Version label "${data.version_label}" already exists for this dataset`)
    }

    // Create version record
    const version = await ModelFactory.documentVersion.create({
      dataset_id: datasetId,
      version_label: data.version_label,
      status: 'active',
      metadata: data.metadata || {},
      created_by: user?.id || null,
    })

    log.info('Document version created', {
      versionId: version.id,
      datasetId,
      label: data.version_label,
    })

    return version
  }

  /**
   * Update an existing document version.
   * @param versionId - UUID of the version
   * @param data - Fields to update
   * @returns Updated DocumentVersion or undefined
   */
  async updateVersion(
    versionId: string,
    data: {
      version_label?: string
      status?: 'active' | 'archived'
      metadata?: Record<string, unknown>
      ragflow_dataset_id?: string
      ragflow_dataset_name?: string
    }
  ): Promise<DocumentVersion | undefined> {
    // Build update payload, only including provided fields
    const updateData: Partial<DocumentVersion> = {}
    if (data.version_label !== undefined) updateData.version_label = data.version_label
    if (data.status !== undefined) updateData.status = data.status
    if (data.metadata !== undefined) updateData.metadata = data.metadata
    if (data.ragflow_dataset_id !== undefined) updateData.ragflow_dataset_id = data.ragflow_dataset_id
    if (data.ragflow_dataset_name !== undefined) updateData.ragflow_dataset_name = data.ragflow_dataset_name

    return ModelFactory.documentVersion.update(versionId, updateData)
  }

  /**
   * Delete a document version and all associated files.
   * Uses a transaction to ensure consistency.
   * @param versionId - UUID of the version to delete
   */
  async deleteVersion(versionId: string): Promise<void> {
    const trx = await db.transaction()
    try {
      // Delete all converter jobs for this version
      await trx('converter_jobs').where('version_id', versionId).delete()

      // Delete version (cascade deletes document_version_files)
      await trx('document_versions').where('id', versionId).delete()

      await trx.commit()
      log.info('Document version deleted', { versionId })
    } catch (error) {
      await trx.rollback()
      throw error
    }
  }

  // --------------------------------------------------------------------------
  // Version Files
  // --------------------------------------------------------------------------

  /**
   * List all files in a version with their current status.
   * @param versionId - UUID of the version
   * @returns Array of DocumentVersionFile records
   */
  async listVersionFiles(versionId: string): Promise<DocumentVersionFile[]> {
    return ModelFactory.documentVersionFile.findByVersionId(versionId)
  }

  /**
   * Add files to a version. Creates pending file records.
   * @param versionId - UUID of the version
   * @param fileNames - Array of file names to add
   * @returns Array of created DocumentVersionFile records
   */
  async addFiles(versionId: string, fileNames: string[]): Promise<DocumentVersionFile[]> {
    const results: DocumentVersionFile[] = []
    for (const fileName of fileNames) {
      // Upsert to handle re-uploads of the same file name
      const file = await ModelFactory.documentVersionFile.upsertByName({
        version_id: versionId,
        file_name: fileName,
        status: 'pending',
        error: null,
      })
      results.push(file)
    }
    return results
  }

  /**
   * Delete files from a version by file IDs.
   * @param versionId - UUID of the version
   * @param fileIds - Array of file UUIDs to delete
   */
  async deleteFiles(versionId: string, fileIds: string[]): Promise<void> {
    await ModelFactory.documentVersionFile.bulkDeleteByIds(versionId, fileIds)
  }

  /**
   * Update a file's status and optional error/ragflow_doc_id.
   * @param fileId - UUID of the file
   * @param status - New status
   * @param extra - Optional error and ragflow_doc_id
   * @returns Updated file record or undefined
   */
  async updateFileStatus(
    fileId: string,
    status: DocumentVersionFile['status'],
    extra?: { error?: string; ragflow_doc_id?: string }
  ): Promise<DocumentVersionFile | undefined> {
    const data: Partial<DocumentVersionFile> = { status }
    if (extra?.error !== undefined) data.error = extra.error
    if (extra?.ragflow_doc_id !== undefined) data.ragflow_doc_id = extra.ragflow_doc_id
    return ModelFactory.documentVersionFile.update(fileId, data)
  }
}

/** Exported singleton instance */
export const ragVersionService = RagVersionService.getSharedInstance()
