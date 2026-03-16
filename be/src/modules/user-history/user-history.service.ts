/**
 * @fileoverview User History Service.
 * Provides methods for retrieving a user's personal chat and search history.
 * Filters all queries by the authenticated user's email for data isolation.
 * 
 * @module services/user-history.service
 */

import { ModelFactory } from '@/shared/models/factory.js';

/**
 * @description Service for managing user-specific history data, filtering all queries by user email for data isolation
 */
export class UserHistoryService {
    /**
     * @description Get chat history for a specific user with pagination and search
     * @param {string} userEmail - The email of the user
     * @param {number} page - Page number (1-indexed)
     * @param {number} limit - Items per page
     * @param {string} search - Search query string
     * @param {string} startDate - Filter by start date (ISO format)
     * @param {string} endDate - Filter by end date (ISO format)
     * @returns {Promise<any[]>} Paginated chat history sessions
     */
    async getChatHistory(
        userEmail: string,
        page: number,
        limit: number,
        search: string,
        startDate: string,
        endDate: string
    ) {
        // Calculate offset for pagination
        const offset = (page - 1) * limit;

        return await ModelFactory.historyChatSession.findHistoryByUser(
            userEmail,
            limit,
            offset,
            search,
            startDate,
            endDate
        );
    }

    /**
     * @description Get details for a specific chat session, verifying ownership by user email
     * @param {string} sessionId - The session ID to retrieve
     * @param {string} userEmail - The email of the requesting user
     * @returns {Promise<any[]>} Array of chat messages in the session
     */
    async getChatSessionDetails(sessionId: string, userEmail: string) {
        return await ModelFactory.historyChatMessage.findBySessionIdAndUserEmail(sessionId, userEmail);
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
}

/** Singleton instance of the user history service */
export const userHistoryService = new UserHistoryService();
