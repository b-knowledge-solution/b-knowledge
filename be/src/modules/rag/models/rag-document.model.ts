/**
 * @fileoverview RagDocumentModel — CRUD for the Peewee 'document' table.
 *
 * This table follows the RAGFlow Python convention where create_time/update_time
 * are Unix timestamps in milliseconds, status and run are string flags, and
 * IDs are 32-char hex strings (UUID without hyphens).
 *
 * @module modules/rag/models/rag-document
 */

import { db } from '@/shared/db/knex.js'
import { DocumentRow } from '@/shared/models/types.js'

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
 * @description Provides data access for the Peewee 'document' table shared between
 * the Node.js backend and Python advance-rag task executors.
 * Documents track parsing progress, chunk counts, and S3 storage locations.
 */
export class RagDocumentModel {
    private readonly tableName = 'document';

    /**
     * @description Create a new document record with RAGFlow-compatible defaults
     * @param {object} data - Document creation data
     * @param {string} data.id - Document UUID (hex, no hyphens)
     * @param {string} data.kb_id - Parent knowledgebase ID (hex, no hyphens)
     * @param {string} data.parser_id - Parser type identifier
     * @param {Record<string, unknown>} data.parser_config - Parser configuration
     * @param {string} data.name - Original filename
     * @param {string} data.location - S3 storage path
     * @param {number} data.size - File size in bytes
     * @param {string} data.suffix - File extension without dot
     * @param {string} data.type - File type category (pdf, doc, visual, aural)
     * @returns {Promise<void>}
     */
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
            process_duration: 0,
            token_num: 0,
            chunk_num: 0,
            create_time: now,
            create_date: nowDatetime(),
            update_time: now,
            update_date: nowDatetime(),
        });
    }

    /**
     * @description Update a document record by ID, automatically setting update timestamps
     * @param {string} docId - Document UUID (hyphens stripped automatically)
     * @param {Record<string, unknown>} data - Fields to update
     * @returns {Promise<void>}
     */
    async update(docId: string, data: Record<string, unknown>): Promise<void> {
        await db(this.tableName).where({ id: docId.replace(/-/g, '') }).update({
            ...data,
            update_time: nowMs(),
            update_date: nowDatetime(),
        });
    }

    /**
     * @description Find a document by ID
     * @param {string} docId - Document UUID (hyphens stripped automatically)
     * @returns {Promise<DocumentRow | undefined>} The document row or undefined
     */
    async findById(docId: string): Promise<DocumentRow | undefined> {
        return db(this.tableName).where({ id: docId.replace(/-/g, '') }).first();
    }

    /**
     * @description Find all documents in a dataset, ordered by creation time descending
     * @param {string} datasetId - Dataset/knowledgebase UUID (hyphens stripped automatically)
     * @returns {Promise<DocumentRow[]>} Array of document rows
     */
    async findByDatasetId(datasetId: string): Promise<DocumentRow[]> {
        return db(this.tableName)
            .where({ kb_id: datasetId.replace(/-/g, '') })
            .orderBy('create_time', 'desc');
    }

    /**
     * @description Find active documents in a dataset, ordered ascending (for advanced task processing)
     * @param {string} datasetId - Dataset/knowledgebase UUID (hyphens stripped automatically)
     * @returns {Promise<DocumentRow[]>} Array of active document rows
     */
    async findByDatasetIdAsc(datasetId: string): Promise<DocumentRow[]> {
        return db(this.tableName)
            .where({ kb_id: datasetId.replace(/-/g, ''), status: '1' })
            .orderBy('create_time', 'asc');
    }

    /**
     * @description Mark document as queued for parsing (matches Python begin2parse).
     * Sets a tiny random progress value so the UI shows the parsing indicator.
     * @param {string} docId - Document UUID
     * @returns {Promise<void>}
     */
    async beginParse(docId: string): Promise<void> {
        await this.update(docId, {
            // Small random progress (0-1%) signals "queued" state in the UI
            progress: Math.random() * 0.01,
            progress_msg: 'Task is queued...',
            process_begin_at: nowDatetime(),
            run: '1',
        });
    }

    /**
     * @description Hard-delete a document row from the table
     * @param {string} docId - Document UUID (hyphens stripped automatically)
     * @returns {Promise<void>}
     */
    async softDelete(docId: string): Promise<void> {
        await db(this.tableName).where({ id: docId.replace(/-/g, '') }).delete();
    }
}
