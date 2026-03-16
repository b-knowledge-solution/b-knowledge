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
}
