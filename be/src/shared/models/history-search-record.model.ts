/**
 * @fileoverview History Search Record Model.
 *
 * Represents individual search records within history search sessions.
 * Stores search inputs, AI summaries, and file results.
 *
 * @module shared/models/history-search-record
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { Knex } from 'knex'

/**
 * History search record shape.
 * @description Defines the columns of the history_search_records table.
 */
export interface HistorySearchRecord {
    /** Primary key */
    id: string
    /** Session ID linking to parent session */
    session_id: string
    /** The search query text */
    search_input: string
    /** AI-generated summary of search results */
    ai_summary: string
    /** Array of file results */
    file_results: any[]
    /** Timestamp of creation */
    created_at: Date
}

/**
 * HistorySearchRecordModel
 * Provides CRUD operations for the history_search_records table.
 * @description Manages history search record entries with session-scoped queries.
 */
export class HistorySearchRecordModel extends BaseModel<HistorySearchRecord> {
    /** Database table name */
    protected tableName = 'history_search_records'
    /** Knex connection instance */
    protected knex: Knex = db

    /**
     * Find records by session ID and verify user ownership.
     * @param sessionId - The session ID to look up.
     * @param userEmail - The email of the requesting user.
     * @returns Promise<any[]> - Array of search records ordered by creation time.
     * @description Joins with sessions table to verify ownership before returning records.
     */
    async findBySessionIdAndUserEmail(sessionId: string, userEmail: string) {
        // Join with sessions table to verify ownership before returning records
        return await this.knex
            .select('history_search_records.*')
            .from(this.tableName)
            .join('history_search_sessions', 'history_search_records.session_id', 'history_search_sessions.session_id')
            .where('history_search_records.session_id', sessionId)
            .andWhere('history_search_sessions.user_email', userEmail)
            .orderBy('history_search_records.created_at', 'asc')
    }
}
