/**
 * @fileoverview KnowledgeBaseEntityPermission model for CRUD on knowledge_base_entity_permissions table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { KnowledgeBaseEntityPermission } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the knowledge_base_entity_permissions table,
 *   which stores fine-grained permissions on individual entities (categories, chats, searches)
 * @extends BaseModel<KnowledgeBaseEntityPermission>
 */
export class KnowledgeBaseEntityPermissionModel extends BaseModel<KnowledgeBaseEntityPermission> {
  protected tableName = 'knowledge_base_entity_permissions'
  protected knex = db

  /**
   * @description Find all entity-level permissions for a given knowledge base, ordered newest first
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<KnowledgeBaseEntityPermission[]>} Array of entity permission records
   */
  async findByKnowledgeBaseId(knowledgeBaseId: string): Promise<KnowledgeBaseEntityPermission[]> {
    return this.knex(this.tableName)
      .where('knowledge_base_id', knowledgeBaseId)
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find permissions for a specific entity within a knowledge base
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {string} entityType - Entity type ('category', 'chat', 'search')
   * @param {string} entityId - UUID of the entity
   * @returns {Promise<KnowledgeBaseEntityPermission[]>} Array of entity permission records
   */
  async findByEntity(knowledgeBaseId: string, entityType: string, entityId: string): Promise<KnowledgeBaseEntityPermission[]> {
    return this.knex(this.tableName)
      .where({ knowledge_base_id: knowledgeBaseId, entity_type: entityType, entity_id: entityId })
  }
}
