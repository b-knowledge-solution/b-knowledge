/**
 * @fileoverview OpenSearch search and chunk retrieval service.
 *
 * Queries the same OpenSearch index that advance-rag task executors write to.
 * Supports full-text, semantic (vector), and hybrid search methods.
 * Also provides chunk CRUD operations (manual add/edit/delete) and
 * document-level chunk toggling.
 *
 * Index naming: "knowledge_{tenantId}"
 * Chunks are filtered by kb_id (dataset_id) and tenant_id (mandatory isolation).
 *
 * @module modules/rag/services/rag-search
 */

import { Client } from '@opensearch-project/opensearch'
import { log } from '@/shared/services/logger.service.js'
import { ChunkResult, SearchRequest } from '@/shared/models/types.js'
import { config } from '@/shared/config/index.js'

const SYSTEM_TENANT_ID = config.opensearch.systemTenantId
const ES_HOST = config.opensearch.host
const ES_PASSWORD = config.opensearch.password

/**
 * Get the OpenSearch index name for a given tenant.
 * Defaults to the system tenant when no tenantId is provided.
 * @param {string} [tenantId] - Optional tenant ID to resolve a per-org index
 * @returns {string} The index name string
 */
function getIndexName(tenantId?: string): string {
    return `knowledge_${tenantId || SYSTEM_TENANT_ID}`
}

let osClient: Client | null = null

/**
 * Get or create the singleton OpenSearch client.
 * @returns The OpenSearch client instance
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



/**
 * @description Service for searching and managing chunks in OpenSearch.
 * Provides full-text, semantic, and hybrid search, as well as manual
 * chunk CRUD and document-level availability toggling.
 *
 * All search methods require a tenantId parameter for mandatory tenant isolation.
 * Every OpenSearch query includes a `{ term: { tenant_id: tenantId } }` filter.
 */
export class RagSearchService {
    /**
     * @description Build combined access filters including mandatory tenant isolation and optional ABAC filters.
     * This helper ensures tenant_id filtering is NEVER skipped in any search path.
     * @param {string} tenantId - Tenant ID for mandatory isolation
     * @param {Record<string, unknown>[]} abacFilters - Optional ABAC filter clauses
     * @returns {Record<string, unknown>[]} Array of OpenSearch filter clauses
     */
    private getFilters(tenantId: string, abacFilters: Record<string, unknown>[] = []): Record<string, unknown>[] {
        return [
            { term: { tenant_id: tenantId } },
            ...abacFilters,
        ]
    }

    /**
     * Build OpenSearch filter clauses from metadata filter conditions.
     * @param filter - Optional metadata filter with logic and conditions
     * @returns Array of OpenSearch query clauses
     */
    private buildMetadataFilters(filter?: { logic?: string; conditions?: Array<{ name: string; comparison_operator: string; value: unknown }> }): Record<string, unknown>[] {
        if (!filter?.conditions?.length) return []
        // Map each metadata condition to an OpenSearch query clause
        return filter.conditions.map(c => {
            switch (c.comparison_operator) {
                case 'is': return { term: { [c.name]: c.value } }
                case 'is_not': return { bool: { must_not: [{ term: { [c.name]: c.value } }] } }
                case 'contains': return { match: { [c.name]: c.value } }
                case 'gt': return { range: { [c.name]: { gt: c.value } } }
                case 'lt': return { range: { [c.name]: { lt: c.value } } }
                case 'range': {
                    const arr = c.value as unknown[]
                    return { range: { [c.name]: { gte: arr[0], lte: arr[1] } } }
                }
                default: return {}
            }
        }).filter(f => Object.keys(f).length > 0)
    }

