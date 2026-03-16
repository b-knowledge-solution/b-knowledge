/**
 * @fileoverview Admin history service for querying chat and search session records.
 * Provides paginated access to user activity history with full-text search support.
 * @module services/admin-history
 */
import { db } from '@/shared/db/knex.js';
import { ModelFactory } from '@/shared/models/factory.js';

/**
 * @description Service for querying chat and search history across all users with filtering, pagination, and full-text search
 */
export class AdminHistoryService {
    /**
     * @description Retrieve paginated chat history sessions with optional full-text search, email, and date range filters
     * @param {number} page - Page number (1-based)
     * @param {number} limit - Maximum items per page
     * @param {string} search - Full-text search query applied to messages and email
     * @param {string} email - Filter sessions by user email (partial match)
     * @param {string} startDate - Lower bound date filter (inclusive)
     * @param {string} endDate - Upper bound date filter (inclusive, extended to end of day)
     * @param {string} [sourceName] - Optional source name filter
     * @returns {Promise<any[]>} Paginated array of chat session summaries
     */
    async getChatHistory(
        page: number,
        limit: number,
        search: string,
        email: string,
        startDate: string,
        endDate: string,
        sourceName?: string
    ) {
        // Calculate offset for pagination
        const offset = (page - 1) * limit;

        // Base query on sessions
        let query = ModelFactory.historyChatSession.getKnex()
            .select(
                'history_chat_sessions.session_id',
                'history_chat_sessions.updated_at as created_at',
                'history_chat_sessions.user_email',

                // Subquery for first prompt
                db.raw(`(
                    SELECT user_prompt FROM history_chat_messages 
                    WHERE session_id = history_chat_sessions.session_id 
                    ORDER BY created_at ASC LIMIT 1
                ) as user_prompt`),
                // Subquery for message count
                db.raw(`(
                    SELECT COUNT(*) FROM history_chat_messages 
                    WHERE session_id = history_chat_sessions.session_id
                ) as message_count`)
            )
            .from('history_chat_sessions')

            .orderBy('history_chat_sessions.updated_at', 'desc')
            .limit(limit)
            .offset(offset);

        // Apply full-text search filter across email and message content
        if (search) {
            // Strip special characters to prevent tsquery injection
            const cleanSearch = search.replace(/[^\w\s]/g, '').trim();
            const terms = cleanSearch.split(/\s+/).filter(t => t.length > 0);

            query = query.where(builder => {
                // Match sessions by user email (case-insensitive partial match)
                builder.where('history_chat_sessions.user_email', 'ilike', `%${search}%`)
                    // Or match sessions containing relevant messages via full-text search
                    .orWhereExists(function () {
                        const sub = this.select('id').from('history_chat_messages')
                            .whereRaw('history_chat_messages.session_id = history_chat_sessions.session_id');

                        // Use multiple tsquery strategies for better recall
                        if (terms.length > 0) {
                            // Prefix query: all terms must appear (AND) with prefix matching
                            const prefixQuery = terms.join(' & ') + ':*';
                            // OR query: any term can match
                            const orQuery = terms.join(' | ');
                            sub.where(b => {
                                b.whereRaw("search_vector @@ websearch_to_tsquery('english', ?)", [search])
                                    .orWhereRaw("search_vector @@ to_tsquery('english', ?)", [prefixQuery])
                                    .orWhereRaw("search_vector @@ to_tsquery('english', ?)", [orQuery]);
                            });
                        } else {
                            // Fall back to websearch_to_tsquery for single-term or empty search
                            sub.whereRaw("search_vector @@ websearch_to_tsquery('english', ?)", [search]);
                        }
                    });
            });
        }

        // Filter by user email (partial, case-insensitive)
        if (email) {
            query = query.where('history_chat_sessions.user_email', 'ilike', `%${email}%`);
        }

        // Filter sessions updated on or after the start date
        if (startDate) {
            query = query.where('history_chat_sessions.updated_at', '>=', startDate);
        }

        // Filter sessions updated on or before the end date (extended to end of day)
        if (endDate) {
            query = query.where('history_chat_sessions.updated_at', '<=', `${endDate} 23:59:59`);
        }



        return await query;
    }

    /**
     * @description Retrieve all messages for a specific chat session ordered chronologically
     * @param {string} sessionId - The unique session identifier
     * @returns {Promise<any[]>} Array of chat message records for the session
     */
    async getChatSessionDetails(sessionId: string) {
        // Query to get all history entries for the session
        return await ModelFactory.historyChatMessage.getKnex()
            .from('history_chat_messages')
            .select('*')
            .where('session_id', sessionId)
            .orderBy('created_at', 'asc');
    }

