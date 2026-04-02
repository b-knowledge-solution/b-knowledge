/**
 * @fileoverview DocumentCategory model for CRUD on document_categories table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { DocumentCategory } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the document_categories table,
 *   which organizes project documents into named groups with ordering
 * @extends BaseModel<DocumentCategory>
 */
export class DocumentCategoryModel extends BaseModel<DocumentCategory> {
  protected tableName = 'document_categories'
  protected knex = db

  /**
   * @description Find all categories for a given project, ordered by sort_order ascending
   * @param {string} projectId - UUID of the project
   * @returns {Promise<DocumentCategory[]>} Array of category records
   */
  async findByProjectId(projectId: string): Promise<DocumentCategory[]> {
    return this.knex(this.tableName)
      .where('project_id', projectId)
      .orderBy('sort_order', 'asc')
  }
}
