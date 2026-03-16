/**
 * RAG document & task metadata service.
 *
 * Delegates all database operations to model classes. Previously accessed
 * PostgreSQL tables directly; now uses ModelFactory singletons for the
 * Peewee-schema tables (document, task, knowledgebase, file, file2document).
 *
 * Table schemas match advance-rag/db/db_models.py.
 */

import { ModelFactory } from '@/shared/models/factory.js';
import { log } from '@/shared/services/logger.service.js';
import { DocumentRow, TaskRow, KnowledgebaseRow } from '@/shared/models/types.js';

export class RagDocumentService {
    // -----------------------------------------------------------------------
    // Knowledgebase (dataset in Peewee)
    // -----------------------------------------------------------------------

    async createKnowledgebase(data: {
        id: string;
        name: string;
        description?: string;
        language?: string;
        embedding_model?: string;
        parser_id?: string;
        parser_config?: Record<string, unknown>;
        pagerank?: number;
    }): Promise<void> {
        await ModelFactory.knowledgebase.create(data);
    }

    async updateKnowledgebase(id: string, data: Record<string, unknown>): Promise<void> {
        await ModelFactory.knowledgebase.update(id, data);
    }

    async deleteKnowledgebase(id: string): Promise<void> {
        await ModelFactory.knowledgebase.softDelete(id);
    }

    async getKnowledgebase(id: string): Promise<KnowledgebaseRow | undefined> {
        return ModelFactory.knowledgebase.findById(id);
    }

    // -----------------------------------------------------------------------
    // Document
    // -----------------------------------------------------------------------

    async listDocuments(datasetId: string): Promise<DocumentRow[]> {
        return ModelFactory.ragDocument.findByDatasetId(datasetId);
    }

    async getDocument(docId: string): Promise<DocumentRow | undefined> {
        return ModelFactory.ragDocument.findById(docId);
    }

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
    }): Promise<void> {
        await ModelFactory.ragDocument.create(data);
    }

    async updateDocument(docId: string, data: Record<string, unknown>): Promise<void> {
        await ModelFactory.ragDocument.update(docId, data);
    }

    async softDeleteDocument(docId: string): Promise<void> {
        await ModelFactory.ragDocument.softDelete(docId);
    }

    /**
     * Mark document as queued for parsing (matches Python begin2parse).
     */
    async beginParse(docId: string): Promise<void> {
        await ModelFactory.ragDocument.beginParse(docId);
    }

    /**
     * Get parsed document IDs for a dataset (for advanced tasks).
     */
    async getDatasetDocuments(datasetId: string): Promise<DocumentRow[]> {
        return ModelFactory.ragDocument.findByDatasetIdAsc(datasetId);
    }

    // -----------------------------------------------------------------------
    // File + File2Document
    // -----------------------------------------------------------------------

    async createFile(data: {
        id: string;
        name: string;
        location: string;
        size: number;
        type: string;
    }): Promise<void> {
        await ModelFactory.ragFile.createFile(data);
    }

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

    async createTask(data: Partial<TaskRow>): Promise<void> {
        await ModelFactory.ragTask.create(data);
    }

    async getTask(taskId: string): Promise<TaskRow | undefined> {
        return ModelFactory.ragTask.findById(taskId);
    }

    async getTaskStatus(taskId: string): Promise<{
        task_id: string;
        task_type: string;
        progress: number;
        progress_msg: string;
        status: 'done' | 'failed' | 'running' | 'not_found';
    }> {
        const task = await this.getTask(taskId);
        if (!task) {
            return { task_id: taskId, task_type: '', progress: 0, progress_msg: '', status: 'not_found' };
        }
        return {
            task_id: taskId,
            task_type: task.task_type || 'parse',
            progress: task.progress,
            progress_msg: task.progress_msg,
            status: task.progress === 1 ? 'done' : task.progress === -1 ? 'failed' : 'running',
        };
    }

    /**
     * Get the advanced task status for a dataset (graphrag/raptor/mindmap).
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
     * Check if an advanced task is already running for a dataset.
     * Returns true if a task is in progress (should block new submissions).
     */
    async isAdvancedTaskRunning(datasetId: string, taskType: string): Promise<boolean> {
        const kb = await this.getKnowledgebase(datasetId);
        if (!kb) return false;

        const taskIdField = `${taskType}_task_id` as keyof KnowledgebaseRow;
        const taskId = kb[taskIdField] as string | null;
        if (!taskId) return false;

        const task = await this.getTask(taskId);
        if (!task) return false;

        return task.progress !== -1 && task.progress !== 1;
    }

    /**
     * Increment doc_num on a knowledgebase.
     */
    async incrementDocCount(datasetId: string, count: number): Promise<void> {
        await ModelFactory.knowledgebase.incrementDocCount(datasetId, count);
    }

    // -----------------------------------------------------------------------
    // Bulk Operations
    // -----------------------------------------------------------------------

    /**
     * Cancel parsing for a document (reset run status).
     * @param docId - Document ID to cancel
     */
    async cancelParse(docId: string): Promise<void> {
        await ModelFactory.ragDocument.update(docId, {
            run: '2',
            progress: 0,
            progress_msg: '',
        });
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
}

export const ragDocumentService = new RagDocumentService();
