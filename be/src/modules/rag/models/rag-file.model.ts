/**
 * RagFileModel provides access to the Peewee 'file' and 'file2document' tables.
 * These tables follow the RAGFlow Python convention.
 */

import { db } from '@/shared/db/knex.js'
import { getUuid } from '../services/rag-redis.service.js'

// RAGFlow stores tenant_id as a 32-char hex string (UUID without hyphens)
const SYSTEM_TENANT_ID = (
    process.env['SYSTEM_TENANT_ID'] || '00000000000000000000000000000001'
).replace(/-/g, '');

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

    /**
     * Delete file2document and file records for a given document ID.
     * @param documentId - The document ID to clean up
     */
    async deleteByDocumentId(documentId: string): Promise<void> {
        const docIdClean = documentId.replace(/-/g, '');

        // Find linked file IDs via file2document join table
        const links = await db('file2document')
            .where({ document_id: docIdClean })
            .select('file_id');

        // Delete join records
        await db('file2document').where({ document_id: docIdClean }).delete();

        // Delete file records (each file may be linked to only one document)
        for (const link of links) {
            await db('file').where({ id: link.file_id }).delete();
        }
    }
}
