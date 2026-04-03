/**
 * @fileoverview DocumentCategoryVersionFile model for CRUD on document_category_version_files table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { DocumentCategoryVersionFile } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the document_category_version_files table,
 *   which stores files attached to specific versions of document categories
 * @extends BaseModel<DocumentCategoryVersionFile>
 */
export class DocumentCategoryVersionFileModel extends BaseModel<DocumentCategoryVersionFile> {
  protected tableName = 'document_category_version_files'
  protected knex = db

  /**
   * @description Find all files attached to a given category version, ordered newest first
   * @param {string} versionId - UUID of the version
   * @returns {Promise<DocumentCategoryVersionFile[]>} Array of file records
   */
  async findByVersionId(versionId: string): Promise<DocumentCategoryVersionFile[]> {
    return this.knex(this.tableName)
      .where('version_id', versionId)
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Update the status of a version file identified by version_id and ragflow_doc_id
   * @param {string} versionId - UUID of the category version
   * @param {string} ragflowDocId - The ragflow document ID
   * @param {string} status - New status value (e.g. 'parsing', 'converting')
   * @returns {Promise<void>}
   */
  async updateStatusByVersionAndDocId(versionId: string, ragflowDocId: string, status: string): Promise<void> {
    await this.knex(this.tableName)
      .where({ version_id: versionId, ragflow_doc_id: ragflowDocId })
      .update({ status, updated_at: new Date() })
  }
}
