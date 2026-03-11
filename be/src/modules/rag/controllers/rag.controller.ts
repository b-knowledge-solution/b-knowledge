import { Request, Response } from 'express';
import path from 'path';
import { ragService } from '../services/rag.service.js';
import { ragDocumentService } from '../services/rag-document.service.js';
import { ragRedisService, getUuid } from '../services/rag-redis.service.js';
import { ragStorageService } from '../services/rag-storage.service.js';
import { ragSearchService } from '../services/rag-search.service.js';
import { ragVersionService } from '../services/rag-version.service.js';
import { ragConverterService } from '../services/rag-converter.service.js';
import { ragUploadService } from '../services/rag-upload.service.js';
import { log } from '@/shared/services/logger.service.js';
import { getClientIp } from '@/shared/utils/ip.js';
import { getRedisClient } from '@/shared/services/redis.service.js';

export class RagController {
    // -------------------------------------------------------------------------
    // Datasets
    // -------------------------------------------------------------------------

    async listDatasets(req: Request, res: Response): Promise<void> {
        try {
            const datasets = await ragService.getAvailableDatasets(req.user);
            res.json(datasets);
        } catch (error) {
            log.error('Failed to list datasets', { error: String(error) });
            res.status(500).json({ error: 'Failed to list datasets' });
        }
    }

