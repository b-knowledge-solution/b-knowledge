
/**
 * Chat embed token model: stores API tokens for external chat widget access.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ChatEmbedToken } from '@/shared/models/types.js'

/**
 * @description ChatEmbedTokenModel — represents the 'chat_embed_tokens' table.
 * Manages embed tokens that grant public access to chat dialogs for external widget integrations.
 */
export class ChatEmbedTokenModel extends BaseModel<ChatEmbedToken> {
  /** Table name in the database */
  protected tableName = 'chat_embed_tokens'
  /** Knex connection instance */
  protected knex = db

  /**
   * @description Insert a new embed token record and return the created row
   * @param {Partial<ChatEmbedToken>} data - Token data including dialog_id, token, name, is_active, created_by, expires_at
   * @returns {Promise<ChatEmbedToken>} The created token row with all columns
   */
  async insertToken(data: Partial<ChatEmbedToken>): Promise<ChatEmbedToken> {
    const [row] = await this.knex(this.tableName).insert(data).returning('*')
    return row
  }

  /**
   * @description List all tokens for a given dialog, ordered by creation date descending
   * @param {string} resourceId - UUID of the dialog (dialog_id)
   * @returns {Promise<ChatEmbedToken[]>} Array of token rows ordered newest first
   */
  async findByResource(resourceId: string): Promise<ChatEmbedToken[]> {
    return this.knex(this.tableName)
      .where({ dialog_id: resourceId })
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find an active, non-expired token by its raw token string
   * @param {string} tokenString - The 64-char hex token to look up
   * @returns {Promise<ChatEmbedToken | undefined>} The matching active token or undefined
   */
  async findActiveByToken(tokenString: string): Promise<ChatEmbedToken | undefined> {
    return this.knex(this.tableName)
      .where({ token: tokenString, is_active: true })
      .first()
  }

  /**
   * @description Find a token by its primary key ID
   * @param {string} tokenId - UUID of the token record
   * @returns {Promise<ChatEmbedToken | undefined>} The token row or undefined
   */
  async findByTokenId(tokenId: string): Promise<ChatEmbedToken | undefined> {
    return this.knex(this.tableName).where({ id: tokenId }).first()
  }

  /**
   * @description Delete a token by its primary key ID
   * @param {string} tokenId - UUID of the token record to delete
   * @returns {Promise<void>}
   */
  async deleteByTokenId(tokenId: string): Promise<void> {
    await this.knex(this.tableName).where({ id: tokenId }).delete()
  }
}
