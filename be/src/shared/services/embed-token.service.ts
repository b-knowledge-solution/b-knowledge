
/**
 * @fileoverview Shared embed token service for managing API tokens
 * used by embeddable widgets (chat and search).
 *
 * Provides CRUD operations and validation for embed tokens stored
 * in per-module tables (chat_embed_tokens, search_embed_tokens).
 * Each module instantiates this service with its own table name and FK column.
 * Includes a 30-second in-memory validation cache for performance.
 *
 * @module shared/services/embed-token
 */

import { randomBytes } from 'crypto'
import { db } from '@/shared/db/knex.js'
import { log } from '@/shared/services/logger.service.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @description Generic embed token row returned from the database
 */
export interface EmbedTokenRow {
  id: string
  /** Foreign key to the parent resource (dialog_id or app_id depending on table) */
  [key: string]: unknown
  token: string
  name: string
  is_active: boolean
  created_by?: string | null
  created_at: Date
  expires_at?: Date | null
}

/** Cached validation result */
interface CachedToken {
  /** The validated token record */
  row: EmbedTokenRow
  /** Timestamp when this cache entry was created */
  cachedAt: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Validation cache TTL in milliseconds (30 seconds) */
const CACHE_TTL_MS = 30_000

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Service for managing embed tokens in a specific table.
 * Supports both chat_embed_tokens (dialog_id FK) and search_embed_tokens (app_id FK).
 * Includes an in-memory validation cache with 30-second TTL.
 */
export class EmbedTokenService {
  /** Database table name for this service instance */
  private tableName: string
  /** Column name for the parent resource foreign key */
  private fkColumn: string
  /** In-memory cache for validated tokens keyed by token string */
  private validationCache = new Map<string, CachedToken>()

  /**
   * @description Create a new EmbedTokenService instance.
   * @param {string} tableName - The database table to operate on (e.g. 'chat_embed_tokens')
   * @param {string} [fkColumn='app_id'] - The foreign key column name (e.g. 'dialog_id' or 'app_id')
   */
  constructor(tableName: string, fkColumn: string = 'app_id') {
    this.tableName = tableName
    this.fkColumn = fkColumn
  }

  /**
   * @description Generate a cryptographically secure 64-character hex token.
   * @returns {string} Random 64-char hex string
   */
  private generateToken(): string {
    return randomBytes(32).toString('hex')
  }

  /**
   * @description Create a new embed token for a resource.
   * @param {string} resourceId - UUID of the parent resource (dialog or search app)
   * @param {string} name - Human-readable label for the token
   * @param {string} createdBy - UUID of the user creating the token
   * @param {Date | null} [expiresAt] - Optional expiration date
   * @returns {Promise<EmbedTokenRow>} The created token row
   */
  async createToken(
    resourceId: string,
    name: string,
    createdBy: string,
    expiresAt?: Date | null
  ): Promise<EmbedTokenRow> {
    const token = this.generateToken()

    const [row] = await db(this.tableName)
      .insert({
        [this.fkColumn]: resourceId,
        token,
        name,
        is_active: true,
        created_by: createdBy,
        expires_at: expiresAt ?? null,
      })
      .returning('*')

    log.info('Embed token created', { table: this.tableName, resourceId, tokenId: row.id })
    return row
  }

  /**
   * @description List all tokens for a given resource.
   * Token values are masked for security — only first 8 and last 4 chars shown.
   * @param {string} resourceId - UUID of the parent resource
   * @returns {Promise<EmbedTokenRow[]>} Array of token rows with masked token values
   */
  async listTokens(resourceId: string): Promise<EmbedTokenRow[]> {
    const tokens = await db(this.tableName)
      .where({ [this.fkColumn]: resourceId })
      .orderBy('created_at', 'desc')

    // Mask token values for security
    return tokens.map((t: EmbedTokenRow) => ({
      ...t,
      token: `${t.token.slice(0, 8)}...${t.token.slice(-4)}`,
    }))
  }

  /**
   * @description Revoke (delete) a token by its ID.
   * Also removes any cached validation entry.
   * @param {string} tokenId - UUID of the token record to delete
   * @returns {Promise<void>}
   */
  async revokeToken(tokenId: string): Promise<void> {
    // Find the token first to clear from cache
    const row = await db(this.tableName).where({ id: tokenId }).first()
    if (row) {
      this.validationCache.delete(row.token)
    }

    await db(this.tableName).where({ id: tokenId }).delete()
    log.info('Embed token revoked', { table: this.tableName, tokenId })
  }

  /**
   * @description Validate a token string and return the associated record.
   * Uses a 30-second in-memory cache to avoid repeated DB lookups.
   * Checks that the token exists, is active, and is not expired.
   * @param {string} tokenString - The 64-char hex token to validate
   * @returns {Promise<EmbedTokenRow | undefined>} The token row if valid, undefined otherwise
   */
  async validateToken(tokenString: string): Promise<EmbedTokenRow | undefined> {
    // Check cache first
    const cached = this.validationCache.get(tokenString)
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
      return cached.row
    }

    const row = await db(this.tableName)
      .where({ token: tokenString, is_active: true })
      .first()

    if (!row) return undefined

    // Check expiration
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return undefined
    }

    // Cache the valid token
    this.validationCache.set(tokenString, { row, cachedAt: Date.now() })
    return row
  }

  /**
   * @description Find a token by its ID.
   * @param {string} tokenId - UUID of the token record
   * @returns {Promise<EmbedTokenRow | undefined>} The token row if found, undefined otherwise
   */
  async findById(tokenId: string): Promise<EmbedTokenRow | undefined> {
    return db(this.tableName).where({ id: tokenId }).first()
  }
}

/** Singleton service for search_embed_tokens table */
export const searchEmbedTokenService = new EmbedTokenService('search_embed_tokens', 'app_id')

/** Singleton service for chat_embed_tokens table */
export const chatEmbedTokenService = new EmbedTokenService('chat_embed_tokens', 'dialog_id')
