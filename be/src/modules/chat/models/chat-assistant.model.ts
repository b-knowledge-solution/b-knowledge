
/**
 * Chat assistant model: stores chat assistant configurations.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ChatAssistant } from '@/shared/models/types.js'

/**
 * ChatAssistantModel
 * Represents the 'chat_assistants' table.
 * Manages assistant configurations for chat features.
 */
export class ChatAssistantModel extends BaseModel<ChatAssistant> {
  /** Table name in the database */
  protected tableName = 'chat_assistants'
  /** Knex connection instance */
  protected knex = db
}
