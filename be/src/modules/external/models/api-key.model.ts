/**
 * @fileoverview ApiKey model for CRUD operations on the api_keys table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'

/**
 * @description Shape of a row in the api_keys table
 */
export interface ApiKey {
  /** Unique UUID identifier */
  id: string
  /** UUID of the owning user */
  user_id: string
  /** Human-readable label */
  name: string
  /** First 8 chars of the key for display */
  key_prefix: string
  /** SHA-256 hash of the full key */
  key_hash: string
  /** Permitted API scopes */
  scopes: string[]
  /** Whether the key is currently active */
  is_active: boolean
  /** Timestamp of last API request using this key */
  last_used_at: Date | null
  /** Optional expiration timestamp */
  expires_at: Date | null
  /** Creation timestamp */
  created_at: Date
  /** Last update timestamp */
  updated_at: Date
}

/**
 * @description Provides CRUD operations for the api_keys table.
 *   Stores hashed API keys for external API authentication.
 * @extends BaseModel<ApiKey>
 */
export class ApiKeyModel extends BaseModel<ApiKey> {
  protected tableName = 'api_keys'
  protected knex = db

  /**
   * @description Find an API key by its SHA-256 hash.
   *   Used during Bearer token validation to look up the key record.
   * @param {string} keyHash - SHA-256 hex digest of the raw API key
   * @returns {Promise<ApiKey | undefined>} The key record if found
   */
  async findByHash(keyHash: string): Promise<ApiKey | undefined> {
    return this.knex(this.tableName).where({ key_hash: keyHash }).first()
  }

  /**
   * @description List all API keys for a given user, ordered by creation date descending.
   * @param {string} userId - UUID of the user
   * @returns {Promise<ApiKey[]>} Array of API key records
   */
  async listByUser(userId: string): Promise<ApiKey[]> {
    return this.knex(this.tableName)
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
  }
}
