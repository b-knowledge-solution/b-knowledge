/**
 * @fileoverview Memory message service -- OpenSearch CRUD, hybrid search, and FIFO cleanup.
 *
 * Manages memory messages stored in per-tenant OpenSearch indices (memory_{tenantId}).
 * Provides insertion with FIFO enforcement, hybrid vector+text search, pagination,
 * status updates (forget/restore), and bulk deletion.
 *
 * @module modules/memory/services/memory-message
 */
import { Client } from '@opensearch-project/opensearch'
import { config } from '@/shared/config/index.js'
import { log } from '@/shared/services/logger.service.js'
import { ModelFactory } from '@/shared/models/factory.js'

// ============================================================================
// OpenSearch Client (follows rag-search.service.ts pattern)
// ============================================================================

const ES_HOST = config.opensearch.host
const ES_PASSWORD = config.opensearch.password

let osClient: Client | null = null

/**
 * @description Get or create the singleton OpenSearch client.
 * @returns {Client} The OpenSearch client instance
 */
function getClient(): Client {
  if (!osClient) {
    const opts: Record<string, unknown> = { node: ES_HOST }
    if (ES_PASSWORD) {
      opts['auth'] = { username: 'admin', password: ES_PASSWORD }
    }
    // Disable SSL verification for local development
    opts['ssl'] = { rejectUnauthorized: false }
    osClient = new Client(opts as any)
  }
  return osClient
}

// ============================================================================
// Types
// ============================================================================

/**
 * @description Shape of a memory message document stored in OpenSearch.
 *   Each message is a single document in the memory_{tenantId} index.
 */
export interface MemoryMessageDoc {
  /** Unique message identifier (used as OpenSearch _id) */
  message_id: string
  /** Parent memory pool UUID */
  memory_id: string
  /** Content text of the memory message */
  content: string
  /** Embedding vector for semantic search (dimension matches tenant embedding model) */
  content_embed?: number[]
  /** Memory type bitmask value: RAW=1, SEMANTIC=2, EPISODIC=4, PROCEDURAL=8 */
  message_type: number
  /** Active status: 1 = active, 0 = forgotten */
  status: number
  /** Tenant ID for multi-tenant isolation filtering */
  tenant_id: string
  /** Optional source reference (e.g., chat session or agent run ID) */
  source_id?: string
  /** UUID of the user who created this memory message (upstream port: user_id tracking) */
  user_id?: string
  /** ISO timestamp when the memory starts being valid */
  valid_at?: string
  /** ISO timestamp when the memory stops being valid */
  invalid_at?: string
  /** ISO timestamp of creation */
  created_at: string
}

/**
 * @description Search result item returned from hybrid memory search.
 */
export interface MemorySearchResult {
  /** OpenSearch document ID */
  id: string
  /** Message content text */
  content: string
  /** Memory type bitmask value */
  message_type: number
  /** Combined relevance score */
  score: number
  /** Parent memory pool UUID */
  memory_id: string
  /** ISO timestamp of creation */
  created_at: string
}

// ============================================================================
// Index Mapping
// ============================================================================

/** @description Approximate bytes per message for FIFO size calculation */
const APPROX_MESSAGE_SIZE_BYTES = 9000

/**
 * @description OpenSearch index mapping for memory messages.
 *   Uses knn_vector (dimension 1024) for semantic search and keyword/text fields
 *   for filtering and full-text search.
 */
const MEMORY_INDEX_MAPPING = {
  settings: {
    index: {
      knn: true,
    },
  },
  mappings: {
    properties: {
      message_id: { type: 'keyword' },
      memory_id: { type: 'keyword' },
      content: { type: 'text', analyzer: 'standard' },
      content_embed: {
        type: 'knn_vector',
        dimension: 1024,
        method: {
          name: 'hnsw',
          space_type: 'cosinesimil',
          engine: 'nmslib',
        },
      },
      message_type: { type: 'integer' },
      status: { type: 'integer' },
      tenant_id: { type: 'keyword' },
      source_id: { type: 'keyword' },
      valid_at: { type: 'date' },
      invalid_at: { type: 'date' },
      created_at: { type: 'date' },
    },
  },
}

// ============================================================================
// Service
// ============================================================================

/**
 * @description Singleton service managing memory messages in OpenSearch.
 *   Handles index lifecycle, CRUD, hybrid search, FIFO enforcement, and status updates.
 *   All methods require tenantId as first parameter for mandatory tenant isolation.
 */
class MemoryMessageService {
  /** Cache of tenant IDs whose indices have been verified to exist (Pitfall 6) */
  private indexCache = new Set<string>()

