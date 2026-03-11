/**
 * @fileoverview RAG Upload Service — uploads converted files to RAGFlow and tracks status.
 *
 * After conversion, this service uploads files to RAGFlow, triggers parsing,
 * and syncs parse status back to document_version_files.
 *
 * @description Implements Singleton Pattern per coding guidelines.
 * @module modules/rag/services/rag-upload
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { DocumentVersionFile } from '@/shared/models/types.js'
import { ragDocumentService } from './rag-document.service.js'
import { ragRedisService, getUuid } from './rag-redis.service.js'
import { ragStorageService } from './rag-storage.service.js'
import { log } from '@/shared/services/logger.service.js'
import path from 'path'

/**
 * RagUploadService handles uploading converted files to RAGFlow
 * and tracking their parsing status.
 * @description Singleton pattern — use exported instance.
 */
export class RagUploadService {
  private static instance: RagUploadService

  /**
   * Get the shared singleton instance.
   * @returns RagUploadService singleton
   */
  static getSharedInstance(): RagUploadService {
    if (!this.instance) {
      this.instance = new RagUploadService()
    }
    return this.instance
  }

  // --------------------------------------------------------------------------
  // Upload to RAGFlow
  // --------------------------------------------------------------------------

  /**
   * Upload version files to RAGFlow as documents in the version's RAGFlow dataset.
   * Updates file records with ragflow_doc_id and status.
   *
   * @param versionId - UUID of the version
   * @param ragflowDatasetId - RAGFlow dataset ID to upload into
   * @param files - Multer file buffers to upload
   * @returns Summary of upload results
   */
  async uploadFilesToRagflow(
    versionId: string,
    ragflowDatasetId: string,
    files: Array<{ originalname: string; buffer: Buffer; size: number }>
  ): Promise<{ uploaded: number; failed: number; errors: string[] }> {
    const result = { uploaded: 0, failed: 0, errors: [] as string[] }

    // Get or verify the knowledgebase record for the RAGFlow dataset
    const kb = await ragDocumentService.getKnowledgebase(ragflowDatasetId)

    for (const file of files) {
      const fileName = file.originalname || 'unknown'

      try {
        const fileId = getUuid()
        const docId = getUuid()
        const suffix = path.extname(fileName).toLowerCase().replace('.', '')
        const fileType = ragStorageService.getFileType(suffix)

        // Store file in MinIO
        const storagePath = ragStorageService.buildStoragePath(ragflowDatasetId, fileId, fileName)
        await ragStorageService.putFile(storagePath, file.buffer)

        // Create File record in Peewee tables
        await ragDocumentService.createFile({
          id: fileId,
          name: fileName,
          location: storagePath,
          size: file.size,
          type: fileType,
        })

        // Create Document record in Peewee tables
        const parserConfig = kb
          ? (typeof kb.parser_config === 'string' ? JSON.parse(kb.parser_config) : kb.parser_config)
          : { pages: [[1, 1000000]] }
        await ragDocumentService.createDocument({
          id: docId,
          kb_id: ragflowDatasetId.replace(/-/g, ''),
          parser_id: kb?.parser_id || 'naive',
          parser_config: parserConfig,
          name: fileName,
          location: storagePath,
          size: file.size,
          suffix,
          type: fileType,
        })

        // Create File2Document link
        await ragDocumentService.createFile2Document(fileId, docId)

        // Update document_version_files with ragflow_doc_id
        await ModelFactory.documentVersionFile.upsertByName({
          version_id: versionId,
          file_name: fileName,
          ragflow_doc_id: docId,
          status: 'imported',
        })

        result.uploaded++
        log.info('File uploaded to RAGFlow', { fileName, docId, versionId })
      } catch (err) {
        result.failed++
        const errorMsg = `${fileName}: ${(err as Error).message}`
        result.errors.push(errorMsg)
        log.error('Failed to upload file to RAGFlow', { fileName, error: errorMsg })

        // Mark file as failed
        await ModelFactory.documentVersionFile.upsertByName({
          version_id: versionId,
          file_name: fileName,
          status: 'failed',
          error: (err as Error).message,
        })
      }
    }

    // Update doc count on the knowledgebase
    if (result.uploaded > 0 && kb) {
      try {
        await ragDocumentService.incrementDocCount(ragflowDatasetId, result.uploaded)
      } catch (err) {
        log.warn('Failed to increment doc count', { error: (err as Error).message })
      }
    }

    return result
  }

