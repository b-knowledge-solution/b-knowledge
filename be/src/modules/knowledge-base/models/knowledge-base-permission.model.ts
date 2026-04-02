/**
 * @fileoverview KnowledgeBasePermission model for CRUD on knowledge_base_permissions table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { KnowledgeBasePermission } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the knowledge_base_permissions table,
 *   which stores tab-level access grants (documents, chat, settings) for users and teams
 * @extends BaseModel<KnowledgeBasePermission>
 */
export class KnowledgeBasePermissionModel extends BaseModel<KnowledgeBasePermission> {
  protected tableName = 'knowledge_base_permissions'
  protected knex = db

  /**
   * @description Find all permission entries for a given knowledge base, ordered newest first
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<KnowledgeBasePermission[]>} Array of permission records
   */
  async findByKnowledgeBaseId(knowledgeBaseId: string): Promise<KnowledgeBasePermission[]> {
    return this.knex(this.tableName)
      .where('knowledge_base_id', knowledgeBaseId)
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find all permissions granted to a specific grantee across all knowledge bases
   * @param {string} granteeType - 'user' or 'team'
   * @param {string} granteeId - UUID of the grantee
   * @returns {Promise<KnowledgeBasePermission[]>} Array of permission records
   */
  async findByGrantee(granteeType: string, granteeId: string): Promise<KnowledgeBasePermission[]> {
    return this.knex(this.tableName)
      .where({ grantee_type: granteeType, grantee_id: granteeId })
  }
}