  /**
   * @description Ensure the memory OpenSearch index exists for a tenant.
   *   Uses an in-memory cache to skip redundant exists() calls after first verification.
   * @param {string} tenantId - Tenant/organization identifier
   * @returns {Promise<void>}
   */
  async ensureIndex(tenantId: string): Promise<void> {
    // Skip if we already verified this tenant's index exists this process lifecycle
    if (this.indexCache.has(tenantId)) return

    const client = getClient()
    const indexName = `memory_${tenantId}`

    try {
      const { body: exists } = await client.indices.exists({ index: indexName })

      if (!exists) {
        // Create the index with knn_vector mapping for semantic search
        // Cast mapping to any -- OpenSearch client types are overly strict for knn_vector
        await client.indices.create({
          index: indexName,
          body: MEMORY_INDEX_MAPPING as any,
        })
        log.info('Created memory index', { indexName, tenantId })
      }

      // Cache the result so subsequent calls skip the exists check
      this.indexCache.add(tenantId)
    } catch (error) {
      // Log but don't throw -- index may already exist from a race condition
      log.error('Failed to ensure memory index', {
        error: error instanceof Error ? error.message : String(error),
        tenantId,
      })
    }
  }

  /**
   * @description Insert a memory message into OpenSearch and enforce FIFO size limits.
   *   Sets created_at timestamp and uses message_id as the OpenSearch document _id.
   * @param {string} tenantId - Tenant/organization identifier
   * @param {Omit<MemoryMessageDoc, 'created_at'>} doc - Message document without created_at
   * @returns {Promise<void>}
   */
  async insertMessage(tenantId: string, doc: Omit<MemoryMessageDoc, 'created_at'>): Promise<void> {
    const client = getClient()
    const indexName = `memory_${tenantId}`

    // Set creation timestamp to current UTC time
    const fullDoc: MemoryMessageDoc = {
      ...doc,
      created_at: new Date().toISOString(),
    }

    await client.index({
      index: indexName,
      id: doc.message_id,
      body: fullDoc,
      refresh: 'true',
    })

    // Enforce FIFO forgetting policy after insertion
    await this.enforceFifo(tenantId, doc.memory_id)
  }

  /**
   * @description Enforce FIFO forgetting policy for a memory pool.
   *   Counts total messages for the pool, compares against pool memory_size,
   *   and deletes the oldest excess messages when the limit is exceeded.
   * @param {string} tenantId - Tenant/organization identifier
   * @param {string} memoryId - Memory pool UUID to enforce limits on
   * @returns {Promise<void>}
   */
  async enforceFifo(tenantId: string, memoryId: string): Promise<void> {
    try {
      // Fetch the pool's memory_size limit from the database
      const pool = await ModelFactory.memory.findById(memoryId)
      if (!pool) return

      const client = getClient()
      const indexName = `memory_${tenantId}`

      // Count total messages for this memory pool
      const countRes = await client.count({
        index: indexName,
        body: {
          query: { term: { memory_id: memoryId } },
        },
      })
      const count = countRes.body.count ?? 0

      // Calculate max allowed messages based on pool size and approximate message size
      const maxMessages = Math.floor(pool.memory_size / APPROX_MESSAGE_SIZE_BYTES)

      // Skip if within limits
      if (count <= maxMessages) return

      const excess = count - maxMessages
      log.info('FIFO enforcement: removing excess messages', {
        memoryId,
        count,
        maxMessages,
        excess,
      })

      // Find the oldest excess messages by sorting on created_at ascending
      const searchRes = await client.search({
        index: indexName,
        body: {
          query: { term: { memory_id: memoryId } },
          sort: [{ created_at: { order: 'asc' as const } }],
          size: excess,
          _source: false,
        },
      })

      const idsToDelete = (searchRes.body.hits.hits ?? []).map((hit: any) => hit._id as string)

      // Bulk delete the oldest messages by their IDs
      if (idsToDelete.length > 0) {
        await client.deleteByQuery({
          index: indexName,
          body: {
            query: { ids: { values: idsToDelete } },
          },
          refresh: true,
        })
      }
    } catch (error) {
      // FIFO enforcement is non-critical -- log and continue
      log.error('FIFO enforcement failed', {
        error: error instanceof Error ? error.message : String(error),
        tenantId,
        memoryId,
      })
    }
  }

  /**
   * @description Perform hybrid vector+text search over memory messages.
   *   Combines knn vector search with text match in a single OpenSearch query.
   *   Filters by memory_id, tenant_id, active status, and optional time range.
   * @param {string} tenantId - Tenant/organization identifier
   * @param {string} memoryId - Memory pool UUID to search within
   * @param {string} query - Text search query
   * @param {number[]} queryVector - Embedding vector for semantic search
   * @param {number} [topK=10] - Maximum number of results to return
   * @param {number} [vectorWeight=0.7] - Weight for vector similarity (0-1)
   * @returns {Promise<MemorySearchResult[]>} Array of search results sorted by relevance
   */
  async searchMemory(
    tenantId: string,
    memoryId: string,
    query: string,
    queryVector: number[],
    topK = 10,
    vectorWeight = 0.7,
  ): Promise<MemorySearchResult[]> {
    const client = getClient()
    const indexName = `memory_${tenantId}`
    const textWeight = 1 - vectorWeight

    const shouldClauses: Record<string, unknown>[] = []

    // Add text match with weight boost for keyword relevance
    if (query) {
      shouldClauses.push({
        match: { content: { query, boost: textWeight } },
      })
    }

    // Add knn vector search for semantic relevance
    if (queryVector.length > 0) {
      shouldClauses.push({
        knn: {
          content_embed: {
            vector: queryVector,
            k: topK,
          },
        },
      })
    }

    const res = await client.search({
      index: indexName,
      body: {
        query: {
          bool: {
            must: [
              { term: { memory_id: memoryId } },
            ],
            filter: [
              { term: { tenant_id: tenantId } },
              { term: { status: 1 } },
            ],
            should: shouldClauses,
          },
        },
        size: topK,
        _source: ['content', 'message_type', 'memory_id', 'created_at'],
      },
    })

    // Map OpenSearch hits to MemorySearchResult
    return (res.body.hits.hits ?? []).map((hit: any) => ({
      id: hit._id,
      content: hit._source?.content ?? '',
      message_type: hit._source?.message_type ?? 0,
      score: hit._score ?? 0,
      memory_id: hit._source?.memory_id ?? memoryId,
      created_at: hit._source?.created_at ?? '',
    }))
  }

