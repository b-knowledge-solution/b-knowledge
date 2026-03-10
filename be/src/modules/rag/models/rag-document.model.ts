/**
 * RagDocumentModel provides access to the Peewee 'document' table.
 * This table follows the RAGFlow Python convention (create_time as ms, string status).
 */

import { db } from '@/shared/db/knex.js'
import { DocumentRow } from '@/shared/models/types.js'

const SYSTEM_TENANT_ID = process.env['SYSTEM_TENANT_ID'] || '00000000-0000-0000-0000-000000000001';

function nowMs(): number {
    return Date.now();
}

function nowDatetime(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export class RagDocumentModel {
    private readonly tableName = 'document';

    async create(data: {
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
        const now = nowMs();
        await db(this.tableName).insert({
            id: data.id,
            kb_id: data.kb_id,
            parser_id: data.parser_id,
            parser_config: JSON.stringify(data.parser_config),
            source_type: 'local',
            type: data.type,
            created_by: SYSTEM_TENANT_ID,
            name: data.name,
            location: data.location,
            size: data.size,
            suffix: data.suffix,
            run: '0',
            status: '1',
            progress: 0,
            progress_msg: '',
            token_num: 0,
            chunk_num: 0,
            create_time: now,
            create_date: nowDatetime(),
            update_time: now,
            update_date: nowDatetime(),
        });
    }

    async update(docId: string, data: Record<string, unknown>): Promise<void> {
        await db(this.tableName).where({ id: docId.replace(/-/g, '') }).update({
            ...data,
            update_time: nowMs(),
            update_date: nowDatetime(),
        });
    }

    async findById(docId: string): Promise<DocumentRow | undefined> {
        return db(this.tableName).where({ id: docId.replace(/-/g, '') }).first();
    }

    async findByDatasetId(datasetId: string): Promise<DocumentRow[]> {
        return db(this.tableName)
            .where({ kb_id: datasetId.replace(/-/g, ''), status: '1' })
            .orderBy('create_time', 'desc');
    }

    async findByDatasetIdAsc(datasetId: string): Promise<DocumentRow[]> {
        return db(this.tableName)
            .where({ kb_id: datasetId.replace(/-/g, ''), status: '1' })
            .orderBy('create_time', 'asc');
    }

    /**
     * Mark document as queued for parsing (matches Python begin2parse).
     */
    async beginParse(docId: string): Promise<void> {
        await this.update(docId, {
            progress: Math.random() * 0.01,
            progress_msg: 'Task is queued...',
            process_begin_at: nowDatetime(),
            run: '1',
        });
    }

    async softDelete(docId: string): Promise<void> {
        await this.update(docId, { status: '0' });
    }
}
