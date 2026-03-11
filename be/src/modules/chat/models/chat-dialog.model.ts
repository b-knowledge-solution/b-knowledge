
/**
 * Chat dialog model: stores RAGFlow dialog (chat assistant) configurations.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ChatDialog } from '@/shared/models/types.js'

/**
 * ChatDialogModel
 * Represents the 'chat_dialogs' table.
 * Manages dialog configurations for RAGFlow chat assistants.
 */
export class ChatDialogModel extends BaseModel<ChatDialog> {
  /** Table name in the database */
  protected tableName = 'chat_dialogs'
  /** Knex connection instance */
  protected knex = db
}
