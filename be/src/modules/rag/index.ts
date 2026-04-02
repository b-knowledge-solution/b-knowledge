/**
 * @fileoverview Barrel export for the RAG module.
 *
 * Re-exports all public services, routes, and types used by other modules.
 * Import from this barrel (`@/modules/rag/index.js`) rather than reaching
 * into internal files directly.
 *
 * @module modules/rag
 */

export { default as ragRoutes } from './routes/rag.routes.js';
export { ragService } from './services/rag.service.js';
export { ragDocumentService } from './services/rag-document.service.js';
export { datasetSyncService } from './services/dataset-sync.service.js';
export { ragRedisService } from './services/rag-redis.service.js';
export { ragStorageService } from './services/rag-storage.service.js';
export { ragSearchService } from './services/rag-search.service.js';
export { ragGraphragService } from './services/rag-graphrag.service.js';
export { ragDeepResearchService } from './services/rag-deep-research.service.js';
export type { GraphEntity, GraphRelation } from './services/rag-graphrag.service.js';
export type { DeepResearchOptions } from './services/rag-deep-research.service.js';
export { ragRerankService } from './services/rag-rerank.service.js';
export { ragCitationService } from './services/rag-citation.service.js';
export { ragSqlService } from './services/rag-sql.service.js';
export { converterQueueService } from './services/converter-queue.service.js';
export { queryLogService } from './services/query-log.service.js';
export type { CreateQueryLogData } from './services/query-log.service.js';
export type { AccessControl } from '@/shared/models/types.js';
