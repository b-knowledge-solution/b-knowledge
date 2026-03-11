/**
 * @fileoverview DocumentCategoryVersion model for CRUD on document_category_versions table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { DocumentCategoryVersion } from '@/shared/models/types.js'

/**
 * DocumentCategoryVersionModel provides CRUD for the document_category_versions table.
 * @extends BaseModel<DocumentCategoryVersion>
 */
export class DocumentCategoryVersionModel extends BaseModel<DocumentCategoryVersion> {
  protected tableName = 'document_category_versions'
  protected knex = db

  /**
   * Find all versions for a given category.
   * @param categoryId - UUID of the category
   * @returns Array of version records
   */
  async findByCategoryId(categoryId: string): Promise<DocumentCategoryVersion[]> {
    return this.knex(this.tableName)
      .where('category_id', categoryId)
      .orderBy('created_at', 'desc')
  }
}
