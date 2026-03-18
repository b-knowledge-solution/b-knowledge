/**
 * @fileoverview RAG module controller — handles HTTP requests for dataset,
 * document, chunk, search, and advanced task management.
 *
 * All methods follow the Express (req, res) pattern and delegate business
 * logic to service classes. Errors are caught and returned as JSON with
 * appropriate HTTP status codes.
 *
 * @module modules/rag/controllers/rag
 */

import { Request, Response } from 'express';
import path from 'path';
import { ragService } from '../services/rag.service.js';
import { ragDocumentService } from '../services/rag-document.service.js';
import { ragRedisService, getUuid } from '../services/rag-redis.service.js';
import { ragStorageService } from '../services/rag-storage.service.js';
import { ragSearchService } from '../services/rag-search.service.js';
import { log } from '@/shared/services/logger.service.js';
import { ModelFactory } from '@/shared/models/factory.js';
import { getClientIp } from '@/shared/utils/ip.js';
import { getRedisClient } from '@/shared/services/redis.service.js';
import { db } from '@/shared/db/knex.js';

/**
 * @description Resolve model_providers.id for an embedding model name
 * @param {string} modelName - The embedding model name (e.g., "text-embedding-3-small")
 * @returns {Promise<string | null>} The provider UUID or null if not found
 */
async function resolveEmbeddingProviderId(modelName: string): Promise<string | null> {
    if (!modelName) return null;
    // Look up the active embedding provider by model name
    const provider = await db('model_providers')
        .select('id')
        .where('model_name', modelName)
        .where('model_type', 'embedding')
        .where('status', 'active')
        .first();
    return provider?.id || null;
}

/**
 * @description Controller for all RAG module endpoints including dataset CRUD,
 * document upload/parse/delete, chunk management, search, and advanced tasks.
 */
export class RagController {
    // -------------------------------------------------------------------------
    // Datasets
    // -------------------------------------------------------------------------

    /**
     * @description GET /datasets — List all datasets accessible to the current user.
     * Filters by access control (public, team, user grants).
     * @param {Request} req - Express request with optional user context
     * @param {Response} res - Express response with dataset array
     * @returns {Promise<void>}
     */
    async listDatasets(req: Request, res: Response): Promise<void> {
        try {
            const datasets = await ragService.getAvailableDatasets(req.user);
            res.json(datasets);
        } catch (error) {
            log.error('Failed to list datasets', { error: String(error) });
            res.status(500).json({ error: 'Failed to list datasets' });
        }
    }

    /**
     * @description GET /datasets/:id — Get a single dataset by ID.
     * Returns 404 if dataset is not found or has been soft-deleted.
     * @param {Request} req - Express request with dataset ID param
     * @param {Response} res - Express response with dataset object
     * @returns {Promise<void>}
     */
    async getDataset(req: Request, res: Response): Promise<void> {
        try {
            const dataset = await ragService.getDatasetById(req.params['id']!);
            // Return 404 for missing or soft-deleted datasets
            if (!dataset || dataset.status === 'deleted') {
                res.status(404).json({ error: 'Dataset not found' });
                return;
            }
            res.json(dataset);
        } catch (error) {
            log.error('Failed to get dataset', { error: String(error) });
            res.status(500).json({ error: 'Failed to get dataset' });
        }
    }

    /**
     * @description POST /datasets — Create a new dataset with optional access control.
     * Also syncs to the Peewee knowledgebase table used by Python task executors.
     * Returns 409 if a dataset with the same name already exists.
     * @param {Request} req - Express request with dataset creation body
     * @param {Response} res - Express response with created dataset (201)
     * @returns {Promise<void>}
     */
    async createDataset(req: Request, res: Response): Promise<void> {
        try {
            const user = req.user
                ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
                : undefined;

            const dataset = await ragService.createDataset(req.body, user);

            // Sync to shared knowledgebase table (used by Python task executors)
            try {
                const kbData: Parameters<typeof ragDocumentService.createKnowledgebase>[0] = {
                    id: dataset.id,
                    name: dataset.name,
                };
                if (dataset.description) kbData.description = dataset.description;
                if (dataset.language) kbData.language = dataset.language;
                if (dataset.embedding_model) {
                    kbData.embedding_model = dataset.embedding_model;
                    // Resolve provider UUID so the Python worker can look up the model config directly
                    const providerId = await resolveEmbeddingProviderId(dataset.embedding_model);
                    if (providerId) kbData.tenant_embd_id = providerId;
                }
                if (dataset.parser_id) kbData.parser_id = dataset.parser_id;
                if (dataset.parser_config) {
                    kbData.parser_config = typeof dataset.parser_config === 'string'
                        ? JSON.parse(dataset.parser_config) : dataset.parser_config;
                }
                if (dataset.pagerank !== undefined) kbData.pagerank = dataset.pagerank;
                await ragDocumentService.createKnowledgebase(kbData);
            } catch (syncErr) {
                log.warn('Failed to sync dataset to knowledgebase table (non-blocking)', { error: String(syncErr) });
            }

            res.status(201).json(dataset);
        } catch (error: any) {
            log.error('Failed to create dataset', { error: String(error) });
            const status = error.message?.includes('already exists') ? 409 : 500;
            res.status(status).json({ error: error.message || 'Failed to create dataset' });
        }
    }

