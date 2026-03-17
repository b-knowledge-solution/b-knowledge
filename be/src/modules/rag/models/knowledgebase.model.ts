/**
 * @fileoverview KnowledgebaseModel — CRUD for the Peewee 'knowledgebase' table.
 *
 * This table follows the RAGFlow Python convention where create_time/update_time
 * are stored as Unix timestamps in milliseconds and status is a string ('0'/'1').
 * IDs and tenant_id are stored as 32-char hex strings (UUID without hyphens).
 *
 * @module modules/rag/models/knowledgebase
 */

import { db } from '@/shared/db/knex.js'
import { KnowledgebaseRow } from '@/shared/models/types.js'

/**
 * @description Get current Unix timestamp in milliseconds (Peewee convention)
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

// RAGFlow stores tenant_id as a 32-char hex string (UUID without hyphens)
const SYSTEM_TENANT_ID = (
    process.env['SYSTEM_TENANT_ID'] || '00000000000000000000000000000001'
).replace(/-/g, '');

/**
 * @description Provides data access for the Peewee 'knowledgebase' table shared
 * between the Node.js backend and Python advance-rag task executors.
 * Column naming follows the RAGFlow Python convention (e.g., embd_id, parser_id).
 */
export class KnowledgebaseModel {
    private readonly tableName = 'knowledgebase';

    /**
     * @description Create a new knowledgebase record with RAGFlow-compatible defaults
     * @param {object} data - Knowledgebase creation data
     * @param {string} data.id - UUID of the knowledgebase (will be stripped of hyphens)
     * @param {string} data.name - Display name
     * @param {string} [data.description] - Optional description
     * @param {string} [data.language] - Document language (defaults to 'English')
     * @param {string} [data.embedding_model] - Embedding model identifier
     * @param {string} [data.parser_id] - Parser type (defaults to 'naive')
     * @param {Record<string, unknown>} [data.parser_config] - Parser configuration object
     * @param {number} [data.pagerank] - PageRank score for search boosting
     * @returns {Promise<void>}
     */
    async create(data: {
        id: string;
        name: string;
        description?: string;
        language?: string;
        embedding_model?: string;
        parser_id?: string;
        parser_config?: Record<string, unknown>;
        pagerank?: number;
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
            pagerank: data.pagerank || 0,
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

    /**
     * @description Update a knowledgebase record, mapping Node.js field names to Peewee column names
     * @param {string} id - UUID of the knowledgebase (hyphens stripped automatically)
     * @param {Record<string, unknown>} data - Fields to update (supports Node.js naming like embedding_model)
     * @returns {Promise<void>}
     */
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
        // Serialize parser_config object to JSON string for storage
        if ('parser_config' in updateData && typeof updateData['parser_config'] === 'object') {
            updateData['parser_config'] = JSON.stringify(updateData['parser_config']);
        }
        await db(this.tableName).where({ id: id.replace(/-/g, '') }).update(updateData);
    }

    /**
     * @description Soft-delete a knowledgebase by setting status to '0'
     * @param {string} id - UUID of the knowledgebase
     * @returns {Promise<void>}
     */
    async softDelete(id: string): Promise<void> {
        await db(this.tableName).where({ id: id.replace(/-/g, '') }).update({
            status: '0',
            update_time: nowMs(),
            update_date: nowDatetime(),
        });
    }

    /**
     * @description Find a knowledgebase by ID (hyphens stripped automatically)
     * @param {string} id - UUID of the knowledgebase
     * @returns {Promise<KnowledgebaseRow | undefined>} The knowledgebase row or undefined
     */
    async findById(id: string): Promise<KnowledgebaseRow | undefined> {
        return db(this.tableName).where({ id: id.replace(/-/g, '') }).first();
    }

    /**
     * @description Increment (or decrement) the doc_num counter on a knowledgebase
     * @param {string} id - UUID of the knowledgebase
     * @param {number} count - Amount to increment (negative to decrement)
     * @returns {Promise<void>}
     */
    async incrementDocCount(id: string, count: number): Promise<void> {
        await db(this.tableName)
            .where({ id: id.replace(/-/g, '') })
            .increment('doc_num', count);
    }
}
