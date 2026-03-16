/**
 * @fileoverview History Chat Session Model.
 *
 * Represents chat sessions received from external clients (browser extensions, etc.).
 * Stores session metadata for grouping chat messages.
 *
 * @module shared/models/history-chat-session
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { Knex } from 'knex'

/**
 * History chat session record shape.
 * @description Defines the columns of the history_chat_sessions table.
 */
export interface HistoryChatSession {
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
 * HistoryChatSessionModel
 * Provides CRUD operations for the history_chat_sessions table.
 * @description Manages history chat session records with user history queries.
 */
export class HistoryChatSessionModel extends BaseModel<HistoryChatSession> {
    /** Database table name */
    protected tableName = 'history_chat_sessions'
    /** Knex connection instance */
    protected knex: Knex = db

    /**
     * Find chat history for a specific user with pagination and filters.
     * @param userEmail - The user's email address.
     * @param limit - Maximum number of results.
     * @param offset - Number of results to skip.
     * @param search - Optional full-text search query.
     * @param startDate - Optional start date filter (ISO format).
     * @param endDate - Optional end date filter (ISO format).
     * @returns Promise<any[]> - Array of chat session records with metadata.
     * @description Queries sessions joined with knowledge base sources and message subqueries.
     */
    async findHistoryByUser(
        userEmail: string,
        limit: number,
        offset: number,
        search?: string,
        startDate?: string,
        endDate?: string
    ) {
        // Base query to select chat sessions
        let query = this.knex
            .select(
                'history_chat_sessions.session_id',
                'history_chat_sessions.updated_at as created_at',
                'history_chat_sessions.user_email',

                // Subquery for first prompt
                this.knex.raw(`(
                    SELECT user_prompt FROM history_chat_messages
                    WHERE session_id = history_chat_sessions.session_id
                    ORDER BY created_at ASC LIMIT 1
                ) as user_prompt`),
                // Subquery for message count
                this.knex.raw(`(
                    SELECT COUNT(*) FROM history_chat_messages
                    WHERE session_id = history_chat_sessions.session_id
                ) as message_count`)
            )
            .from(this.tableName)

            .where('history_chat_sessions.user_email', userEmail)
            .orderBy('history_chat_sessions.updated_at', 'desc')
            .limit(limit)
            .offset(offset)

        // Apply full-text search filter if provided
        if (search) {
            // Sanitize input: strip special characters to prevent tsquery injection
            const cleanSearch = search.replace(/[^\w\s]/g, '').trim()
            const terms = cleanSearch.split(/\s+/).filter(t => t.length > 0)

            // Use EXISTS subquery against messages to find sessions containing matching content
            query = query.where(builder => {
                builder.whereExists(function () {
                    const sub = this.select('id').from('history_chat_messages')
                        .whereRaw('history_chat_messages.session_id = history_chat_sessions.session_id')

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
            query = query.where('history_chat_sessions.updated_at', '>=', startDate)
        }

        // Apply end date upper bound filter (include entire end day by appending 23:59:59)
        if (endDate) {
            query = query.where('history_chat_sessions.updated_at', '<=', `${endDate} 23:59:59`)
        }

        return await query
    }
}
