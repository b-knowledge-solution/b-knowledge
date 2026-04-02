/**
 * @fileoverview Type definitions for the Dashboard feature.
 * @module features/dashboard/types/dashboard.types
 */

/**
 * @description Daily activity data point for trend charts.
 */
export interface DailyActivity {
    /** Date string (YYYY-MM-DD) */
    date: string
    /** External chat message count */
    chatCount: number
    /** External search record count */
    searchCount: number
}

/**
 * @description Top user entry with session count.
 */
export interface TopUser {
    /** User email address */
    email: string
    /** Total session count across all sources */
    sessionCount: number
}

/**
 * @description Session count breakdown by source type.
 */
export interface UsageBreakdown {
    /** External AI Chat sessions */
    chatSessions: number
    /** External AI Search sessions */
    searchSessions: number
}

/**
 * @description Complete dashboard statistics payload from the API.
 */
/**
 * @description Query analytics data from the admin analytics API.
 */
export interface QueryAnalytics {
    /** Total number of queries in the date range */
    totalQueries: number
    /** Average response time in milliseconds */
    avgResponseTime: number
    /** Rate of failed retrievals as a decimal (0-100) */
    failedRate: number
    /** Rate of low confidence results as a decimal (0-100) */
    lowConfRate: number
    /** Top queries ranked by frequency */
    topQueries: { query: string; count: number; avg_confidence: number }[]
    /** Daily query count trend data */
    trend: { date: string; count: number }[]
}

/**
 * @description Feedback analytics data from the admin feedback API.
 */
export interface FeedbackAnalytics {
    /** Overall satisfaction rate as a percentage (0-100) */
    satisfactionRate: number
    /** Total number of feedback entries */
    totalFeedback: number
    /** Rate of queries returning zero results as a percentage (0-100) */
    zeroResultRate: number
    /** Datasets with the lowest satisfaction rates */
    worstDatasets: { name: string; satisfactionRate: number }[]
    /** Daily feedback trend data (count = total feedback, satisfactionRate = % positive) */
    trend: { date: string; count: number; satisfactionRate: number }[]
    /** Recent negative feedback entries */
    negativeFeedback: { id: string; query: string; answerPreview: string; source?: 'chat' | 'search' | 'agent'; traceId: string | null; langfuseUrl: string | null; createdAt: string }[]
    /** Base URL for constructing Langfuse trace links */
    langfuseBaseUrl: string
}

/**
 * @description A session flagged with high negative feedback count.
 */
export interface TopFlaggedSession {
    /** Feedback source type (chat, search, agent) */
    source: string
    /** Source identifier (conversation_id, search_app_id, or agent_run_id) */
    source_id: string
    /** Count of negative feedback records for this session */
    negative_count: number
    /** Total feedback records for this session */
    total_count: number
}

/**
 * @description Response shape from GET /api/feedback/stats endpoint.
 */
export interface FeedbackStatsResponse {
    /** Feedback count breakdown by source type */
    sourceBreakdown: { chat: number; search: number; agent: number }
    /** Sessions with the most negative feedback, sorted by negative_count desc */
    topFlagged: TopFlaggedSession[]
}

/**
 * @description Complete dashboard statistics payload from the API.
 */
export interface DashboardStats {
    /** Total sessions across all sources */
    totalSessions: number
    /** Total messages across all sources */
    totalMessages: number
    /** Count of unique users */
    uniqueUsers: number
    /** Average messages per session */
    avgMessagesPerSession: number
    /** Daily activity trend data */
    activityTrend: DailyActivity[]
    /** Top 10 most active users */
    topUsers: TopUser[]
    /** Session breakdown by type */
    usageBreakdown: UsageBreakdown
}
