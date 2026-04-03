
/**
 * Broadcast message model: stores system-wide announcements with scheduling metadata.
 * 
 * Extended with custom methods for complex queries:
 * - findActive: Get currently active messages
 * - findActiveExcludingDismissed: Get active messages not dismissed by user
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { BroadcastMessage } from '@/shared/models/types.js'

/**
 * @description Manages system-wide broadcast messages with time-based activation and user dismissal tracking
 */
export class BroadcastMessageModel extends BaseModel<BroadcastMessage> {
  /** Table name in the database */
  protected tableName = 'broadcast_messages'
  /** Knex connection instance */
  protected knex = db

  /**
   * @description Find all currently active broadcast messages where is_active=true and within date range
   * @param {string | Date} now - Reference time for checking activity (defaults to current time)
   * @returns {Promise<BroadcastMessage[]>} Array of active messages sorted by creation date descending
   */
  async findActive(now: string | Date = new Date()): Promise<BroadcastMessage[]> {
    // Normalizing timestamp to ISO string for database comparison
    const timestamp = typeof now === 'string' ? now : now.toISOString()

    // Execute query with filtering conditions
    return this.knex(this.tableName)
      .where('is_active', true)
      .where('starts_at', '<=', timestamp)
      .where('ends_at', '>=', timestamp)
      // Sort to show newest messages first
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find active messages excluding those dismissed by a specific user within 24 hours using LEFT JOIN
   * @param {string} userId - ID of the user to check dismissals for
   * @param {string | Date} now - Reference time for checking activity (defaults to current time)
   * @returns {Promise<BroadcastMessage[]>} Array of relevant active messages
   */
  async findActiveExcludingDismissed(userId: string, now: string | Date = new Date()): Promise<BroadcastMessage[]> {
    // Normalizing timestamp to ISO string
    const timestamp = typeof now === 'string' ? now : now.toISOString()

    return this.knex(this.tableName)
      // Select all columns from broadcast_messages
      .select('broadcast_messages.*')
      // Left join with dismissal table to find matching dismissal records for this user
      .leftJoin('user_dismissed_broadcasts as d', function () {
        this.on('broadcast_messages.id', '=', 'd.broadcast_id')
          .andOn('d.user_id', '=', db.raw('?', [userId]))
      })
      // Filter for active status and date range
      .where('broadcast_messages.is_active', true)
      .where('broadcast_messages.starts_at', '<=', timestamp)
      .where('broadcast_messages.ends_at', '>=', timestamp)
      // Filter out messages that are either not dismissed (d.broadcast_id is null)
      // OR were dismissed more than 24 hours ago (re-show after 24h)
      .where(function () {
        this.whereNull('d.broadcast_id')
          .orWhereRaw("d.dismissed_at < NOW() - INTERVAL '24 hours'")
      })
      // Sort result by creation date
      .orderBy('broadcast_messages.created_at', 'desc')
  }
}
