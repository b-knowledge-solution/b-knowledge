
/**
 * Search app access model: manages RBAC access entries for search apps.
 * Stores user/team grants in the search_app_access junction table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { SearchAppAccess } from '@/shared/models/types.js'

/**
 * SearchAppAccessModel
 * Represents the 'search_app_access' table.
 * Manages user and team access grants for search app configurations.
 */
export class SearchAppAccessModel extends BaseModel<SearchAppAccess> {
  /** Table name in the database */
  protected tableName = 'search_app_access'
  /** Knex connection instance */
  protected knex = db

  /**
   * Find all access entries for a specific search app.
   * @param appId - UUID of the search app
   * @returns Array of SearchAppAccess records for the app
   */
  async findByAppId(appId: string): Promise<SearchAppAccess[]> {
    // Query access entries filtered by app_id
    return this.getKnex().where({ app_id: appId })
  }

  /**
   * Find all search app IDs accessible by a user (directly or via team membership).
   * @param userId - UUID of the user
   * @param teamIds - Array of team UUIDs the user belongs to
   * @returns Array of unique app IDs the user can access
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
   * Replace all access entries for a search app with new entries (bulk upsert).
   * Deletes existing entries and inserts new ones within a transaction.
   * @param appId - UUID of the search app
   * @param entries - Array of new access entries (entity_type + entity_id)
   * @param createdBy - UUID of the user performing the operation
   * @returns Array of newly created SearchAppAccess records
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
