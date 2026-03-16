
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
}
