/**
 * @fileoverview RAG document and task metadata service.
 *
 * Delegates all database operations to model classes via ModelFactory singletons
 * for the Peewee-schema tables (document, task, knowledgebase, file, file2document).
 * Table schemas match advance-rag/db/db_models.py.
 *
 * @module modules/rag/services/rag-document
 */

import { ModelFactory } from '@/shared/models/factory.js';
import { log } from '@/shared/services/logger.service.js';
import { getRedisClient } from '@/shared/services/redis.service.js';
import { DocumentRow, TaskRow, KnowledgebaseRow } from '@/shared/models/types.js';
import { ragSearchService } from './rag-search.service.js';

/**
 * @description Service layer for RAG document and task metadata operations.
 * Wraps ModelFactory calls for knowledgebase, document, file, and task CRUD,
 * providing a unified API for the RAG controller.
 */
export class RagDocumentService {
    // -----------------------------------------------------------------------
    // Knowledgebase (dataset in Peewee)
    // -----------------------------------------------------------------------

    /**
     * @description Create a new knowledgebase record in the Peewee table
     * @param {object} data - Knowledgebase creation data
     * @returns {Promise<void>}
     */
    async createKnowledgebase(data: {
        id: string;
        name: string;
        description?: string;
        language?: string;
        embedding_model?: string;
        tenant_embd_id?: string;
        parser_id?: string;
        parser_config?: Record<string, unknown>;
        pagerank?: number;
    }): Promise<void> {
        await ModelFactory.knowledgebase.create(data);
    }

    /**
     * @description Update a knowledgebase record with the given fields
     * @param {string} id - Knowledgebase UUID
     * @param {Record<string, unknown>} data - Fields to update
     * @returns {Promise<void>}
     */
    async updateKnowledgebase(id: string, data: Record<string, unknown>): Promise<void> {
        await ModelFactory.knowledgebase.update(id, data);
    }

    /**
     * @description Soft-delete a knowledgebase record by setting status to '0'
     * @param {string} id - Knowledgebase UUID
     * @returns {Promise<void>}
     */
    async deleteKnowledgebase(id: string): Promise<void> {
        await ModelFactory.knowledgebase.softDelete(id);
    }

    /**
     * @description Retrieve a knowledgebase record by ID
     * @param {string} id - Knowledgebase UUID
     * @returns {Promise<KnowledgebaseRow | undefined>} The knowledgebase row or undefined
     */
    async getKnowledgebase(id: string): Promise<KnowledgebaseRow | undefined> {
        return ModelFactory.knowledgebase.findById(id);
    }

    // -----------------------------------------------------------------------
    // Document
    // -----------------------------------------------------------------------

    /**
     * @description List all documents in a dataset, ordered by creation time descending
     * @param {string} datasetId - Dataset/knowledgebase UUID
     * @returns {Promise<DocumentRow[]>} Array of document rows
     */
    async listDocuments(datasetId: string): Promise<DocumentRow[]> {
        return ModelFactory.ragDocument.findByDatasetId(datasetId);
    }

    /**
     * @description Retrieve a single document by ID
     * @param {string} docId - Document UUID
     * @returns {Promise<DocumentRow | undefined>} The document row or undefined
     */
    async getDocument(docId: string): Promise<DocumentRow | undefined> {
        return ModelFactory.ragDocument.findById(docId);
    }

    /**
     * @description Create a new document record in the Peewee 'document' table
     * @param {object} data - Document creation data including kb_id, parser settings, and file info
     * @param {string} [data.source_type] - Source type: 'local' (default) or 'web_crawl'
     * @param {string} [data.source_url] - Original URL for web-crawled documents
     * @returns {Promise<void>}
     */
    async createDocument(data: {
        id: string;
        kb_id: string;
        parser_id: string;
        parser_config: Record<string, unknown>;
        name: string;
        location: string;
        size: number;
        suffix: string;
        type: string;
        source_type?: string;
        source_url?: string;
    }): Promise<void> {
        await ModelFactory.ragDocument.create(data);
    }

    /**
     * @description Update a document record with the given fields
     * @param {string} docId - Document UUID
     * @param {Record<string, unknown>} data - Fields to update
     * @returns {Promise<void>}
     */
    async updateDocument(docId: string, data: Record<string, unknown>): Promise<void> {
        await ModelFactory.ragDocument.update(docId, data);
    }

    /**
     * @description Hard-delete a document record from the 'document' table
     * @param {string} docId - Document UUID
     * @returns {Promise<void>}
     */
    async softDeleteDocument(docId: string): Promise<void> {
        await ModelFactory.ragDocument.softDelete(docId);
    }

