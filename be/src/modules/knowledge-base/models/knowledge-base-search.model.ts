/**
 * @fileoverview KnowledgeBaseSearch model for CRUD on knowledge_base_searches table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { KnowledgeBaseSearch } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the knowledge_base_searches table,
 *   which stores search app configurations linked to knowledge bases
 * @extends BaseModel<KnowledgeBaseSearch>
 */
export class KnowledgeBaseSearchModel extends BaseModel<KnowledgeBaseSearch> {
  protected tableName = 'knowledge_base_searches'
  protected knex = db

  /**
   * @description Find all search app configurations for a given knowledge base, ordered newest first
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<KnowledgeBaseSearch[]>} Array of knowledge base search records
   */
  async findByKnowledgeBaseId(knowledgeBaseId: string): Promise<KnowledgeBaseSearch[]> {
    return this.knex(this.tableName)
      .where('knowledge_base_id', knowledgeBaseId)
      .orderBy('created_at', 'desc')
  }
}
