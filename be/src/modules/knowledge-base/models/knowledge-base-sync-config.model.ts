/**
 * @fileoverview KnowledgeBaseSyncConfig model for CRUD on knowledge_base_sync_configs table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { KnowledgeBaseSyncConfig } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the knowledge_base_sync_configs table,
 *   which stores external data source sync configurations linked to knowledge bases
 * @extends BaseModel<KnowledgeBaseSyncConfig>
 */
export class KnowledgeBaseSyncConfigModel extends BaseModel<KnowledgeBaseSyncConfig> {
  protected tableName = 'knowledge_base_sync_configs'
  protected knex = db

  /**
   * @description Find all sync configurations for a given knowledge base, ordered newest first
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<KnowledgeBaseSyncConfig[]>} Array of sync config records
   */
  async findByKnowledgeBaseId(knowledgeBaseId: string): Promise<KnowledgeBaseSyncConfig[]> {
    return this.knex(this.tableName)
      .where('knowledge_base_id', knowledgeBaseId)
      .orderBy('created_at', 'desc')
  }
}
