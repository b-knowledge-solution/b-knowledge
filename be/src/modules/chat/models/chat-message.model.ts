
/**
 * Chat messages model: stores message-level records linked to sessions.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ChatMessage } from '@/shared/models/types.js'

/**
 * @description ChatMessageModel — represents the 'chat_messages' table.
 * Stores individual messages (user prompts and AI responses) associated with chat sessions.
 * Each message includes role, content, optional citations, and feedback data.
 */
export class ChatMessageModel extends BaseModel<ChatMessage> {
  /** Table name in the database */
  protected tableName = 'chat_messages'
  /** Knex connection instance */
  protected knex = db

  /**
   * @description Get the first user message for each session (for preview display)
   * @param {string[]} sessionIds - Array of session IDs
   * @returns {Promise<any[]>} Array of { session_id, user_prompt } records
   */
  async findFirstUserPromptsBySessionIds(sessionIds: string[]): Promise<any[]> {
    return this.knex(this.tableName + ' as cm_first')
      .distinctOn('cm_first.session_id')
      .select('cm_first.session_id', 'cm_first.content as user_prompt')
      .where('cm_first.role', 'user')
      .whereIn('cm_first.session_id', sessionIds)
      .orderBy('cm_first.session_id')
      .orderBy('cm_first.timestamp', 'asc')
  }

  /**
   * @description Count messages per session for a set of session IDs
   * @param {string[]} sessionIds - Array of session IDs
   * @returns {Promise<any[]>} Array of { session_id, message_count } records
   */
  async countBySessionIds(sessionIds: string[]): Promise<any[]> {
    return this.knex(this.tableName + ' as cm_count')
      .select('cm_count.session_id')
      .count('* as message_count')
      .whereIn('cm_count.session_id', sessionIds)
      .groupBy('cm_count.session_id')
  }

  /**
   * @description Get all messages for a session ordered by timestamp
   * @param {string} sessionId - Session UUID
   * @returns {Promise<any[]>} Ordered array of message records
   */
  async findBySessionIdOrdered(sessionId: string): Promise<any[]> {
    return this.knex(this.tableName)
      .where('session_id', sessionId)
      .orderBy('timestamp', 'asc')
  }

  /**
   * @description Delete all messages belonging to the given session IDs
   * @param {string[]} sessionIds - Array of session IDs whose messages should be deleted
   * @returns {Promise<number>} Number of deleted message rows
   */
  async deleteBySessionIds(sessionIds: string[]): Promise<number> {
    return this.knex(this.tableName)
      .whereIn('session_id', sessionIds)
      .delete()
  }

  /**
   * @description Delete a specific message by its ID and session scope
   * @param {string} messageId - The message ID to delete
   * @param {string} sessionId - The session ID for scoping the deletion
   * @returns {Promise<number>} Number of deleted rows (0 or 1)
   */
  async deleteByIdAndSessionId(messageId: string, sessionId: string): Promise<number> {
    return this.knex(this.tableName)
      .where({ id: messageId, session_id: sessionId })
      .delete()
  }

  /**
   * @description Load conversation history for a session, excluding a specific message, with a limit
   * @param {string} sessionId - The session to load history from
   * @param {string} excludeMessageId - Message ID to exclude (typically the current user message)
   * @param {number} limit - Maximum number of history messages to return
   * @returns {Promise<any[]>} Ordered array of history messages
   */
  async findHistoryExcluding(sessionId: string, excludeMessageId: string, limit: number): Promise<any[]> {
    return this.knex(this.tableName)
      .where('session_id', sessionId)
      .where('id', '!=', excludeMessageId)
      .orderBy('timestamp', 'asc')
      .limit(limit)
  }

  /**
   * @description Count total messages in a single session
   * @param {string} sessionId - The session ID to count messages for
   * @returns {Promise<number>} Total message count
   */
  async countBySessionId(sessionId: string): Promise<number> {
    const result = await this.knex(this.tableName)
      .where('session_id', sessionId)
      .count('id as count')
      .first()
    return Number(result?.count) || 0
  }
}
