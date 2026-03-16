
/**
 * Chat embed token model: stores API tokens for external chat widget access.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ChatEmbedToken } from '@/shared/models/types.js'

/**
 * ChatEmbedTokenModel
 * Represents the 'chat_embed_tokens' table.
 * Manages embed tokens that grant public access to chat dialogs.
 */
export class ChatEmbedTokenModel extends BaseModel<ChatEmbedToken> {
  /** Table name in the database */
  protected tableName = 'chat_embed_tokens'
  /** Knex connection instance */
  protected knex = db
}
