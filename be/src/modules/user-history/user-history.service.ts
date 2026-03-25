/**
 * @fileoverview User History Service.
 * Provides methods for retrieving a user's personal chat and search history.
 * Merges data from both external history tables (history_chat_sessions)
 * and internal chat tables (chat_sessions/chat_messages) for unified results.
 * Filters all queries by the authenticated user's email for data isolation.
 * 
 * @module services/user-history.service
 */

import { ModelFactory } from '@/shared/models/factory.js';
import { db } from '@/shared/db/knex.js';

/**
 * @description Service for managing user-specific history data.
 * Merges external and internal chat/search data for unified view.
 */
export class UserHistoryService {
    /**
     * @description Get chat history for a user with pagination and search.
     * Merges data from external history_chat_sessions AND internal chat_sessions.
     * @param {string} userEmail - The email of the user
     * @param {number} page - Page number (1-indexed)
     * @param {number} limit - Items per page
     * @param {string} search - Search query string
     * @param {string} startDate - Filter by start date (ISO format)
     * @param {string} endDate - Filter by end date (ISO format)
     * @returns {Promise<any[]>} Paginated and merged chat history sessions
     */
    async getChatHistory(
        userEmail: string,
        page: number,
        limit: number,
        search: string,
        startDate: string,
        endDate: string
    ) {
        // Fetch external history sessions
        const offset = (page - 1) * limit;
        const externalResults = await ModelFactory.historyChatSession.findHistoryByUser(
            userEmail,
            limit,
            offset,
            search,
            startDate,
            endDate
        );

        // Fetch internal chat sessions for this user (resolve user_id from email)
        const internalResults = await this.getInternalChatHistory(
            userEmail, limit, offset, search, startDate, endDate
        );

        // Merge both result sets and sort by date descending
        const merged = [...externalResults, ...internalResults];
        merged.sort((a: any, b: any) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateB - dateA;
        });

