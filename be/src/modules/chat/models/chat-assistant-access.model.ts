
/**
 * Chat assistant access model: manages RBAC access entries for chat assistants.
 * Stores user/team grants in the chat_assistant_access junction table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ChatAssistantAccess } from '@/shared/models/types.js'

/**
 * ChatAssistantAccessModel
 * Represents the 'chat_assistant_access' table.
 * Manages user and team access grants for chat assistant configurations.
 */
export class ChatAssistantAccessModel extends BaseModel<ChatAssistantAccess> {
  /** Table name in the database */
  protected tableName = 'chat_assistant_access'
  /** Knex connection instance */
  protected knex = db

  /**
   * Find all access entries for a specific assistant.
   * @param assistantId - UUID of the assistant
   * @returns Array of ChatAssistantAccess records for the assistant
   */
  async findByAssistantId(assistantId: string): Promise<ChatAssistantAccess[]> {
    // Query access entries filtered by assistant_id
    return this.getKnex().where({ assistant_id: assistantId })
  }

  /**
   * Find all assistant IDs accessible by a user (directly or via team membership).
   * @param userId - UUID of the user
   * @param teamIds - Array of team UUIDs the user belongs to
   * @returns Array of unique assistant IDs the user can access
   */
  async findAccessibleAssistantIds(userId: string, teamIds: string[]): Promise<string[]> {
    // Build query to find assistants accessible via user or team grants
    const query = this.getKnex()
      .select('assistant_id')
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

    // Extract assistant_id strings from result rows
    const rows = await query
    return rows.map((row: { assistant_id: string }) => row.assistant_id)
  }

  /**
   * Replace all access entries for an assistant with new entries (bulk upsert).
   * Deletes existing entries and inserts new ones within a transaction.
   * @param assistantId - UUID of the assistant
   * @param entries - Array of new access entries (entity_type + entity_id)
   * @param createdBy - UUID of the user performing the operation
   * @returns Array of newly created ChatAssistantAccess records
   */
  async bulkReplace(
    assistantId: string,
    entries: Array<{ entity_type: 'user' | 'team'; entity_id: string }>,
    createdBy: string
  ): Promise<ChatAssistantAccess[]> {
    // Use a transaction to ensure atomicity of delete + insert
    return db.transaction(async (trx) => {
      // Remove all existing access entries for this assistant
      await this.getKnex().where({ assistant_id: assistantId }).delete().transacting(trx)

      // If no new entries, return empty array
      if (entries.length === 0) {
        return []
      }

      // Build insert data with assistant_id and created_by
      const insertData = entries.map((entry) => ({
        assistant_id: assistantId,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        created_by: createdBy,
      }))

      // Insert all new entries and return created records
      return this.getKnex().insert(insertData).returning('*').transacting(trx)
    })
  }
}
