
/**
 * Search embed token model: stores API tokens for external search widget access.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { SearchEmbedToken } from '@/shared/models/types.js'

/**
 * @description SearchEmbedTokenModel — represents the 'search_embed_tokens' table.
 * Manages embed tokens that grant public access to search apps for external widget integrations.
 */
export class SearchEmbedTokenModel extends BaseModel<SearchEmbedToken> {
  /** Table name in the database */
  protected tableName = 'search_embed_tokens'
  /** Knex connection instance */
  protected knex = db

  /**
   * @description Insert a new embed token record and return the created row
   * @param {Partial<SearchEmbedToken>} data - Token data including app_id, token, name, is_active, created_by, expires_at
   * @returns {Promise<SearchEmbedToken>} The created token row with all columns
   */
  async insertToken(data: Partial<SearchEmbedToken>): Promise<SearchEmbedToken> {
    const [row] = await this.knex(this.tableName).insert(data).returning('*')
    return row
  }

  /**
   * @description List all tokens for a given search app, ordered by creation date descending
   * @param {string} resourceId - UUID of the search app (app_id)
   * @returns {Promise<SearchEmbedToken[]>} Array of token rows ordered newest first
   */
  async findByResource(resourceId: string): Promise<SearchEmbedToken[]> {
    return this.knex(this.tableName)
      .where({ app_id: resourceId })
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find an active, non-expired token by its raw token string
   * @param {string} tokenString - The 64-char hex token to look up
   * @returns {Promise<SearchEmbedToken | undefined>} The matching active token or undefined
   */
  async findActiveByToken(tokenString: string): Promise<SearchEmbedToken | undefined> {
    return this.knex(this.tableName)
      .where({ token: tokenString, is_active: true })
      .first()
  }

  /**
   * @description Find a token by its primary key ID
   * @param {string} tokenId - UUID of the token record
   * @returns {Promise<SearchEmbedToken | undefined>} The token row or undefined
   */
  async findByTokenId(tokenId: string): Promise<SearchEmbedToken | undefined> {
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
