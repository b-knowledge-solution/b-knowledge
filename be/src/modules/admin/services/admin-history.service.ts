/**
 * @fileoverview Admin history service for querying chat, search, and agent run session records.
 * Provides paginated access to user activity history with full-text search support
 * and feedback enrichment (positive/negative counts).
 * All database access is delegated to AdminHistoryModel via ModelFactory.
 * @module services/admin-history
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { MessageRole } from '@/shared/constants/message-roles.js'

import type { FeedbackFilter } from '../models/admin-history.model.js'
export type { FeedbackFilter } from '../models/admin-history.model.js'

/**
 * @description Service for querying chat, search, and agent run history across all users with filtering, pagination, full-text search, and feedback enrichment
 */
export class AdminHistoryService {
    /**
     * @description Retrieve paginated chat history sessions with optional full-text search, email, date range, and feedback filters.
     * Enriches results with positive_count and negative_count from answer_feedback table.
     * @param {number} page - Page number (1-based)
     * @param {number} limit - Maximum items per page
     * @param {string} search - Full-text search query applied to messages and email
     * @param {string} email - Filter sessions by user email (partial match)
     * @param {string} startDate - Lower bound date filter (inclusive)
     * @param {string} endDate - Upper bound date filter (inclusive, extended to end of day)
     * @param {string} [sourceName] - Optional source name filter
     * @param {FeedbackFilter} [feedbackFilter] - Optional feedback status filter
     * @param {string} [tenantId] - Optional tenant ID for scoping feedback queries
     * @returns {Promise<any[]>} Paginated array of chat session summaries with feedback counts
     */
    async getChatHistory(
        page: number,
        limit: number,
        search: string,
        email: string,
        startDate: string,
        endDate: string,
        sourceName?: string,
        feedbackFilter?: FeedbackFilter,
        tenantId?: string
    ) {
        const adminHistory = ModelFactory.adminHistory
        const filters = { page, limit, search, email, startDate, endDate, sourceName, feedbackFilter, tenantId }

        // ── External history_chat_sessions (page first, then enrich) ─────
        const externalBase = await adminHistory.findExternalChatSessions(filters)
        const externalIds = externalBase.map((row: any) => row.session_id)
        let externalResults = externalBase.map((row: any) => ({ ...row, user_prompt: '', message_count: 0, positive_count: 0, negative_count: 0 }))

        if (externalIds.length > 0) {
            const { firstPrompts, messageCounts, feedbackRows } = await adminHistory.findExternalChatEnrichmentData(externalIds, tenantId)

            const promptMap = new Map(firstPrompts.map((row: any) => [row.session_id, row.user_prompt]))
            const countMap = new Map(messageCounts.map((row: any) => [row.session_id, Number(row.message_count ?? 0)]))
            const feedbackMap = new Map(feedbackRows.map((row: any) => [row.source_id, row]))

            externalResults = externalBase.map((row: any) => {
                const feedback = feedbackMap.get(row.session_id)
                return {
                    ...row,
                    user_prompt: promptMap.get(row.session_id) ?? '',
                    message_count: countMap.get(row.session_id) ?? 0,
                    positive_count: Number(feedback?.positive_count ?? 0),
                    negative_count: Number(feedback?.negative_count ?? 0),
                }
            })
        }

        // ── Internal chat_sessions (page first, then enrich) ──────────────
        const internalBase = await adminHistory.findInternalChatSessions(filters)
        const internalIds = internalBase.map((row: any) => row.session_id)
        let internalResults = internalBase.map((r: any) => ({ ...r, user_prompt: '', message_count: 0, positive_count: 0, negative_count: 0, source: 'internal' }))

        if (internalIds.length > 0) {
            const { firstPrompts, messageCounts, feedbackRows } = await adminHistory.findInternalChatEnrichmentData(internalIds, tenantId)

            const promptMap = new Map(firstPrompts.map((row: any) => [row.session_id, row.user_prompt]))
            const countMap = new Map(messageCounts.map((row: any) => [row.session_id, Number(row.message_count ?? 0)]))
            const feedbackMap = new Map(feedbackRows.map((row: any) => [row.source_id, row]))

            internalResults = internalBase.map((row: any) => {
                const feedback = feedbackMap.get(row.session_id)
                return {
                    ...row,
                    user_prompt: promptMap.get(row.session_id) ?? '',
                    message_count: countMap.get(row.session_id) ?? 0,
                    positive_count: Number(feedback?.positive_count ?? 0),
                    negative_count: Number(feedback?.negative_count ?? 0),
                    source: 'internal',
                }
            })
        }

        // ── Merge & sort by date descending ───────────────────────────────
        const merged = [...externalResults, ...internalResults]
        merged.sort((a: any, b: any) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateB - dateA;
        });

