/**
 * @fileoverview DocumentVersionFile model — CRUD for the document_version_files table.
 * @module modules/rag/models/document-version-file
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { DocumentVersionFile } from '@/shared/models/types.js'
import { Knex } from 'knex'

/**
 * DocumentVersionFileModel provides data access for document_version_files table.
 * @description Extends BaseModel with version-scoped queries and bulk operations.
 */
export class DocumentVersionFileModel extends BaseModel<DocumentVersionFile> {
  protected tableName = 'document_version_files'
  protected knex = db

  /**
   * @description Find all files belonging to a version, ordered by file name alphabetically
   * @param {string} versionId - UUID of the parent version
   * @returns {Promise<DocumentVersionFile[]>} Array of DocumentVersionFile records
   */
  async findByVersionId(versionId: string): Promise<DocumentVersionFile[]> {
    return this.knex(this.tableName)
      .where('version_id', versionId)
      .orderBy('file_name', 'asc')
  }

  /**
   * @description Upsert a file record using the version_id + file_name unique constraint.
   * Merges ragflow_doc_id, status, error, and updated_at on conflict.
   * @param {Partial<DocumentVersionFile>} data - File data to upsert
   * @param {Knex.Transaction} [trx] - Optional database transaction
   * @returns {Promise<DocumentVersionFile>} The upserted record
   */
  async upsertByName(data: Partial<DocumentVersionFile>, trx?: Knex.Transaction): Promise<DocumentVersionFile> {
    const query = this.knex(this.tableName)
      .insert(data)
      .onConflict(['version_id', 'file_name'])
      .merge({
        ragflow_doc_id: data.ragflow_doc_id,
        status: data.status,
        error: data.error,
        updated_at: this.knex.fn.now(),
      })
      .returning('*')
    if (trx) query.transacting(trx)
    const [result] = await query
    return result
  }

  /**
   * @description Bulk delete files by IDs within a specific version
   * @param {string} versionId - UUID of the parent version
   * @param {string[]} fileIds - Array of file UUIDs to delete
   * @param {Knex.Transaction} [trx] - Optional database transaction
   * @returns {Promise<void>}
   */
  async bulkDeleteByIds(versionId: string, fileIds: string[], trx?: Knex.Transaction): Promise<void> {
    const query = this.knex(this.tableName)
      .where('version_id', versionId)
      .whereIn('id', fileIds)
    if (trx) query.transacting(trx)
    await query.delete()
  }
}