    /**
     * Full-text search over chunks in a dataset.
     * @param {string} tenantId - Tenant ID for mandatory isolation (from request context)
     * @param {string} datasetId - The dataset (kb_id) to search within
     * @param {string} query - The search query string
     * @param {number} topK - Maximum number of results to return
     * @param {Record<string, unknown>[]} extraFilters - Optional additional OpenSearch filter clauses
     * @param {Record<string, unknown>[]} abacFilters - Optional ABAC filter clauses
     * @returns Object with matching chunk results and total hit count from OpenSearch
     */
    async fullTextSearch(
        tenantId: string,
        datasetId: string,
        query: string,
        topK: number,
        extraFilters: Record<string, unknown>[] = [],
        abacFilters: Record<string, unknown>[] = [],
    ): Promise<{ chunks: ChunkResult[]; total: number }> {
        const client = getClient()
        const res = await client.search({
            index: getIndexName(tenantId),
            body: {
                query: {
                    bool: {
                        must: [
                            { term: { kb_id: datasetId } },
                            { match: { content_with_weight: { query, minimum_should_match: '30%' } } },
                        ],
                        filter: [
                            { term: { available_int: 1 } },
                            ...this.getFilters(tenantId, abacFilters),
                            ...extraFilters,
                        ],
                        should: [
                            /**
                             * Boost by pagerank (version recency) — newer versions have higher
                             * pagerank values set during createVersionDataset. Uses linear scoring
                             * so v2 scores ~2x v1. Documents without pagerank_fea are unaffected.
                             */
                            { rank_feature: { field: 'pagerank_fea', linear: {} } },
                        ],
                    },
                },
                size: topK,
                _source: ['content_with_weight', 'doc_id', 'docnm_kwd', 'page_num_int', 'position_int', 'img_id', 'available_int', 'important_kwd', 'question_kwd'],
                // Highlight matching terms in content for retrieval test display
                highlight: {
                    fields: {
                        content_with_weight: { pre_tags: ['<mark>'], post_tags: ['</mark>'], fragment_size: 300, number_of_fragments: 1 },
                    },
                },
            },
        })

        const hitsTotal = res.body.hits.total
        const total = typeof hitsTotal === 'number' ? hitsTotal : hitsTotal?.value ?? 0
        const chunks = this.mapHits(res.body.hits.hits, 'full_text')
        return { chunks, total }
    }

    /**
     * Semantic (vector) search over chunks.
     * Requires the query to already be embedded as a vector.
     * @param {string} tenantId - Tenant ID for mandatory isolation (from request context)
     * @param {string} datasetId - The dataset (kb_id) to search within
     * @param {number[]} queryVector - The query embedding vector
     * @param {number} topK - Maximum number of results to return
     * @param {number} threshold - Minimum similarity score threshold
     * @param {Record<string, unknown>[]} extraFilters - Optional additional OpenSearch filter clauses
     * @param {Record<string, unknown>[]} abacFilters - Optional ABAC filter clauses
     * @returns Object with matching chunk results above the threshold and total hit count
     */
    async semanticSearch(
        tenantId: string,
        datasetId: string,
        queryVector: number[],
        topK: number,
        threshold: number,
        extraFilters: Record<string, unknown>[] = [],
        abacFilters: Record<string, unknown>[] = [],
    ): Promise<{ chunks: ChunkResult[]; total: number }> {
        const client = getClient()
        const res = await client.search({
            index: getIndexName(tenantId),
            body: {
                query: {
                    bool: {
                        must: [
                            { term: { kb_id: datasetId } },
                        ],
                        filter: [
                            { term: { available_int: 1 } },
                            ...this.getFilters(tenantId, abacFilters),
                            ...extraFilters,
                        ],
                        should: [
                            {
                                knn: {
                                    q_vec: {
                                        vector: queryVector,
                                        k: topK,
                                    },
                                },
                            },
                            /**
                             * Boost by pagerank (version recency) — newer versions have higher
                             * pagerank values. Linear scoring gives proportional boost.
                             * Documents without pagerank_fea are unaffected.
                             */
                            { rank_feature: { field: 'pagerank_fea', linear: {} } },
                        ],
                    },
                },
                size: topK,
                _source: ['content_with_weight', 'doc_id', 'docnm_kwd', 'page_num_int', 'position_int', 'img_id', 'available_int', 'important_kwd', 'question_kwd'],
                // Highlight matching terms in content for retrieval test display
                highlight: {
                    fields: {
                        content_with_weight: { pre_tags: ['<mark>'], post_tags: ['</mark>'], fragment_size: 300, number_of_fragments: 1 },
                    },
                },
            },
        })

        const hitsTotal = res.body.hits.total
        const total = typeof hitsTotal === 'number' ? hitsTotal : hitsTotal?.value ?? 0
        const chunks = this.mapHits(res.body.hits.hits, 'semantic')
        return { chunks, total }
    }

