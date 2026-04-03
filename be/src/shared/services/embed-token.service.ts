
/**
 * @fileoverview Shared embed token service for managing API tokens
 * used by embeddable widgets (chat and search).
 *
 * Provides CRUD operations and validation for embed tokens stored
 * in per-module tables (chat_embed_tokens, search_embed_tokens).
 * Each module instantiates this service with its own model instance.
 * Includes a 30-second in-memory validation cache for performance.
 *
 * @module shared/services/embed-token
 */

import { randomBytes } from 'crypto'
import { ModelFactory } from '@/shared/models/factory.js'
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

/**
 * @description Interface for embed token model instances used by the service.
 * Both ChatEmbedTokenModel and SearchEmbedTokenModel implement these methods.
 */
export interface EmbedTokenModelInterface {
  /** Insert a new token and return the created row */
  insertToken(data: Record<string, unknown>): Promise<any>
  /** Find all tokens for a given resource, ordered by created_at desc */
  findByResource(resourceId: string): Promise<any[]>
  /** Find an active token by its raw token string */
  findActiveByToken(tokenString: string): Promise<any>
  /** Find a token by its primary key ID */
  findByTokenId(tokenId: string): Promise<any>
  /** Delete a token by its primary key ID */
  deleteByTokenId(tokenId: string): Promise<void>
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
 * Service for managing embed tokens via a model instance.
 * Supports both chat_embed_tokens (dialog_id FK) and search_embed_tokens (app_id FK).
 * Includes an in-memory validation cache with 30-second TTL.
 */
export class EmbedTokenService {
  /** Model instance providing database access for this service */
  private model: EmbedTokenModelInterface
  /** Column name for the parent resource foreign key */
  private fkColumn: string
  /** Human-readable label for logging (e.g. 'chat_embed_tokens') */
  private label: string
  /** In-memory cache for validated tokens keyed by token string */
  private validationCache = new Map<string, CachedToken>()

  /**
   * @description Create a new EmbedTokenService instance.
   * @param {EmbedTokenModelInterface} model - The model instance for database access
   * @param {string} fkColumn - The foreign key column name (e.g. 'dialog_id' or 'app_id')
   * @param {string} label - Human-readable label for logging purposes
   */
  constructor(model: EmbedTokenModelInterface, fkColumn: string, label: string) {
    this.model = model
    this.fkColumn = fkColumn
    this.label = label
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

    const row = await this.model.insertToken({
      [this.fkColumn]: resourceId,
      token,
      name,
      is_active: true,
      created_by: createdBy,
      expires_at: expiresAt ?? null,
    })

    log.info('Embed token created', { table: this.label, resourceId, tokenId: row.id })
    return row
  }

  /**
   * @description List all tokens for a given resource.
   * Token values are masked for security — only first 8 and last 4 chars shown.
   * @param {string} resourceId - UUID of the parent resource
   * @returns {Promise<EmbedTokenRow[]>} Array of token rows with masked token values
   */
  async listTokens(resourceId: string): Promise<EmbedTokenRow[]> {
    const tokens = await this.model.findByResource(resourceId)

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
    const row = await this.model.findByTokenId(tokenId)
    if (row) {
      this.validationCache.delete(row.token)
    }

    await this.model.deleteByTokenId(tokenId)
    log.info('Embed token revoked', { table: this.label, tokenId })
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

    const row = await this.model.findActiveByToken(tokenString)

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
    return this.model.findByTokenId(tokenId)
  }
}

/** Singleton service for search_embed_tokens table */
export const searchEmbedTokenService = new EmbedTokenService(
  ModelFactory.searchEmbedToken,
  'app_id',
  'search_embed_tokens'
)

/** Singleton service for chat_embed_tokens table */
export const chatEmbedTokenService = new EmbedTokenService(
  ModelFactory.chatEmbedToken,
  'dialog_id',
  'chat_embed_tokens'
)
