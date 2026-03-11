/**
 * @fileoverview External Search Session Model.
 *
 * Represents search sessions received from external clients.
 * Stores session metadata for grouping search records.
 *
 * @module shared/models/external-search-session
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { Knex } from 'knex'

/**
 * External search session record shape.
 * @description Defines the columns of the history_search_sessions table.
 */
export interface ExternalSearchSession {
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
 * ExternalSearchSessionModel
 * Provides CRUD operations for the history_search_sessions table.
 * @description Manages external search session records with user history queries.
 */
export class ExternalSearchSessionModel extends BaseModel<ExternalSearchSession> {
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
        // Base query to select search sessions
        let query = this.knex
            .select(
                'history_search_sessions.session_id',
                'history_search_sessions.updated_at as created_at',
                'history_search_sessions.user_email',
                'knowledge_base_sources.name as source_name',
                // Subquery for first search input
                this.knex.raw(`(
                    SELECT search_input FROM history_search_records
                    WHERE session_id = history_search_sessions.session_id
                    ORDER BY created_at ASC LIMIT 1
                ) as search_input`),
                // Subquery for count
                this.knex.raw(`(
                    SELECT COUNT(*) FROM history_search_records
                    WHERE session_id = history_search_sessions.session_id
                ) as message_count`)
            )
            .from(this.tableName)
            .leftJoin('knowledge_base_sources', 'history_search_sessions.share_id', 'knowledge_base_sources.share_id')
            .where('history_search_sessions.user_email', userEmail)
            .orderBy('history_search_sessions.updated_at', 'desc')
            .limit(limit)
            .offset(offset)

        // Apply search filter if provided
        if (search) {
            const cleanSearch = search.replace(/[^\w\s]/g, '').trim()
            const terms = cleanSearch.split(/\s+/).filter(t => t.length > 0)

            query = query.where(builder => {
                builder.whereExists(function () {
                    const sub = this.select('id').from('history_search_records')
                        .whereRaw('history_search_records.session_id = history_search_sessions.session_id')

                    if (terms.length > 0) {
                        const prefixQuery = terms.join(' & ') + ':*'
                        const orQuery = terms.join(' | ')
                        sub.where(b => {
                            b.whereRaw("search_vector @@ websearch_to_tsquery('english', ?)", [search])
                                .orWhereRaw("search_vector @@ to_tsquery('english', ?)", [prefixQuery])
                                .orWhereRaw("search_vector @@ to_tsquery('english', ?)", [orQuery])
                        })
                    } else {
                        sub.whereRaw("search_vector @@ websearch_to_tsquery('english', ?)", [search])
                    }
                })
            })
        }

        // Apply date range filters
        if (startDate) {
            query = query.where('history_search_sessions.updated_at', '>=', startDate)
        }

        if (endDate) {
            query = query.where('history_search_sessions.updated_at', '<=', `${endDate} 23:59:59`)
        }

        return await query
    }
}
