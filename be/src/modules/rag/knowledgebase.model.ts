/**
 * KnowledgebaseModel provides access to the Peewee 'knowledgebase' table.
 * This table follows the RAGFlow Python convention (create_time as ms, string status).
 */

import { db } from '@/shared/db/knex.js'
import { KnowledgebaseRow } from '@/shared/models/types.js'

// Peewee uses Unix timestamp in milliseconds for create_time/update_time
function nowMs(): number {
    return Date.now();
}

function nowDatetime(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

const SYSTEM_TENANT_ID = process.env['SYSTEM_TENANT_ID'] || '00000000-0000-0000-0000-000000000001';

export class KnowledgebaseModel {
    private readonly tableName = 'knowledgebase';

    async create(data: {
        id: string;
        name: string;
        description?: string;
        language?: string;
        embedding_model?: string;
        parser_id?: string;
        parser_config?: Record<string, unknown>;
    }): Promise<void> {
        const now = nowMs();
        await db(this.tableName).insert({
            id: data.id.replace(/-/g, ''),
            tenant_id: SYSTEM_TENANT_ID,
            name: data.name,
            description: data.description || '',
            language: data.language || 'English',
            embd_id: data.embedding_model || '',
            parser_id: data.parser_id || 'naive',
            parser_config: JSON.stringify(data.parser_config || { pages: [[1, 1000000]] }),
            created_by: SYSTEM_TENANT_ID,
            permission: 'team',
            status: '1',
            doc_num: 0,
            token_num: 0,
            chunk_num: 0,
            create_time: now,
            create_date: nowDatetime(),
            update_time: now,
            update_date: nowDatetime(),
        });
    }

    async update(id: string, data: Record<string, unknown>): Promise<void> {
        const updateData: Record<string, unknown> = {
            ...data,
            update_time: nowMs(),
            update_date: nowDatetime(),
        };
        // Map field names from Node.js convention to Peewee column names
        if ('embedding_model' in updateData) {
            updateData['embd_id'] = updateData['embedding_model'];
            delete updateData['embedding_model'];
        }
        if ('parser_config' in updateData && typeof updateData['parser_config'] === 'object') {
            updateData['parser_config'] = JSON.stringify(updateData['parser_config']);
        }
        await db(this.tableName).where({ id: id.replace(/-/g, '') }).update(updateData);
    }

    async softDelete(id: string): Promise<void> {
        await db(this.tableName).where({ id: id.replace(/-/g, '') }).update({
            status: '0',
            update_time: nowMs(),
            update_date: nowDatetime(),
        });
    }

    async findById(id: string): Promise<KnowledgebaseRow | undefined> {
        return db(this.tableName).where({ id: id.replace(/-/g, '') }).first();
    }

    async incrementDocCount(id: string, count: number): Promise<void> {
        await db(this.tableName)
            .where({ id: id.replace(/-/g, '') })
            .increment('doc_num', count);
    }
}
