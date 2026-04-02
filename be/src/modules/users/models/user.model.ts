
/**
 * Users table model: lookup by id/email and shared CRUD helpers.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { User } from '@/shared/models/types.js'

/**
 * UserModel
 * Represents the 'users' table.
 * Core user identity management.
 */
export class UserModel extends BaseModel<User> {
  /** Table name in the database */
  protected tableName = 'users'
  /** Knex connection instance */
  protected knex = db

  /**
   * Find a user by their email address.
   * @param email - Email address to search for
   * @returns Promise<User | undefined> - User record if found
   * @description Common lookup used during authentication to link sessions to users.
   */
  async findByEmail(email: string): Promise<User | undefined> {
    // Used by auth flow to bind sessions to existing users
    return this.knex(this.tableName).where({ email }).first()
  }

  /**
   * @description Batch-fetch display names for enrichment purposes
   * @param {string[]} ids - Array of user UUIDs
   * @returns {Promise<Array<{ id: string; display_name: string }>>} Matching users with id and display_name
   */
  async findDisplayNamesByIds(ids: string[]): Promise<Array<{ id: string; display_name: string }>> {
    if (ids.length === 0) return []
    return this.knex(this.tableName)
      .select('id', 'display_name')
      .whereIn('id', ids)
  }

  /**
   * @description Find a user by ID verifying tenant membership via user_tenant join table
   * @param {string} userId - UUID of the user
   * @param {string} tenantId - UUID of the tenant for multi-tenant isolation
   * @returns {Promise<User | undefined>} User record if found and belongs to tenant
   */
  async findByIdAndTenant(userId: string, tenantId: string): Promise<User | undefined> {
    return this.knex(this.tableName + ' as u')
      .innerJoin('user_tenant as ut', 'ut.user_id', 'u.id')
      .where('u.id', userId)
      .andWhere('ut.tenant_id', tenantId)
      .first()
  }
}