    /**
     * @description PUT /datasets/:id — Update dataset properties.
     * Syncs changes to the Peewee knowledgebase table (non-blocking).
     * @param {Request} req - Express request with dataset ID and update body
     * @param {Response} res - Express response with updated dataset
     * @returns {Promise<void>}
     */
    async updateDataset(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        // Guard: require dataset ID
        if (!id) { res.status(400).json({ error: 'ID is required' }); return; }

        try {
            const user = req.user
                ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
                : undefined;

            const dataset = await ragService.updateDataset(id, req.body, user);
            if (!dataset) { res.status(404).json({ error: 'Dataset not found' }); return; }

            // Sync changed fields to Peewee knowledgebase table (non-blocking)
            try {
                const kbData: any = {};
                if (req.body.name !== undefined) kbData.name = req.body.name;
                if (req.body.description !== undefined) kbData.description = req.body.description;
                if (req.body.language !== undefined) kbData.language = req.body.language;
                if (req.body.embedding_model !== undefined) {
                    kbData.embedding_model = req.body.embedding_model;
                    // Resolve provider UUID so the Python worker can look up the model config directly
                    const providerId = await resolveEmbeddingProviderId(req.body.embedding_model);
                    kbData.tenant_embd_id = providerId;
                }
                if (req.body.parser_id !== undefined) kbData.parser_id = req.body.parser_id;
                if (req.body.parser_config !== undefined) kbData.parser_config = req.body.parser_config;
                if (req.body.pagerank !== undefined) kbData.pagerank = req.body.pagerank;

                if (Object.keys(kbData).length > 0) {
                    await ragDocumentService.updateKnowledgebase(id, kbData);
                }
            } catch (syncErr) {
                log.warn('Failed to sync dataset update to knowledgebase table', { error: String(syncErr) });
            }

            res.json(dataset);
        } catch (error: any) {
            log.error('Failed to update dataset', { error: String(error) });
            res.status(500).json({ error: error.message || 'Failed to update dataset' });
        }
    }

    /**
     * @description DELETE /datasets/:id — Soft-delete a dataset and clean stale references.
     * Also soft-deletes the corresponding knowledgebase record.
     * @param {Request} req - Express request with dataset ID param
     * @param {Response} res - Express response (204 on success)
     * @returns {Promise<void>}
     */
    async deleteDataset(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        // Guard: require dataset ID
        if (!id) { res.status(400).json({ error: 'ID is required' }); return; }

        try {
            const user = req.user
                ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
                : undefined;

            await ragService.deleteDataset(id, user);

            // Sync deletion to Peewee knowledgebase table (non-blocking)
            try {
                await ragDocumentService.deleteKnowledgebase(id);
            } catch (syncErr) {
                log.warn('Failed to sync dataset deletion to knowledgebase table', { error: String(syncErr) });
            }

            res.status(204).send();
        } catch (error) {
            log.error('Failed to delete dataset', { error: String(error) });
            res.status(500).json({ error: 'Failed to delete dataset' });
        }
    }

    /**
     * PATCH /datasets/:id/documents/:docId/toggle — toggle document chunk availability.
     * Sets available_int to 0 (disabled) or 1 (enabled) for all chunks of the document.
     * @param req - Express request with dataset ID, docId params, and body { available: boolean }
     * @param res - Express response with number of updated chunks
     */
    async toggleDocumentAvailability(req: Request, res: Response): Promise<void> {
        const { id: datasetId, docId } = req.params;
        if (!datasetId || !docId) {
            res.status(400).json({ error: 'Dataset ID and document ID are required' });
            return;
        }

        const { available } = req.body;
        if (typeof available !== 'boolean') {
            res.status(400).json({ error: 'available (boolean) is required in request body' });
            return;
        }

        try {
            // Update document status in PostgreSQL
            await ragDocumentService.updateDocument(docId!, { status: available ? '1' : '0' });

            // Update chunk availability in OpenSearch
            let chunksUpdated = 0;
            try {
                chunksUpdated = await ragSearchService.toggleDocumentAvailability(datasetId, docId!, available);
            } catch {
                // OpenSearch update may fail if no chunks exist yet — that's OK
            }

            res.json({ doc_id: docId, available, chunks_updated: chunksUpdated });
        } catch (error) {
            log.error('Failed to toggle document availability', { datasetId, docId, error: String(error) });
            res.status(500).json({ error: 'Failed to toggle document availability' });
        }
    }

    // -------------------------------------------------------------------------
    // Dataset RBAC Access Control
    // -------------------------------------------------------------------------

    /**
     * GET /datasets/:id/access — return enriched access control for a dataset.
     * @param req - Express request with dataset ID param
     * @param res - Express response with enriched access data
     */
    async getDatasetAccess(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        if (!id) { res.status(400).json({ error: 'ID is required' }); return; }

        try {
            const access = await ragService.getDatasetAccess(id);
            res.json(access);
        } catch (error: any) {
            // Return 404 if dataset not found, 500 otherwise
            const status = error.message === 'Dataset not found' ? 404 : 500;
            log.error('Failed to get dataset access', { error: String(error) });
            res.status(status).json({ error: error.message || 'Failed to get dataset access' });
        }
    }

    /**
     * PUT /datasets/:id/access — update access control for a dataset.
     * @param req - Express request with dataset ID param and access control body
     * @param res - Express response with updated dataset
     */
    async setDatasetAccess(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        if (!id) { res.status(400).json({ error: 'ID is required' }); return; }

        try {
            // Build user context for audit logging
            const user = req.user
                ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
                : undefined;

            if (!user) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const dataset = await ragService.setDatasetAccess(id, req.body, user);
            if (!dataset) { res.status(404).json({ error: 'Dataset not found' }); return; }

            res.json(dataset);
        } catch (error: any) {
            log.error('Failed to set dataset access', { error: String(error) });
            res.status(500).json({ error: error.message || 'Failed to set dataset access' });
        }
    }

    // -------------------------------------------------------------------------
    // Documents
    // -------------------------------------------------------------------------

    /**
     * @description GET /datasets/:id/documents — List all documents in a dataset.
     * Returns documents from the Peewee 'document' table ordered by creation time.
     * @param {Request} req - Express request with dataset ID param
     * @param {Response} res - Express response with document array
     * @returns {Promise<void>}
     */
    async listDocuments(req: Request, res: Response): Promise<void> {
        try {
            const docs = await ragDocumentService.listDocuments(req.params['id']!);
            res.json(docs);
        } catch (error) {
            log.error('Failed to list documents', { error: String(error) });
            res.status(500).json({ error: 'Failed to list documents' });
        }
    }

