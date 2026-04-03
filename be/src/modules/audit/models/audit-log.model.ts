/**
 * Audit log model: append-only store for security events.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { AuditLog } from '@/shared/models/types.js'

/**
 * AuditLogModel
 * Represents the 'audit_logs' table for storing system audit trails.
 * Tracks user actions, resource changes, and security events.
 */
export class AuditLogModel extends BaseModel<AuditLog> {
  /** Table name in the database */
  protected tableName = 'audit_logs'
  /** Knex connection instance */
  protected knex = db

  /**
   * @description Count audit log records matching the given filter conditions
   * @param {Partial<AuditLog>} [filter] - Optional WHERE clause conditions to narrow the count
   * @returns {Promise<number>} Total count of matching records
   */
  async count(filter?: Partial<AuditLog>): Promise<number> {
    const query = this.knex(this.tableName).count('* as count')
    // Apply optional filter conditions to narrow the count
    if (filter) {
      query.where(filter)
    }
    const [result] = await query
    return result ? Number(result.count) : 0
  }

  /**
   * @description Get paginated audit log entries scoped to a set of resource IDs within a tenant.
   *   Used for knowledge base activity feeds covering both the KB and its bound datasets.
   * @param {string} tenantId - Tenant ID for org-scoped filtering
   * @param {string[]} resourceIds - Array of resource IDs to include (knowledge base ID + dataset IDs)
   * @param {number} limit - Maximum number of entries to return
   * @param {number} offset - Pagination offset
   * @returns {Promise<{ data: AuditLog[]; total: number }>} Paginated audit entries with total count
   */
  async findByResourceIdsInTenant(
    tenantId: string,
    resourceIds: string[],
    limit: number,
    offset: number
  ): Promise<{ data: AuditLog[]; total: number }> {
    // Base query: audit logs for the specified resource IDs within tenant
    const baseQuery = this.knex(this.tableName)
      .where('tenant_id', tenantId)
      .andWhere(function () {
        this.whereIn('resource_id', resourceIds)
      })

    // Run data fetch and count in parallel for efficiency
    const [data, countResult] = await Promise.all([
      baseQuery.clone()
        .select('*')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset),
      baseQuery.clone()
        .count('* as cnt')
        .first(),
    ])

    const total = Number((countResult as any)?.cnt ?? 0)
    return { data, total }
  }
}
