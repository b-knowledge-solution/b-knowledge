
/**
 * Chat file attachments model: stores file metadata for chat uploads.
 * @description Manages the chat_files table for images and PDFs attached to conversations.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'

/**
 * Shape of a row in the chat_files table.
 */
export interface ChatFile {
  id: string
  session_id: string
  message_id: string | null
  original_name: string
  mime_type: string
  size: number
  s3_key: string
  s3_bucket: string
  url: string | null
  uploaded_by: string | null
  created_at: Date
  expires_at: Date | null
}

/**
 * ChatFileModel
 * Represents the 'chat_files' table.
 * Manages file attachment metadata for chat conversations.
 */
export class ChatFileModel extends BaseModel<ChatFile> {
  /** Table name in the database */
  protected tableName = 'chat_files'
  /** Knex connection instance */
  protected knex = db

  /**
   * Find all files belonging to a session.
   * @param sessionId - The chat session ID
   * @returns Array of chat files for the session
   */
  async findBySessionId(sessionId: string): Promise<ChatFile[]> {
    return this.knex(this.tableName)
      .where('session_id', sessionId)
      .orderBy('created_at', 'asc')
  }

  /**
   * Find all files that have expired (expires_at < now).
   * @returns Array of expired chat files
   */
  async findExpired(): Promise<ChatFile[]> {
    return this.knex(this.tableName)
      .where('expires_at', '<', new Date())
      .whereNotNull('expires_at')
  }
}
