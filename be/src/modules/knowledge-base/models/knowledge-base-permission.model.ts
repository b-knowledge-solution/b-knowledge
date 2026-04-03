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

  /**
   * @description Find knowledge_base_ids accessible to any of the given team IDs
   * @param {string[]} teamIds - Array of team UUIDs
   * @returns {Promise<string[]>} Array of knowledge_base_id values
   */
  async findKnowledgeBaseIdsByTeams(teamIds: string[]): Promise<string[]> {
    if (teamIds.length === 0) return []
    // Query team-based permissions and extract distinct knowledge base IDs
    const rows = await this.knex(this.tableName)
      .where('grantee_type', 'team')
      .whereIn('grantee_id', teamIds)
      .select('knowledge_base_id')
    return rows.map((p: any) => p.knowledge_base_id)
  }

  /**
   * @description Find a single permission entry for a specific knowledge base, grantee type, and grantee ID
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {string} granteeType - 'user' or 'team'
   * @param {string} granteeId - UUID of the grantee
   * @returns {Promise<KnowledgeBasePermission | undefined>} Permission record if found
   */
  async findByKnowledgeBaseAndGrantee(
    knowledgeBaseId: string,
    granteeType: string,
    granteeId: string
  ): Promise<KnowledgeBasePermission | undefined> {
    return this.knex(this.tableName)
      .where({
        knowledge_base_id: knowledgeBaseId,
        grantee_type: granteeType,
        grantee_id: granteeId,
      })
      .first()
  }

  /**
   * @description Get all user members of a knowledge base with their profile details.
   *   JOINs with users table to get email, name, and role.
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<Array<{ id: string; user_id: string; email: string; name: string; role: string; created_at: Date }>>}
   */
  async findMembersWithUserDetails(knowledgeBaseId: string): Promise<Array<{
    id: string; user_id: string; email: string; name: string; role: string; created_at: Date
  }>> {
    // JOIN permissions with users to get member profile details in a single query
    return this.knex(this.tableName + ' as kbp')
      .select(
        'kbp.id',
        'kbp.grantee_id as user_id',
        'u.email',
        this.knex.raw("COALESCE(u.nickname, u.email) as name"),
        'u.role',
        'kbp.created_at',
      )
      .innerJoin('users as u', 'u.id', 'kbp.grantee_id')
      .where('kbp.knowledge_base_id', knowledgeBaseId)
      .andWhere('kbp.grantee_type', 'user')
      .orderBy('kbp.created_at', 'desc')
  }
}
