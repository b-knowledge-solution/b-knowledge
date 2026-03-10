/**
 * Elasticsearch search and chunk retrieval service.
 *
 * Queries the same ES index that advance-rag task executors write to.
 * Index naming: "ragflow_{SYSTEM_TENANT_ID}"
 * Chunks are filtered by kb_id (dataset_id).
 */

import { Client } from '@elastic/elasticsearch';
import { log } from '@/shared/services/logger.service.js';
import { ChunkResult, SearchRequest } from '@/shared/models/types.js';

const SYSTEM_TENANT_ID = process.env['SYSTEM_TENANT_ID'] || '00000000-0000-0000-0000-000000000001';
const ES_HOST = process.env['ES_HOST'] || 'http://localhost:9200';
const ES_PASSWORD = process.env['ES_PASSWORD'] || '';

function getIndexName(): string {
    return `ragflow_${SYSTEM_TENANT_ID}`;
}

let esClient: Client | null = null;

function getClient(): Client {
    if (!esClient) {
        const opts: Record<string, unknown> = { node: ES_HOST };
        if (ES_PASSWORD) {
            opts['auth'] = { username: 'elastic', password: ES_PASSWORD };
        }
        esClient = new Client(opts as any);
    }
    return esClient;
}



export class RagSearchService {
    /**
     * Full-text search over chunks in a dataset.
     */
    async fullTextSearch(datasetId: string, query: string, topK: number): Promise<ChunkResult[]> {
        const client = getClient();
        const res = await client.search({
            index: getIndexName(),
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
        });

        return this.mapHits(res.hits.hits, 'full_text');
    }

    /**
     * Semantic (vector) search over chunks.
     * Requires the query to already be embedded as a vector.
     */
    async semanticSearch(
        datasetId: string,
        queryVector: number[],
        topK: number,
        threshold: number,
    ): Promise<ChunkResult[]> {
        const client = getClient();
        const res = await client.search({
            index: getIndexName(),
            knn: {
                field: 'q_vec',
                query_vector: queryVector,
                k: topK,
                num_candidates: topK * 2,
                filter: { term: { kb_id: datasetId } },
            },
            size: topK,
            _source: ['content_with_weight', 'doc_id', 'docnm_kwd', 'page_num_int', 'position_int'],
        });

        return this.mapHits(res.hits.hits, 'semantic').filter(c => (c.score ?? 0) >= threshold);
    }

    /**
     * Hybrid search: combine full-text and semantic results, keep highest score per chunk.
     */
    async hybridSearch(
        datasetId: string,
        query: string,
        queryVector: number[] | null,
        topK: number,
        threshold: number,
    ): Promise<ChunkResult[]> {
        const textResults = await this.fullTextSearch(datasetId, query, topK);

        if (!queryVector || queryVector.length === 0) {
            return textResults;
        }

        const semanticResults = await this.semanticSearch(datasetId, queryVector, topK, threshold);

        // Merge by chunk_id, keep highest score
        const seen = new Map<string, ChunkResult>();
        for (const r of [...textResults, ...semanticResults]) {
            const existing = seen.get(r.chunk_id);
            if (!existing || (r.score ?? 0) > (existing.score ?? 0)) {
                seen.set(r.chunk_id, r);
            }
        }

        return [...seen.values()]
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
            .slice(0, topK);
    }

    /**
     * Search dispatcher — handles method routing.
     * For semantic/hybrid, embedding must be done externally.
     */
    async search(
        datasetId: string,
        req: SearchRequest,
        queryVector?: number[] | null,
    ): Promise<{ chunks: ChunkResult[]; total: number }> {
        const method = req.method || 'full_text';
        const topK = req.top_k || 10;
        const threshold = req.similarity_threshold || 0;

        let chunks: ChunkResult[];

        switch (method) {
            case 'full_text':
                chunks = await this.fullTextSearch(datasetId, req.query, topK);
                break;
            case 'semantic':
                if (!queryVector?.length) {
                    chunks = await this.fullTextSearch(datasetId, req.query, topK);
                } else {
                    chunks = await this.semanticSearch(datasetId, queryVector, topK, threshold);
                }
                break;
            case 'hybrid':
            default:
                chunks = await this.hybridSearch(datasetId, req.query, queryVector ?? null, topK, threshold);
                break;
        }

        return { chunks, total: chunks.length };
    }

    /**
     * List chunks for a dataset, optionally filtered by document.
     */
    async listChunks(
        datasetId: string,
        options: { doc_id?: string; page?: number; limit?: number } = {},
    ): Promise<{ chunks: ChunkResult[]; total: number; page: number; limit: number }> {
        const client = getClient();
        const page = options.page || 1;
        const limit = options.limit || 20;
        const offset = (page - 1) * limit;

        const must: Record<string, unknown>[] = [{ term: { kb_id: datasetId } }];
        if (options.doc_id) {
            must.push({ term: { doc_id: options.doc_id } });
        }

        const res = await client.search({
            index: getIndexName(),
            query: { bool: { must } },
            from: offset,
            size: limit,
            sort: [{ create_time: { order: 'desc' as const } }],
            _source: ['content_with_weight', 'content_ltks', 'doc_id', 'docnm_kwd', 'page_num_int', 'position_int'],
        });

        const total = typeof res.hits.total === 'number' ? res.hits.total : res.hits.total?.value ?? 0;
        const chunks = this.mapHits(res.hits.hits);

        return { chunks, total, page, limit };
    }

    /**
     * Check ES connection health.
     */
    async health(): Promise<boolean> {
        try {
            const client = getClient();
            await client.ping();
            return true;
        } catch {
            return false;
        }
    }

    private mapHits(hits: any[], method?: string): ChunkResult[] {
        return hits.map((hit: any) => {
            const src = hit._source || {};
            return {
                chunk_id: hit._id,
                text: src.content_with_weight || src.content_ltks || '',
                doc_id: src.doc_id,
                doc_name: src.docnm_kwd,
                page_num: src.page_num_int || [],
                positions: src.position_int || [],
                score: hit._score ?? 0,
                ...(method ? { method } : {}),
            };
        });
    }
}

export const ragSearchService = new RagSearchService();