  /**
   * @description List memory messages with pagination, optional keyword search, and type filter.
   * @param {string} tenantId - Tenant/organization identifier
   * @param {string} memoryId - Memory pool UUID
   * @param {number} page - Page number (1-based)
   * @param {number} pageSize - Number of items per page
   * @param {string} [keyword] - Optional keyword for content text search
   * @param {number} [messageType] - Optional memory type bitmask filter
   * @returns {Promise<{ items: MemoryMessageDoc[]; total: number }>} Paginated results
   */
  async listMessages(
    tenantId: string,
    memoryId: string,
    page: number,
    pageSize: number,
    keyword?: string,
    messageType?: number,
  ): Promise<{ items: MemoryMessageDoc[]; total: number }> {
    const client = getClient()
    const indexName = `memory_${tenantId}`

    // Build mandatory filter clauses for tenant isolation and pool scoping
    const filterClauses: Record<string, unknown>[] = [
      { term: { memory_id: memoryId } },
      { term: { tenant_id: tenantId } },
    ]

    // Add optional message type filter
    if (messageType !== undefined) {
      filterClauses.push({ term: { message_type: messageType } })
    }

    // Build the bool query with optional keyword match
    const mustClauses: Record<string, unknown>[] = []
    if (keyword) {
      mustClauses.push({ match: { content: keyword } })
    }

    const res = await client.search({
      index: indexName,
      body: {
        query: {
          bool: {
            must: mustClauses.length > 0 ? mustClauses : [{ match_all: {} }],
            filter: filterClauses,
          },
        },
        from: (page - 1) * pageSize,
        size: pageSize,
        sort: [{ created_at: { order: 'desc' } }],
      },
    })

    const hitsTotal = res.body.hits.total
    const total = typeof hitsTotal === 'number' ? hitsTotal : hitsTotal?.value ?? 0

    const items: MemoryMessageDoc[] = (res.body.hits.hits ?? []).map((hit: any) => ({
      ...hit._source,
      message_id: hit._id,
    }))

    return { items, total }
  }

  /**
   * @description Delete a single memory message from OpenSearch by its document ID.
   * @param {string} tenantId - Tenant/organization identifier for index resolution
   * @param {string} messageId - OpenSearch document ID of the message
   * @returns {Promise<void>}
   */
  async deleteMessage(tenantId: string, messageId: string): Promise<void> {
    const client = getClient()
    await client.delete({
      index: `memory_${tenantId}`,
      id: messageId,
      refresh: 'true',
    })
  }

  /**
   * @description Delete all messages belonging to a specific memory pool.
   *   Used during pool deletion to clean up associated OpenSearch data.
   * @param {string} memoryId - Memory pool UUID whose messages to delete
   * @param {string} tenantId - Tenant/organization identifier for index resolution
   * @returns {Promise<void>}
   */
  async deleteAllByMemory(memoryId: string, tenantId: string): Promise<void> {
    const client = getClient()
    try {
      await client.deleteByQuery({
        index: `memory_${tenantId}`,
        body: {
          query: { term: { memory_id: memoryId } },
        },
        refresh: true,
      })
    } catch (error) {
      // Log but don't throw -- index may not exist yet if no messages were ever stored
      log.warn('Failed to delete messages for memory pool', {
        error: error instanceof Error ? error.message : String(error),
        memoryId,
        tenantId,
      })
    }
  }

  /**
   * @description Update the status of a memory message (active/forgotten).
   *   Status 1 = active (searchable), status 0 = forgotten (excluded from search).
   * @param {string} tenantId - Tenant/organization identifier for index resolution
   * @param {string} messageId - OpenSearch document ID of the message
   * @param {number} status - New status value (0 = forgotten, 1 = active)
   * @returns {Promise<void>}
   */
  async updateMessageStatus(tenantId: string, messageId: string, status: number): Promise<void> {
    const client = getClient()
    await client.update({
      index: `memory_${tenantId}`,
      id: messageId,
      body: { doc: { status } },
      refresh: 'true',
    })
  }
}

/** @description Singleton memory message service instance */
export const memoryMessageService = new MemoryMessageService()
