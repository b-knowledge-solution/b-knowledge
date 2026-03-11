/**
 * @fileoverview DocumentCategoryVersionFile model for CRUD on document_category_version_files table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { DocumentCategoryVersionFile } from '@/shared/models/types.js'

/**
 * DocumentCategoryVersionFileModel provides CRUD for document_category_version_files.
 * @extends BaseModel<DocumentCategoryVersionFile>
 */
export class DocumentCategoryVersionFileModel extends BaseModel<DocumentCategoryVersionFile> {
  protected tableName = 'document_category_version_files'
  protected knex = db

  /**
   * Find all files for a given version.
   * @param versionId - UUID of the version
   * @returns Array of file records
   */
  async findByVersionId(versionId: string): Promise<DocumentCategoryVersionFile[]> {
    return this.knex(this.tableName)
      .where('version_id', versionId)
      .orderBy('created_at', 'desc')
  }
}
