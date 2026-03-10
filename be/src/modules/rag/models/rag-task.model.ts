/**
 * RagTaskModel provides access to the Peewee 'task' table.
 * This table follows the RAGFlow Python convention.
 */

import { db } from '@/shared/db/knex.js'
import { TaskRow } from '@/shared/models/types.js'

function nowMs(): number {
    return Date.now();
}

function nowDatetime(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export class RagTaskModel {
    private readonly tableName = 'task';

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

    async findById(taskId: string): Promise<TaskRow | undefined> {
        return db(this.tableName).where({ id: taskId }).first();
    }
}
