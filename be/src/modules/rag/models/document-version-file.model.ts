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
   * Find all files belonging to a version, ordered by file name.
   * @param versionId - UUID of the parent version
   * @returns Array of DocumentVersionFile records
   */
  async findByVersionId(versionId: string): Promise<DocumentVersionFile[]> {
    return this.knex(this.tableName)
      .where('version_id', versionId)
      .orderBy('file_name', 'asc')
  }

  /**
   * Upsert a file record by version_id + file_name unique constraint.
   * @param data - File data to upsert
   * @param trx - Optional transaction
   * @returns The upserted record
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
   * Bulk delete files by IDs within a version.
   * @param versionId - UUID of the parent version
   * @param fileIds - Array of file UUIDs to delete
   * @param trx - Optional transaction
   */
  async bulkDeleteByIds(versionId: string, fileIds: string[], trx?: Knex.Transaction): Promise<void> {
    const query = this.knex(this.tableName)
      .where('version_id', versionId)
      .whereIn('id', fileIds)
    if (trx) query.transacting(trx)
    await query.delete()
  }
}
