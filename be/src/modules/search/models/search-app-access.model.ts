
/**
 * Search app access model: manages RBAC access entries for search apps.
 * Stores user/team grants in the search_app_access junction table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { SearchAppAccess } from '@/shared/models/types.js'

/**
 * @description Model for the search_app_access junction table, managing user and team
 *   access grants for search app configurations with transactional bulk replace support
 */
export class SearchAppAccessModel extends BaseModel<SearchAppAccess> {
  /** Table name in the database */
  protected tableName = 'search_app_access'
  /** Knex connection instance */
  protected knex = db

  /**
   * @description Find all access control entries for a specific search app
   * @param {string} appId - UUID of the search app
   * @returns {Promise<SearchAppAccess[]>} Array of SearchAppAccess records for the app
   */
  async findByAppId(appId: string): Promise<SearchAppAccess[]> {
    // Query access entries filtered by app_id
    return this.getKnex().where({ app_id: appId })
  }

  /**
   * @description Find all search app IDs accessible by a user (directly or via team membership)
   * @param {string} userId - UUID of the user
   * @param {string[]} teamIds - Array of team UUIDs the user belongs to
   * @returns {Promise<string[]>} Array of unique app IDs the user can access
   */
  async findAccessibleAppIds(userId: string, teamIds: string[]): Promise<string[]> {
    // Build query to find apps accessible via user or team grants
    const query = this.getKnex()
      .select('app_id')
      .where(function () {
        // Direct user access
        this.where({ entity_type: 'user', entity_id: userId })

        // Team-based access (if user belongs to any teams)
        if (teamIds.length > 0) {
          this.orWhere(function () {
            this.where('entity_type', 'team').whereIn('entity_id', teamIds)
          })
        }
      })
      .distinct()

    // Extract app_id strings from result rows
    const rows = await query
    return rows.map((row: { app_id: string }) => row.app_id)
  }

  /**
   * @description Atomically replace all access entries for a search app with new entries.
   *   Deletes existing entries and inserts new ones within a single transaction.
   * @param {string} appId - UUID of the search app
   * @param {Array<{ entity_type: 'user' | 'team'; entity_id: string }>} entries - New access entries
   * @param {string} createdBy - UUID of the user performing the operation
   * @returns {Promise<SearchAppAccess[]>} Array of newly created SearchAppAccess records
   */
  async bulkReplace(
    appId: string,
    entries: Array<{ entity_type: 'user' | 'team'; entity_id: string }>,
    createdBy: string
  ): Promise<SearchAppAccess[]> {
    // Use a transaction to ensure atomicity of delete + insert
    return db.transaction(async (trx) => {
      // Remove all existing access entries for this app
      await this.getKnex().where({ app_id: appId }).delete().transacting(trx)

      // If no new entries, return empty array
      if (entries.length === 0) {
        return []
      }

      // Build insert data with app_id and created_by
      const insertData = entries.map((entry) => ({
        app_id: appId,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        created_by: createdBy,
      }))

      // Insert all new entries and return created records
      return this.getKnex().insert(insertData).returning('*').transacting(trx)
    })
  }
}