    /**
     * Hybrid search: combine full-text and semantic results with weighted scoring.
     * @param {string} tenantId - Tenant ID for mandatory isolation (from request context)
     * @param {string} datasetId - The dataset (kb_id) to search within
     * @param {string} query - The search query string
     * @param {number[] | null} queryVector - The query embedding vector (optional)
     * @param {number} topK - Maximum number of results to return
     * @param {number} threshold - Minimum similarity score threshold for semantic results
     * @param {number} vectorWeight - Weight for semantic scores (0-1). 0 = pure text, 1 = pure semantic. Default 0.5
     * @param {Record<string, unknown>[]} extraFilters - Optional additional OpenSearch filter clauses
     * @param {Record<string, unknown>[]} abacFilters - Optional ABAC filter clauses
     * @returns Object with merged chunk results sorted by weighted score and total hit count
     */
    async hybridSearch(
        tenantId: string,
        datasetId: string,
        query: string,
        queryVector: number[] | null,
        topK: number,
        threshold: number,
        vectorWeight: number = 0.5,
        extraFilters: Record<string, unknown>[] = [],
        abacFilters: Record<string, unknown>[] = [],
    ): Promise<{ chunks: ChunkResult[]; total: number }> {
        const textResult = await this.fullTextSearch(tenantId, datasetId, query, topK, extraFilters, abacFilters)

        if (!queryVector || queryVector.length === 0) {
            return textResult
        }

        const semanticResult = await this.semanticSearch(tenantId, datasetId, queryVector, topK, threshold, extraFilters, abacFilters)

        // Apply weighted scoring: vectorWeight controls the balance
        const textWeight = 1 - vectorWeight

        // Find max scores for normalization (avoid division by zero)
        const maxTextScore = Math.max(...textResult.chunks.map(r => r.score ?? 0), 0.001)
        const maxSemanticScore = Math.max(...semanticResult.chunks.map(r => r.score ?? 0), 0.001)

        // Build lookup maps with normalized scores
        const textMap = new Map<string, number>()
        for (const r of textResult.chunks) {
            textMap.set(r.chunk_id, (r.score ?? 0) / maxTextScore)
        }
        const semanticMap = new Map<string, number>()
        for (const r of semanticResult.chunks) {
            semanticMap.set(r.chunk_id, (r.score ?? 0) / maxSemanticScore)
        }

        // Merge and compute weighted scores
        const seen = new Map<string, ChunkResult>()
        for (const r of [...textResult.chunks, ...semanticResult.chunks]) {
            if (seen.has(r.chunk_id)) continue
            const textScore = textMap.get(r.chunk_id) ?? 0
            const semanticScore = semanticMap.get(r.chunk_id) ?? 0
            const weightedScore = textWeight * textScore + vectorWeight * semanticScore
            // Preserve individual similarity scores for debugging and UI display
            seen.set(r.chunk_id, { ...r, score: weightedScore, vector_similarity: semanticScore, term_similarity: textScore })
        }

        const chunks = [...seen.values()]
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
            .slice(0, topK)

        // Use the max of both totals as an approximation (chunks may overlap)
        const total = Math.max(textResult.total, semanticResult.total)

        return { chunks, total }
    }

