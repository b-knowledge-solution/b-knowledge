
/**
 * Teams model: simple CRUD for team records used in RBAC groupings.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { Team } from '@/shared/models/types.js'

/**
 * TeamModel
 * Represents the 'teams' table.
 * Manages team groups used for Role-Based Access Control (RBAC).
 */
export class TeamModel extends BaseModel<Team> {
  /** Table name in the database */
  protected tableName = 'teams'
  /** Knex connection instance */
  protected knex = db

  /**
   * @description Batch-fetch team names for enrichment purposes
   * @param {string[]} ids - Array of team UUIDs
   * @returns {Promise<Array<{ id: string; name: string }>>} Matching teams with id and name
   */
  async findNamesByIds(ids: string[]): Promise<Array<{ id: string; name: string }>> {
    if (ids.length === 0) return []
    return this.knex(this.tableName)
      .select('id', 'name')
      .whereIn('id', ids)
  }
}
