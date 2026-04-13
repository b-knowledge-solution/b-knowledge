/**
 * @fileoverview RAG module route definitions.
 *
 * Registers all dataset, document, chunk, search, and advanced task endpoints
 * under the `/api/rag` prefix (mounted in app/routes.ts).
 *
 * Auth requirements:
 * - Read endpoints: `requireAuth` (any authenticated user)
 * - Mutation endpoints: `requirePermission('datasets.edit')` (admin/manager)
 *
 * @module modules/rag/routes/rag
 */

import { Router } from 'express';
import multer from 'multer';
import { RagController } from '../controllers/rag.controller.js';
import { requireAuth, requirePermission } from '@/shared/middleware/auth.middleware.js';
import { validate } from '@/shared/middleware/validate.middleware.js';
import {
  createDatasetSchema, updateDatasetSchema, searchChunksSchema, uuidParamSchema, datasetAccessSchema,
  updateDatasetSettingsSchema, createChunkSchema, updateChunkSchema, chunkParamSchema, retrievalTestSchema,
  docParamSchema, toggleDocumentSchema,
  bulkParseDocumentsSchema, bulkToggleDocumentsSchema, bulkDeleteDocumentsSchema,
  bulkChunkSwitchSchema,
  changeDocumentParserSchema, webCrawlSchema,

  createVersionSchema,
  bulkMetadataSchema,
  graphRunSchema,
} from '../schemas/rag.schemas.js';

const router = Router();
const controller = new RagController();
// Use memory storage for file uploads — files are forwarded to S3 immediately
const upload = multer({ storage: multer.memoryStorage() });

// Bulk metadata — MUST be registered before /datasets/:id to avoid route parameter capture
router.post('/datasets/bulk-metadata', requirePermission('datasets.edit'), validate(bulkMetadataSchema), controller.bulkUpdateMetadata.bind(controller));

// Tag aggregations endpoint
router.get('/tags/aggregations', requireAuth, controller.getTagAggregations.bind(controller));

// Dataset endpoints
router.get('/datasets', requireAuth, controller.listDatasets.bind(controller));
router.get('/datasets/:id', requireAuth, controller.getDataset.bind(controller));
router.post('/datasets', requirePermission('datasets.create'), validate(createDatasetSchema), controller.createDataset.bind(controller));
router.put('/datasets/:id', requirePermission('datasets.edit'), validate({ params: uuidParamSchema, body: updateDatasetSchema }), controller.updateDataset.bind(controller));
router.delete('/datasets/:id', requirePermission('datasets.delete'), controller.deleteDataset.bind(controller));

// Dataset versioning endpoints
// Versioned upload creates new documents inside a dataset
router.post('/datasets/:id/versions', requirePermission('documents.create'), upload.array('files'), controller.uploadVersionDocuments.bind(controller));
router.get('/datasets/:id/versions', requireAuth, controller.listVersions.bind(controller));

// Dataset RBAC access control endpoints — sharing grants live under datasets.share
router.get('/datasets/:id/access', requirePermission('datasets.share'), controller.getDatasetAccess.bind(controller));
router.put('/datasets/:id/access', requirePermission('datasets.share'), validate({ params: uuidParamSchema, body: datasetAccessSchema }), controller.setDatasetAccess.bind(controller));



// Auto-detect field map from OpenSearch data
router.post('/datasets/:id/generate-field-map', requirePermission('datasets.edit'), validate({ params: uuidParamSchema }), controller.generateFieldMap.bind(controller));

// Dataset settings endpoints
router.get('/datasets/:id/settings', requireAuth, controller.getDatasetSettings.bind(controller));
router.put('/datasets/:id/settings', requirePermission('datasets.edit'), validate({ params: uuidParamSchema, body: updateDatasetSettingsSchema }), controller.updateDatasetSettings.bind(controller));

// Re-embed: queue background task to re-generate embeddings for all chunks (per D-14)
router.post('/datasets/:id/re-embed', requirePermission('datasets.reindex'), validate({ params: uuidParamSchema }), controller.reEmbedDataset.bind(controller));

// Chunk management endpoints (manual add/edit/delete)
router.post('/datasets/:id/chunks', requirePermission('chunks.create'), validate({ params: uuidParamSchema, body: createChunkSchema }), controller.createChunk.bind(controller));
router.put('/datasets/:id/chunks/:chunkId', requirePermission('chunks.edit'), validate({ params: chunkParamSchema, body: updateChunkSchema }), controller.updateChunk.bind(controller));
router.delete('/datasets/:id/chunks/:chunkId', requirePermission('chunks.delete'), controller.deleteChunk.bind(controller));
router.post('/datasets/:id/chunks/bulk-switch', requirePermission('chunks.edit'), validate({ params: uuidParamSchema, body: bulkChunkSwitchSchema }), controller.bulkSwitchChunks.bind(controller));

// Retrieval test endpoint — read-only diagnostic over a dataset's chunks
router.post('/datasets/:id/retrieval-test', requirePermission('datasets.view'), validate({ params: uuidParamSchema, body: retrievalTestSchema }), controller.retrievalTest.bind(controller));

