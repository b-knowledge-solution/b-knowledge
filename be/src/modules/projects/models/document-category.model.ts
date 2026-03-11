/**
 * @fileoverview DocumentCategory model for CRUD on document_categories table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { DocumentCategory } from '@/shared/models/types.js'

/**
 * DocumentCategoryModel provides CRUD operations for the document_categories table.
 * @extends BaseModel<DocumentCategory>
 */
export class DocumentCategoryModel extends BaseModel<DocumentCategory> {
  protected tableName = 'document_categories'
  protected knex = db

  /**
   * Find all categories for a given project, ordered by sort_order.
   * @param projectId - UUID of the project
   * @returns Array of category records
   */
  async findByProjectId(projectId: string): Promise<DocumentCategory[]> {
    return this.knex(this.tableName)
      .where('project_id', projectId)
      .orderBy('sort_order', 'asc')
  }
}
