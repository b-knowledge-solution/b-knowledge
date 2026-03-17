/**
 * @fileoverview RagTaskModel — CRUD for the Peewee 'task' table.
 *
 * Tasks track document parsing progress, advanced processing (GraphRAG, RAPTOR),
 * and enrichment jobs. Progress is stored as a float: 0 = queued, 0..1 = running,
 * 1 = done, -1 = failed. This table follows the RAGFlow Python convention.
 *
 * @module modules/rag/models/rag-task
 */

import { db } from '@/shared/db/knex.js'
import { TaskRow } from '@/shared/models/types.js'

/**
 * @description Get current Unix timestamp in milliseconds
 * @returns {number} Current time in milliseconds
 */
function nowMs(): number {
    return Date.now();
}

/**
 * @description Format current time as 'YYYY-MM-DD HH:MM:SS' for Peewee date columns
 * @returns {string} Formatted datetime string
 */
function nowDatetime(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * @description Provides data access for the Peewee 'task' table.
 * Supports creation, lookup, pagination, and aggregate statistics for RAG processing tasks.
 */
export class RagTaskModel {
    private readonly tableName = 'task';

    /**
     * @description Create a new task record with RAGFlow-compatible defaults
     * @param {Partial<TaskRow>} data - Task creation data (id and doc_id are required)
     * @returns {Promise<void>}
     */
    async create(data: Partial<TaskRow>): Promise<void> {
        const now = nowMs();
        await db(this.tableName).insert({
            id: data.id,
            doc_id: data.doc_id,
            from_page: data.from_page ?? 0,
            to_page: data.to_page ?? 100000000,
            task_type: data.task_type ?? '',
            priority: data.priority ?? 0,
            progress: data.progress ?? 0,
            progress_msg: data.progress_msg ?? '',
            begin_at: data.begin_at ?? nowDatetime(),
            digest: data.digest ?? '',
            chunk_ids: data.chunk_ids ?? '',
            retry_count: 0,
            process_duration: 0,
            create_time: now,
            create_date: nowDatetime(),
            update_time: now,
            update_date: nowDatetime(),
        });
    }

    /**
     * @description Find a task by its ID
     * @param {string} taskId - Task UUID (hex, no hyphens)
     * @returns {Promise<TaskRow | undefined>} The task row or undefined
     */
    async findById(taskId: string): Promise<TaskRow | undefined> {
        return db(this.tableName).where({ id: taskId }).first();
    }

    /**
     * Find all tasks associated with a document, ordered by creation time desc.
     * @param docId - Document ID (hex, no hyphens)
     * @returns Array of TaskRow
     */
    async findByDocId(docId: string): Promise<TaskRow[]> {
        return db(this.tableName)
            .where({ doc_id: docId.replace(/-/g, '') })
            .orderBy('create_time', 'desc');
    }

    /**
     * Find all tasks for a dataset by joining task → document.
     * Supports pagination and optional status filtering.
     * @param kbId - Dataset/knowledgebase ID (hex, no hyphens)
     * @param options - Pagination and filter options
     * @returns Object with logs array and total count
     */
    async findByDatasetId(
        kbId: string,
        options: { page?: number; limit?: number; status?: string } = {}
    ): Promise<{ logs: (TaskRow & { document_name?: string; document_suffix?: string })[]; total: number }> {
        const { page = 1, limit = 20, status } = options;
        const normalizedKbId = kbId.replace(/-/g, '');

        let baseQuery = db(this.tableName)
            .join('document', 'task.doc_id', '=', 'document.id')
            .where('document.kb_id', normalizedKbId);

        // Filter by status if provided
        if (status === 'done') {
            baseQuery = baseQuery.where('task.progress', 1);
        } else if (status === 'failed') {
            baseQuery = baseQuery.where('task.progress', -1);
        } else if (status === 'running') {
            baseQuery = baseQuery.where('task.progress', '>', 0).where('task.progress', '<', 1);
        }

        // Get total count
        const countResult = await baseQuery.clone().count('task.id as count').first();
        const total = Number(countResult?.count ?? 0);

        // Get paginated results
        const logs = await baseQuery
            .select(
                'task.*',
                'document.name as document_name',
                'document.suffix as document_suffix'
            )
            .orderBy('task.create_time', 'desc')
            .offset((page - 1) * limit)
            .limit(limit);

        return { logs, total };
    }

    /**
     * Get overview stats for a dataset: count tasks by status.
     * @param kbId - Dataset/knowledgebase ID (hex, no hyphens)
     * @returns Counts of finished, failed, processing, and cancelled tasks
     */
    async getOverviewStats(kbId: string): Promise<{
        total_documents: number;
        finished: number;
        failed: number;
        processing: number;
        cancelled: number;
    }> {
        const normalizedKbId = kbId.replace(/-/g, '');

        // Count documents for this dataset
        const docCount = await db('document')
            .where({ kb_id: normalizedKbId })
            .count('id as count')
            .first();

        // Aggregate task statuses via join
        const stats = await db(this.tableName)
            .join('document', 'task.doc_id', '=', 'document.id')
            .where('document.kb_id', normalizedKbId)
            .select(
                db.raw('COUNT(CASE WHEN task.progress = 1 THEN 1 END) as finished'),
                db.raw('COUNT(CASE WHEN task.progress = -1 THEN 1 END) as failed'),
                db.raw('COUNT(CASE WHEN task.progress > 0 AND task.progress < 1 THEN 1 END) as processing'),
                db.raw("COUNT(CASE WHEN task.progress = 0 AND task.progress_msg LIKE '%cancel%' THEN 1 END) as cancelled")
            )
            .first();

        return {
            total_documents: Number(docCount?.count ?? 0),
            finished: Number(stats?.finished ?? 0),
            failed: Number(stats?.failed ?? 0),
            processing: Number(stats?.processing ?? 0),
            cancelled: Number(stats?.cancelled ?? 0),
        };
    }
}