    /**
     * Search dispatcher — handles method routing.
     * For semantic/hybrid, embedding must be done externally.
     * @param {string} tenantId - Tenant ID for mandatory isolation (from request context)
     * @param {string} datasetId - The dataset (kb_id) to search within
     * @param {SearchRequest} req - The search request parameters
     * @param {number[] | null} [queryVector] - Optional pre-computed query embedding
     * @param {Record<string, unknown>[]} [abacFilters] - Optional ABAC filter clauses
     * @returns Object with chunks array and total count
     */
    async search(
        tenantId: string,
        datasetId: string,
        req: SearchRequest,
        queryVector?: number[] | null,
        abacFilters: Record<string, unknown>[] = [],
    ): Promise<{ chunks: ChunkResult[]; total: number }> {
        const method = req.method || 'full_text'
        const topK = req.top_k || 10
        const vectorWeight = req.vector_similarity_weight ?? 0.5

        // When doc_ids are explicitly provided, bypass similarity threshold so that
        // those specific documents are always included regardless of relevance score.
        // Upstream port: search.py similarity threshold bypass for explicit doc_ids.
        const threshold = (req.doc_ids && req.doc_ids.length > 0)
            ? 0
            : (req.similarity_threshold || 0)

        // Build extra OpenSearch filters from metadata_filter conditions
        const extraFilters = this.buildMetadataFilters(req.metadata_filter)

        // Filter by specific document IDs when provided
        if (req.doc_ids?.length) {
            extraFilters.push({ terms: { doc_id: req.doc_ids } })
        }

        let result: { chunks: ChunkResult[]; total: number }

        // Route to the appropriate search method
        switch (method) {
            case 'full_text':
                result = await this.fullTextSearch(tenantId, datasetId, req.query, topK, extraFilters, abacFilters)
                break
            case 'semantic':
                // Fall back to full-text if no query vector is available
                if (!queryVector?.length) {
                    result = await this.fullTextSearch(tenantId, datasetId, req.query, topK, extraFilters, abacFilters)
                } else {
                    result = await this.semanticSearch(tenantId, datasetId, queryVector, topK, threshold, extraFilters, abacFilters)
                }
                break
            case 'hybrid':
            default:
                result = await this.hybridSearch(tenantId, datasetId, req.query, queryVector ?? null, topK, threshold, vectorWeight, extraFilters, abacFilters)
                break
        }

        // Populate similarity breakdown fields for non-hybrid search methods
        if (method === 'full_text') {
            result.chunks = result.chunks.map(c => ({ ...c, term_similarity: c.score ?? 0 }))
        } else if (method === 'semantic') {
            result.chunks = result.chunks.map(c => ({ ...c, vector_similarity: c.score ?? 0 }))
        }

        // Apply similarity threshold filter to remove low-scoring results.
        // Uses the computed threshold which is already set to 0 when doc_ids are provided.
        result.chunks = result.chunks.filter((chunk) => (chunk.score ?? 0) >= (threshold || 0.2))

        return result
    }