    /**
     * @description Mark document as queued for parsing (matches Python begin2parse).
     * Sets a small random progress to signal "queued" state in the UI.
     * @param {string} docId - Document UUID
     * @returns {Promise<void>}
     */
    async beginParse(docId: string): Promise<void> {
        await ModelFactory.ragDocument.beginParse(docId);
    }

    /**
     * @description Get active documents for a dataset (for advanced tasks like GraphRAG/RAPTOR)
     * @param {string} datasetId - Dataset UUID
     * @returns {Promise<DocumentRow[]>} Array of active document rows ordered by creation time ascending
     */
    async getDatasetDocuments(datasetId: string): Promise<DocumentRow[]> {
        return ModelFactory.ragDocument.findByDatasetIdAsc(datasetId);
    }

    // -----------------------------------------------------------------------
    // File + File2Document
    // -----------------------------------------------------------------------

    /**
     * @description Create a file metadata record in the Peewee 'file' table
     * @param {object} data - File creation data including id, name, location, size, and type
     * @returns {Promise<void>}
     */
    async createFile(data: {
        id: string;
        name: string;
        location: string;
        size: number;
        type: string;
    }): Promise<void> {
        await ModelFactory.ragFile.createFile(data);
    }

    /**
     * @description Create a file-to-document association in the 'file2document' join table
     * @param {string} fileId - File UUID
     * @param {string} documentId - Document UUID
     * @returns {Promise<void>}
     */
    async createFile2Document(fileId: string, documentId: string): Promise<void> {
        await ModelFactory.ragFile.createFile2Document(fileId, documentId);
    }

    /**
     * Delete file and file2document records for a given document ID.
     * @param docId - Document ID to clean up
     */
    async deleteFileRecords(docId: string): Promise<void> {
        await ModelFactory.ragFile.deleteByDocumentId(docId);
    }

    // -----------------------------------------------------------------------
    // Task
    // -----------------------------------------------------------------------

    /**
     * @description Create a new task record in the Peewee 'task' table
     * @param {Partial<TaskRow>} data - Task creation data (id and doc_id are required)
     * @returns {Promise<void>}
     */
    async createTask(data: Partial<TaskRow>): Promise<void> {
        await ModelFactory.ragTask.create(data);
    }

    /**
     * @description Retrieve a task record by ID
     * @param {string} taskId - Task UUID
     * @returns {Promise<TaskRow | undefined>} The task row or undefined
     */
    async getTask(taskId: string): Promise<TaskRow | undefined> {
        return ModelFactory.ragTask.findById(taskId);
    }

    /**
     * @description Get the current status of a task with computed status label
     * @param {string} taskId - Task UUID
     * @returns {Promise<object>} Task status with progress, message, and computed status (done/failed/running/not_found)
     */
    async getTaskStatus(taskId: string): Promise<{
        task_id: string;
        task_type: string;
        progress: number;
        progress_msg: string;
        status: 'done' | 'failed' | 'running' | 'not_found';
    }> {
        const task = await this.getTask(taskId);
        // Return not_found if task does not exist
        if (!task) {
            return { task_id: taskId, task_type: '', progress: 0, progress_msg: '', status: 'not_found' };
        }
        // Derive status from progress: 1 = done, -1 = failed, anything else = running
        return {
            task_id: taskId,
            task_type: task.task_type || 'parse',
            progress: task.progress,
            progress_msg: task.progress_msg,
            status: task.progress === 1 ? 'done' : task.progress === -1 ? 'failed' : 'running',
        };
    }

    /**
     * @description Get the advanced task status for a dataset (graphrag/raptor/mindmap).
     * Reads the task ID from the knowledgebase record's {taskType}_task_id field.
     * @param {string} datasetId - Dataset UUID
     * @param {string} taskType - Task type ('graphrag', 'raptor', or 'mindmap')
     * @returns {Promise<object>} Task status with progress and computed status label
     */
    async getAdvancedTaskStatus(datasetId: string, taskType: string): Promise<{
        task_id: string | null;
        task_type: string;
        progress?: number;
        progress_msg?: string;
        status: string;
    }> {
        const kb = await this.getKnowledgebase(datasetId);
        if (!kb) {
            return { task_id: null, task_type: taskType, status: 'not_found' };
        }

        const taskIdField = `${taskType}_task_id` as keyof KnowledgebaseRow;
        const taskId = kb[taskIdField] as string | null;
        if (!taskId) {
            return { task_id: null, task_type: taskType, status: 'not_started' };
        }

        const task = await this.getTask(taskId);
        if (!task) {
            return { task_id: taskId, task_type: taskType, status: 'not_found' };
        }

        return {
            task_id: taskId,
            task_type: taskType,
            progress: task.progress,
            progress_msg: task.progress_msg,
            status: task.progress === 1 ? 'done' : task.progress === -1 ? 'failed' : 'running',
        };
    }

