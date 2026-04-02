/**
 * @fileoverview KnowledgeBaseChat model for CRUD on knowledge_base_chats table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { KnowledgeBaseChat } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the knowledge_base_chats table,
 *   which stores chat assistant configurations linked to knowledge bases
 * @extends BaseModel<KnowledgeBaseChat>
 */
export class KnowledgeBaseChatModel extends BaseModel<KnowledgeBaseChat> {
  protected tableName = 'knowledge_base_chats'
  protected knex = db

  /**
   * @description Find all chat assistant configurations for a given knowledge base, ordered newest first
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<KnowledgeBaseChat[]>} Array of knowledge base chat records
   */
  async findByKnowledgeBaseId(knowledgeBaseId: string): Promise<KnowledgeBaseChat[]> {
    return this.knex(this.tableName)
      .where('knowledge_base_id', knowledgeBaseId)
      .orderBy('created_at', 'desc')
  }
}
