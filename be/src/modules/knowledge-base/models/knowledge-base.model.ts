/**
 * @fileoverview KnowledgeBase model for CRUD operations on the knowledge_base table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { KnowledgeBase } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the knowledge_base table,
 *   which is the top-level organizational entity for datasets, chats, and searches
 * @extends BaseModel<KnowledgeBase>
 */
export class KnowledgeBaseModel extends BaseModel<KnowledgeBase> {
  protected tableName = 'knowledge_base'
  protected knex = db

  /**
   * @description Find all knowledge bases created by a specific user, ordered newest first
   * @param {string} userId - UUID of the creator
   * @returns {Promise<KnowledgeBase[]>} Array of knowledge bases created by the user
   */
  async findByCreator(userId: string): Promise<KnowledgeBase[]> {
    return this.knex(this.tableName)
      .where('created_by', userId)
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find all knowledge bases with active status, ordered newest first
   * @returns {Promise<KnowledgeBase[]>} Array of active knowledge bases
   */
  async findActive(): Promise<KnowledgeBase[]> {
    return this.knex(this.tableName)
      .where('status', 'active')
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find all active knowledge bases belonging to a specific tenant, ordered newest first.
   *   Enforces multi-tenant isolation by filtering on tenant_id.
   * @param {string} tenantId - UUID of the tenant/organization
   * @returns {Promise<KnowledgeBase[]>} Array of active knowledge bases within the tenant
   */
  async findByTenant(tenantId: string): Promise<KnowledgeBase[]> {
    return this.knex(this.tableName)
      .where('tenant_id', tenantId)
      .andWhere('status', 'active')
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Check if a knowledge base with the given name already exists (excluding deleted ones),
   *   optionally scoped to a specific tenant
   * @param {string} name - Knowledge base name to check
   * @param {string} [tenantId] - Optional tenant ID for scoped duplicate check
   * @returns {Promise<KnowledgeBase | undefined>} Existing knowledge base if found
   */
  async findByNameExcludingDeleted(name: string, tenantId?: string): Promise<KnowledgeBase | undefined> {
    // Build query to find active/non-deleted knowledge base by name
    let query = this.knex(this.tableName)
      .where('name', name)
      .whereNot('status', 'deleted')
    // Scope to tenant if provided for multi-tenant isolation
    if (tenantId) query = query.andWhere('tenant_id', tenantId)
    return query.first()
  }
}