    /**
     * @description Check if an advanced task is already running for a dataset.
     * Returns true if a task is in progress (should block new submissions).
     * @param {string} datasetId - Dataset UUID
     * @param {string} taskType - Task type ('graphrag', 'raptor', or 'mindmap')
     * @returns {Promise<boolean>} True if a task of this type is currently running
     */
    async isAdvancedTaskRunning(datasetId: string, taskType: string): Promise<boolean> {
        const kb = await this.getKnowledgebase(datasetId);
        if (!kb) return false;

        const taskIdField = `${taskType}_task_id` as keyof KnowledgebaseRow;
        const taskId = kb[taskIdField] as string | null;
        if (!taskId) return false;

        const task = await this.getTask(taskId);
        if (!task) return false;

        // Task is running if progress is neither done (1) nor failed (-1)
        return task.progress !== -1 && task.progress !== 1;
    }

    /**
     * @description Increment (or decrement) the doc_num counter on a knowledgebase
     * @param {string} datasetId - Dataset UUID
     * @param {number} count - Amount to increment (negative to decrement)
     * @returns {Promise<void>}
     */
    async incrementDocCount(datasetId: string, count: number): Promise<void> {
        await ModelFactory.knowledgebase.incrementDocCount(datasetId, count);
    }

    // -----------------------------------------------------------------------
    // Per-Document Parser Change
    // -----------------------------------------------------------------------

    /**
     * @description Change a document's parser and reset for re-parsing
     * @param {string} datasetId - Dataset ID
     * @param {string} docId - Document ID
     * @param {object} data - New parser_id and optional parser_config
     * @returns {Promise<any>} Updated document record
     * @throws {Error} If document not found or currently being parsed (409)
     */
    async changeDocumentParser(
        datasetId: string,
        docId: string,
        data: { parser_id: string; parser_config?: Record<string, unknown> },
    ): Promise<any> {
        const doc = await this.getDocument(docId)
        // Guard: document must exist and belong to this dataset
        if (!doc || doc.kb_id !== datasetId) throw new Error('Document not found in this dataset')
        // Guard: cannot change parser while parsing is in progress
        if (doc.run === '1') {
            const error = new Error('Cannot change parser while document is being parsed')
            ;(error as any).statusCode = 409
            throw error
        }
        // Skip if parser is unchanged and no new config provided
        if (doc.parser_id === data.parser_id && !data.parser_config) return doc
        // Delete existing chunks from OpenSearch before resetting
        await ragSearchService.deleteChunksByDocId(datasetId, docId)
        // Reset document metadata for re-parsing
        const updateData: Record<string, unknown> = {
            parser_id: data.parser_id,
            progress: 0,
            progress_msg: '',
            run: '0',
            chunk_num: 0,
            token_num: 0,
        }
        if (data.parser_config) {
            updateData.parser_config = JSON.stringify(data.parser_config)
        }
        await this.updateDocument(docId, updateData)
        return { ...doc, ...updateData }
    }

    // -----------------------------------------------------------------------
    // Web Crawl
    // -----------------------------------------------------------------------

