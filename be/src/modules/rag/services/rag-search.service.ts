/**
 * OpenSearch search and chunk retrieval service.
 *
 * Queries the same OpenSearch index that advance-rag task executors write to.
 * Index naming: "ragflow_{SYSTEM_TENANT_ID}"
 * Chunks are filtered by kb_id (dataset_id).
 */

import { Client } from '@opensearch-project/opensearch'
import { log } from '@/shared/services/logger.service.js'
import { ChunkResult, SearchRequest } from '@/shared/models/types.js'

const SYSTEM_TENANT_ID = process.env['SYSTEM_TENANT_ID'] || '00000000-0000-0000-0000-000000000001'
const ES_HOST = process.env['ES_HOST'] || 'http://localhost:9200'
const ES_PASSWORD = process.env['ES_PASSWORD'] || ''

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



export class RagSearchService {
    /**
     * Full-text search over chunks in a dataset.
     * @param datasetId - The dataset (kb_id) to search within
     * @param query - The search query string
     * @param topK - Maximum number of results to return
     * @returns Array of matching chunk results
     */
    async fullTextSearch(datasetId: string, query: string, topK: number): Promise<ChunkResult[]> {
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
                    },
                },
                size: topK,
                _source: ['content_with_weight', 'doc_id', 'docnm_kwd', 'page_num_int', 'position_int'],
            },
        })

        return this.mapHits(res.body.hits.hits, 'full_text')
    }

    /**
     * Semantic (vector) search over chunks.
     * Requires the query to already be embedded as a vector.
     * @param datasetId - The dataset (kb_id) to search within
     * @param queryVector - The query embedding vector
     * @param topK - Maximum number of results to return
     * @param threshold - Minimum similarity score threshold
     * @returns Array of matching chunk results above the threshold
     */
    async semanticSearch(
        datasetId: string,
        queryVector: number[],
        topK: number,
        threshold: number,
    ): Promise<ChunkResult[]> {
        const client = getClient()
        const res = await client.search({
            index: getIndexName(),
            body: {
                query: {
                    bool: {
                        must: [
                            { term: { kb_id: datasetId } },
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
                _source: ['content_with_weight', 'doc_id', 'docnm_kwd', 'page_num_int', 'position_int'],
            },
        })

        return this.mapHits(res.body.hits.hits, 'semantic').filter(c => (c.score ?? 0) >= threshold)
    }

    /**
     * Hybrid search: combine full-text and semantic results, keep highest score per chunk.
     * @param datasetId - The dataset (kb_id) to search within
     * @param query - The search query string
     * @param queryVector - The query embedding vector (optional)
     * @param topK - Maximum number of results to return
     * @param threshold - Minimum similarity score threshold for semantic results
     * @returns Merged and deduplicated chunk results sorted by score
     */
    async hybridSearch(
        datasetId: string,
        query: string,
        queryVector: number[] | null,
        topK: number,
        threshold: number,
    ): Promise<ChunkResult[]> {
        const textResults = await this.fullTextSearch(datasetId, query, topK)

        if (!queryVector || queryVector.length === 0) {
            return textResults
        }

        const semanticResults = await this.semanticSearch(datasetId, queryVector, topK, threshold)

        // Merge by chunk_id, keep highest score
        const seen = new Map<string, ChunkResult>()
        for (const r of [...textResults, ...semanticResults]) {
            const existing = seen.get(r.chunk_id)
            if (!existing || (r.score ?? 0) > (existing.score ?? 0)) {
                seen.set(r.chunk_id, r)
            }
        }

        return [...seen.values()]
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
            .slice(0, topK)
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

        let chunks: ChunkResult[]

        switch (method) {
            case 'full_text':
                chunks = await this.fullTextSearch(datasetId, req.query, topK)
                break
            case 'semantic':
                if (!queryVector?.length) {
                    chunks = await this.fullTextSearch(datasetId, req.query, topK)
                } else {
                    chunks = await this.semanticSearch(datasetId, queryVector, topK, threshold)
                }
                break
            case 'hybrid':
            default:
                chunks = await this.hybridSearch(datasetId, req.query, queryVector ?? null, topK, threshold)
                break
        }

        return { chunks, total: chunks.length }
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
                _source: ['content_with_weight', 'content_ltks', 'doc_id', 'docnm_kwd', 'page_num_int', 'position_int'],
            },
        })

        // OpenSearch returns total as an object with value property
        const hitsTotal = res.body.hits.total
        const total = typeof hitsTotal === 'number' ? hitsTotal : hitsTotal?.value ?? 0
        const chunks = this.mapHits(res.body.hits.hits)

        return { chunks, total, page, limit }
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
            }
        })
    }
}

export const ragSearchService = new RagSearchService()
