
/**
 * UserTenant join-table model: manages user-to-tenant (organization) memberships.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'

/**
 * @description Shape of a row in the user_tenant join table
 */
export interface UserTenant {
  id: string
  user_id: string
  tenant_id: string
  role: string
  invited_by?: string
  status?: string
  create_time?: number
  create_date?: string
  update_time?: number
  update_date?: string
}

/**
 * @description Shape returned by findMembershipsWithOrgNames (joined with tenant table)
 */
export interface UserTenantWithOrgName {
  id: string
  name: string
  role: string
}

/**
 * @description Model for the user_tenant join table.
 * Manages user-to-organization membership records including role assignments.
 */
export class UserTenantModel extends BaseModel<UserTenant> {
  /** Table name in the database */
  protected tableName = 'user_tenant'
  /** Knex connection instance */
  protected knex = db

  /**
   * @description Find all organization memberships for a given user
   * @param {string} userId - The user's ID
   * @returns {Promise<Pick<UserTenant, 'tenant_id' | 'role'>[]>} Array of tenant_id and role pairs
   */
  async findMembershipsByUserId(userId: string): Promise<Pick<UserTenant, 'tenant_id' | 'role'>[]> {
    return this.knex(this.tableName)
      .where({ user_id: userId })
      .select('tenant_id', 'role')
  }

  /**
   * @description Create a new user-tenant membership record
   * @param {Partial<UserTenant>} data - Membership data including user_id, tenant_id, role, etc.
   * @returns {Promise<UserTenant>} The created membership record
   */
  async createMembership(data: Partial<UserTenant>): Promise<UserTenant> {
    // Insert and return the created row
    const [result] = await this.knex(this.tableName).insert(data).returning('*')
    return result
  }

  /**
   * @description Find all memberships for a user with organization display names.
   * Joins user_tenant with the tenant table to resolve human-readable org names,
   * falling back through display_name → name → id via COALESCE.
   * @param {string} userId - The user's ID
   * @returns {Promise<UserTenantWithOrgName[]>} Array of org id, name, and role
   */
  async findMembershipsWithOrgNames(userId: string): Promise<UserTenantWithOrgName[]> {
    return this.knex(this.tableName)
      .join('tenant', 'user_tenant.tenant_id', 'tenant.id')
      .where({ 'user_tenant.user_id': userId })
      .select(
        'user_tenant.tenant_id as id',
        this.knex.raw("COALESCE(tenant.display_name, tenant.name, tenant.id) as name"),
        'user_tenant.role',
      )
  }

  /**
   * @description Find a single membership record for a specific user and tenant
   * @param {string} userId - The user's ID
   * @param {string} tenantId - The tenant/organization ID
   * @returns {Promise<UserTenant | undefined>} The membership record if it exists
   */
  async findMembership(userId: string, tenantId: string): Promise<UserTenant | undefined> {
    return this.knex(this.tableName)
      .where({ user_id: userId, tenant_id: tenantId })
      .first()
  }
}
