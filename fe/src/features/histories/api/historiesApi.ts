/**
 * @fileoverview API Service for Admin Histories features.
 * All types are imported from `types/histories.types.ts`.
 *
 * @module features/histories/api/historiesApi
 */
import { apiFetch } from '@/lib/api'
import type {
    FilterState,
    ChatSessionSummary,
    SearchSessionSummary,
    ExternalChatHistory,
    ExternalSearchHistory,
    AgentRunSessionSummary,
    ExternalAgentRunDetail,
} from '../types/histories.types'

/**
 * @description Build common query params from filters, including feedbackFilter.
 * Maps 'all' feedback filter to empty string (no filter on backend).
 * @param {string} search - Search query text
 * @param {FilterState} filters - Current filter state
 * @param {number} page - Page number
 * @returns {URLSearchParams} Query parameters
 */
function buildParams(search: string, filters: FilterState, page: number): URLSearchParams {
    // Map feedbackFilter: 'all' means no filter, otherwise pass the value
    const feedbackValue = filters.feedbackFilter && filters.feedbackFilter !== 'all'
        ? filters.feedbackFilter
        : ''

    return new URLSearchParams({
        q: search,
        email: filters.email,
        startDate: filters.startDate,
        endDate: filters.endDate,
        sourceName: filters.sourceName || '',
        feedbackFilter: feedbackValue,
        page: page.toString(),
        limit: '20',
    })
}

/**
 * @description Fetch chat history summaries with pagination, filtering, and feedback counts.
 * @param {string} search - Search query for prompts/content.
 * @param {FilterState} filters - Filters for email, source, date range, and feedback.
 * @param {number} page - Page number to fetch.
 * @returns {Promise<ChatSessionSummary[]>} List of chat sessions with feedback counts.
 */
export async function fetchExternalChatHistory(
    search: string,
    filters: FilterState,
    page: number,
): Promise<ChatSessionSummary[]> {
    const params = buildParams(search, filters, page)
    return apiFetch<ChatSessionSummary[]>(`/api/system/history/chat?${params.toString()}`)
}

/**
 * @description Fetch search history summaries with pagination, filtering, and feedback counts.
 * @param {string} search - Search query.
 * @param {FilterState} filters - Filters.
 * @param {number} page - Page number.
 * @returns {Promise<SearchSessionSummary[]>} List of search sessions with feedback counts.
 */
export async function fetchExternalSearchHistory(
    search: string,
    filters: FilterState,
    page: number,
): Promise<SearchSessionSummary[]> {
    const params = buildParams(search, filters, page)
    return apiFetch<SearchSessionSummary[]>(`/api/system/history/search?${params.toString()}`)
}

/**
 * @description Fetch detailed messages for a specific chat session.
 * @param {string} sessionId - ID of the session.
 * @returns {Promise<ExternalChatHistory[]>} List of messages in the session.
 */
export async function fetchChatSessionDetails(sessionId: string): Promise<ExternalChatHistory[]> {
    return apiFetch<ExternalChatHistory[]>(`/api/system/history/chat/${sessionId}`)
}

/**
 * @description Fetch details for a specific search session.
 * @param {string} sessionId - ID of the session.
 * @returns {Promise<ExternalSearchHistory[]>} Details of the search session.
 */
export async function fetchSearchSessionDetails(sessionId: string): Promise<ExternalSearchHistory[]> {
    return apiFetch<ExternalSearchHistory[]>(`/api/system/history/search/${sessionId}`)
}

/**
 * @description Fetch agent run history summaries with pagination and filtering.
 * @param {string} search - Search query for agent name or input.
 * @param {FilterState} filters - Filters for email, date range, and feedback.
 * @param {number} page - Page number to fetch.
 * @returns {Promise<AgentRunSessionSummary[]>} List of agent runs with feedback counts.
 */
export async function fetchAgentRunHistory(
    search: string,
    filters: FilterState,
    page: number,
): Promise<AgentRunSessionSummary[]> {
    const params = buildParams(search, filters, page)
    return apiFetch<AgentRunSessionSummary[]>(`/api/system/history/agent-runs?${params.toString()}`)
}

/**
 * @description Fetch details for a specific agent run including steps and feedback.
 * @param {string} runId - UUID of the agent run.
 * @returns {Promise<ExternalAgentRunDetail>} Run details with steps and feedback records.
 */
export async function fetchAgentRunDetails(runId: string): Promise<ExternalAgentRunDetail> {
    return apiFetch<ExternalAgentRunDetail>(`/api/system/history/agent-runs/${runId}`)
}

/**
 * @description Export feedback records matching the current filters.
 * Calls GET /api/feedback/export with filter parameters including source and thumbup.
 * @param {FilterState} filters - Current filter state for date range, feedback type, and source.
 * @returns {Promise<any[]>} Array of feedback records (with user_email) for CSV export.
 */
export async function exportFeedback(filters: FilterState): Promise<any[]> {
    const params = new URLSearchParams({
        startDate: filters.startDate,
        endDate: filters.endDate,
    })

    // Map feedbackFilter to thumbup param for the export endpoint
    if (filters.feedbackFilter === 'positive') {
        params.set('thumbup', 'true')
    } else if (filters.feedbackFilter === 'negative') {
        params.set('thumbup', 'false')
    }

    // Pass source filter to scope export to the active tab (chat, search, agent)
    if (filters.sourceName) {
        params.set('source', filters.sourceName)
    }

    return apiFetch<any[]>(`/api/feedback/export?${params.toString()}`)
}
