
/**
 * Agent embed token model: stores API tokens for external agent widget access.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'

/**
 * @description Agent embed token entity representing a row in the agent_embed_tokens table
 */
export interface AgentEmbedToken {
  id: string
  agent_id: string
  token: string
  name: string
  is_active: boolean
  created_by?: string | null
  created_at: Date
  expires_at?: Date | null
}

/**
 * @description AgentEmbedTokenModel — represents the 'agent_embed_tokens' table.
 * Manages embed tokens that grant public access to agents for external widget integrations.
 */
export class AgentEmbedTokenModel extends BaseModel<AgentEmbedToken> {
  /** Table name in the database */
  protected tableName = 'agent_embed_tokens'
  /** Knex connection instance */
  protected knex = db

  /**
   * @description Insert a new embed token record and return the created row
   * @param {Partial<AgentEmbedToken>} data - Token data including agent_id, token, name, is_active, created_by, expires_at
   * @returns {Promise<AgentEmbedToken>} The created token row with all columns
   */
  async insertToken(data: Partial<AgentEmbedToken>): Promise<AgentEmbedToken> {
    const [row] = await this.knex(this.tableName).insert(data).returning('*')
    return row
  }

  /**
   * @description List all tokens for a given agent, ordered by creation date descending
   * @param {string} resourceId - UUID of the agent (agent_id)
   * @returns {Promise<AgentEmbedToken[]>} Array of token rows ordered newest first
   */
  async findByResource(resourceId: string): Promise<AgentEmbedToken[]> {
    return this.knex(this.tableName)
      .where({ agent_id: resourceId })
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find an active, non-expired token by its raw token string
   * @param {string} tokenString - The 64-char hex token to look up
   * @returns {Promise<AgentEmbedToken | undefined>} The matching active token or undefined
   */
  async findActiveByToken(tokenString: string): Promise<AgentEmbedToken | undefined> {
    return this.knex(this.tableName)
      .where({ token: tokenString, is_active: true })
      .first()
  }

  /**
   * @description Find a token by its primary key ID
   * @param {string} tokenId - UUID of the token record
   * @returns {Promise<AgentEmbedToken | undefined>} The token row or undefined
   */
  async findByTokenId(tokenId: string): Promise<AgentEmbedToken | undefined> {
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