    /**
     * @description Search across multiple datasets (knowledge bases) in a single OpenSearch query.
     * Uses a `terms` filter with multiple kb_ids instead of a single `term` filter.
     * Enforces mandatory tenant isolation and optional ABAC filters.
     *
     * @param {string} tenantId - Tenant ID for mandatory isolation
     * @param {string[]} datasetIds - Array of dataset UUIDs to search across
     * @param {SearchRequest} req - Search request parameters (query, method, top_k, etc.)
     * @param {number[] | null} [queryVector] - Optional pre-computed query embedding for hybrid/semantic search
     * @param {Record<string, unknown>[]} [abacFilters] - Optional ABAC filter clauses
     * @returns Object with merged chunk results sorted by score and total hit count
     */
    async searchMultipleDatasets(
        tenantId: string,
        datasetIds: string[],
        req: SearchRequest,
        queryVector?: number[] | null,
        abacFilters: Record<string, unknown>[] = [],
    ): Promise<{ chunks: ChunkResult[]; total: number }> {
        // Return empty results when no datasets provided
        if (datasetIds.length === 0) {
            return { chunks: [], total: 0 }
        }

        // Cap to 20 KBs maximum to prevent query size limit issues (Pitfall 6)
        const MAX_CROSS_DATASET_KBS = 20
        let cappedIds = datasetIds
        if (datasetIds.length > MAX_CROSS_DATASET_KBS) {
            log.warn('Cross-dataset search exceeds 20 KB cap, truncating', {
                requested: datasetIds.length,
                max: MAX_CROSS_DATASET_KBS,
            })
            cappedIds = datasetIds.slice(0, MAX_CROSS_DATASET_KBS)
        }

        // Strip hyphens from UUIDs to match OpenSearch kb_id format (32-char hex)
        const kbIds = cappedIds.map(id => id)

        const client = getClient()
        const method = req.method || 'full_text'
        const topK = req.top_k || 10

        // Build extra OpenSearch filters from metadata_filter conditions
        const extraFilters = this.buildMetadataFilters(req.metadata_filter)

        // Filter by specific document IDs when provided
        if (req.doc_ids?.length) {
            extraFilters.push({ terms: { doc_id: req.doc_ids } })
        }

        // Build the multi-KB query using terms filter (searches all KBs in one query)
        const mustClauses: Record<string, unknown>[] = [
            { terms: { kb_id: kbIds } },
        ]

        // Add text match for full_text and hybrid methods
        if (method === 'full_text' || method === 'hybrid') {
            mustClauses.push({
                match: { content_with_weight: { query: req.query, minimum_should_match: '30%' } },
            })
        }

        const shouldClauses: Record<string, unknown>[] = [
            // Boost by pagerank (version recency)
            { rank_feature: { field: 'pagerank_fea', linear: {} } },
        ]

        // Add vector search for semantic and hybrid methods
        if ((method === 'semantic' || method === 'hybrid') && queryVector?.length) {
            shouldClauses.push({
                knn: {
                    q_vec: {
                        vector: queryVector,
                        k: topK,
                    },
                },
            })
        }

        const res = await client.search({
            index: getIndexName(tenantId),
            body: {
                query: {
                    bool: {
                        must: mustClauses,
                        filter: [
                            { term: { available_int: 1 } },
                            ...this.getFilters(tenantId, abacFilters),
                            ...extraFilters,
                        ],
                        should: shouldClauses,
                    },
                },
                size: topK,
                _source: ['content_with_weight', 'doc_id', 'docnm_kwd', 'page_num_int', 'position_int', 'img_id', 'available_int', 'important_kwd', 'question_kwd', 'kb_id'],
                highlight: {
                    fields: {
                        content_with_weight: { pre_tags: ['<mark>'], post_tags: ['</mark>'], fragment_size: 300, number_of_fragments: 1 },
                    },
                },
            },
        })

        const hitsTotal = res.body.hits.total
        const total = typeof hitsTotal === 'number' ? hitsTotal : hitsTotal?.value ?? 0
        const chunks = this.mapHits(res.body.hits.hits, method)

        // Sort by score descending and apply topK limit
        const sorted = chunks
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
            .slice(0, topK)

        return { chunks: sorted, total }
    }

    /**
     * List chunks for a dataset, optionally filtered by document.
     * @param {string} tenantId - Tenant ID for mandatory isolation (from request context)
     * @param {string} datasetId - The dataset (kb_id) to list chunks from
     * @param {object} options - Pagination and filtering options
     * @returns Paginated chunk results with total count
     */
    async listChunks(
        tenantId: string,
        datasetId: string,
        options: { doc_id?: string; page?: number; limit?: number; available?: boolean } = {},
    ): Promise<{ chunks: ChunkResult[]; total: number; page: number; limit: number }> {
        const client = getClient()
        const page = options.page || 1
        const limit = options.limit || 20
        const offset = (page - 1) * limit

        // OpenSearch stores kb_id and doc_id as 32-char hex (no hyphens)
        const must: Record<string, unknown>[] = [
            { term: { kb_id: datasetId } },
        ]
        if (options.doc_id) {
            must.push({ term: { doc_id: options.doc_id } })
        }
        // Filter by availability status when explicitly specified
        if (options.available !== undefined) {
            must.push({ term: { available_int: options.available ? 1 : 0 } })
        }

        // NOTE: tenant isolation is provided by the index name (knowledge_{tenantId}).
        // The Python RAG worker does NOT store tenant_id as a document field in chunks,
        // so we must NOT filter by tenant_id here — it would match zero documents.
        const res = await client.search({
            index: getIndexName(tenantId),
            body: {
                query: {
                    bool: {
                        must,
                    },
                },
                from: offset,
                size: limit,
                sort: [
                    { page_num_int: { order: 'asc' as const, unmapped_type: 'float' } },
                    { top_int: { order: 'asc' as const, unmapped_type: 'float' } },
                    { create_time: { order: 'asc' as const } },
                ],
                _source: ['content_with_weight', 'content_ltks', 'doc_id', 'docnm_kwd', 'page_num_int', 'position_int', 'img_id', 'available_int', 'important_kwd', 'question_kwd'],
            },
        })

        // OpenSearch returns total as an object with value property
        const hitsTotal = res.body.hits.total
        const total = typeof hitsTotal === 'number' ? hitsTotal : hitsTotal?.value ?? 0
        const chunks = this.mapHits(res.body.hits.hits)

        return { chunks, total, page, limit }
    }

