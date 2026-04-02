/**
 * @fileoverview KnowledgeBaseDataset model for CRUD on knowledge_base_datasets table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { KnowledgeBaseDataset } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the knowledge_base_datasets junction table,
 *   which links datasets to knowledge bases with an auto_created flag for cascade management
 * @extends BaseModel<KnowledgeBaseDataset>
 */
export class KnowledgeBaseDatasetModel extends BaseModel<KnowledgeBaseDataset> {
  protected tableName = 'knowledge_base_datasets'
  protected knex = db

  /**
   * @description Find all dataset links for a given knowledge base, ordered newest first
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<KnowledgeBaseDataset[]>} Array of knowledge-base-dataset link records
   */
  async findByKnowledgeBaseId(knowledgeBaseId: string): Promise<KnowledgeBaseDataset[]> {
    return this.knex(this.tableName)
      .where('knowledge_base_id', knowledgeBaseId)
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find auto-created dataset links for a knowledge base, used during cascade deletion
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<KnowledgeBaseDataset[]>} Array of auto-created knowledge-base-dataset link records
   */
  async findAutoCreated(knowledgeBaseId: string): Promise<KnowledgeBaseDataset[]> {
    return this.knex(this.tableName)
      .where({ knowledge_base_id: knowledgeBaseId, auto_created: true })
  }
}
