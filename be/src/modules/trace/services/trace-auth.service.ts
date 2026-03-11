/**
 * @fileoverview Trace authentication service with Redis-backed email validation cache.
 *
 * Provides email validation against the user table with Redis caching
 * and distributed locking to reduce database load on high-volume trace endpoints.
 *
 * @module modules/trace/services/trace-auth
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { config } from '@/shared/config/index.js'
import { log } from '@/shared/services/logger.service.js'
import { createClient } from 'redis'

/**
 * Service for validating trace request emails with Redis cache/lock support.
 * @description Singleton that caches email validation results in Redis
 *   to avoid repeated database lookups on high-throughput trace ingestion.
 */
export class TraceAuthService {
  /** Redis client instance for caching */
  private redisClient: ReturnType<typeof createClient> | null = null
  /** Cache key prefix for email validation results */
  private readonly CACHE_PREFIX = 'kb:email-validation:'
  /** Lock key prefix for preventing cache stampedes */
  private readonly LOCK_PREFIX = 'kb:email-lock:'

  /**
   * Lazily connect to Redis; continue without cache on failure.
   * @returns Promise<ReturnType<typeof createClient> | null> - The Redis client or null.
   * @description Initializes and connects the Redis client if not already connected.
   */
  private async getRedisClient(): Promise<ReturnType<typeof createClient> | null> {
    // Return existing client if connected
    if (this.redisClient && this.redisClient.isReady) {
      return this.redisClient
    }

    try {
      // Create new client instance
      this.redisClient = createClient({ url: config.redis.url })

      // Handle client errors
      this.redisClient.on('error', (err) => {
        log.error('Trace auth Redis client error', { error: err.message })
      })

      // Connect to Redis
      await this.redisClient.connect()
      log.info('Trace auth Redis client connected')
      return this.redisClient
    } catch (error) {
      // Log warning but allow fallthrough to DB mode
      log.warn('Failed to connect Redis for trace auth caching', {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Generate cache key for email validation.
   * @param ipAddress - Request IP.
   * @param email - User email.
   * @returns string - The cache key.
   * @description Includes IP and email to throttle per-actor validation.
   */
  private getCacheKey(ipAddress: string, email: string): string {
    return `${this.CACHE_PREFIX}${ipAddress}:${email.toLowerCase()}`
  }

  /**
   * Generate lock key for cache population.
   * @param ipAddress - Request IP.
   * @param email - User email.
   * @returns string - The lock key.
   * @description Used to prevent cache stampedes on first-time validation.
   */
  private getLockKey(ipAddress: string, email: string): string {
    return `${this.LOCK_PREFIX}${ipAddress}:${email.toLowerCase()}`
  }

  /**
   * Retrieve validation result from Redis cache.
   * @param cacheKey - The cache key.
   * @returns Promise<boolean | null> - True/False if cached, null if miss or error.
   * @description Checks Redis for a previously cached validation result.
   */
  private async getEmailValidationFromCache(cacheKey: string): Promise<boolean | null> {
    const redis = await this.getRedisClient()
    if (!redis) return null

    try {
      // Fetch value from cache
      const cached = await redis.get(cacheKey)
      if (cached !== null) {
        return cached === 'true'
      }
      return null
    } catch {
      // Swallow errors on cache read
      return null
    }
  }

  /**
   * Store validation result in Redis cache.
   * @param cacheKey - The cache key.
   * @param isValid - The validation result.
   * @returns Promise<void>
   * @description Caches the result with a TTL to reduce database load.
   */
  private async setEmailValidationInCache(cacheKey: string, isValid: boolean): Promise<void> {
    const redis = await this.getRedisClient()
    if (!redis) return

    try {
      // Set value with expiration
      await redis.setEx(
        cacheKey,
        config.externalTrace.cacheTtlSeconds,
        isValid ? 'true' : 'false'
      )
    } catch {
      // Ignore cache write errors
    }
  }

  /**
   * Acquire a distributed lock.
   * @param lockKey - The lock key.
   * @returns Promise<boolean> - True if lock acquired (or Redis unavailable), false if locked.
   * @description Tries to set a key with NX flag to acquire lock.
   */
  private async acquireLock(lockKey: string): Promise<boolean> {
    const redis = await this.getRedisClient()
    if (!redis) return true

    try {
      // Try to set key only if not exists
      const result = await redis.setNX(lockKey, 'locked')
      const acquired = !!result
      if (acquired) {
        // Set expiry on lock to prevent deadlocks
        await redis.pExpire(lockKey, config.externalTrace.lockTimeoutMs)
      }
      return acquired
    } catch {
      // Fail open on error
      return true
    }
  }

  /**
   * Release a distributed lock.
   * @param lockKey - The lock key.
   * @returns Promise<void>
   * @description Deletes the lock key.
   */
  private async releaseLock(lockKey: string): Promise<void> {
    const redis = await this.getRedisClient()
    if (!redis) return

    try {
      await redis.del(lockKey)
    } catch {
      // Ignore errors on release
    }
  }

  /**
   * Wait for a lock to be released with exponential backoff.
   * @param lockKey - The lock key to wait on.
   * @param maxAttempts - Maximum validation attempts.
   * @returns Promise<boolean> - True if lock cleared, false if still locked.
   * @description Polls Redis for lock existence.
   */
  private async waitForLock(lockKey: string, maxAttempts = 5): Promise<boolean> {
    const redis = await this.getRedisClient()
    if (!redis) return true

    for (let i = 0; i < maxAttempts; i++) {
      // Exponential backoff delay
      const delay = Math.pow(2, i) * 50
      await new Promise(resolve => setTimeout(resolve, delay))

      // Check if lock still exists
      const exists = await redis.exists(lockKey)
      if (!exists) {
        return true
      }
    }
    return false
  }

  /**
   * Validate email against user table with Redis cache/lock to reduce DB churn.
   * @param email - User email to validate.
   * @param ipAddress - Request IP.
   * @returns Promise<boolean> - True if user exists.
   * @description Checks cache first, then DB with locking to prevent stampedes.
   */
  async validateEmailWithCache(email: string, ipAddress: string): Promise<boolean> {
    const cacheKey = this.getCacheKey(ipAddress, email)
    const lockKey = this.getLockKey(ipAddress, email)

    // Check cache first
    const cachedResult = await this.getEmailValidationFromCache(cacheKey)
    if (cachedResult !== null) {
      return cachedResult
    }

    // Acquire lock for DB lookup
    const lockAcquired = await this.acquireLock(lockKey)

    if (!lockAcquired) {
      // Another process is validating; wait for it
      await this.waitForLock(lockKey)
      // Re-check cache after wait
      const resultAfterWait = await this.getEmailValidationFromCache(cacheKey)
      if (resultAfterWait !== null) {
        return resultAfterWait
      }
    }

    try {
      // Check database for user
      const user = await ModelFactory.user.findByEmail(email)
      const isValid = !!user
      // Update cache
      await this.setEmailValidationInCache(cacheKey, isValid)
      return isValid
    } finally {
      // Always release lock
      if (lockAcquired) {
        await this.releaseLock(lockKey)
      }
    }
  }

  /**
   * Graceful cleanup of Redis connection.
   * @returns Promise<void>
   * @description Closes the Redis connection if open.
   */
  async shutdown(): Promise<void> {
    if (this.redisClient && this.redisClient.isOpen) {
      await this.redisClient.quit()
    }
  }
}

/** Singleton instance of the trace auth service */
export const traceAuthService = new TraceAuthService()
