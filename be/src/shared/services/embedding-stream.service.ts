/**
 * @fileoverview Valkey Stream bridge for query-time embedding via Python workers.
 * Publishes embedding requests via XADD and awaits responses via BRPOP
 * on a dedicated Redis client (per D-09).
 *
 * Uses a dedicated client for BRPOP (blocking operation) to avoid blocking
 * the main Redis client used for sessions, cache, etc.
 *
 * Protocol:
 *   - XADD embed:requests * requestId {uuid} text {query}
 *   - Python worker responds: LPUSH embed:response:{requestId} {json_vector}
 *   - Node.js awaits: BRPOP embed:response:{requestId} {timeout}
 *
 * @module shared/services/embedding-stream
 */
import { createClient, type RedisClientType } from 'redis'
import { config } from '@/shared/config/index.js'
import { log } from '@/shared/services/logger.service.js'
import crypto from 'crypto'

/** Stream key for embedding requests */
const EMBED_REQUEST_STREAM = 'embed:requests'
/** Response key prefix (per-request) */
const EMBED_RESPONSE_PREFIX = 'embed:response:'
/** Timeout in seconds for BRPOP wait */
const BRPOP_TIMEOUT_SECONDS = 30

/**
 * @description Service that communicates with Python embedding workers via Valkey Streams.
 * Publishes embedding requests to a stream and awaits responses on per-request keys.
 * Uses two dedicated Redis clients: one for non-blocking XADD, one for blocking BRPOP.
 */
class EmbeddingStreamService {
  private publishClient: RedisClientType | null = null
  private brpopClient: RedisClientType | null = null
  private initialized = false

  /**
   * @description Initialize dedicated Redis clients for the embedding stream.
   * Creates two clients: one for XADD (publish) and one for BRPOP (blocking read).
   * Must be called before embedText(). Safe to call multiple times (idempotent).
   * @returns {Promise<void>}
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    const redisUrl = config.redis.password
      ? `redis://:${config.redis.password}@${config.redis.host}:${config.redis.port}`
      : `redis://${config.redis.host}:${config.redis.port}`

    // Publish client for XADD (non-blocking)
    this.publishClient = createClient({ url: redisUrl }) as RedisClientType
    this.publishClient.on('error', (err) => {
      log.error('Embedding stream publish client error', { error: err.message })
    })
    await this.publishClient.connect()

    // Dedicated BRPOP client (blocking operations block the connection)
    this.brpopClient = createClient({ url: redisUrl }) as RedisClientType
    this.brpopClient.on('error', (err) => {
      log.error('Embedding stream BRPOP client error', { error: err.message })
    })
    await this.brpopClient.connect()

    this.initialized = true
    log.info('Embedding stream service initialized (2 dedicated Redis clients)')
  }

  /**
   * @description Embed a single text via the Valkey Stream bridge.
   * Publishes a request to embed:requests, awaits the Python worker's response
   * on embed:response:{requestId} via BRPOP.
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} Embedding vector as number array
   * @throws {Error} If worker times out or response is invalid
   */
  async embedText(text: string): Promise<number[]> {
    // Lazy-initialize on first call to avoid eager connection when not needed
    if (!this.initialized || !this.publishClient || !this.brpopClient) {
      await this.initialize()
    }

    const requestId = crypto.randomUUID()
    const responseKey = `${EMBED_RESPONSE_PREFIX}${requestId}`

    // Publish embedding request to stream
    await this.publishClient!.xAdd(EMBED_REQUEST_STREAM, '*', {
      requestId,
      text,
    })

    // Await response from Python worker (blocking pop with timeout)
    const result = await this.brpopClient!.brPop(responseKey, BRPOP_TIMEOUT_SECONDS)

    if (!result) {
      throw new Error(
        `Embedding request timed out after ${BRPOP_TIMEOUT_SECONDS}s (requestId=${requestId})`
      )
    }

    // Parse the JSON vector from the response
    const vector = JSON.parse(result.element) as number[]
    return vector
  }

  /**
   * @description Embed multiple texts via the stream bridge (sequential).
   * Each text is embedded individually per D-12 (no micro-batching).
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = []
    for (const text of texts) {
      const vector = await this.embedText(text)
      vectors.push(vector)
    }
    return vectors
  }

  /**
   * @description Gracefully close the dedicated Redis clients.
   * @returns {Promise<void>}
   */
  async shutdown(): Promise<void> {
    if (this.publishClient) {
      await this.publishClient.quit()
      this.publishClient = null
    }
    if (this.brpopClient) {
      await this.brpopClient.quit()
      this.brpopClient = null
    }
    this.initialized = false
    log.info('Embedding stream service shut down')
  }
}

/** Singleton embedding stream service instance */
export const embeddingStreamService = new EmbeddingStreamService()
