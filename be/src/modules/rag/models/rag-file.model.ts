/**
 * @fileoverview RagFileModel — CRUD for the Peewee 'file' and 'file2document' tables.
 *
 * These tables follow the RAGFlow Python convention. The 'file' table stores
 * file metadata while 'file2document' is a join table linking files to documents.
 *
 * @module modules/rag/models/rag-file
 */

import { db } from '@/shared/db/knex.js'
import { getUuid } from '../services/rag-redis.service.js'

// RAGFlow stores tenant_id as a 32-char hex string (UUID without hyphens)
const SYSTEM_TENANT_ID = (
    process.env['SYSTEM_TENANT_ID'] || '00000000000000000000000000000001'
).replace(/-/g, '');

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
 * @description Provides data access for the Peewee 'file' and 'file2document' join tables.
 * Manages file metadata and file-to-document associations used by the RAGFlow pipeline.
 */
export class RagFileModel {
    /**
     * @description Create a file metadata record in the 'file' table
     * @param {object} data - File creation data
     * @param {string} data.id - File UUID (hex, no hyphens)
     * @param {string} data.name - Original filename
     * @param {string} data.location - S3 storage path
     * @param {number} data.size - File size in bytes
     * @param {string} data.type - File type category
     * @returns {Promise<void>}
     */
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

    /**
     * @description Create a file-to-document association in the 'file2document' join table
     * @param {string} fileId - File UUID (hex, no hyphens)
     * @param {string} documentId - Document UUID (hex, no hyphens)
     * @returns {Promise<void>}
     */
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
     * @description Delete file2document join records and associated file records for a document.
     * Cleans up both the join table and the file metadata table.
     * @param {string} documentId - The document ID to clean up (hyphens stripped automatically)
     * @returns {Promise<void>}
     */
    async deleteByDocumentId(documentId: string): Promise<void> {
        const docIdClean = documentId.replace(/-/g, '');

        // Find linked file IDs via file2document join table
        const links = await db('file2document')
            .where({ document_id: docIdClean })
            .select('file_id');

        // Delete join records first (referential integrity)
        await db('file2document').where({ document_id: docIdClean }).delete();

        // Delete file records (each file may be linked to only one document)
        for (const link of links) {
            await db('file').where({ id: link.file_id }).delete();
        }
    }
}