    /**
     * @description POST /datasets/:id/documents — Upload one or more files to a dataset.
     * Stores files in S3, creates file/document/file2document records in PostgreSQL,
     * and increments the dataset doc count.
     * @param {Request} req - Express request with multipart file uploads
     * @param {Response} res - Express response with created document array (201)
     * @returns {Promise<void>}
     */
    async uploadDocuments(req: Request, res: Response): Promise<void> {
        const datasetId = req.params['id'];
        // Guard: require dataset ID
        if (!datasetId) { res.status(400).json({ error: 'Dataset ID is required' }); return; }

        try {
            const files = req.files as Express.Multer.File[] | undefined;
            // Guard: require at least one file
            if (!files || files.length === 0) {
                res.status(400).json({ error: 'No files provided' });
                return;
            }

            // Verify dataset exists in datasets table
            const dataset = await ModelFactory.dataset.findById(datasetId);
            if (!dataset) {
                res.status(404).json({ error: 'Dataset not found' });
                return;
            }

            const results = [];
            for (const file of files) {
                const fileId = getUuid();
                const docId = getUuid();
                const filename = file.originalname || 'unknown';
                const suffix = path.extname(filename).toLowerCase().replace('.', '');
                const fileType = ragStorageService.getFileType(suffix);

                // Store file in MinIO
                const storagePath = ragStorageService.buildStoragePath(datasetId, fileId, filename);
                await ragStorageService.putFile(storagePath, file.buffer);

                // Create File record
                await ragDocumentService.createFile({
                    id: fileId,
                    name: filename,
                    location: storagePath,
                    size: file.size,
                    type: fileType,
                });

                // Create Document record — use parser settings from the dataset
                const parserConfig = typeof dataset.parser_config === 'string'
                    ? JSON.parse(dataset.parser_config)
                    : dataset.parser_config;
                await ragDocumentService.createDocument({
                    id: docId,
                    kb_id: datasetId.replace(/-/g, ''),
                    parser_id: dataset.parser_id || 'naive',
                    parser_config: parserConfig || { pages: [[1, 1000000]] },
                    name: filename,
                    location: storagePath,
                    size: file.size,
                    suffix,
                    type: fileType,
                });

                // Create File2Document link
                await ragDocumentService.createFile2Document(fileId, docId);

                results.push({
                    id: docId,
                    name: filename,
                    size: file.size,
                    type: fileType,
                    status: '1',
                    run: '0',
                });
            }

            // Update doc count on datasets table
            await ModelFactory.dataset.getKnex()
                .where({ id: datasetId })
                .increment('doc_count', results.length);

            res.status(201).json(results);
        } catch (error) {
            log.error('Failed to upload documents', { error: String(error) });
            res.status(500).json({ error: 'Failed to upload documents' });
        }
    }

    /**
     * @description POST /datasets/:id/documents/:docId/parse — Trigger document parsing.
     * Marks the document as queued and sends a parse_init task to the Redis Stream
     * for the Python task executor to process.
     * @param {Request} req - Express request with dataset ID and document ID params
     * @param {Response} res - Express response with parsing status
     * @returns {Promise<void>}
     */
    async parseDocument(req: Request, res: Response): Promise<void> {
        const { id: datasetId, docId } = req.params;
        if (!datasetId || !docId) {
            res.status(400).json({ error: 'Dataset ID and document ID are required' });
            return;
        }

        try {
            const doc = await ragDocumentService.getDocument(docId!);
            if (!doc) {
                res.status(404).json({ error: 'Document not found' });
                return;
            }

            // Mark document as queued
            await ragDocumentService.beginParse(docId!);

            // Queue parse_init task to Redis — task executor will split into sub-tasks
            await ragRedisService.queueParseInit(docId!);

            res.json({ status: 'parsing', doc_id: docId });
        } catch (error) {
            log.error('Failed to parse document', { error: String(error) });
            res.status(500).json({ error: 'Failed to trigger parsing' });
        }
    }

    /**
     * @description GET /datasets/:id/documents/:docId/download — Download a document file.
     * Streams the file from S3 storage with appropriate Content-Type and Content-Disposition headers.
     * @param {Request} req - Express request with dataset ID and document ID params
     * @param {Response} res - Express response with file content
     * @returns {Promise<void>}
     */
    async downloadDocument(req: Request, res: Response): Promise<void> {
        const { id: datasetId, docId } = req.params;
        if (!datasetId || !docId) {
            res.status(400).json({ error: 'Dataset ID and document ID are required' });
            return;
        }

        try {
            const doc = await ragDocumentService.getDocument(docId!);
            if (!doc) {
                res.status(404).json({ error: 'Document not found' });
                return;
            }

            if (!doc.location) {
                res.status(404).json({ error: 'File not found in storage' });
                return;
            }

            const content = await ragStorageService.getFile(doc.location);
            const filename = doc.name || 'download';
            const suffix = path.extname(filename).toLowerCase();
            const contentType = ragStorageService.getContentType(suffix);

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
            res.setHeader('Content-Length', content.length);
            res.send(content);
        } catch (error) {
            log.error('Failed to download document', { error: String(error) });
            res.status(500).json({ error: 'Failed to download document' });
        }
    }

    /**
     * @description DELETE /datasets/:id/documents/:docId — Delete a document and all associated data.
     * Performs a multi-step cleanup: S3 file, OpenSearch chunks, PG file records, document row,
     * and decrements the dataset doc count. Each step is best-effort to avoid partial failures.
     * @param {Request} req - Express request with dataset ID and document ID params
     * @param {Response} res - Express response (204 on success)
     * @returns {Promise<void>}
     */
    async deleteDocument(req: Request, res: Response): Promise<void> {
        const { id: datasetId, docId } = req.params;
        if (!datasetId || !docId) {
            res.status(400).json({ error: 'Dataset ID and document ID are required' });
            return;
        }

        try {
            // 1. Fetch document to get storage path (location field)
            const doc = await ragDocumentService.getDocument(docId!);
            if (!doc) {
                res.status(404).json({ error: 'Document not found' });
                return;
            }

            // 2. Delete file from S3 storage
            if (doc.location) {
                try { await ragStorageService.deleteFile(doc.location); } catch { /* best-effort */ }
            }

            // 3. Delete chunks from OpenSearch
            try { await ragSearchService.deleteDocumentChunks(docId!); } catch { /* best-effort */ }

            // 4. Delete file and file2document records from PostgreSQL
            try { await ragDocumentService.deleteFileRecords(docId!); } catch { /* best-effort */ }

            // 5. Delete document row from PostgreSQL
            await ragDocumentService.softDeleteDocument(docId!);

            // 6. Decrement dataset doc count
            try { await ragDocumentService.incrementDocCount(datasetId!, -1); } catch { /* best-effort */ }

            res.status(204).send();
        } catch (error) {
            log.error('Failed to delete document', { error: String(error) });
            res.status(500).json({ error: 'Failed to delete document' });
        }
    }

