
/**
 * Chat file attachments model: stores file metadata for chat uploads.
 * @description Manages the chat_files table for images and PDFs attached to conversations.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'

/**
 * @description Shape of a row in the chat_files table.
 * Represents file attachment metadata stored alongside chat conversations.
 */
export interface ChatFile {
  /** Unique file identifier (UUID) */
  id: string
  /** Chat session this file belongs to */
  session_id: string
  /** Message this file is attached to (null if not yet linked) */
  message_id: string | null
  /** Original filename as uploaded by the user */
  original_name: string
  /** MIME type of the file (e.g., image/png, application/pdf) */
  mime_type: string
  /** File size in bytes */
  size: number
  /** S3 object key for the stored file */
  s3_key: string
  /** S3 bucket name where the file is stored */
  s3_bucket: string
  /** Optional public URL (not typically used) */
  url: string | null
  /** User ID of the uploader */
  uploaded_by: string | null
  /** Timestamp when the file was uploaded */
  created_at: Date
  /** Expiration timestamp for automatic cleanup */
  expires_at: Date | null
}

/**
 * @description ChatFileModel — represents the 'chat_files' table.
 * Manages file attachment metadata for chat conversations with S3-backed storage.
 */
export class ChatFileModel extends BaseModel<ChatFile> {
  /** Table name in the database */
  protected tableName = 'chat_files'
  /** Knex connection instance */
  protected knex = db

  /**
   * @description Find all files belonging to a session.
   * @param {string} sessionId - The chat session ID
   * @returns {Promise<ChatFile[]>} Array of chat files for the session, ordered by creation time
   */
  async findBySessionId(sessionId: string): Promise<ChatFile[]> {
    return this.knex(this.tableName)
      .where('session_id', sessionId)
      .orderBy('created_at', 'asc')
  }

  /**
   * @description Find multiple files by their IDs.
   * @param {string[]} ids - Array of file UUIDs to look up
   * @returns {Promise<ChatFile[]>} Array of matching chat files
   */
  async findByIds(ids: string[]): Promise<ChatFile[]> {
    // Short-circuit for empty input to avoid unnecessary DB query
    if (ids.length === 0) return []
    return this.knex(this.tableName).whereIn('id', ids)
  }

  /**
   * @description Find all files that have expired (expires_at < now).
   * Used by the cleanup job to remove stale files from S3 and the database.
   * @returns {Promise<ChatFile[]>} Array of expired chat files
   */
  async findExpired(): Promise<ChatFile[]> {
    return this.knex(this.tableName)
      .where('expires_at', '<', new Date())
      .whereNotNull('expires_at')
  }
}
