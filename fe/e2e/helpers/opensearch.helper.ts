/**
 * @fileoverview Direct OpenSearch query helper for E2E test verification.
 *
 * Bypasses the backend API to query OpenSearch directly, enabling tests
 * to verify chunk indexing, embedding vectors, and search behavior at
 * the storage layer. Used alongside API-level assertions to ensure the
 * full pipeline (parse -> chunk -> embed -> index) is working.
 *
 * Index naming follows the backend convention: "knowledge_{SYSTEM_TENANT_ID}"
 * where SYSTEM_TENANT_ID is a 32-char hex UUID (no hyphens).
 *
 * @module e2e/helpers/opensearch.helper
 */

/** OpenSearch base URL for direct queries */
const OPENSEARCH_URL = process.env.OPENSEARCH_URL || 'http://localhost:9201'

// E2E helper reads from env directly -- backend uses config.opensearch.systemTenantId
const SYSTEM_TENANT_ID = (
  process.env.SYSTEM_TENANT_ID || '00000000000000000000000000000001'
).replace(/-/g, '')

/**
 * @description Shape of a single chunk document stored in OpenSearch
 */
export interface ChunkDocument {
  _id: string
  _source: {
    content_with_weight?: string
    content_ltks?: string
    q_vec?: number[]
    kb_id?: string
    doc_id?: string
    docnm_kwd?: string
    page_num_int?: number[]
    position_int?: number[]
    available_int?: number
    important_kwd?: string[]
    question_kwd?: string[]
    create_time?: string
    create_timestamp_flt?: number
    img_id?: string
  }
}

/**
 * @description Simplified chunk result for test assertions
 */
export interface ChunkResult {
  chunk_id: string
  content: string
  kb_id: string
  doc_id: string
  doc_name: string
  has_embedding: boolean
  embedding_dim: number
  available: boolean
}

/**
 * @description Search result from OpenSearch text query
 */
export interface SearchResult {
  chunk_id: string
  content: string
  score: number
  doc_id: string
  doc_name: string
}

/**
 * @description Helper class for directly querying OpenSearch in E2E tests.
 * Provides methods to verify chunk indexing, embeddings, and search behavior
 * at the storage layer, bypassing the backend API.
 */
export class OpenSearchHelper {
  private baseUrl: string

  /**
   * @param {string} [baseUrl] - OpenSearch base URL (defaults to OPENSEARCH_URL env or localhost:9201)
   */
  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || OPENSEARCH_URL
  }

  /**
   * @description Get the OpenSearch index name for the system tenant.
   * Follows the backend convention: "knowledge_{SYSTEM_TENANT_ID}"
   * @returns {string} The index name
   */
  getIndexName(): string {
    return `knowledge_${SYSTEM_TENANT_ID}`
  }

  /**
   * @description Normalize a UUID to 32-char hex format (no hyphens).
   * OpenSearch stores doc_id and kb_id without hyphens, but the backend API
   * returns UUIDs with hyphens. This method ensures consistent format.
   * @param {string} uuid - UUID in any format (with or without hyphens)
   * @returns {string} 32-char hex UUID without hyphens
   */
  normalizeUuid(uuid: string): string {
    return uuid.replace(/-/g, '')
  }

  /**
   * @description Query OpenSearch for all chunks belonging to a specific document.
   * Uses term query on doc_id field with normalized UUID format.
   * @param {string} indexName - OpenSearch index name
   * @param {string} docId - Document UUID (will be normalized to 32-char hex)
   * @returns {Promise<ChunkResult[]>} Array of chunk results from the index
   */
  async getChunksByDocId(indexName: string, docId: string): Promise<ChunkResult[]> {
    // Normalize UUID to 32-char hex (no hyphens) to match OpenSearch storage format
    const normalizedDocId = this.normalizeUuid(docId)

    const response = await fetch(`${this.baseUrl}/${indexName}/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: {
          term: { doc_id: normalizedDocId },
        },
        size: 10000,
        _source: [
          'content_with_weight', 'content_ltks', 'q_vec', 'kb_id',
          'doc_id', 'docnm_kwd', 'available_int', 'important_kwd',
          'question_kwd', 'page_num_int', 'position_int',
        ],
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`OpenSearch getChunksByDocId failed (${response.status}): ${text}`)
    }

    const json = await response.json()
    const hits = json.hits?.hits || []

    return hits.map((hit: ChunkDocument) => this.mapChunkResult(hit))
  }

  /**
   * @description Perform a full-text search against the content_with_weight field,
   * filtered by kb_id (dataset ID). Used to verify chunks are searchable.
   * @param {string} indexName - OpenSearch index name
   * @param {string} query - Text search query
   * @param {string} kbId - Dataset/knowledge base UUID (will be normalized)
   * @returns {Promise<SearchResult[]>} Array of search results sorted by relevance
   */
  async searchChunks(indexName: string, query: string, kbId: string): Promise<SearchResult[]> {
    // Normalize kb_id to 32-char hex to match OpenSearch storage format
    const normalizedKbId = this.normalizeUuid(kbId)

    const response = await fetch(`${this.baseUrl}/${indexName}/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: {
          bool: {
            must: [
              { term: { kb_id: normalizedKbId } },
              { match: { content_with_weight: { query, minimum_should_match: '30%' } } },
            ],
            filter: [
              { term: { available_int: 1 } },
            ],
          },
        },
        size: 20,
        _source: ['content_with_weight', 'doc_id', 'docnm_kwd'],
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`OpenSearch searchChunks failed (${response.status}): ${text}`)
    }

    const json = await response.json()
    const hits = json.hits?.hits || []

    return hits.map((hit: any) => ({
      chunk_id: hit._id,
      content: hit._source?.content_with_weight || '',
      score: hit._score ?? 0,
      doc_id: hit._source?.doc_id || '',
      doc_name: hit._source?.docnm_kwd || '',
    }))
  }

  /**
   * @description Force an OpenSearch index refresh to make recently indexed
   * documents immediately searchable. By default, OpenSearch refreshes every
   * 1 second, but in tests we need immediate consistency.
   * @param {string} indexName - OpenSearch index name to refresh
   * @returns {Promise<void>}
   */
  async refreshIndex(indexName: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${indexName}/_refresh`, {
      method: 'POST',
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`OpenSearch refreshIndex failed (${response.status}): ${text}`)
    }
  }

  /**
   * @description Map a raw OpenSearch hit to a simplified ChunkResult for assertions.
   * @param {ChunkDocument} hit - Raw OpenSearch hit document
   * @returns {ChunkResult} Simplified chunk result
   */
  private mapChunkResult(hit: ChunkDocument): ChunkResult {
    const src = hit._source || {}
    const embedding = src.q_vec || []

    return {
      chunk_id: hit._id,
      content: src.content_with_weight || src.content_ltks || '',
      kb_id: src.kb_id || '',
      doc_id: src.doc_id || '',
      doc_name: src.docnm_kwd || '',
      has_embedding: Array.isArray(embedding) && embedding.length > 0,
      embedding_dim: Array.isArray(embedding) ? embedding.length : 0,
      available: src.available_int === undefined ? true : src.available_int === 1,
    }
  }
}

/**
 * @description Factory function to create an OpenSearchHelper with default settings.
 * @returns {OpenSearchHelper} Configured OpenSearch helper instance
 */
export function opensearchHelper(): OpenSearchHelper {
  return new OpenSearchHelper()
}