    /**
     * @description Retrieve paginated search history sessions with optional full-text search, email, and date range filters
     * @param {number} page - Page number (1-based)
     * @param {number} limit - Maximum items per page
     * @param {string} search - Full-text search query applied to records and email
     * @param {string} email - Filter sessions by user email (partial match)
     * @param {string} startDate - Lower bound date filter (inclusive)
     * @param {string} endDate - Upper bound date filter (inclusive, extended to end of day)
     * @param {string} [sourceName] - Optional source name filter
     * @returns {Promise<any[]>} Paginated array of search session summaries
     */
    async getSearchHistory(
        page: number,
        limit: number,
        search: string,
        email: string,
        startDate: string,
        endDate: string,
        sourceName?: string
    ) {
        // Calculate pagination offset
        const offset = (page - 1) * limit;

        // Base query on sessions
        let query = ModelFactory.historySearchSession.getKnex()
            .select(
                'history_search_sessions.session_id',
                'history_search_sessions.updated_at as created_at',
                'history_search_sessions.user_email',

                // Subquery for first search input
                db.raw(`(
                    SELECT search_input FROM history_search_records 
                    WHERE session_id = history_search_sessions.session_id 
                    ORDER BY created_at ASC LIMIT 1
                ) as search_input`),
                // Subquery for count
                db.raw(`(
                    SELECT COUNT(*) FROM history_search_records 
                    WHERE session_id = history_search_sessions.session_id
                ) as message_count`)
            )
            .from('history_search_sessions')

            .orderBy('history_search_sessions.updated_at', 'desc')
            .limit(limit)
            .offset(offset);

        // Apply full-text search filter across email and search record content
        if (search) {
            // Strip special characters to prevent tsquery injection
            const cleanSearch = search.replace(/[^\w\s]/g, '').trim();
            const terms = cleanSearch.split(/\s+/).filter(t => t.length > 0);

            query = query.where(builder => {
                // Match sessions by user email (case-insensitive partial match)
                builder.where('history_search_sessions.user_email', 'ilike', `%${search}%`)
                    // Or match sessions with relevant search records via full-text search
                    .orWhereExists(function () {
                        const sub = this.select('id').from('history_search_records')
                            .whereRaw('history_search_records.session_id = history_search_sessions.session_id');

                        // Use multiple tsquery strategies for better recall
                        if (terms.length > 0) {
                            const prefixQuery = terms.join(' & ') + ':*';
                            const orQuery = terms.join(' | ');
                            sub.where(b => {
                                b.whereRaw("search_vector @@ websearch_to_tsquery('english', ?)", [search])
                                    .orWhereRaw("search_vector @@ to_tsquery('english', ?)", [prefixQuery])
                                    .orWhereRaw("search_vector @@ to_tsquery('english', ?)", [orQuery]);
                            });
                        } else {
                            // Fall back to websearch_to_tsquery for single-term or empty search
                            sub.whereRaw("search_vector @@ websearch_to_tsquery('english', ?)", [search]);
                        }
                    });
            });
        }

        // Filter by user email (partial, case-insensitive)
        if (email) {
            query = query.where('history_search_sessions.user_email', 'ilike', `%${email}%`);
        }

        // Filter sessions updated on or after the start date
        if (startDate) {
            query = query.where('history_search_sessions.updated_at', '>=', startDate);
        }

        // Filter sessions updated on or before the end date (extended to end of day)
        if (endDate) {
            query = query.where('history_search_sessions.updated_at', '<=', `${endDate} 23:59:59`);
        }



        return await query;
    }

    /**
     * @description Retrieve all search records for a specific search session ordered chronologically
     * @param {string} sessionId - The unique session identifier
     * @returns {Promise<any[]>} Array of search records for the session
     */
    async getSearchSessionDetails(sessionId: string) {
        // Query to get all search entries for the session
        return await ModelFactory.historySearchRecord.getKnex()
            .from('history_search_records')
            .select('*')
            .where('session_id', sessionId)
            .orderBy('created_at', 'asc');
    }

    /**
     * @description Retrieve paginated system-level chat sessions joined with user details and aggregated messages as JSON
     * @param {number} page - Page number (1-based)
     * @param {number} limit - Maximum items per page
     * @param {string} search - Search query to filter by session title, user email, display name, or message content
     * @returns {Promise<any[]>} Array of system chat session records with embedded messages
     */
    async getSystemChatHistory(
        page: number,
        limit: number,
        search: string
    ) {
        // Build base query joining chat_sessions with users
        let query = ModelFactory.chatSession.getKnex()
            .from('chat_sessions')
            .leftJoin('users', 'chat_sessions.user_id', 'users.id')
            .select(
                'chat_sessions.*',
                'users.email as user_email',
                'users.display_name as user_name',
                // Subquery to aggregate chat messages as JSON array
                (ModelFactory.chatSession.getKnex().client as any).raw(`
                    COALESCE(
                        (
                            SELECT json_agg(json_build_object(
                                'id', cm.id,
                                'role', cm.role,
                                'content', cm.content,
                                'timestamp', cm.timestamp
                            ) ORDER BY cm.timestamp ASC)
                            FROM chat_messages cm
                            WHERE cm.session_id = chat_sessions.id
                        ),
                        '[]'
                    ) as messages
                `)
            )
            .orderBy('chat_sessions.updated_at', 'desc')
            .limit(limit)
            .offset((page - 1) * limit);

        // Apply search filter if provided
        if (search) {
            // Filter by session title, user email, display name, or message content
            query = query.where(builder => {
                builder.where('chat_sessions.title', 'ilike', `%${search}%`)
                    .orWhere('users.email', 'ilike', `%${search}%`)
                    .orWhere('users.display_name', 'ilike', `%${search}%`)
                    // Exists subquery for message content search
                    .orWhereExists(function () {
                        this.select('*')
                            .from('chat_messages')
                            .whereRaw('chat_messages.session_id = chat_sessions.id')
                            .andWhere('content', 'ilike', `%${search}%`);
                    });
            });
        }

        // Execute query and return results
        return await query;
    }
}

/** Singleton instance of AdminHistoryService */
export const adminHistoryService = new AdminHistoryService();
