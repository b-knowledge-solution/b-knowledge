
/**
 * Tracks which users dismissed which broadcast messages to avoid re-showing.
 * 
 * Extended with custom method for upsert operation.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { UserDismissedBroadcast } from '@/shared/models/types.js'

/**
 * @description Tracks message dismissals by users to prevent re-showing dismissed broadcasts
 */
export class UserDismissedBroadcastModel extends BaseModel<UserDismissedBroadcast> {
  /** Table name in the database */
  protected tableName = 'user_dismissed_broadcasts'
  /** Knex connection instance */
  protected knex = db

  /**
   * @description Record a message dismissal using upsert (ON CONFLICT DO NOTHING) since only first dismissal matters
   * @param {string} userId - ID of the user dismissing the message
   * @param {string} broadcastId - ID of the message being dismissed
   * @returns {Promise<void>}
   */
  async upsertDismissal(userId: string, broadcastId: string): Promise<void> {
    // Perform insert with on conflict ignore strategy
    await this.knex(this.tableName)
      .insert({
        user_id: userId,
        broadcast_id: broadcastId,
        created_by: userId,
        updated_by: userId
      })
      .onConflict(['user_id', 'broadcast_id'])
      .ignore()
  }
}