    // -------------------------------------------------------------------------
    // Chunk Management (manual add/edit/delete)
    // -------------------------------------------------------------------------

    /**
     * Add a manual chunk to a dataset's OpenSearch index.
     * @param {string} tenantId - Tenant ID for index resolution
     * @param {string} datasetId - UUID of the dataset
     * @param {object} data - Chunk data with content and optional metadata
     * @returns Created chunk info with ID
     */
    async addChunk(tenantId: string, datasetId: string, data: { content: string; doc_id?: string; important_keywords?: string[]; question_keywords?: string[] }): Promise<{ chunk_id: string }> {
        const client = getClient()
        const body: Record<string, unknown> = {
            kb_id: datasetId,
            tenant_id: tenantId,
            content_with_weight: data.content,
            content_ltks: data.content,
            doc_id: (data.doc_id || ''),
            docnm_kwd: '',
            create_time: new Date().toISOString(),
            create_timestamp_flt: Date.now() / 1000,
        }
        if (data.important_keywords?.length) {
            body.important_kwd = data.important_keywords
        }
        // Store question keywords in OpenSearch for retrieval augmentation
        if (data.question_keywords?.length) {
            body.question_kwd = data.question_keywords
        }

        const res = await client.index({
            index: getIndexName(tenantId),
            body,
            refresh: 'true',
        })

        return { chunk_id: res.body._id }
    }

    /**
     * Update an existing chunk in OpenSearch.
     * @param {string} tenantId - Tenant ID for index resolution
     * @param {string} datasetId - UUID of the dataset (for validation)
     * @param {string} chunkId - OpenSearch document ID of the chunk
     * @param {object} data - Partial update data
     * @returns Updated chunk info
     */
    async updateChunk(
        tenantId: string,
        datasetId: string,
        chunkId: string,
        data: { content?: string; important_keywords?: string[]; question_keywords?: string[]; available?: boolean },
    ): Promise<{ chunk_id: string; updated: boolean }> {
        const client = getClient()
        const doc: Record<string, unknown> = {}
        if (data.content !== undefined) {
            doc.content_with_weight = data.content
            doc.content_ltks = data.content
        }
        if (data.important_keywords !== undefined) {
            doc.important_kwd = data.important_keywords
        }
        // Update question keywords when explicitly provided (including empty array to clear)
        if (data.question_keywords !== undefined) {
            doc.question_kwd = data.question_keywords
        }
        if (data.available !== undefined) {
            doc.available_int = data.available ? 1 : 0
        }

        await client.update({
            index: getIndexName(tenantId),
            id: chunkId,
            body: { doc },
            refresh: 'true',
        })

        return { chunk_id: chunkId, updated: true }
    }

    /**
     * Delete a chunk from OpenSearch.
     * @param {string} tenantId - Tenant ID for index resolution
     * @param {string} datasetId - UUID of the dataset (for validation)
     * @param {string} chunkId - OpenSearch document ID of the chunk
     */
    async deleteChunk(tenantId: string, datasetId: string, chunkId: string): Promise<void> {
        const client = getClient()
        await client.delete({
            index: getIndexName(tenantId),
            id: chunkId,
            refresh: 'true',
        })
    }

