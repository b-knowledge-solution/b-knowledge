
/**
 * Chat sessions model: stores per-user chat threads.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ChatSession } from '@/shared/models/types.js'

/**
 * @description ChatSessionModel — represents the 'chat_sessions' table.
 * Manages chat conversation metadata, ownership, and dialog association.
 * Each session belongs to a user and is linked to a chat assistant (dialog).
 */
export class ChatSessionModel extends BaseModel<ChatSession> {
  /** Table name in the database */
  protected tableName = 'chat_sessions'
  /** Knex connection instance */
  protected knex = db

  /**
   * @description Find internal chat sessions for a user with pagination, search, and date filtering
   * @param {string} userId - User ID to filter sessions
   * @param {string} userEmail - User email for display in results
   * @param {number} limit - Max results
   * @param {number} offset - Results to skip
   * @param {string} [search] - Optional search text
   * @param {string} [startDate] - Optional start date
   * @param {string} [endDate] - Optional end date
   * @returns {Promise<any[]>} Array of session records
   */
  async findByUserWithFilters(
    userId: string,
    userEmail: string,
    limit: number,
    offset: number,
    search?: string,
    startDate?: string,
    endDate?: string
  ): Promise<any[]> {
    // Build base query for internal chat sessions
    let query = this.knex(this.tableName)
      .select(
        'chat_sessions.id as session_id',
        'chat_sessions.created_at',
        this.knex.raw('? as user_email', [userEmail]),
        'chat_sessions.title'
      )
      .where('chat_sessions.user_id', userId)
      .orderBy('chat_sessions.created_at', 'desc')
      .limit(limit)
      .offset(offset)

    // Apply text search filter against session title or message content
    if (search) {
      query = query.where(builder => {
        builder.where('chat_sessions.title', 'ilike', `%${search}%`)
          .orWhereExists(function () {
            this.select('id').from('chat_messages')
              .whereRaw('chat_messages.session_id = chat_sessions.id')
              .where('content', 'ilike', `%${search}%`)
          })
      })
    }

    // Apply date range filters
    if (startDate) {
      query = query.where('chat_sessions.created_at', '>=', startDate)
    }
    if (endDate) {
      query = query.where('chat_sessions.created_at', '<=', `${endDate} 23:59:59`)
    }

    return query
  }

  /**
   * @description Find a session by ID verifying user ownership
   * @param {string} sessionId - Session UUID
   * @param {string} userId - User UUID for ownership check
   * @returns {Promise<any>} Session record or undefined
   */
  async findByIdAndUser(sessionId: string, userId: string): Promise<any> {
    return this.knex(this.tableName)
      .where({ id: sessionId, user_id: userId })
      .first()
  }

  /**
   * @description Find all sessions for a dialog belonging to a user, ordered by creation date descending
   * @param {string} dialogId - The dialog/assistant ID to filter by
   * @param {string} userId - The user ID to filter by
   * @returns {Promise<any[]>} Array of session records
   */
  async findByDialogAndUser(dialogId: string, userId: string): Promise<any[]> {
    return this.knex(this.tableName)
      .where({ dialog_id: dialogId, user_id: userId })
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Get IDs of sessions owned by a user from a given set of session IDs
   * @param {string[]} sessionIds - Candidate session IDs to check ownership for
   * @param {string} userId - The user ID for ownership verification
   * @returns {Promise<string[]>} Array of session IDs owned by the user
   */
  async findOwnedIds(sessionIds: string[], userId: string): Promise<string[]> {
    return this.knex(this.tableName)
      .whereIn('id', sessionIds)
      .andWhere('user_id', userId)
      .pluck('id')
  }

  /**
   * @description Delete sessions by their IDs
   * @param {string[]} ids - Array of session IDs to delete
   * @returns {Promise<number>} Number of deleted rows
   */
  async deleteByIds(ids: string[]): Promise<number> {
    return this.knex(this.tableName)
      .whereIn('id', ids)
      .delete()
  }

  /**
   * @description Get all session IDs for a dialog belonging to a specific user
   * @param {string} dialogId - The dialog/assistant ID
   * @param {string} userId - The user ID for ownership filtering
   * @returns {Promise<string[]>} Array of session IDs
   */
  async findIdsByDialogAndUser(dialogId: string, userId: string): Promise<string[]> {
    return this.knex(this.tableName)
      .where('dialog_id', dialogId)
      .andWhere('user_id', userId)
      .pluck('id')
  }
}
