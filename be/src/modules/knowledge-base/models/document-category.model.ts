/**
 * @fileoverview DocumentCategory model for CRUD on document_categories table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { DocumentCategory } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the document_categories table,
 *   which organizes knowledge base documents into named groups with ordering
 * @extends BaseModel<DocumentCategory>
 */
export class DocumentCategoryModel extends BaseModel<DocumentCategory> {
  protected tableName = 'document_categories'
  protected knex = db

  /**
   * @description Find all categories for a given knowledge base, ordered by sort_order ascending
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<DocumentCategory[]>} Array of category records
   */
  async findByKnowledgeBaseId(knowledgeBaseId: string): Promise<DocumentCategory[]> {
    return this.knex(this.tableName)
      .where('knowledge_base_id', knowledgeBaseId)
      .orderBy('sort_order', 'asc')
  }
}