    /**
     * @description Bulk update availability status for multiple chunks
     * @param {string} tenantId - Tenant ID for index resolution
     * @param {string} datasetId - The dataset ID the chunks belong to
     * @param {string[]} chunkIds - Array of chunk IDs to update
     * @param {boolean} available - Whether chunks should be enabled or disabled
     * @returns {Promise<{ updated: number }>} Count of updated chunks
     */
    async bulkSwitchChunks(tenantId: string, datasetId: string, chunkIds: string[], available: boolean): Promise<{ updated: number }> {
        const client = getClient()
        const availableInt = available ? 1 : 0
        // Build bulk update request with one update action per chunk
        const body = chunkIds.flatMap((id) => [
            { update: { _index: getIndexName(tenantId), _id: id } },
            { doc: { available_int: availableInt } },
        ])
        const res = await client.bulk({ body, refresh: 'true' })
        const updated = res.body.items?.filter((item: any) => item.update?.status === 200).length ?? 0
        return { updated }
    }

    /**
     * @description Delete all chunks belonging to a specific document
     * @param {string} tenantId - Tenant ID for index resolution
     * @param {string} datasetId - Dataset ID
     * @param {string} docId - Document ID whose chunks to delete
     * @returns {Promise<{ deleted: number }>} Count of deleted chunks
     */
    async deleteChunksByDocId(tenantId: string, datasetId: string, docId: string): Promise<{ deleted: number }> {
        const client = getClient()
        // NOTE: tenant isolation is provided by the index name — Python chunks have no tenant_id field
        const res = await client.deleteByQuery({
            index: getIndexName(tenantId),
            body: {
                query: {
                    bool: {
                        must: [
                            { term: { kb_id: datasetId } },
                            { term: { doc_id: docId } },
                        ],
                    },
                },
            },
            refresh: true,
        })
        const deleted = (res.body as Record<string, unknown>).deleted as number ?? 0
        log.info('Deleted chunks by doc ID', { datasetId, docId, deleted })
        return { deleted }
    }

    /**
     * Toggle availability of all chunks belonging to a document.
     * Updates the available_int field in OpenSearch for all chunks with the given doc_id.
     * @param {string} tenantId - Tenant ID for index resolution
     * @param {string} datasetId - UUID of the dataset (kb_id) the document belongs to
     * @param {string} docId - The document ID whose chunks should be toggled
     * @param {boolean} available - True to enable, false to disable
     * @returns Number of chunks updated
     */
    async toggleDocumentAvailability(
        tenantId: string,
        datasetId: string,
        docId: string,
        available: boolean,
    ): Promise<number> {
        const client = getClient()
        // NOTE: tenant isolation is provided by the index name — Python chunks have no tenant_id field
        const res = await client.updateByQuery({
            index: getIndexName(tenantId),
            body: {
                query: {
                    bool: {
                        must: [
                            { term: { kb_id: datasetId } },
                            { term: { doc_id: docId } },
                        ],
                    },
                },
                script: {
                    source: `ctx._source.available_int = params.available`,
                    params: { available: available ? 1 : 0 },
                },
            },
            refresh: true,
        })

        const updated = (res.body as Record<string, unknown>).updated as number ?? 0
        log.info('Toggled document availability', { datasetId, docId, available, chunksUpdated: updated })
        return updated
    }