    /**
     * POST /datasets/:id/documents/bulk-parse
     * @description Start or cancel parsing for multiple documents.
     * @param req - Express request with { doc_ids: string[], run: 1|2 }
     * @param res - Express response
     */
    async bulkParseDocuments(req: Request, res: Response): Promise<void> {
        const datasetId = req.params['id'];
        if (!datasetId) { res.status(400).json({ error: 'Dataset ID is required' }); return; }

        const { doc_ids, run } = req.body as { doc_ids: string[]; run: number };

        // Validate inputs to prevent crashes from malformed request body
        if (!Array.isArray(doc_ids) || doc_ids.length === 0) {
            res.status(400).json({ error: 'doc_ids must be a non-empty array' });
            return;
        }
        if (run !== 1 && run !== 2) {
            res.status(400).json({ error: 'run must be 1 (parse) or 2 (cancel)' });
            return;
        }

        try {
            const results: { doc_id: string; status: string }[] = [];

            for (const docId of doc_ids) {
                if (!docId || typeof docId !== 'string') continue;
                const doc = await ragDocumentService.getDocument(docId);
                if (!doc) continue;

                if (run === 1) {
                    // Start parsing
                    await ragDocumentService.beginParse(docId);
                    await ragRedisService.queueParseInit(docId);
                    results.push({ doc_id: docId, status: 'parsing' });
                } else {
                    // Cancel parsing
                    await ragDocumentService.cancelParse(docId);
                    results.push({ doc_id: docId, status: 'cancelled' });
                }
            }

            res.json({ results });
        } catch (error) {
            log.error('Failed to bulk parse documents', { error: String(error) });
            res.status(500).json({ error: 'Failed to bulk parse documents' });
        }
    }

    /**
     * POST /datasets/:id/documents/bulk-toggle
     * @description Enable or disable multiple documents.
     * @param req - Express request with { doc_ids: string[], enabled: boolean }
     * @param res - Express response
     */
    async bulkToggleDocuments(req: Request, res: Response): Promise<void> {
        const datasetId = req.params['id'];
        if (!datasetId) { res.status(400).json({ error: 'Dataset ID is required' }); return; }

        const { doc_ids, enabled } = req.body as { doc_ids: string[]; enabled: boolean };

        try {
            await ragDocumentService.bulkToggle(doc_ids, enabled);
            res.json({ doc_ids, enabled });
        } catch (error) {
            log.error('Failed to bulk toggle documents', { error: String(error) });
            res.status(500).json({ error: 'Failed to bulk toggle documents' });
        }
    }

    /**
     * POST /datasets/:id/documents/bulk-delete
     * @description Delete multiple documents.
     * @param req - Express request with { doc_ids: string[] }
     * @param res - Express response
     */
    async bulkDeleteDocuments(req: Request, res: Response): Promise<void> {
        const datasetId = req.params['id'];
        if (!datasetId) { res.status(400).json({ error: 'Dataset ID is required' }); return; }

        const { doc_ids } = req.body as { doc_ids: string[] };

        try {
            let deletedCount = 0;

            for (const docId of doc_ids) {
                const doc = await ragDocumentService.getDocument(docId);
                if (!doc) continue;

                // S3
                if (doc.location) {
                    try { await ragStorageService.deleteFile(doc.location); } catch { /* best-effort */ }
                }
                // OpenSearch chunks
                try { await ragSearchService.deleteDocumentChunks(docId); } catch { /* best-effort */ }
                // file + file2document PG records
                try { await ragDocumentService.deleteFileRecords(docId); } catch { /* best-effort */ }
                // document row
                await ragDocumentService.softDeleteDocument(docId);

                deletedCount++;
            }

            // Decrement dataset doc count
            if (deletedCount > 0) {
                try { await ragDocumentService.incrementDocCount(datasetId!, -deletedCount); } catch { /* best-effort */ }
            }

            res.json({ deleted: deletedCount });
        } catch (error) {
            log.error('Failed to bulk delete documents', { error: String(error) });
            res.status(500).json({ error: 'Failed to bulk delete documents' });
        }
    }

    // -------------------------------------------------------------------------
    // Progress SSE
    // -------------------------------------------------------------------------

    /**
     * @description GET /datasets/:id/documents/:docId/status — Stream parsing progress via SSE.
     * Subscribes to the Redis pub/sub channel for the document and forwards progress events
     * to the client as Server-Sent Events.
     * @param {Request} req - Express request with dataset ID and document ID params
     * @param {Response} res - Express SSE response stream
     * @returns {Promise<void>}
     */
    async streamDocumentProgress(req: Request, res: Response): Promise<void> {
        const { id: datasetId, docId } = req.params;
        if (!datasetId || !docId) {
            res.status(400).json({ error: 'Dataset ID and document ID are required' });
            return;
        }

        const redisClient = getRedisClient();
        if (!redisClient) {
            res.status(503).json({ error: 'Redis not available for progress streaming' });
            return;
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });

        const channel = `task:${docId}:progress`;
        const subscriber = redisClient.duplicate();

        try {
            await subscriber.connect();
            await subscriber.subscribe(channel, (message) => {
                res.write(`data: ${message}\n\n`);
            });
        } catch (error) {
            log.error('Failed to subscribe to progress channel', { error: String(error) });
            res.write(`data: ${JSON.stringify({ error: 'Subscription failed' })}\n\n`);
            res.end();
            return;
        }