// Document endpoints
router.get('/datasets/:id/documents', requireAuth, controller.listDocuments.bind(controller));
router.post('/datasets/:id/documents', requirePermission('documents.create'), upload.array('files'), controller.uploadDocuments.bind(controller));
router.post('/datasets/:id/documents/:docId/parse', requirePermission('documents.parse'), controller.parseDocument.bind(controller));
router.get('/datasets/:id/documents/:docId/download', requireAuth, controller.downloadDocument.bind(controller));
router.get('/datasets/:id/documents/:docId/status', requireAuth, controller.streamDocumentProgress.bind(controller));
router.delete('/datasets/:id/documents/:docId', requirePermission('documents.delete'), controller.deleteDocument.bind(controller));
router.patch('/datasets/:id/documents/:docId/toggle', requirePermission('documents.edit'), validate({ params: docParamSchema, body: toggleDocumentSchema }), controller.toggleDocumentAvailability.bind(controller));
// Per-document parser change
router.put('/datasets/:id/documents/:docId/parser', requirePermission('documents.edit'), validate({ params: docParamSchema, body: changeDocumentParserSchema }), controller.changeDocumentParser.bind(controller));

// Web crawl document creation
router.post('/datasets/:id/documents/web-crawl', requirePermission('documents.create'), validate({ params: uuidParamSchema, body: webCrawlSchema }), controller.webCrawlDocument.bind(controller));

// Bulk document operations
router.post('/datasets/:id/documents/bulk-parse', requirePermission('documents.bulk'), validate({ params: uuidParamSchema, body: bulkParseDocumentsSchema }), controller.bulkParseDocuments.bind(controller));
router.post('/datasets/:id/documents/bulk-toggle', requirePermission('documents.bulk'), validate({ params: uuidParamSchema, body: bulkToggleDocumentsSchema }), controller.bulkToggleDocuments.bind(controller));
router.post('/datasets/:id/documents/bulk-delete', requirePermission('documents.bulk'), validate({ params: uuidParamSchema, body: bulkDeleteDocumentsSchema }), controller.bulkDeleteDocuments.bind(controller));

// Search + Chunks — POST body carries a query; semantically a read over chunks
router.post('/datasets/:id/search', requirePermission('chunks.view'), validate({ params: uuidParamSchema, body: searchChunksSchema }), controller.searchChunks.bind(controller));
router.get('/datasets/:id/chunks', requireAuth, controller.listChunks.bind(controller));

// Advanced tasks (GraphRAG, RAPTOR, Mindmap)
router.post('/datasets/:id/:taskType(graphrag|raptor|mindmap)', requirePermission('datasets.advanced'), controller.runAdvancedTask.bind(controller));
router.get('/datasets/:id/:taskType(graphrag|raptor|mindmap)/status', requireAuth, controller.traceAdvancedTask.bind(controller));

// Document enrichment (keywords, questions, tags, metadata)
router.post('/datasets/:id/documents/:docId/:enrichType(keywords|questions|tags|metadata)', requirePermission('documents.enrich'), controller.runDocumentEnrichment.bind(controller));

// Task status
router.get('/tasks/:taskId/status', requireAuth, controller.getTaskStatus.bind(controller));

// Dataset overview & logs
router.get('/datasets/:id/overview', requireAuth, controller.getDatasetOverview.bind(controller));
router.get('/datasets/:id/logs', requireAuth, controller.getDatasetLogs.bind(controller));

// Document logs (process log modal)
router.get('/datasets/:id/documents/:docId/logs', requireAuth, controller.getDocumentLogs.bind(controller));

// Knowledge graph data (visualization)
router.get('/datasets/:id/graph', requireAuth, controller.getGraphData.bind(controller));

// GraphRAG metrics and trigger endpoints
router.get('/datasets/:datasetId/graph/metrics', requireAuth, controller.getGraphMetrics.bind(controller));
router.post('/datasets/:datasetId/graph/run', requirePermission('datasets.advanced'), validate(graphRunSchema), controller.triggerGraphRag.bind(controller));

// Metadata management
router.get('/datasets/:id/metadata', requireAuth, controller.getMetadata.bind(controller));
router.put('/datasets/:id/metadata', requirePermission('datasets.edit'), controller.updateMetadata.bind(controller));

// Chunk image serving — serves images extracted from documents during parsing
router.get('/images/:imageId', requireAuth, controller.getChunkImage.bind(controller));

// Converter job status
router.get('/datasets/:id/converter-jobs/:jobId/status', requireAuth, controller.getConverterJobStatus.bind(controller));

// Parsing scheduler system config
router.get('/system/config/parsing_scheduler', requirePermission('datasets.edit'), controller.getParsingSchedulerConfig.bind(controller));
router.put('/system/config/parsing_scheduler', requirePermission('datasets.edit'), controller.updateParsingSchedulerConfig.bind(controller));

export default router;