    async getDataset(req: Request, res: Response): Promise<void> {
        try {
            const dataset = await ragService.getDatasetById(req.params['id']!);
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

    async createDataset(req: Request, res: Response): Promise<void> {
        try {
            const user = req.user
                ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
                : undefined;

            const dataset = await ragService.createDataset(req.body, user);

            // Sync to shared knowledgebase table (used by task executors)
            try {
                const kbData: Parameters<typeof ragDocumentService.createKnowledgebase>[0] = {
                    id: dataset.id,
                    name: dataset.name,
                };
                if (dataset.description) kbData.description = dataset.description;
                if (dataset.language) kbData.language = dataset.language;
                if (dataset.embedding_model) kbData.embedding_model = dataset.embedding_model;
                if (dataset.parser_id) kbData.parser_id = dataset.parser_id;
                if (dataset.parser_config) {
                    kbData.parser_config = typeof dataset.parser_config === 'string'
                        ? JSON.parse(dataset.parser_config) : dataset.parser_config;
                }
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

    async updateDataset(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        if (!id) { res.status(400).json({ error: 'ID is required' }); return; }

        try {
            const user = req.user
                ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
                : undefined;

            const dataset = await ragService.updateDataset(id, req.body, user);
            if (!dataset) { res.status(404).json({ error: 'Dataset not found' }); return; }

            try {
                await ragDocumentService.updateKnowledgebase(id, req.body);
            } catch (syncErr) {
                log.warn('Failed to sync dataset update to knowledgebase table', { error: String(syncErr) });
            }

            res.json(dataset);
        } catch (error: any) {
            log.error('Failed to update dataset', { error: String(error) });
            res.status(500).json({ error: error.message || 'Failed to update dataset' });
        }
    }

    async deleteDataset(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        if (!id) { res.status(400).json({ error: 'ID is required' }); return; }

        try {
            const user = req.user
                ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
                : undefined;

            await ragService.deleteDataset(id, user);

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

    async listDocuments(req: Request, res: Response): Promise<void> {
        try {
            const docs = await ragDocumentService.listDocuments(req.params['id']!);
            res.json(docs);
        } catch (error) {
            log.error('Failed to list documents', { error: String(error) });
            res.status(500).json({ error: 'Failed to list documents' });
        }
    }

    async uploadDocuments(req: Request, res: Response): Promise<void> {
        const datasetId = req.params['id'];
        if (!datasetId) { res.status(400).json({ error: 'Dataset ID is required' }); return; }

        try {
            const files = req.files as Express.Multer.File[] | undefined;
            if (!files || files.length === 0) {
                res.status(400).json({ error: 'No files provided' });
                return;
            }

            // Verify dataset exists in knowledgebase table
            const kb = await ragDocumentService.getKnowledgebase(datasetId);
            if (!kb) {
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

                // Create Document record
                const parserConfig = typeof kb.parser_config === 'string'
                    ? JSON.parse(kb.parser_config)
                    : kb.parser_config;
                await ragDocumentService.createDocument({
                    id: docId,
                    kb_id: datasetId.replace(/-/g, ''),
                    parser_id: kb.parser_id,
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

            // Update doc count
            await ragDocumentService.incrementDocCount(datasetId, results.length);

            res.status(201).json(results);
        } catch (error) {
            log.error('Failed to upload documents', { error: String(error) });
            res.status(500).json({ error: 'Failed to upload documents' });
        }
    }

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

    async deleteDocument(req: Request, res: Response): Promise<void> {
        const { id: datasetId, docId } = req.params;
        if (!datasetId || !docId) {
            res.status(400).json({ error: 'Dataset ID and document ID are required' });
            return;
        }

        try {
            await ragDocumentService.softDeleteDocument(docId!);
            res.status(204).send();
        } catch (error) {
            log.error('Failed to delete document', { error: String(error) });
            res.status(500).json({ error: 'Failed to delete document' });
        }
    }

    // -------------------------------------------------------------------------
    // Progress SSE
    // -------------------------------------------------------------------------

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
                await ragDocumentService.updateKnowledgebase(id, req.body);
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
                similarity_threshold: req.body.similarity_threshold || 0.2,
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

    async listChunks(req: Request, res: Response): Promise<void> {
        const datasetId = req.params['id'];
        if (!datasetId) { res.status(400).json({ error: 'Dataset ID is required' }); return; }

        try {
            const options: { doc_id?: string; page?: number; limit?: number } = {};
            if (req.query['doc_id']) options.doc_id = req.query['doc_id'] as string;
            if (req.query['page']) options.page = parseInt(req.query['page'] as string, 10);
            if (req.query['limit']) options.limit = parseInt(req.query['limit'] as string, 10);
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

    async runDocumentEnrichment(req: Request, res: Response): Promise<void> {
        const { id: datasetId, docId, enrichType } = req.params;
        if (!datasetId || !docId || !enrichType) {
            res.status(400).json({ error: 'Dataset ID, document ID, and enrichment type are required' });
            return;
        }

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
    // Document Versions
    // -------------------------------------------------------------------------

    /**
     * GET /datasets/:id/versions — list all versions for a dataset.
     * @param req - Express request with dataset ID param
     * @param res - Express response with array of versions
     */
    async listVersions(req: Request, res: Response): Promise<void> {
        try {
            const versions = await ragVersionService.listVersions(req.params['id']!);
            res.json(versions);
        } catch (error) {
            log.error('Failed to list versions', { error: String(error) });
            res.status(500).json({ error: 'Failed to list versions' });
        }
    }

    /**
     * POST /datasets/:id/versions — create a new version.
     * @param req - Express request with dataset ID and version body
     * @param res - Express response with created version
     */
    async createVersion(req: Request, res: Response): Promise<void> {
        const datasetId = req.params['id']!;
        try {
            const user = req.user
                ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) }
                : undefined;

            const version = await ragVersionService.createVersion(datasetId, req.body, user);
            res.status(201).json(version);
        } catch (error: any) {
            log.error('Failed to create version', { error: String(error) });
            const status = error.message?.includes('already exists') ? 409 : 500;
            res.status(status).json({ error: error.message || 'Failed to create version' });
        }
    }

    /**
     * PUT /datasets/:id/versions/:versionId — update a version.
     * @param req - Express request with version ID and update body
     * @param res - Express response with updated version
     */
    async updateVersion(req: Request, res: Response): Promise<void> {
        const { versionId } = req.params;
        if (!versionId) { res.status(400).json({ error: 'Version ID is required' }); return; }

        try {
            const version = await ragVersionService.updateVersion(versionId, req.body);
            if (!version) { res.status(404).json({ error: 'Version not found' }); return; }
            res.json(version);
        } catch (error) {
            log.error('Failed to update version', { error: String(error) });
            res.status(500).json({ error: 'Failed to update version' });
        }
    }

    /**
     * DELETE /datasets/:id/versions/:versionId — delete a version.
     * @param req - Express request with version ID
     * @param res - Express response (204 on success)
     */
    async deleteVersion(req: Request, res: Response): Promise<void> {
        const { versionId } = req.params;
        if (!versionId) { res.status(400).json({ error: 'Version ID is required' }); return; }

        try {
            await ragVersionService.deleteVersion(versionId);
            res.status(204).send();
        } catch (error) {
            log.error('Failed to delete version', { error: String(error) });
            res.status(500).json({ error: 'Failed to delete version' });
        }
    }

    // -------------------------------------------------------------------------
    // Version Documents
    // -------------------------------------------------------------------------

    /**
     * POST /datasets/:id/versions/:versionId/documents — upload files to a version.
     * @param req - Express request with multipart files
     * @param res - Express response with upload results
     */
    async uploadVersionDocuments(req: Request, res: Response): Promise<void> {
        const { id: datasetId, versionId } = req.params;
        if (!datasetId || !versionId) {
            res.status(400).json({ error: 'Dataset ID and version ID are required' });
            return;
        }

        try {
            const files = req.files as Express.Multer.File[] | undefined;
            if (!files || files.length === 0) {
                res.status(400).json({ error: 'No files provided' });
                return;
            }

            // Verify version exists
            const version = await ragVersionService.getVersion(versionId);
            if (!version) { res.status(404).json({ error: 'Version not found' }); return; }

            // Add file records to the version
            const fileNames = files.map(f => f.originalname || 'unknown');
            const fileRecords = await ragVersionService.addFiles(versionId, fileNames);

            // If the version has a RAGFlow dataset, upload directly
            if (version.ragflow_dataset_id) {
                const result = await ragUploadService.uploadFilesToRagflow(
                    versionId,
                    version.ragflow_dataset_id,
                    files.map(f => ({
                        originalname: f.originalname,
                        buffer: f.buffer,
                        size: f.size,
                    }))
                );
                res.status(201).json({ files: fileRecords, upload: result });
            } else {
                // Files registered but not uploaded to RAGFlow yet
                res.status(201).json({ files: fileRecords });
            }
        } catch (error) {
            log.error('Failed to upload version documents', { error: String(error) });
            res.status(500).json({ error: 'Failed to upload documents' });
        }
    }

    /**
     * GET /datasets/:id/versions/:versionId/documents — list version files with status.
     * @param req - Express request with version ID
     * @param res - Express response with file array
     */
    async listVersionDocuments(req: Request, res: Response): Promise<void> {
        const { versionId } = req.params;
        if (!versionId) { res.status(400).json({ error: 'Version ID is required' }); return; }

        try {
            const files = await ragVersionService.listVersionFiles(versionId);
            res.json(files);
        } catch (error) {
            log.error('Failed to list version documents', { error: String(error) });
            res.status(500).json({ error: 'Failed to list version documents' });
        }
    }

    /**
     * DELETE /datasets/:id/versions/:versionId/documents — bulk delete files.
     * @param req - Express request with file_ids in body
     * @param res - Express response (204 on success)
     */
    async deleteVersionDocuments(req: Request, res: Response): Promise<void> {
        const { versionId } = req.params;
        if (!versionId) { res.status(400).json({ error: 'Version ID is required' }); return; }

        try {
            await ragVersionService.deleteFiles(versionId, req.body.file_ids);
            res.status(204).send();
        } catch (error) {
            log.error('Failed to delete version documents', { error: String(error) });
            res.status(500).json({ error: 'Failed to delete version documents' });
        }
    }

    /**
     * POST /datasets/:id/versions/:versionId/documents/convert — queue conversion.
     * @param req - Express request with version ID
     * @param res - Express response with job details
     */
    async convertVersionDocuments(req: Request, res: Response): Promise<void> {
        const { id: datasetId, versionId } = req.params;
        if (!datasetId || !versionId) {
            res.status(400).json({ error: 'Dataset ID and version ID are required' });
            return;
        }

        try {
            // Get pending files for this version
            const files = await ragVersionService.listVersionFiles(versionId);
            const pendingFiles = files.filter(f => f.status === 'pending');

            if (pendingFiles.length === 0) {
                res.status(400).json({ error: 'No pending files to convert' });
                return;
            }

            // Enqueue conversion job
            const { job } = await ragConverterService.enqueueConversion({
                datasetId,
                versionId,
                fileNames: pendingFiles.map(f => f.file_name),
            });

            // Update file statuses to 'converting'
            for (const file of pendingFiles) {
                await ragVersionService.updateFileStatus(file.id, 'converting');
            }

            // Set manual trigger to start processing
            await ragConverterService.setManualTrigger();

            res.json({ job_id: job.id, file_count: pendingFiles.length, status: job.status });
        } catch (error) {
            log.error('Failed to queue conversion', { error: String(error) });
            res.status(500).json({ error: 'Failed to queue conversion' });
        }
    }

    /**
     * POST /datasets/:id/versions/:versionId/documents/parse — start RAGFlow parsing.
     * @param req - Express request with version ID
     * @param res - Express response with parse count
     */
    async parseVersionDocuments(req: Request, res: Response): Promise<void> {
        const { versionId } = req.params;
        if (!versionId) { res.status(400).json({ error: 'Version ID is required' }); return; }

        try {
            const queued = await ragUploadService.triggerParse(versionId);
            res.json({ queued, status: 'parsing' });
        } catch (error) {
            log.error('Failed to trigger parse', { error: String(error) });
            res.status(500).json({ error: 'Failed to trigger parsing' });
        }
    }

    /**
     * GET /datasets/:id/versions/:versionId/documents/status — sync status from RAGFlow.
     * @param req - Express request with version ID
     * @param res - Express response with file statuses
     */
    async syncVersionDocumentStatus(req: Request, res: Response): Promise<void> {
        const { versionId } = req.params;
        if (!versionId) { res.status(400).json({ error: 'Version ID is required' }); return; }

        try {
            const statuses = await ragUploadService.syncStatus(versionId);
            res.json(statuses);
        } catch (error) {
            log.error('Failed to sync document status', { error: String(error) });
            res.status(500).json({ error: 'Failed to sync document status' });
        }
    }

    /**
     * POST /datasets/:id/versions/:versionId/documents/requeue — retry failed conversions.
     * @param req - Express request with dataset and version IDs
     * @param res - Express response with new job details
     */
    async requeueVersionDocuments(req: Request, res: Response): Promise<void> {
        const { id: datasetId, versionId } = req.params;
        if (!datasetId || !versionId) {
            res.status(400).json({ error: 'Dataset ID and version ID are required' });
            return;
        }

        try {
            const job = await ragConverterService.requeueFailed(datasetId, versionId);
            if (!job) {
                res.status(400).json({ error: 'No failed files to requeue' });
                return;
            }

            // Set manual trigger to start processing
            await ragConverterService.setManualTrigger();

            res.json({ job_id: job.id, file_count: job.file_count, status: job.status });
        } catch (error) {
            log.error('Failed to requeue documents', { error: String(error) });
            res.status(500).json({ error: 'Failed to requeue documents' });
        }
    }
}
