/**
 * @fileoverview API Key service for generating, hashing, validating, and managing
 *   user-scoped API keys used for external API authentication.
 *
 * Keys follow the format `bk-<40 hex chars>` and are stored as SHA-256 hashes.
 * The plaintext key is returned only once at creation time.
 *
 * @module services/api-key
 */

import { createHash, randomBytes } from 'crypto'
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import type { ApiKey } from '../models/api-key.model.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @description Result of creating a new API key — includes the plaintext key
 *   which is returned only once and never stored.
 */
export interface CreateApiKeyResult {
  /** The API key record (without plaintext) */
  apiKey: ApiKey
  /** The full plaintext key — shown only once */
  plaintextKey: string
}

/** @description Cached validation entry with TTL */
interface CachedApiKey {
  row: ApiKey
  cachedAt: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Key prefix for all generated API keys */
const KEY_PREFIX = 'bk-'

/** Validation cache TTL in milliseconds (30 seconds) */
const CACHE_TTL_MS = 30_000

/** Debounce interval for last_used_at updates (60 seconds) */
const LAST_USED_DEBOUNCE_MS = 60_000

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * @description Service for managing API keys: generation, hashing, CRUD, and validation.
 *   Uses in-memory caching for fast validation during high-throughput API calls.
 */
class ApiKeyService {
  /** In-memory cache for validated keys, keyed by key hash */
  private validationCache = new Map<string, CachedApiKey>()
  /** Tracks last_used_at update timestamps to debounce DB writes */
  private lastUsedTimestamps = new Map<string, number>()

  /**
   * @description Generate a cryptographically secure API key in `bk-<40 hex>` format.
   * @returns {string} The plaintext API key
   */
  generateKey(): string {
    // 20 random bytes → 40 hex chars, prefixed with "bk-"
    return `${KEY_PREFIX}${randomBytes(20).toString('hex')}`
  }

  /**
   * @description Compute SHA-256 hash of a plaintext API key for storage.
   * @param {string} key - The plaintext API key
   * @returns {string} Hex-encoded SHA-256 hash
   */
  hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex')
  }

  /**
   * @description Create a new API key for a user. Returns the plaintext key once.
   * @param {string} userId - UUID of the owning user
   * @param {string} name - Human-readable label
   * @param {string[]} scopes - Permitted scopes (chat, search, retrieval)
   * @param {Date | null} [expiresAt] - Optional expiration date
   * @returns {Promise<CreateApiKeyResult>} The created record and plaintext key
   */
  async createApiKey(
    userId: string,
    name: string,
    scopes: string[],
    expiresAt?: Date | null
  ): Promise<CreateApiKeyResult> {
    const plaintextKey = this.generateKey()
    const keyHash = this.hashKey(plaintextKey)
    // Store only the prefix for display (e.g. "bk-a1b2c3d4")
    const keyPrefix = plaintextKey.slice(0, 11)

    const apiKey = await ModelFactory.apiKey.create({
      user_id: userId,
      name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes: scopes as any,
      is_active: true,
      expires_at: expiresAt ?? null,
    } as Partial<ApiKey>)

    log.info('API key created', { userId, keyId: apiKey.id, scopes })
    return { apiKey, plaintextKey }
  }

  /**
   * @description List all API keys for a user. Sensitive fields are excluded.
   * @param {string} userId - UUID of the user
   * @returns {Promise<ApiKey[]>} Array of API key records
   */
  async listApiKeys(userId: string): Promise<ApiKey[]> {
    return ModelFactory.apiKey.listByUser(userId)
  }

  /**
   * @description Update an API key's mutable fields (name, scopes, is_active).
   * @param {string} userId - UUID of the owning user (for ownership check)
   * @param {string} keyId - UUID of the API key
   * @param {object} data - Fields to update
   * @returns {Promise<ApiKey | undefined>} Updated record, or undefined if not found/not owned
   */
  async updateApiKey(
    userId: string,
    keyId: string,
    data: { name?: string; scopes?: string[]; is_active?: boolean }
  ): Promise<ApiKey | undefined> {
    // Verify ownership before updating
    const existing = await ModelFactory.apiKey.findById(keyId)
    if (!existing || existing.user_id !== userId) return undefined

    // Clear validation cache when key is deactivated
    if (data.is_active === false) {
      this.validationCache.delete(existing.key_hash)
    }

    const updated = await ModelFactory.apiKey.update(keyId, {
      ...data,
      updated_at: new Date(),
    } as Partial<ApiKey>)

    log.info('API key updated', { userId, keyId })
    return updated
  }

  /**
   * @description Delete an API key permanently.
   * @param {string} userId - UUID of the owning user (for ownership check)
   * @param {string} keyId - UUID of the API key
   * @returns {Promise<boolean>} True if deleted, false if not found/not owned
   */
  async deleteApiKey(userId: string, keyId: string): Promise<boolean> {
    // Verify ownership before deleting
    const existing = await ModelFactory.apiKey.findById(keyId)
    if (!existing || existing.user_id !== userId) return false

    // Clear from validation cache
    this.validationCache.delete(existing.key_hash)

    await ModelFactory.apiKey.delete(keyId)
    log.info('API key deleted', { userId, keyId })
    return true
  }

  /**
   * @description Validate a raw API key string and return the associated record.
   *   Uses a 30-second in-memory cache for performance during high-throughput calls.
   *   Checks: key exists, is active, is not expired.
   * @param {string} rawKey - The plaintext API key from the Authorization header
   * @returns {Promise<ApiKey | undefined>} The key record if valid, undefined otherwise
   */
  async validateApiKey(rawKey: string): Promise<ApiKey | undefined> {
    const keyHash = this.hashKey(rawKey)

    // Check cache first
    const cached = this.validationCache.get(keyHash)
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
      // Fire-and-forget last_used_at update (debounced)
      this.updateLastUsed(cached.row.id).catch(() => {})
      return cached.row
    }

    // Look up by hash in the database
    const row = await ModelFactory.apiKey.findByHash(keyHash)
    if (!row) return undefined

    // Check active status
    if (!row.is_active) return undefined

    // Check expiration
    if (row.expires_at && new Date(row.expires_at) < new Date()) return undefined

    // Cache the valid key
    this.validationCache.set(keyHash, { row, cachedAt: Date.now() })

    // Fire-and-forget last_used_at update (debounced)
    this.updateLastUsed(row.id).catch(() => {})

    return row
  }

  /**
   * @description Update the last_used_at timestamp, debounced to avoid excessive DB writes.
   * @param {string} keyId - UUID of the API key
   * @returns {Promise<void>}
   */
  private async updateLastUsed(keyId: string): Promise<void> {
    const lastUpdate = this.lastUsedTimestamps.get(keyId) ?? 0
    // Skip if updated within the debounce window
    if (Date.now() - lastUpdate < LAST_USED_DEBOUNCE_MS) return

    this.lastUsedTimestamps.set(keyId, Date.now())
    await ModelFactory.apiKey.update(keyId, {
      last_used_at: new Date(),
    } as Partial<ApiKey>)
  }
}

/** Singleton instance */
export const apiKeyService = new ApiKeyService()