        return merged.slice(0, limit);
    }

    /**
     * @description Retrieve all messages for a specific chat session ordered chronologically.
     * Checks both external history_chat_messages and internal chat_messages tables.
     * Enriches each message with feedback_thumbup and feedback_comment from answer_feedback.
     * @param {string} sessionId - The unique session identifier
     * @param {string} [tenantId] - Optional tenant ID for scoping feedback queries
     * @returns {Promise<any[]>} Array of chat message records for the session with feedback fields
     */
    async getChatSessionDetails(sessionId: string, tenantId?: string) {
        const adminHistory = ModelFactory.adminHistory

        // Try external history first
        const external = await adminHistory.findExternalChatMessages(sessionId)

        // Query feedback records for this chat session (tenant-scoped if provided)
        const feedbackRecords = await adminHistory.findFeedbackBySourceAndSession('chat', sessionId, tenantId)

        // Build a lookup map from message_id to feedback data
        const feedbackMap = new Map(feedbackRecords.map((f: any) => [f.message_id, f]))

        if (external.length > 0) {
            // Merge feedback into external messages by matching message_id to id
            return external.map((msg: any) => ({
                ...msg,
                feedback_thumbup: feedbackMap.get(msg.id)?.thumbup ?? null,
                feedback_comment: feedbackMap.get(msg.id)?.comment ?? null,
            }))
        }

        // Fall back to internal chat_messages
        const messages = await adminHistory.findInternalChatMessages(sessionId)

        // Pair user+assistant messages into the external format
        const paired: any[] = [];
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (msg.role === MessageRole.USER) {
                const assistantMsg = messages[i + 1]?.role === MessageRole.ASSISTANT ? messages[i + 1] : null;
                // Use assistant message ID for feedback lookup (feedback is on responses)
                const feedbackId = assistantMsg?.id || msg.id
                paired.push({
                    id: msg.id,
                    session_id: sessionId,
                    user_prompt: msg.content,
                    llm_response: assistantMsg?.content || '',
                    citations: assistantMsg?.citations || '[]',
                    created_at: msg.timestamp,
                    source: 'internal',
                    feedback_thumbup: feedbackMap.get(feedbackId)?.thumbup ?? null,
                    feedback_comment: feedbackMap.get(feedbackId)?.comment ?? null,
                });
                if (assistantMsg) i++;
            }
        }

        return paired;
    }

    /**
     * @description Retrieve paginated search history sessions with optional full-text search, email, date range, and feedback filters.
     * Enriches results with positive_count and negative_count from answer_feedback table.
     * @param {number} page - Page number (1-based)
     * @param {number} limit - Maximum items per page
     * @param {string} search - Full-text search query applied to records and email
     * @param {string} email - Filter sessions by user email (partial match)
     * @param {string} startDate - Lower bound date filter (inclusive)
     * @param {string} endDate - Upper bound date filter (inclusive, extended to end of day)
     * @param {string} [sourceName] - Optional source name filter
     * @param {FeedbackFilter} [feedbackFilter] - Optional feedback status filter
     * @param {string} [tenantId] - Optional tenant ID for scoping feedback queries
     * @returns {Promise<any[]>} Paginated array of search session summaries with feedback counts
     */
    async getSearchHistory(
        page: number,
        limit: number,
        search: string,
        email: string,
        startDate: string,
        endDate: string,
        sourceName?: string,
        feedbackFilter?: FeedbackFilter,
        tenantId?: string
    ) {
        const adminHistory = ModelFactory.adminHistory
        const filters = { page, limit, search, email, startDate, endDate, feedbackFilter, tenantId }

        // Base query on sessions (page first), then enrich only paged session IDs
        const baseSessions = await adminHistory.findSearchSessions(filters)
        if (baseSessions.length === 0) return []

        const sessionIds = baseSessions.map((row: any) => row.session_id)
        const { firstInputs, messageCounts, feedbackRows } = await adminHistory.findSearchEnrichmentData(sessionIds, tenantId)

        const inputMap = new Map(firstInputs.map((row: any) => [row.session_id, row.search_input]))
        const countMap = new Map(messageCounts.map((row: any) => [row.session_id, Number(row.message_count ?? 0)]))
        const feedbackMap = new Map(feedbackRows.map((row: any) => [row.source_id, row]))

        return baseSessions.map((row: any) => {
            const feedback = feedbackMap.get(row.session_id)
            return {
                ...row,
                search_input: inputMap.get(row.session_id) ?? '',
                message_count: countMap.get(row.session_id) ?? 0,
                positive_count: Number(feedback?.positive_count ?? 0),
                negative_count: Number(feedback?.negative_count ?? 0),
            }
        })
    }

    /**
     * @description Retrieve all search records for a specific search session ordered chronologically.
     * Enriches each record with feedback_thumbup and feedback_comment from answer_feedback.
     * @param {string} sessionId - The unique session identifier
     * @param {string} [tenantId] - Optional tenant ID for scoping feedback queries
     * @returns {Promise<any[]>} Array of search records for the session with feedback fields
     */
    async getSearchSessionDetails(sessionId: string, tenantId?: string) {
        const adminHistory = ModelFactory.adminHistory

        // Query to get all search entries for the session
        const records = await adminHistory.findSearchRecords(sessionId)

        // Query feedback records for this search session (tenant-scoped if provided)
        const feedbackRecords = await adminHistory.findFeedbackBySourceAndSession('search', sessionId, tenantId)

        // Build a lookup map from message_id to feedback data
        const feedbackMap = new Map(feedbackRecords.map((f: any) => [f.message_id, f]))

        // Merge feedback into search records by matching message_id to id
        return records.map((record: any) => ({
            ...record,
            feedback_thumbup: feedbackMap.get(record.id)?.thumbup ?? null,
            feedback_comment: feedbackMap.get(record.id)?.comment ?? null,
        }))
    }

    /**
     * @description Retrieve paginated agent run history with feedback counts.
     * Joins agent_runs with agents table for agent name, enriches with feedback subqueries.
     * @param {number} page - Page number (1-based)
     * @param {number} limit - Maximum items per page
     * @param {string} search - Search query to filter by agent name or input text
     * @param {string} email - Filter by triggering user email (partial match)
     * @param {string} startDate - Lower bound date filter (inclusive)
     * @param {string} endDate - Upper bound date filter (inclusive, extended to end of day)
     * @param {FeedbackFilter} [feedbackFilter] - Optional feedback status filter
     * @param {string} [tenantId] - Optional tenant ID for scoping feedback queries
     * @returns {Promise<any[]>} Paginated array of agent run summaries with feedback counts
     */
    async getAgentRunHistory(
        page: number,
        limit: number,
        search: string,
        email: string,
        startDate: string,
        endDate: string,
        feedbackFilter?: FeedbackFilter,
        tenantId?: string
    ) {
        const adminHistory = ModelFactory.adminHistory
        const filters = { page, limit, search, email, startDate, endDate, feedbackFilter, tenantId }

        const runs = await adminHistory.findAgentRuns(filters)
        if (runs.length === 0) return []

        const runIds = runs.map((r: any) => r.run_id)
        const feedbackRows = await adminHistory.findAgentRunFeedback(runIds, tenantId)

        const feedbackMap = new Map(
            feedbackRows.map((row: any) => [row.source_id, { positive_count: Number(row.positive_count ?? 0), negative_count: Number(row.negative_count ?? 0) }])
        )

        return runs.map((run: any) => {
            const feedback = feedbackMap.get(run.run_id) ?? { positive_count: 0, negative_count: 0 }
            return { ...run, ...feedback }
        })
    }

    /**
     * @description Retrieve a single agent run with its steps and associated feedback records.
     * @param {string} runId - UUID of the agent run
     * @param {string} [tenantId] - Optional tenant ID for scoping feedback and agent queries
     * @returns {Promise<{ run: any, steps: any[], feedback: any[] } | null>} Run details with steps and feedback
     */
    async getAgentRunDetails(runId: string, tenantId?: string) {
        const adminHistory = ModelFactory.adminHistory

        // Fetch the run record with agent name, optionally scoped to tenant
        const run = await adminHistory.findAgentRunWithDetails(runId, tenantId)

        if (!run) return null

        // Fetch run steps and feedback in parallel
        const [steps, feedback] = await Promise.all([
            adminHistory.findAgentRunSteps(runId),
            adminHistory.findAgentRunDetailFeedback(runId, tenantId),
        ])

        return { run, steps, feedback }
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
        return ModelFactory.adminHistory.findSystemChatSessionsWithMessages(page, limit, search)
    }
}

/** Singleton instance of AdminHistoryService */
export const adminHistoryService = new AdminHistoryService();
