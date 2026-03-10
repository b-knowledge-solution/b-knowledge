/**
 * RagFileModel provides access to the Peewee 'file' and 'file2document' tables.
 * These tables follow the RAGFlow Python convention.
 */

import { db } from '@/shared/db/knex.js'
import { getUuid } from './rag-redis.service.js'

const SYSTEM_TENANT_ID = process.env['SYSTEM_TENANT_ID'] || '00000000-0000-0000-0000-000000000001';

function nowMs(): number {
    return Date.now();
}

function nowDatetime(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export class RagFileModel {
    async createFile(data: {
        id: string;
        name: string;
        location: string;
        size: number;
        type: string;
    }): Promise<void> {
        const now = nowMs();
        await db('file').insert({
            id: data.id,
            parent_id: '',
            tenant_id: SYSTEM_TENANT_ID,
            created_by: SYSTEM_TENANT_ID,
            name: data.name,
            location: data.location,
            size: data.size,
            type: data.type,
            source_type: '',
            create_time: now,
            create_date: nowDatetime(),
            update_time: now,
            update_date: nowDatetime(),
        });
    }

    async createFile2Document(fileId: string, documentId: string): Promise<void> {
        const now = nowMs();
        await db('file2document').insert({
            id: getUuid(),
            file_id: fileId,
            document_id: documentId,
            create_time: now,
            create_date: nowDatetime(),
            update_time: now,
            update_date: nowDatetime(),
        });
    }
}
