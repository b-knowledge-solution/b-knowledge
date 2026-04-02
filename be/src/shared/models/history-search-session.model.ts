/**
 * @fileoverview History Search Session Model.
 *
 * Represents search sessions received from external clients.
 * Stores session metadata for grouping search records.
 *
 * @module shared/models/history-search-session
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { Knex } from 'knex'

/**
 * History search session record shape.
 * @description Defines the columns of the history_search_sessions table.
 */
export interface HistorySearchSession {
    /** Primary key */
    id: string
    /** External session identifier */
    session_id: string
    /** Share ID linking to a knowledge base source */
    share_id?: string
    /** Email of the user who initiated the session */
    user_email?: string
    /** Timestamp of creation */
    created_at: Date
    /** Timestamp of last update */
    updated_at: Date
}

/**
 * HistorySearchSessionModel
 * Provides CRUD operations for the history_search_sessions table.
 * @description Manages history search session records with user history queries.
 */
export class HistorySearchSessionModel extends BaseModel<HistorySearchSession> {
    /** Database table name */
    protected tableName = 'history_search_sessions'
    /** Knex connection instance */
    protected knex: Knex = db

    /**
     * Find search history for a specific user with pagination and filters.
     * @param userEmail - The user's email address.
     * @param limit - Maximum number of results.
     * @param offset - Number of results to skip.
     * @param search - Optional full-text search query.
     * @param startDate - Optional start date filter (ISO format).
     * @param endDate - Optional end date filter (ISO format).
     * @returns Promise<any[]> - Array of search session records with metadata.
     * @description Queries sessions joined with knowledge base sources and record subqueries.
     */
    async findHistoryByUser(
        userEmail: string,
        limit: number,
        offset: number,
        search?: string,
        startDate?: string,
        endDate?: string
    ) {
        // Base query to select matching sessions first, then enrich only paged session IDs
        let query = this.knex(this.tableName)
            .select(
                'history_search_sessions.session_id',
                'history_search_sessions.updated_at as created_at',
                'history_search_sessions.user_email'
            )
            .where('history_search_sessions.user_email', userEmail)
            .orderBy('history_search_sessions.updated_at', 'desc')
            .limit(limit)
            .offset(offset)

        // Apply full-text search filter if provided
        if (search) {
            // Sanitize input: strip special characters to prevent tsquery injection
            const cleanSearch = search.replace(/[^\w\s]/g, '').trim()
            const terms = cleanSearch.split(/\s+/).filter(t => t.length > 0)

            // Use EXISTS subquery against records to find sessions containing matching content
            query = query.where(builder => {
                builder.whereExists(function () {
                    const sub = this.select('id').from('history_search_records')
                        .whereRaw('history_search_records.session_id = history_search_sessions.session_id')

                    if (terms.length > 0) {
                        // Try three tsquery strategies for best recall: websearch, prefix match, and OR match
                        const prefixQuery = terms.join(' & ') + ':*'
                        const orQuery = terms.join(' | ')
                        sub.where(b => {
                            b.whereRaw("search_vector @@ websearch_to_tsquery('english', ?)", [search])
                                .orWhereRaw("search_vector @@ to_tsquery('english', ?)", [prefixQuery])
                                .orWhereRaw("search_vector @@ to_tsquery('english', ?)", [orQuery])
                        })
                    } else {
                        // Fall back to websearch tsquery for empty-after-cleaning searches
                        sub.whereRaw("search_vector @@ websearch_to_tsquery('english', ?)", [search])
                    }
                })
            })
        }

        // Apply start date lower bound filter
        if (startDate) {
            query = query.where('history_search_sessions.updated_at', '>=', startDate)
        }

        // Apply end date upper bound filter (include entire end day by appending 23:59:59)
        if (endDate) {
            query = query.where('history_search_sessions.updated_at', '<=', `${endDate} 23:59:59`)
        }

        const sessions = await query
        if (sessions.length === 0) return []

        const sessionIds = sessions.map((s: any) => s.session_id)

        // Fetch first search input only for the paged session IDs to avoid global scans
        const firstInputs = await this.knex('history_search_records as hsr_first')
            .distinctOn('hsr_first.session_id')
            .select('hsr_first.session_id', 'hsr_first.search_input')
            .whereIn('hsr_first.session_id', sessionIds)
            .orderBy('hsr_first.session_id')
            .orderBy('hsr_first.created_at', 'asc')

        // Fetch message counts only for the paged session IDs to avoid global scans
        const messageCounts = await this.knex('history_search_records as hsr_count')
            .select('hsr_count.session_id')
            .count('* as message_count')
            .whereIn('hsr_count.session_id', sessionIds)
            .groupBy('hsr_count.session_id')

        const firstInputMap = new Map(firstInputs.map((row: any) => [row.session_id, row.search_input]))
        const messageCountMap = new Map(messageCounts.map((row: any) => [row.session_id, Number(row.message_count ?? 0)]))

        return sessions.map((session: any) => ({
            ...session,
            search_input: firstInputMap.get(session.session_id) ?? '',
            message_count: messageCountMap.get(session.session_id) ?? 0,
        }))
    }
}