  // --------------------------------------------------------------------------
  // Parse Triggering
  // --------------------------------------------------------------------------

  /**
   * Trigger RAGFlow parsing for all imported files in a version.
   * Only triggers files that have status 'imported' and a ragflow_doc_id.
   *
   * @param versionId - UUID of the version
   * @returns Number of documents queued for parsing
   */
  async triggerParse(versionId: string): Promise<number> {
    // Get all imported files with ragflow_doc_id
    const files = await ModelFactory.documentVersionFile.findByVersionId(versionId)
    const importedFiles = files.filter(f => f.status === 'imported' && f.ragflow_doc_id)

    if (importedFiles.length === 0) {
      log.info('No imported files to parse', { versionId })
      return 0
    }

    // Queue parse for each document
    let queued = 0
    for (const file of importedFiles) {
      try {
        // Begin parse (mark as running in Peewee document table)
        await ragDocumentService.beginParse(file.ragflow_doc_id!)

        // Queue parse_init task to Redis
        await ragRedisService.queueParseInit(file.ragflow_doc_id!)

        // Update version file status to parsing
        await ModelFactory.documentVersionFile.update(file.id, { status: 'parsing' })

        queued++
      } catch (err) {
        log.error('Failed to trigger parse for file', {
          fileId: file.id,
          ragflowDocId: file.ragflow_doc_id,
          error: (err as Error).message,
        })
      }
    }

    log.info('Parse triggered for version files', { versionId, queued, total: importedFiles.length })
    return queued
  }

  // --------------------------------------------------------------------------
  // Status Sync
  // --------------------------------------------------------------------------

  /**
   * Sync document status from RAGFlow (Peewee tables) back to document_version_files.
   * Reads current parse progress from the document table and updates version files.
   *
   * @param versionId - UUID of the version
   * @returns Array of updated file statuses
   */
  async syncStatus(versionId: string): Promise<Array<{
    file_name: string
    status: string
    progress?: number
    progress_msg?: string
  }>> {
    // Get all version files that have a ragflow_doc_id
    const files = await ModelFactory.documentVersionFile.findByVersionId(versionId)
    const trackedFiles = files.filter(f => f.ragflow_doc_id)

    const results: Array<{
      file_name: string
      status: string
      progress?: number
      progress_msg?: string
    }> = []

    for (const file of trackedFiles) {
      try {
        // Get current document status from Peewee document table
        const doc = await ragDocumentService.getDocument(file.ragflow_doc_id!)
        if (!doc) {
          results.push({ file_name: file.file_name, status: file.status })
          continue
        }

        // Map RAGFlow run status to our status
        let newStatus: DocumentVersionFile['status'] = file.status
        if (doc.run === '3') {
          // Done
          newStatus = 'done'
        } else if (doc.run === '4') {
          // Failed
          newStatus = 'failed'
        } else if (doc.run === '1') {
          // Running
          newStatus = 'parsing'
        }

        // Update if status changed
        if (newStatus !== file.status) {
          await ModelFactory.documentVersionFile.update(file.id, {
            status: newStatus,
            error: doc.run === '4' ? (doc.progress_msg || 'Parse failed') : null,
          })
        }

        results.push({
          file_name: file.file_name,
          status: newStatus,
          progress: doc.progress,
          progress_msg: doc.progress_msg,
        })
      } catch (err) {
        log.warn('Failed to sync status for file', {
          fileId: file.id,
          error: (err as Error).message,
        })
        results.push({ file_name: file.file_name, status: file.status })
      }
    }

    // Update last_synced_at on the version
    await ModelFactory.documentVersion.update(versionId, {
      last_synced_at: new Date(),
    } as any)

    return results
  }
}

/** Exported singleton instance */
export const ragUploadService = RagUploadService.getSharedInstance()