        // Return only `limit` items for the page
        return merged.slice(0, limit);
    }

    /**
     * @description Get details for a specific chat session, checking both internal
     * and external tables for the session data.
     * @param {string} sessionId - The session ID to retrieve
     * @param {string} userEmail - The email of the requesting user
     * @returns {Promise<any[]>} Array of chat messages in the session
     */
    async getChatSessionDetails(sessionId: string, userEmail: string) {
        // Try external history first
        const externalMessages = await ModelFactory.historyChatMessage.findBySessionIdAndUserEmail(sessionId, userEmail);
        if (externalMessages && externalMessages.length > 0) {
            return externalMessages;
        }

        // Fall back to internal chat_messages (resolve user by email)
        return this.getInternalChatSessionDetails(sessionId, userEmail);
    }

    /**
     * @description Get search history for a specific user with pagination and search
     * @param {string} userEmail - The email of the user
     * @param {number} page - Page number (1-indexed)
     * @param {number} limit - Items per page
     * @param {string} search - Search query string
     * @param {string} startDate - Filter by start date (ISO format)
     * @param {string} endDate - Filter by end date (ISO format)
     * @returns {Promise<any[]>} Paginated search history sessions
     */
    async getSearchHistory(
        userEmail: string,
        page: number,
        limit: number,
        search: string,
        startDate: string,
        endDate: string
    ) {
        // Calculate offset for pagination
        const offset = (page - 1) * limit;

        return await ModelFactory.historySearchSession.findHistoryByUser(
            userEmail,
            limit,
            offset,
            search,
            startDate,
            endDate
        );
    }

    /**
     * @description Get details for a specific search session, verifying ownership by user email
     * @param {string} sessionId - The session ID to retrieve
     * @param {string} userEmail - The email of the requesting user
     * @returns {Promise<any[]>} Array of search records in the session
     */
    async getSearchSessionDetails(sessionId: string, userEmail: string) {
        return await ModelFactory.historySearchRecord.findBySessionIdAndUserEmail(sessionId, userEmail);
    }

    // ---------------------------------------------------------------------------
    // Private: Internal chat data queries
    // ---------------------------------------------------------------------------

    /**
     * @description Query internal chat_sessions/chat_messages for a user's chat history.
     * Resolves user_id from email, then queries sessions with first message and count.
     * @param {string} userEmail - User email
     * @param {number} limit - Max results
     * @param {number} offset - Results to skip
     * @param {string} search - Optional search text
     * @param {string} startDate - Optional start date
     * @param {string} endDate - Optional end date
     * @returns {Promise<any[]>} Array of internal chat sessions formatted like external ones
     */
    private async getInternalChatHistory(
        userEmail: string,
        limit: number,
        offset: number,
        search?: string,
        startDate?: string,
        endDate?: string
    ): Promise<any[]> {
        // Resolve user ID from email
        const user = await db('users').where('email', userEmail).first();
        if (!user) return [];

        // Build query for internal chat sessions
        let query = db('chat_sessions')
            .select(
                'chat_sessions.id as session_id',
                'chat_sessions.created_at',
                db.raw('? as user_email', [userEmail]),
                // Subquery for first user message content
                db.raw(`(
                    SELECT content FROM chat_messages
                    WHERE session_id = chat_sessions.id AND role = 'user'
                    ORDER BY timestamp ASC LIMIT 1
                ) as user_prompt`),
                // Subquery for message count
                db.raw(`(
                    SELECT COUNT(*) FROM chat_messages
                    WHERE session_id = chat_sessions.id
                )::int as message_count`),
                // Include title for display
                'chat_sessions.title'
            )
            .where('chat_sessions.user_id', user.id)
            .orderBy('chat_sessions.created_at', 'desc')
            .limit(limit)
            .offset(offset);

        // Apply text search filter against message content
        if (search) {
            query = query.where(builder => {
                builder.where('chat_sessions.title', 'ilike', `%${search}%`)
                    .orWhereExists(function () {
                        this.select('id').from('chat_messages')
                            .whereRaw('chat_messages.session_id = chat_sessions.id')
                            .where('content', 'ilike', `%${search}%`);
                    });
            });
        }

        // Apply date range filters
        if (startDate) {
            query = query.where('chat_sessions.created_at', '>=', startDate);
        }
        if (endDate) {
            query = query.where('chat_sessions.created_at', '<=', `${endDate} 23:59:59`);
        }

        // Mark results as internal source for potential differentiation
        const results = await query;
        return results.map((r: any) => ({
            ...r,
            source: 'internal',
        }));
    }

    /**
     * @description Get internal chat messages for a session, verifying user ownership.
     * Formats messages to match the external history message shape.
     * @param {string} sessionId - Internal chat session ID
     * @param {string} userEmail - User email for ownership verification
     * @returns {Promise<any[]>} Formatted messages or empty array if not owned
     */
    private async getInternalChatSessionDetails(
        sessionId: string,
        userEmail: string
    ): Promise<any[]> {
        // Resolve user ID from email
        const user = await db('users').where('email', userEmail).first();
        if (!user) return [];

        // Verify session ownership
        const session = await db('chat_sessions')
            .where({ id: sessionId, user_id: user.id })
            .first();
        if (!session) return [];

        // Fetch all messages ordered by timestamp
        const messages = await db('chat_messages')
            .where('session_id', sessionId)
            .orderBy('timestamp', 'asc');

        // Pair user+assistant messages into the external history message format
        const paired: any[] = [];
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (msg.role === 'user') {
                // Find the next assistant response
                const assistantMsg = messages[i + 1]?.role === 'assistant' ? messages[i + 1] : null;
                paired.push({
                    id: msg.id,
                    session_id: sessionId,
                    user_prompt: msg.content,
                    llm_response: assistantMsg?.content || '',
                    citations: assistantMsg?.citations || '[]',
                    created_at: msg.timestamp,
                    source: 'internal',
                });
                if (assistantMsg) i++; // Skip the paired assistant message
            }
        }

        return paired;
    }
}

/** Singleton instance of the user history service */
export const userHistoryService = new UserHistoryService();