        req.on('close', async () => {
            try {
                await subscriber.unsubscribe(channel);
                await subscriber.disconnect();
            } catch {
                // ignore cleanup errors
            }
        });
    }

    // -------------------------------------------------------------------------
    // Dataset Settings
    // -------------------------------------------------------------------------

    /**
     * GET /datasets/:id/settings - Get dataset settings (general + parser config).
     * @param req - Express request with dataset ID
     * @param res - Express response with dataset settings
     */
    async getDatasetSettings(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        if (!id) { res.status(400).json({ error: 'ID is required' }); return; }

        try {
            const dataset = await ragService.getDatasetById(id);
            if (!dataset || dataset.status === 'deleted') {
                res.status(404).json({ error: 'Dataset not found' });
                return;
            }
            // Return relevant settings fields
            res.json({
                id: dataset.id,
                name: dataset.name,
                description: dataset.description,
                language: dataset.language,
                embedding_model: dataset.embedding_model,
                parser_id: dataset.parser_id,
                parser_config: typeof dataset.parser_config === 'string'
                    ? JSON.parse(dataset.parser_config) : dataset.parser_config,
                access_control: typeof dataset.access_control === 'string'
                    ? JSON.parse(dataset.access_control) : dataset.access_control,
                pagerank: dataset.pagerank || 0,
            });
        } catch (error) {
            log.error('Failed to get dataset settings', { error: String(error) });
            res.status(500).json({ error: 'Failed to get dataset settings' });
        }
    }

    /**
     * PUT /datasets/:id/settings - Update dataset settings.
     * @param req - Express request with dataset ID and settings body
     * @param res - Express response with updated dataset
     */
    async updateDatasetSettings(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        if (!id) { res.status(400).json({ error: 'ID is required' }); return; }

        try {
            const user = req.user
                ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
                : undefined;

            const dataset = await ragService.updateDataset(id, req.body, user);
            if (!dataset) { res.status(404).json({ error: 'Dataset not found' }); return; }

            // Sync to knowledgebase table
            try {
                const kbData: any = {};
                if (req.body.name !== undefined) kbData.name = req.body.name;
                if (req.body.description !== undefined) kbData.description = req.body.description;
                if (req.body.language !== undefined) kbData.language = req.body.language;
                if (req.body.embedding_model !== undefined) {
                    kbData.embedding_model = req.body.embedding_model;
                    // Resolve provider UUID so the Python worker can look up the model config directly
                    const providerId = await resolveEmbeddingProviderId(req.body.embedding_model);
                    kbData.tenant_embd_id = providerId;
                }
                if (req.body.parser_id !== undefined) kbData.parser_id = req.body.parser_id;
                if (req.body.parser_config !== undefined) kbData.parser_config = req.body.parser_config;
                if (req.body.pagerank !== undefined) kbData.pagerank = req.body.pagerank;

                if (Object.keys(kbData).length > 0) {
                    await ragDocumentService.updateKnowledgebase(id, kbData);
                }
            } catch (syncErr) {
                log.warn('Failed to sync dataset settings to knowledgebase', { error: String(syncErr) });
            }

            res.json(dataset);
        } catch (error: any) {
            log.error('Failed to update dataset settings', { error: String(error) });
            res.status(500).json({ error: error.message || 'Failed to update dataset settings' });
        }
    }

    // -------------------------------------------------------------------------
    // Chunk Management (manual add/edit/delete)
    // -------------------------------------------------------------------------

    /**
     * POST /datasets/:id/chunks - Add a manual chunk to a dataset.
     * @param req - Express request with chunk content body
     * @param res - Express response with created chunk info
     */
    async createChunk(req: Request, res: Response): Promise<void> {
        const datasetId = req.params['id'];
        if (!datasetId) { res.status(400).json({ error: 'Dataset ID is required' }); return; }

        try {
            // Delegate to search service which handles ES indexing
            const result = await ragSearchService.addChunk(datasetId, req.body);
            res.status(201).json(result);
        } catch (error) {
            log.error('Failed to create chunk', { error: String(error) });
            res.status(500).json({ error: 'Failed to create chunk' });
        }
    }

    /**
     * PUT /datasets/:id/chunks/:chunkId - Update an existing chunk.
     * @param req - Express request with chunk ID and update body
     * @param res - Express response with updated chunk
     */
    async updateChunk(req: Request, res: Response): Promise<void> {
        const { id: datasetId, chunkId } = req.params;
        if (!datasetId || !chunkId) {
            res.status(400).json({ error: 'Dataset ID and chunk ID are required' });
            return;
        }

        try {
            const result = await ragSearchService.updateChunk(datasetId, chunkId, req.body);
            res.json(result);
        } catch (error) {
            log.error('Failed to update chunk', { error: String(error) });
            res.status(500).json({ error: 'Failed to update chunk' });
        }
    }

    /**
     * DELETE /datasets/:id/chunks/:chunkId - Delete a chunk.
     * @param req - Express request with chunk ID
     * @param res - Express response (204 on success)
     */
    async deleteChunk(req: Request, res: Response): Promise<void> {
        const { id: datasetId, chunkId } = req.params;
        if (!datasetId || !chunkId) {
            res.status(400).json({ error: 'Dataset ID and chunk ID are required' });
            return;
        }

        try {
            await ragSearchService.deleteChunk(datasetId, chunkId);
            res.status(204).send();
        } catch (error) {
            log.error('Failed to delete chunk', { error: String(error) });
            res.status(500).json({ error: 'Failed to delete chunk' });
        }
    }

    /**
     * @description POST /datasets/:id/chunks/bulk-switch — Bulk enable/disable chunks by IDs.
     * @param {Request} req - Express request with chunk_ids and available in body
     * @param {Response} res - Express response with updated count
     * @returns {Promise<void>}
     */
    async bulkSwitchChunks(req: Request, res: Response): Promise<void> {
        const datasetId = req.params['id'];
        if (!datasetId) { res.status(400).json({ error: 'Dataset ID is required' }); return; }
        try {
            const { chunk_ids, available } = req.body;
            const result = await ragSearchService.bulkSwitchChunks(datasetId, chunk_ids, available);
            res.json(result);
        } catch (error) {
            log.error('Failed to bulk switch chunks', { error: String(error) });
            res.status(500).json({ error: 'Failed to bulk switch chunks' });
        }
    }

    // -------------------------------------------------------------------------
    // Retrieval Test
    // -------------------------------------------------------------------------

    /**
     * POST /datasets/:id/retrieval-test - Test retrieval against a dataset.
     * @param req - Express request with query and retrieval params
     * @param res - Express response with retrieval results
     */
    async retrievalTest(req: Request, res: Response): Promise<void> {
        const datasetId = req.params['id'];
        if (!datasetId) { res.status(400).json({ error: 'Dataset ID is required' }); return; }

        try {
            const result = await ragSearchService.search(datasetId, {
                query: req.body.query,
                method: req.body.method || 'hybrid',
                top_k: req.body.top_k || 5,
                similarity_threshold: req.body.similarity_threshold ?? 0.2,
                vector_similarity_weight: req.body.vector_similarity_weight ?? 0.3,
                doc_ids: req.body.doc_ids,
            });
            res.json(result);
        } catch (error) {
            log.error('Failed to run retrieval test', { error: String(error) });
            res.status(500).json({ error: 'Failed to run retrieval test' });
        }
    }

    // -------------------------------------------------------------------------
    // Search + Chunks
    // -------------------------------------------------------------------------

    /**
     * @description POST /datasets/:id/search — Search chunks within a dataset.
     * Delegates to the search service which supports full-text, semantic, and hybrid methods.
     * @param {Request} req - Express request with search query body
     * @param {Response} res - Express response with search results
     * @returns {Promise<void>}
     */
    async searchChunks(req: Request, res: Response): Promise<void> {
        const datasetId = req.params['id'];
        if (!datasetId) { res.status(400).json({ error: 'Dataset ID is required' }); return; }

        try {
            // For now, use full-text search only from Node.js.
            // Semantic search requires embedding inference which stays in Python.
            const result = await ragSearchService.search(datasetId, req.body);
            res.json(result);
        } catch (error) {
            log.error('Failed to search chunks', { error: String(error) });
            res.status(500).json({ error: 'Failed to search chunks' });
        }
    }

    /**
     * @description GET /datasets/:id/chunks — List chunks with optional doc_id filter and pagination.
     * @param {Request} req - Express request with dataset ID param and optional query params (doc_id, page, limit)
     * @param {Response} res - Express response with paginated chunk results
     * @returns {Promise<void>}
     */
    async listChunks(req: Request, res: Response): Promise<void> {
        const datasetId = req.params['id'];
        if (!datasetId) { res.status(400).json({ error: 'Dataset ID is required' }); return; }

        try {
            const options: { doc_id?: string; page?: number; limit?: number; available?: boolean } = {};
            if (req.query['doc_id']) options.doc_id = req.query['doc_id'] as string;
            if (req.query['page']) options.page = parseInt(req.query['page'] as string, 10);
            if (req.query['limit']) options.limit = parseInt(req.query['limit'] as string, 10);
            // Parse available filter: '1'/'true' = enabled, '0'/'false' = disabled
            if (req.query['available'] !== undefined) {
                options.available = req.query['available'] === '1' || req.query['available'] === 'true';
            }
            const result = await ragSearchService.listChunks(datasetId, options);
            res.json(result);
        } catch (error) {
            log.error('Failed to list chunks', { error: String(error) });
            res.status(500).json({ error: 'Failed to list chunks' });
        }
    }

    // -------------------------------------------------------------------------
    // Advanced Tasks (GraphRAG, RAPTOR, Mindmap, Enrichment)
    // -------------------------------------------------------------------------

    /**
     * @description POST /datasets/:id/:taskType(graphrag|raptor|mindmap) — Start an advanced processing task.
     * Creates a task record in PostgreSQL, updates the knowledgebase with the task ID,
     * and queues the task to the Redis Stream for the Python task executor.
     * Returns 409 if a task of the same type is already running.
     * @param {Request} req - Express request with dataset ID and taskType params
     * @param {Response} res - Express response with task info
     * @returns {Promise<void>}
     */
    async runAdvancedTask(req: Request, res: Response): Promise<void> {
        const { id: datasetId, taskType } = req.params;
        if (!datasetId || !taskType) {
            res.status(400).json({ error: 'Dataset ID and task type are required' });
            return;
        }

        if (!['graphrag', 'raptor', 'mindmap'].includes(taskType)) {
            res.status(400).json({ error: `Unknown task type: ${taskType}` });
            return;
        }

        try {
            // Check if already running
            const isRunning = await ragDocumentService.isAdvancedTaskRunning(datasetId, taskType);
            if (isRunning) {
                res.status(409).json({ error: `A ${taskType} task is already running` });
                return;
            }

            // Get documents for the dataset
            const documents = await ragDocumentService.getDatasetDocuments(datasetId);
            if (documents.length === 0) {
                res.status(400).json({ error: 'No documents in dataset' });
                return;
            }

            // Filter by doc_ids if provided
            let docIds = documents.map(d => d.id);
            if (req.body?.doc_ids?.length) {
                const requestedIds = new Set(req.body.doc_ids);
                docIds = docIds.filter(id => requestedIds.has(id));
                if (docIds.length === 0) {
                    res.status(400).json({ error: 'No matching documents found' });
                    return;
                }
            }

            // Create task record in PG
            const taskId = getUuid();
            await ragDocumentService.createTask({
                id: taskId,
                doc_id: documents[0]!.id,
                from_page: 100000000,
                to_page: 100000000,
                task_type: taskType,
                progress: 0,
                progress_msg: `${new Date().toLocaleTimeString('en-US', { hour12: false })} created task ${taskType}`,
                begin_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
            });

            // Update knowledgebase with task ID
            await ragDocumentService.updateKnowledgebase(datasetId, {
                [`${taskType}_task_id`]: taskId,
            });

            // Queue to Redis Stream
            await ragRedisService.queueAdvancedTask(
                taskType as 'graphrag' | 'raptor' | 'mindmap',
                documents[0]!.id,
                docIds,
            );

            res.json({ task_id: taskId, task_type: taskType, doc_count: docIds.length });
        } catch (error: any) {
            log.error(`Failed to run ${taskType}`, { error: String(error) });
            res.status(500).json({ error: error.message || `Failed to run ${taskType}` });
        }
    }

    /**
     * @description GET /datasets/:id/:taskType(graphrag|raptor|mindmap)/status — Get advanced task status.
     * @param {Request} req - Express request with dataset ID and taskType params
     * @param {Response} res - Express response with task progress info
     * @returns {Promise<void>}
     */
    async traceAdvancedTask(req: Request, res: Response): Promise<void> {
        const { id: datasetId, taskType } = req.params;
        if (!datasetId || !taskType) {
            res.status(400).json({ error: 'Dataset ID and task type are required' });
            return;
        }

        try {
            const result = await ragDocumentService.getAdvancedTaskStatus(datasetId, taskType);
            res.json(result);
        } catch (error) {
            log.error(`Failed to trace ${taskType}`, { error: String(error) });
            res.status(500).json({ error: `Failed to trace ${taskType}` });
        }
    }

    /**
     * @description POST /datasets/:id/documents/:docId/:enrichType — Run document enrichment.
     * Supports keyword extraction, question generation, tagging, and metadata enrichment.
     * Creates a task record and queues the enrichment job to Redis Stream.
     * @param {Request} req - Express request with dataset ID, document ID, and enrichType params
     * @param {Response} res - Express response with task info
     * @returns {Promise<void>}
     */
    async runDocumentEnrichment(req: Request, res: Response): Promise<void> {
        const { id: datasetId, docId, enrichType } = req.params;
        if (!datasetId || !docId || !enrichType) {
            res.status(400).json({ error: 'Dataset ID, document ID, and enrichment type are required' });
            return;
        }

        // Map plural URL param to singular task type expected by the Python executor
        const typeMap: Record<string, string> = {
            keywords: 'keyword',
            questions: 'question',
            tags: 'tag',
            metadata: 'metadata',
        };
        const taskType = typeMap[enrichType];
        if (!taskType) {
            res.status(400).json({ error: `Unknown enrichment type: ${enrichType}` });
            return;
        }

        try {
            const doc = await ragDocumentService.getDocument(docId!);
            if (!doc) {
                res.status(404).json({ error: 'Document not found' });
                return;
            }

            // Create task record in PG
            const taskId = getUuid();
            await ragDocumentService.createTask({
                id: taskId,
                doc_id: docId!,
                from_page: 0,
                to_page: 100000000,
                task_type: taskType,
                progress: 0,
                progress_msg: `${new Date().toLocaleTimeString('en-US', { hour12: false })} created task ${taskType}`,
                begin_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
            });

            // Queue to Redis Stream
            await ragRedisService.queueEnrichmentTask(docId!, taskType as any);

            res.json({ task_id: taskId, task_type: taskType, doc_id: docId });
        } catch (error) {
            log.error(`Failed to run ${enrichType} enrichment`, { error: String(error) });
            res.status(500).json({ error: `Failed to run ${enrichType}` });
        }
    }

    /**
     * @description GET /tasks/:taskId/status — Get the current status of a task.
     * Returns progress, progress_msg, and computed status (done/failed/running/not_found).
     * @param {Request} req - Express request with taskId param
     * @param {Response} res - Express response with task status
     * @returns {Promise<void>}
     */
    async getTaskStatus(req: Request, res: Response): Promise<void> {
        const { taskId } = req.params;
        if (!taskId) { res.status(400).json({ error: 'Task ID is required' }); return; }

        try {
            const result = await ragDocumentService.getTaskStatus(taskId);
            res.json(result);
        } catch (error) {
            log.error('Failed to get task status', { error: String(error) });
            res.status(500).json({ error: 'Failed to get task status' });
        }
    }

    // -------------------------------------------------------------------------
    // Dataset Overview & Logs
    // -------------------------------------------------------------------------

    /**
     * GET /datasets/:id/overview — return stats for a dataset.
     * @param req - Express request with dataset ID
     * @param res - Express response with overview stats
     */
    async getDatasetOverview(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        if (!id) { res.status(400).json({ error: 'ID is required' }); return; }

        try {
            const stats = await ragDocumentService.getOverviewStats(id);
            res.json(stats);
        } catch (error) {
            log.error('Failed to get dataset overview', { error: String(error) });
            res.status(500).json({ error: 'Failed to get dataset overview' });
        }
    }

    /**
     * GET /datasets/:id/logs — return paginated processing logs for a dataset.
     * @param req - Express request with dataset ID and query params (page, limit, status)
     * @param res - Express response with paginated logs
     */
    async getDatasetLogs(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        if (!id) { res.status(400).json({ error: 'ID is required' }); return; }

        try {
            const page = req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1;
            const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;
            const status = req.query['status'] as string | undefined;

            const result = await ragDocumentService.getDatasetLogs(id, { page, limit, ...(status ? { status } : {}) });
            res.json(result);
        } catch (error) {
            log.error('Failed to get dataset logs', { error: String(error) });
            res.status(500).json({ error: 'Failed to get dataset logs' });
        }
    }

    /**
     * GET /datasets/:id/documents/:docId/logs — return RAG worker logs for a document.
     * @param req - Express request with dataset ID and document ID
     * @param res - Express response with document processing logs
     */
    async getDocumentLogs(req: Request, res: Response): Promise<void> {
        const { id: datasetId, docId } = req.params;
        if (!datasetId || !docId) {
            res.status(400).json({ error: 'Dataset ID and document ID are required' });
            return;
        }

        try {
            const doc = await ragDocumentService.getDocument(docId!);
            if (!doc) {
                res.status(404).json({ error: 'Document not found' });
                return;
            }

            const tasks = await ragDocumentService.getDocumentLogs(docId!);

            res.json({
                document: {
                    id: doc.id,
                    name: doc.name,
                    suffix: doc.suffix,
                    size: doc.size,
                    type: doc.type,
                    status: doc.status,
                    run: doc.run,
                    progress: doc.progress,
                    progress_msg: doc.progress_msg,
                    chunk_num: doc.chunk_num,
                    token_num: doc.token_num,
                    create_time: doc.create_time,
                    create_date: doc.create_date,
                    update_date: doc.update_date,
                },
                tasks: tasks.map(t => ({
                    task_id: t.id,
                    task_type: t.task_type || 'parse',
                    progress: t.progress,
                    progress_msg: t.progress_msg,
                    begin_at: t.begin_at,
                    process_duration: t.process_duration ?? 0,
                    create_time: t.create_time,
                    create_date: t.create_date,
                    status: t.progress === 1 ? 'done'
                        : t.progress === -1 ? 'failed'
                        : 'running',
                })),
            });
        } catch (error) {
            log.error('Failed to get document logs', { error: String(error) });
            res.status(500).json({ error: 'Failed to get document logs' });
        }
    }

    // -------------------------------------------------------------------------
    // Knowledge Graph Data (for visualization)
    // -------------------------------------------------------------------------

    /**
     * GET /datasets/:id/graph — return graph entities and relations from OpenSearch.
     * @param req - Express request with dataset ID
     * @param res - Express response with nodes and edges arrays
     */
    async getGraphData(req: Request, res: Response): Promise<void> {
        const { id: datasetId } = req.params;
        if (!datasetId) { res.status(400).json({ error: 'Dataset ID is required' }); return; }

        try {
            const { ragGraphragService } = await import('../services/rag-graphrag.service.js');
            const kbId = datasetId.replace(/-/g, '');

            // Fetch entities and relations from OpenSearch
            const entities = await ragGraphragService.getRelevantEntsByTypes([kbId], [], 200);
            const relations = await ragGraphragService.getRelevantRelations([kbId], '*', 500);

            // Map to graph visualization format
            const nodes = entities.map(e => ({
                id: e.entity,
                label: e.entity,
                type: e.type,
                description: e.description,
                pagerank: e.pagerank,
            }));

            const edges = relations.map((r, idx) => ({
                id: `edge-${idx}`,
                source: r.from,
                target: r.to,
                label: r.description,
                weight: r.score,
            }));

            res.json({ nodes, edges });
        } catch (error) {
            log.error('Failed to get graph data', { error: String(error) });
            res.status(500).json({ error: 'Failed to get graph data' });
        }
    }

    // -------------------------------------------------------------------------
    // Metadata Management
    // -------------------------------------------------------------------------

    /**
     * GET /datasets/:id/metadata — return metadata schema for a dataset.
     * @param req - Express request with dataset ID
     * @param res - Express response with metadata fields
     */
    async getMetadata(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        if (!id) { res.status(400).json({ error: 'ID is required' }); return; }

        try {
            const kb = await ragDocumentService.getKnowledgebase(id);
            if (!kb) { res.status(404).json({ error: 'Dataset not found' }); return; }

            // Metadata schema is stored in knowledgebase.parser_config.metadata_fields
            const parserConfig = typeof kb.parser_config === 'string'
                ? JSON.parse(kb.parser_config)
                : kb.parser_config;
            const metadata = parserConfig?.metadata_fields || [];

            res.json({ fields: metadata });
        } catch (error) {
            log.error('Failed to get metadata', { error: String(error) });
            res.status(500).json({ error: 'Failed to get metadata' });
        }
    }

    /**
     * PUT /datasets/:id/metadata — update metadata schema for a dataset.
     * @param req - Express request with metadata fields in body
     * @param res - Express response
     */
    async updateMetadata(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        if (!id) { res.status(400).json({ error: 'ID is required' }); return; }

        try {
            const kb = await ragDocumentService.getKnowledgebase(id);
            if (!kb) { res.status(404).json({ error: 'Dataset not found' }); return; }

            // Update metadata_fields in parser_config
            const parserConfig = typeof kb.parser_config === 'string'
                ? JSON.parse(kb.parser_config)
                : (kb.parser_config || {});
            parserConfig.metadata_fields = req.body.fields || [];

            await ragDocumentService.updateKnowledgebase(id, {
                parser_config: JSON.stringify(parserConfig),
            });

            res.json({ fields: parserConfig.metadata_fields });
        } catch (error) {
            log.error('Failed to update metadata', { error: String(error) });
            res.status(500).json({ error: 'Failed to update metadata' });
        }
    }

    // -------------------------------------------------------------------------
    // Per-Document Parser Change
    // -------------------------------------------------------------------------

    /**
     * @description PUT /datasets/:id/documents/:docId/parser — Change a document's parser method.
     * Deletes existing chunks and resets the document for re-parsing.
     * @param {Request} req - Express request with parser_id and optional parser_config in body
     * @param {Response} res - Express response with updated document
     * @returns {Promise<void>}
     */
    async changeDocumentParser(req: Request, res: Response): Promise<void> {
        const { id, docId } = req.params
        if (!id || !docId) {
            res.status(400).json({ error: 'Dataset ID and Document ID are required' })
            return
        }

        try {
            const result = await ragDocumentService.changeDocumentParser(id, docId, req.body)
            res.json(result)
        } catch (error: any) {
            // Return 409 when document is currently being parsed
            if (error.statusCode === 409) {
                res.status(409).json({ error: error.message })
                return
            }
            if (error.message?.includes('not found')) {
                res.status(404).json({ error: error.message })
                return
            }
            log.error('Failed to change document parser', { error: String(error) })
            res.status(500).json({ error: 'Failed to change document parser' })
        }
    }

    // -------------------------------------------------------------------------
    // Web Crawl
    // -------------------------------------------------------------------------

    /**
     * @description POST /datasets/:id/documents/web-crawl — Create a document from a web URL.
     * Validates URL safety (SSRF prevention) and creates a placeholder document
     * for async crawl processing by the RAG worker.
     * @param {Request} req - Express request with url, optional name, and auto_parse in body
     * @param {Response} res - Express response with created placeholder document
     * @returns {Promise<void>}
     */
    async webCrawlDocument(req: Request, res: Response): Promise<void> {
        const { id } = req.params
        if (!id) {
            res.status(400).json({ error: 'Dataset ID is required' })
            return
        }

        try {
            const doc = await ragDocumentService.webCrawlDocument(id, req.body)
            res.status(201).json(doc)
        } catch (error: any) {
            // Return 400 for SSRF-blocked URLs
            if (error.message?.includes('private/internal')) {
                res.status(400).json({ error: error.message })
                return
            }
            if (error.message?.includes('not found')) {
                res.status(404).json({ error: error.message })
                return
            }
            log.error('Failed to create web crawl document', { error: String(error) })
            res.status(500).json({ error: 'Failed to create web crawl document' })
        }
    }

}
