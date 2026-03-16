/**
 * @fileoverview OpenSearch search and chunk retrieval service.
 *
 * Queries the same OpenSearch index that advance-rag task executors write to.
 * Supports full-text, semantic (vector), and hybrid search methods.
 * Also provides chunk CRUD operations (manual add/edit/delete) and
 * document-level chunk toggling.
 *
 * Index naming: "ragflow_{SYSTEM_TENANT_ID}"
 * Chunks are filtered by kb_id (dataset_id).
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
 * Get the OpenSearch index name based on the system tenant ID.
 * @returns The index name string
 */
function getIndexName(): string {
    return `ragflow_${SYSTEM_TENANT_ID}`
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
 */
export class RagSearchService {
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
     * @param datasetId - The dataset (kb_id) to search within
     * @param query - The search query string
     * @param topK - Maximum number of results to return
     * @param extraFilters - Optional additional OpenSearch filter clauses
     * @returns Object with matching chunk results and total hit count from OpenSearch
     */
    async fullTextSearch(datasetId: string, query: string, topK: number, extraFilters: Record<string, unknown>[] = []): Promise<{ chunks: ChunkResult[]; total: number }> {
        const client = getClient()
        const res = await client.search({
            index: getIndexName(),
            body: {
                query: {
                    bool: {
                        must: [
                            { term: { kb_id: datasetId } },
                            { match: { content_with_weight: { query, minimum_should_match: '30%' } } },
                        ],
                        filter: [
                            { term: { available_int: 1 } },
                            ...extraFilters,
                        ],
                    },
                },
                size: topK,
                _source: ['content_with_weight', 'doc_id', 'docnm_kwd', 'page_num_int', 'position_int', 'img_id'],
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
     * @param datasetId - The dataset (kb_id) to search within
     * @param queryVector - The query embedding vector
     * @param topK - Maximum number of results to return
     * @param threshold - Minimum similarity score threshold
     * @param extraFilters - Optional additional OpenSearch filter clauses
     * @returns Object with matching chunk results above the threshold and total hit count
     */
    async semanticSearch(
        datasetId: string,
        queryVector: number[],
        topK: number,
        threshold: number,
        extraFilters: Record<string, unknown>[] = [],
    ): Promise<{ chunks: ChunkResult[]; total: number }> {
        const client = getClient()
        const res = await client.search({
            index: getIndexName(),
            body: {
                query: {
                    bool: {
                        must: [
                            { term: { kb_id: datasetId } },
                        ],
                        filter: [
                            { term: { available_int: 1 } },
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
                        ],
                    },
                },
                size: topK,
                _source: ['content_with_weight', 'doc_id', 'docnm_kwd', 'page_num_int', 'position_int', 'img_id'],
            },
        })

        const hitsTotal = res.body.hits.total
        const total = typeof hitsTotal === 'number' ? hitsTotal : hitsTotal?.value ?? 0
        const chunks = this.mapHits(res.body.hits.hits, 'semantic').filter(c => (c.score ?? 0) >= threshold)
        return { chunks, total }
    }

    /**
     * Hybrid search: combine full-text and semantic results with weighted scoring.
     * @param datasetId - The dataset (kb_id) to search within
     * @param query - The search query string
     * @param queryVector - The query embedding vector (optional)
     * @param topK - Maximum number of results to return
     * @param threshold - Minimum similarity score threshold for semantic results
     * @param vectorWeight - Weight for semantic scores (0-1). 0 = pure text, 1 = pure semantic. Default 0.5
     * @returns Object with merged chunk results sorted by weighted score and total hit count
     */
    async hybridSearch(
        datasetId: string,
        query: string,
        queryVector: number[] | null,
        topK: number,
        threshold: number,
        vectorWeight: number = 0.5,
        extraFilters: Record<string, unknown>[] = [],
    ): Promise<{ chunks: ChunkResult[]; total: number }> {
        const textResult = await this.fullTextSearch(datasetId, query, topK, extraFilters)

        if (!queryVector || queryVector.length === 0) {
            return textResult
        }

        const semanticResult = await this.semanticSearch(datasetId, queryVector, topK, threshold, extraFilters)

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
            seen.set(r.chunk_id, { ...r, score: weightedScore })
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
     * @param datasetId - The dataset (kb_id) to search within
     * @param req - The search request parameters
     * @param queryVector - Optional pre-computed query embedding
     * @returns Object with chunks array and total count
     */
    async search(
        datasetId: string,
        req: SearchRequest,
        queryVector?: number[] | null,
    ): Promise<{ chunks: ChunkResult[]; total: number }> {
        const method = req.method || 'full_text'
        const topK = req.top_k || 10
        const threshold = req.similarity_threshold || 0
        const vectorWeight = req.vector_similarity_weight ?? 0.5

        // Build extra OpenSearch filters from metadata_filter conditions
        const extraFilters = this.buildMetadataFilters(req.metadata_filter)

        let result: { chunks: ChunkResult[]; total: number }

        // Route to the appropriate search method
        switch (method) {
            case 'full_text':
                result = await this.fullTextSearch(datasetId, req.query, topK, extraFilters)
                break
            case 'semantic':
                // Fall back to full-text if no query vector is available
                if (!queryVector?.length) {
                    result = await this.fullTextSearch(datasetId, req.query, topK, extraFilters)
                } else {
                    result = await this.semanticSearch(datasetId, queryVector, topK, threshold, extraFilters)
                }
                break
            case 'hybrid':
            default:
                result = await this.hybridSearch(datasetId, req.query, queryVector ?? null, topK, threshold, vectorWeight, extraFilters)
                break
        }

        return result
    }

    /**
     * List chunks for a dataset, optionally filtered by document.
     * @param datasetId - The dataset (kb_id) to list chunks from
     * @param options - Pagination and filtering options
     * @returns Paginated chunk results with total count
     */
    async listChunks(
        datasetId: string,
        options: { doc_id?: string; page?: number; limit?: number } = {},
    ): Promise<{ chunks: ChunkResult[]; total: number; page: number; limit: number }> {
        const client = getClient()
        const page = options.page || 1
        const limit = options.limit || 20
        const offset = (page - 1) * limit

        const must: Record<string, unknown>[] = [{ term: { kb_id: datasetId } }]
        if (options.doc_id) {
            must.push({ term: { doc_id: options.doc_id } })
        }

        const res = await client.search({
            index: getIndexName(),
            body: {
                query: { bool: { must } },
                from: offset,
                size: limit,
                sort: [{ create_time: { order: 'desc' as const } }],
                _source: ['content_with_weight', 'content_ltks', 'doc_id', 'docnm_kwd', 'page_num_int', 'position_int', 'img_id'],
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
     * @param datasetId - UUID of the dataset
     * @param data - Chunk data with content and optional metadata
     * @returns Created chunk info with ID
     */
    async addChunk(datasetId: string, data: { content: string; doc_id?: string; important_keywords?: string[] }): Promise<{ chunk_id: string }> {
        const client = getClient()
        const body: Record<string, unknown> = {
            kb_id: datasetId,
            content_with_weight: data.content,
            content_ltks: data.content,
            doc_id: data.doc_id || '',
            docnm_kwd: '',
            create_time: new Date().toISOString(),
            create_timestamp_flt: Date.now() / 1000,
        }
        if (data.important_keywords?.length) {
            body.important_kwd = data.important_keywords
        }

        const res = await client.index({
            index: getIndexName(),
            body,
            refresh: 'true',
        })

        return { chunk_id: res.body._id }
    }

    /**
     * Update an existing chunk in OpenSearch.
     * @param datasetId - UUID of the dataset (for validation)
     * @param chunkId - OpenSearch document ID of the chunk
     * @param data - Partial update data
     * @returns Updated chunk info
     */
    async updateChunk(
        datasetId: string,
        chunkId: string,
        data: { content?: string; important_keywords?: string[]; available?: boolean },
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
        if (data.available !== undefined) {
            doc.available_int = data.available ? 1 : 0
        }

        await client.update({
            index: getIndexName(),
            id: chunkId,
            body: { doc },
            refresh: 'true',
        })

        return { chunk_id: chunkId, updated: true }
    }

    /**
     * Delete a chunk from OpenSearch.
     * @param datasetId - UUID of the dataset (for validation)
     * @param chunkId - OpenSearch document ID of the chunk
     */
    async deleteChunk(datasetId: string, chunkId: string): Promise<void> {
        const client = getClient()
        await client.delete({
            index: getIndexName(),
            id: chunkId,
            refresh: 'true',
        })
    }

    /**
     * Toggle availability of all chunks belonging to a document.
     * Updates the available_int field in OpenSearch for all chunks with the given doc_id.
     * @param datasetId - UUID of the dataset (kb_id) the document belongs to
     * @param docId - The document ID whose chunks should be toggled
     * @param available - True to enable, false to disable
     * @returns Number of chunks updated
     */
    async toggleDocumentAvailability(
        datasetId: string,
        docId: string,
        available: boolean,
    ): Promise<number> {
        const client = getClient()
        const res = await client.updateByQuery({
            index: getIndexName(),
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
     * @param docId - The document ID whose chunks should be removed
     * @returns Number of chunks deleted
     */
    async deleteDocumentChunks(docId: string): Promise<number> {
        try {
            const client = getClient()
            const res = await client.deleteByQuery({
                index: getIndexName(),
                body: {
                    query: {
                        term: { doc_id: docId.replace(/-/g, '') },
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
            return {
                chunk_id: hit._id,
                text: src.content_with_weight || src.content_ltks || '',
                doc_id: src.doc_id,
                doc_name: src.docnm_kwd,
                page_num: src.page_num_int || [],
                positions: src.position_int || [],
                score: hit._score ?? 0,
                ...(method ? { method } : {}),
                ...(src.img_id ? { img_id: src.img_id } : {}),
            }
        })
    }
}

/** Singleton instance of the OpenSearch search service */
export const ragSearchService = new RagSearchService()