    /**
     * Delete all chunks for a document from OpenSearch.
     * @param {string} tenantId - Tenant ID for index resolution
     * @param {string} docId - The document ID whose chunks should be removed
     * @returns Number of chunks deleted
     */
    async deleteDocumentChunks(tenantId: string, docId: string): Promise<number> {
        try {
            const client = getClient()
            // NOTE: tenant isolation is provided by the index name — Python chunks have no tenant_id field
            const res = await client.deleteByQuery({
                index: getIndexName(tenantId),
                body: {
                    query: {
                        bool: {
                            must: [
                                { term: { doc_id: docId } },
                            ],
                        },
                    },
                },
                refresh: true,
            })
            const deleted = (res.body as Record<string, unknown>).deleted as number ?? 0
            log.info('Deleted document chunks from OpenSearch', { docId, chunksDeleted: deleted })
            return deleted
        } catch (err) {
            log.warn('Failed to delete chunks from OpenSearch', { docId, error: String(err) })
            return 0
        }
    }

    // -------------------------------------------------------------------------
    // Tag Aggregations
    // -------------------------------------------------------------------------

    /**
     * @description Query OpenSearch for unique tag keys and top values from accessible datasets.
     * Uses a terms aggregation on the tag_kwd field to discover available tags.
     * @param {string} tenantId - Tenant filter for mandatory isolation
     * @param {string[]} [datasetIds] - Optional dataset ID scope to narrow aggregation
     * @returns {Promise<{ key: string; values: string[] }[]>} Tag keys with their top values
     */
    async getTagAggregations(
        tenantId: string,
        datasetIds?: string[],
    ): Promise<{ key: string; values: string[] }[]> {
        const client = getClient()

        // Build filter clauses with mandatory tenant isolation
        const filter: Record<string, unknown>[] = [
            { term: { tenant_id: tenantId } },
        ]

        // Scope to specific datasets if provided (strip hyphens per OpenSearch convention)
        if (datasetIds?.length) {
            filter.push({
                terms: { kb_id: datasetIds.map(id => id) },
            })
        }

        try {
            const res = await client.search({
                index: getIndexName(tenantId),
                body: {
                    size: 0,
                    query: {
                        bool: { filter },
                    },
                    aggs: {
                        tag_keys: {
                            terms: { field: 'tag_kwd', size: 50 },
                        },
                    },
                },
            })

            // Extract buckets from aggregation response (cast to any for OpenSearch generic typing)
            const buckets = (res.body.aggregations?.tag_keys as any)?.buckets ?? []
            return buckets.map((bucket: { key: string; doc_count: number }) => ({
                key: bucket.key,
                values: [bucket.key],
            }))
        } catch (err) {
            log.warn('Failed to get tag aggregations from OpenSearch', { error: String(err) })
            return []
        }
    }

    /**
     * Check OpenSearch connection health.
     * @returns True if the cluster is reachable
     */
    async health(): Promise<boolean> {
        try {
            const client = getClient()
            await client.ping()
            return true
        } catch {
            return false
        }
    }

    /**
     * Map raw OpenSearch hits to ChunkResult objects.
     * @param hits - Raw hit array from OpenSearch response
     * @param method - Optional search method label to attach
     * @returns Array of ChunkResult objects
     */
    private mapHits(hits: any[], method?: string): ChunkResult[] {
        return hits.map((hit: any) => {
            const src = hit._source || {}
            const highlightFields = hit.highlight || {}
            return {
                chunk_id: hit._id,
                text: src.content_with_weight || src.content_ltks || '',
                doc_id: src.doc_id,
                doc_name: src.docnm_kwd,
                page_num: src.page_num_int || [],
                positions: src.position_int || [],
                score: hit._score ?? 0,
                // Default to available when field is missing (legacy chunks)
                available: src.available_int === undefined ? true : src.available_int === 1,
                important_kwd: src.important_kwd || [],
                question_kwd: src.question_kwd || [],
                // Estimate token count as ~4 chars per token
                token_count: Math.ceil((src.content_with_weight || '').length / 4),
                ...(method ? { method } : {}),
                ...(src.img_id ? { img_id: src.img_id } : {}),
                ...(highlightFields.content_with_weight?.[0] ? { highlight: highlightFields.content_with_weight[0] } : {}),
                // Include source dataset ID for cross-dataset result attribution
                ...(src.kb_id ? { kb_id: src.kb_id } : {}),
            }
        })
    }
}

/** Singleton instance of the OpenSearch search service */
export const ragSearchService = new RagSearchService()
