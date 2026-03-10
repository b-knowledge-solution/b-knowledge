
/**
 * Chat dialog access model: manages RBAC access entries for chat dialogs.
 * Stores user/team grants in the chat_dialog_access junction table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ChatDialogAccess } from '@/shared/models/types.js'

/**
 * ChatDialogAccessModel
 * Represents the 'chat_dialog_access' table.
 * Manages user and team access grants for chat dialog configurations.
 */
export class ChatDialogAccessModel extends BaseModel<ChatDialogAccess> {
  /** Table name in the database */
  protected tableName = 'chat_dialog_access'
  /** Knex connection instance */
  protected knex = db

  /**
   * Find all access entries for a specific dialog.
   * @param dialogId - UUID of the dialog
   * @returns Array of ChatDialogAccess records for the dialog
   */
  async findByDialogId(dialogId: string): Promise<ChatDialogAccess[]> {
    // Query access entries filtered by dialog_id
    return this.getKnex().where({ dialog_id: dialogId })
  }

  /**
   * Find all dialog IDs accessible by a user (directly or via team membership).
   * @param userId - UUID of the user
   * @param teamIds - Array of team UUIDs the user belongs to
   * @returns Array of unique dialog IDs the user can access
   */
  async findAccessibleDialogIds(userId: string, teamIds: string[]): Promise<string[]> {
    // Build query to find dialogs accessible via user or team grants
    const query = this.getKnex()
      .select('dialog_id')
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

    // Extract dialog_id strings from result rows
    const rows = await query
    return rows.map((row: { dialog_id: string }) => row.dialog_id)
  }

  /**
   * Replace all access entries for a dialog with new entries (bulk upsert).
   * Deletes existing entries and inserts new ones within a transaction.
   * @param dialogId - UUID of the dialog
   * @param entries - Array of new access entries (entity_type + entity_id)
   * @param createdBy - UUID of the user performing the operation
   * @returns Array of newly created ChatDialogAccess records
   */
  async bulkReplace(
    dialogId: string,
    entries: Array<{ entity_type: 'user' | 'team'; entity_id: string }>,
    createdBy: string
  ): Promise<ChatDialogAccess[]> {
    // Use a transaction to ensure atomicity of delete + insert
    return db.transaction(async (trx) => {
      // Remove all existing access entries for this dialog
      await this.getKnex().where({ dialog_id: dialogId }).delete().transacting(trx)

      // If no new entries, return empty array
      if (entries.length === 0) {
        return []
      }

      // Build insert data with dialog_id and created_by
      const insertData = entries.map((entry) => ({
        dialog_id: dialogId,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        created_by: createdBy,
      }))

      // Insert all new entries and return created records
      return this.getKnex().insert(insertData).returning('*').transacting(trx)
    })
  }
}