    /**
     * @description Validate URL is not targeting internal networks (SSRF prevention)
     * @param {string} urlString - URL to validate
     * @throws {Error} If URL targets a private/internal IP range
     */
    private validateUrlSafety(urlString: string): void {
        const url = new URL(urlString)
        const hostname = url.hostname
        // Block private and loopback IP ranges
        const privatePatterns = [
            /^10\./,
            /^172\.(1[6-9]|2\d|3[01])\./,
            /^192\.168\./,
            /^127\./,
            /^0\./,
            /^localhost$/i,
            /^::1$/,
            /^fe80:/i,
            /^169\.254\./,              // IPv4 link-local (AWS/GCP/Azure metadata 169.254.169.254)
            /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // Shared Address Space RFC 6598
            /^\[?::ffff:/i,             // IPv4-mapped IPv6
            /^f[cd][0-9a-f]{2}:/i,     // IPv6 ULA fc00::/7 + fd00::/8
        ]
        for (const pattern of privatePatterns) {
            if (pattern.test(hostname)) {
                throw new Error('URL targets a private/internal network address')
            }
        }
    }

    /**
     * @description Create a document from a web URL and push a crawl task to Redis
     * for the advance-rag worker. The worker listens on the 'rag_web_crawl' Redis list,
     * fetches the URL content, converts it to PDF, and triggers parsing.
     * @param {string} datasetId - Dataset ID
     * @param {object} data - URL, optional name, auto_parse flag
     * @returns {Promise<any>} Placeholder document record
     * @throws {Error} If URL is unsafe, dataset not found, or Redis unavailable
     */
    async webCrawlDocument(
        datasetId: string,
        data: { url: string; name?: string; auto_parse?: boolean },
    ): Promise<any> {
        // Validate URL against SSRF before proceeding
        this.validateUrlSafety(data.url)
        const url = new URL(data.url)
        // Use provided name or derive from URL hostname + path
        const name = data.name || `${url.hostname}${url.pathname}`.replace(/\/$/, '').substring(0, 255)
        const dataset = await this.getKnowledgebase(datasetId)
        if (!dataset) throw new Error('Dataset not found')

        // Generate a UUID hex string (32 chars, no hyphens) matching RAGFlow format
        const docId = crypto.randomUUID().replace(/-/g, '')

        // Create placeholder document through the service API
        await this.createDocument({
            id: docId,
            kb_id: datasetId,
            name,
            type: 'pdf',
            suffix: 'pdf',
            location: '',
            size: 0,
            parser_id: dataset.parser_id || 'naive',
            parser_config: dataset.parser_config
                ? (typeof dataset.parser_config === 'string'
                    ? JSON.parse(dataset.parser_config as string)
                    : dataset.parser_config) as Record<string, unknown>
                : {},
            source_type: 'web_crawl',
            source_url: data.url,
        })

        // Set initial progress message for the UI
        await ModelFactory.ragDocument.update(docId, {
            progress_msg: 'Queued for web crawl',
        })

        // Push crawl task to Redis list for advance-rag worker consumption
        const redisClient = getRedisClient()
        if (!redisClient) {
            log.error('Redis not available — cannot queue web crawl task', { docId, url: data.url })
            throw new Error('Redis not available for web crawl queue')
        }

        const taskPayload = JSON.stringify({
            doc_id: docId,
            kb_id: datasetId,
            url: data.url,
            auto_parse: data.auto_parse ?? true,
            created_at: new Date().toISOString(),
        })

        // LPUSH to the rag_web_crawl list; advance-rag worker BRPOPs from this list
        await redisClient.lPush('rag_web_crawl', taskPayload)
        log.info('Queued web crawl task to Redis', { docId, datasetId, url: data.url })

        const doc = await this.getDocument(docId)
        return doc
    }

    // -----------------------------------------------------------------------
    // Bulk Operations
    // -----------------------------------------------------------------------

    /**
     * Cancel parsing for a document (reset run status).
     * @param docId - Document ID to cancel
     */
    async cancelParse(docId: string): Promise<void> {
        try {
            await ModelFactory.ragDocument.update(docId, {
                run: '2',
                progress: 0,
                progress_msg: '',
            });
        } catch (err) {
            log.error('Failed to cancel parse', { docId, error: String(err) });
            throw err;
        }
    }

    /**
     * Soft-delete multiple documents.
     * @param docIds - Array of document IDs
     */
    async bulkSoftDelete(docIds: string[]): Promise<void> {
        for (const docId of docIds) {
            await ModelFactory.ragDocument.softDelete(docId);
        }
    }

    /**
     * Toggle availability status for multiple documents.
     * @param docIds - Array of document IDs
     * @param enabled - Whether to enable (status '1') or disable (status '0')
     */
    async bulkToggle(docIds: string[], enabled: boolean): Promise<void> {
        const status = enabled ? '1' : '0';
        for (const docId of docIds) {
            await ModelFactory.ragDocument.update(docId, { status });
        }
    }
    /**
     * Get all tasks/logs for a specific document.
     * @param docId - Document ID
     * @returns Array of TaskRow ordered by creation time desc
     */
    async getDocumentLogs(docId: string): Promise<TaskRow[]> {
        return ModelFactory.ragTask.findByDocId(docId);
    }

    /**
     * Get paginated tasks/logs for a dataset.
     * @param datasetId - Dataset ID
     * @param options - Pagination and filter options
     * @returns Paginated logs with total count
     */
    async getDatasetLogs(
        datasetId: string,
        options: { page?: number; limit?: number; status?: string } = {}
    ): Promise<{ logs: (TaskRow & { document_name?: string; document_suffix?: string })[]; total: number }> {
        return ModelFactory.ragTask.findByDatasetId(datasetId, options);
    }

    /**
     * Get overview statistics for a dataset.
     * @param datasetId - Dataset ID
     * @returns Stats object with document count and task status breakdowns
     */
    async getOverviewStats(datasetId: string): Promise<{
        total_documents: number;
        finished: number;
        failed: number;
        processing: number;
        cancelled: number;
    }> {
        return ModelFactory.ragTask.getOverviewStats(datasetId);
    }
}

/** Singleton instance of the RAG document service */
export const ragDocumentService = new RagDocumentService();
