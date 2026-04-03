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

  /**
   * @description Bulk insert dataset links with ON CONFLICT DO NOTHING to skip duplicates.
   *   Avoids N+1 inserts by batching all rows into a single query.
   * @param {Array<{ knowledge_base_id: string; dataset_id: string; auto_created: boolean }>} rows - Array of link records
   * @returns {Promise<void>}
   */
  async bulkInsertIgnoreConflict(rows: Array<{ knowledge_base_id: string; dataset_id: string; auto_created: boolean }>): Promise<void> {
    if (rows.length === 0) return
    // Single INSERT with ON CONFLICT DO NOTHING to skip duplicates
    await this.knex(this.tableName)
      .insert(rows)
      .onConflict(['knowledge_base_id', 'dataset_id'])
      .ignore()
  }

  /**
   * @description Resolve all unique dataset IDs accessible to a user via their knowledge base permissions.
   *   Uses a single JOIN query with subselect for tenant isolation.
   * @param {string} userId - UUID of the user
   * @param {string} tenantId - Tenant ID for org-scoped filtering
   * @returns {Promise<string[]>} Deduplicated array of dataset UUIDs
   */
  async resolveDatasetIdsByUserPermissions(userId: string, tenantId: string): Promise<string[]> {
    // Single query with JOIN to resolve all datasets from user's knowledge bases
    const rows = await this.knex(this.tableName + ' as kbd')
      .select('kbd.dataset_id')
      .distinct()
      .innerJoin('knowledge_base_permissions as kbp', 'kbd.knowledge_base_id', 'kbp.knowledge_base_id')
      .where('kbp.grantee_type', 'user')
      .andWhere('kbp.grantee_id', userId)
      .whereIn('kbd.knowledge_base_id', function () {
        // Sub-select: only knowledge bases within the user's tenant
        this.select('id').from('knowledge_base').where('tenant_id', tenantId)
      })
    return rows.map((r: any) => r.dataset_id)
  }
}
