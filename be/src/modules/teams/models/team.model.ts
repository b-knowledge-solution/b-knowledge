
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

  /**
   * @description Check if a team name already exists within a project scope, optionally excluding a specific team ID.
   *   Used for uniqueness validation during team creation and update.
   * @param {string} name - Team name to check
   * @param {string | null} projectName - Project name scope (null for global teams)
   * @param {string} [excludeId] - Optional team ID to exclude from the check (for updates)
   * @returns {Promise<boolean>} True if a team with the given name already exists in the project scope
   */
  async existsByNameInProject(name: string, projectName: string | null, excludeId?: string): Promise<boolean> {
    let query = this.knex(this.tableName)
      .where('name', name)
      .where('project_name', projectName)

    // Exclude the current team when checking during update
    if (excludeId) {
      query = query.whereNot('id', excludeId)
    }

    const existing = await query.first()
    return !!existing
  }

  /**
   * @description Retrieve the stored permissions array for a team.
   *   Returns a parsed string array regardless of whether the DB stored a JSON string or JSONB array.
   * @param {string} teamId - UUID of the team
   * @returns {Promise<string[]>} Array of permission key strings (empty when none set)
   */
  async getPermissions(teamId: string): Promise<string[]> {
    const row = await this.knex(this.tableName)
      .select('permissions')
      .where('id', teamId)
      .first()

    // Return empty array if team not found
    if (!row) return []

    // Handle both raw JSON string (older PostgreSQL drivers) and parsed JSONB
    if (typeof row.permissions === 'string') {
      return JSON.parse(row.permissions)
    }
    return Array.isArray(row.permissions) ? row.permissions : []
  }

  /**
   * @description Replace the permissions array for a team with a new set.
   *   Uses full replacement semantics — the new array overwrites any prior value.
   * @param {string} teamId - UUID of the team
   * @param {string[]} permissions - New set of permission key strings
   * @returns {Promise<void>}
   */
  async setPermissions(teamId: string, permissions: string[]): Promise<void> {
    await this.knex(this.tableName)
      .where('id', teamId)
      .update({ permissions: JSON.stringify(permissions) })
  }
}
