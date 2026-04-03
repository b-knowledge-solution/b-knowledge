
/**
 * Dashboard Service
 * Provides aggregate statistics for admin activity dashboard.
 * Queries across external chat and external search data sources.
 * Also provides query analytics and feedback aggregation for observability.
 * @module services/dashboard
 */
import { config } from '@/shared/config/index.js'
import { ModelFactory } from '@/shared/models/factory.js'

/**
 * @description Shape of daily activity data point for trend charts
 */
export interface DailyActivity {
  /** Date string (YYYY-MM-DD) */
  date: string
  /** Number of external chat messages on this date */
  chatCount: number
  /** Number of external search records on this date */
  searchCount: number
}

/**
 * @description Shape of a top user entry by session count
 */
export interface TopUser {
  /** User email address */
  email: string
  /** Total session count across all sources */
  sessionCount: number
}

/**
 * @description Usage breakdown by source type for pie chart display
 */
export interface UsageBreakdown {
  /** External AI Chat session count */
  chatSessions: number
  /** External AI Search session count */
  searchSessions: number
}

/**
 * @description Query analytics payload with volume, latency, quality, and trend metrics
 */
export interface QueryAnalytics {
  /** Total number of queries in the date range */
  totalQueries: number
  /** Average response time in milliseconds across all queries */
  avgResponseTime: number
  /** Percentage of queries that returned zero results */
  failedRate: number
  /** Percentage of queries with confidence score below 0.5 */
  lowConfRate: number
  /** Top 10 most frequent queries with count and average confidence */
  topQueries: { query: string; count: number; avgConfidence: number | null }[]
  /** Daily query counts for trend chart */
  trend: { date: string; count: number }[]
}

/**
 * @description Feedback analytics payload with satisfaction, worst datasets, and negative entries
 */
export interface FeedbackAnalytics {
  /** Percentage of positive (thumbs-up) feedback */
  satisfactionRate: number
  /** Total feedback entries in the date range */
  totalFeedback: number
  /** Percentage of feedback linked to zero-result queries */
  zeroResultRate: number
  /** Bottom 5 datasets by satisfaction ratio */
  worstDatasets: { datasetId: string; name: string; satisfactionRate: number; feedbackCount: number }[]
  /** Daily feedback volume and satisfaction trend */
  trend: { date: string; count: number; satisfactionRate: number }[]
  /** Recent negative feedback entries with trace links and source type */
  negativeFeedback: { id: string; query: string; answerPreview: string; source: string | null; traceId: string | null; langfuseUrl: string | null; createdAt: string }[]
}

/**
 * @description Complete dashboard statistics payload including summaries, trends, and breakdowns
 */
export interface DashboardStats {
  /** Summary card numbers */
  totalSessions: number
  totalMessages: number
  uniqueUsers: number
  avgMessagesPerSession: number
  /** Daily activity trend for line/column charts */
  activityTrend: DailyActivity[]
  /** Top 10 most active users */
  topUsers: TopUser[]
  /** Session breakdown by type for pie chart */
  usageBreakdown: UsageBreakdown
}

/**
 * @description Aggregates statistics from external chat and search sources using parallel Knex queries
 */
class DashboardService {
  /**
   * @description Get comprehensive dashboard statistics by aggregating data from multiple sources in parallel
   * @param {string} startDate - Optional ISO date string for range start
   * @param {string} endDate - Optional ISO date string for range end
   * @returns {Promise<DashboardStats>} All dashboard data in a single payload
   */
  async getStats(startDate?: string, endDate?: string): Promise<DashboardStats> {
    const dashboardModel = ModelFactory.dashboard

    // Run all queries in parallel for performance
    // Queries cover BOTH external history tables AND internal chat tables
    const [
      extChatSessionCount,
      extSearchSessionCount,
      extChatMessageCount,
      extSearchRecordCount,
      extChatUserEmails,
      extSearchUserEmails,
      extChatTrend,
      extSearchTrend,
      intChatSessionCount,
      intChatMessageCount,
      intChatUserEmails,
      intChatTrend,
      topUsers
    ] = await Promise.all([
      // External session counts
      dashboardModel.countRows('history_chat_sessions', 'updated_at', startDate, endDate),
      dashboardModel.countRows('history_search_sessions', 'updated_at', startDate, endDate),
      // External message counts
      dashboardModel.countRows('history_chat_messages', 'created_at', startDate, endDate),
      dashboardModel.countRows('history_search_records', 'created_at', startDate, endDate),
      // External unique users
      dashboardModel.getDistinctEmails('history_chat_sessions', 'user_email', 'updated_at', startDate, endDate),
      dashboardModel.getDistinctEmails('history_search_sessions', 'user_email', 'updated_at', startDate, endDate),
      // External daily trends
      dashboardModel.getDailyCount('history_chat_messages', 'created_at', startDate, endDate),
      dashboardModel.getDailyCount('history_search_records', 'created_at', startDate, endDate),
      // Internal chat_sessions count
      dashboardModel.countRows('chat_sessions', 'created_at', startDate, endDate),
      // Internal chat_messages count (uses 'timestamp' column)
      dashboardModel.countRows('chat_messages', 'timestamp', startDate, endDate),
      // Internal unique user emails (resolved via users table join)
      dashboardModel.getInternalChatUserEmails(startDate, endDate),
      // Internal daily chat trend (uses 'timestamp' column)
      dashboardModel.getDailyCount('chat_messages', 'timestamp', startDate, endDate),
      // Top users (now includes internal data)
      dashboardModel.getTopUsers(startDate, endDate)
    ])

    // Merge external + internal counts
    const chatSessionCount = extChatSessionCount + intChatSessionCount
    const searchSessionCount = extSearchSessionCount
    const totalSessions = chatSessionCount + searchSessionCount
    const totalMessages = (extChatMessageCount + intChatMessageCount) + extSearchRecordCount

    // Merge unique users from all sources
    const allEmails = new Set<string>([
      ...extChatUserEmails,
      ...extSearchUserEmails,
      ...intChatUserEmails,
    ])
    const uniqueUsers = allEmails.size

    // Average messages per session (avoid division by zero)
    const avgMessagesPerSession = totalSessions > 0
      ? Math.round((totalMessages / totalSessions) * 10) / 10
      : 0

    // Merge all chat trends (external + internal) then merge with search
    const mergedChatTrend = this.mergeTrendMaps(extChatTrend, intChatTrend)
    const activityTrend = this.mergeTrends(mergedChatTrend, extSearchTrend)

    return {
      totalSessions,
      totalMessages,
      uniqueUsers,
      avgMessagesPerSession,
      activityTrend,
      topUsers,
      usageBreakdown: {
        chatSessions: chatSessionCount,
        searchSessions: searchSessionCount
      }
    }
  }

  /**
   * @description Merge daily trends from two sources into a single sorted array
   * @param {Map<string, number>} chat - Chat daily counts
   * @param {Map<string, number>} search - Search daily counts
   * @returns {DailyActivity[]} Sorted array of DailyActivity
   */
  private mergeTrends(
    chat: Map<string, number>,
    search: Map<string, number>
  ): DailyActivity[] {
    // Collect all unique dates from both sources
    const allDates = new Set<string>([...chat.keys(), ...search.keys()])

    // Build merged activity array
    const result: DailyActivity[] = []
    allDates.forEach(date => {
      result.push({
        date,
        chatCount: chat.get(date) || 0,
        searchCount: search.get(date) || 0
      })
    })

    // Sort by date ascending
    result.sort((a, b) => a.date.localeCompare(b.date))
    return result
  }

  /**
   * @description Merge two daily-count maps by summing values for each date.
   * @param {Map<string, number>} a - First count map
   * @param {Map<string, number>} b - Second count map
   * @returns {Map<string, number>} Merged map with summed counts
   */
  private mergeTrendMaps(
    a: Map<string, number>,
    b: Map<string, number>
  ): Map<string, number> {
    const merged = new Map<string, number>(a)
    b.forEach((count, date) => {
      merged.set(date, (merged.get(date) || 0) + count)
    })
    return merged
  }

  /**
   * @description Get query analytics metrics scoped to a tenant with optional date range filtering.
   *   Runs all aggregation queries in parallel for performance.
   * @param {string} tenantId - Tenant ID for org isolation
   * @param {string} startDate - Optional ISO date string for range start
   * @param {string} endDate - Optional ISO date string for range end
   * @returns {Promise<QueryAnalytics>} Query analytics payload
   */
  async getQueryAnalytics(tenantId: string, startDate?: string, endDate?: string): Promise<QueryAnalytics> {
    // Delegate all DB queries to the dashboard model
    const { aggregateResult, topQueriesRows, trendRows } = await ModelFactory.dashboard.getQueryAnalyticsData(tenantId, startDate, endDate)

    const totalQueries = parseInt((aggregateResult as any)?.total_queries as string || '0', 10)
    const avgResponseTime = Math.round(parseFloat((aggregateResult as any)?.avg_response_time as string || '0') * 100) / 100

    // Calculate failed and low-confidence rates as percentages (avoid division by zero)
    const failedCount = parseInt((aggregateResult as any)?.failed_queries as string || '0', 10)
    const failedRate = totalQueries > 0 ? Math.round((failedCount / totalQueries) * 10000) / 100 : 0

    const lowConfCount = parseInt((aggregateResult as any)?.low_conf_queries as string || '0', 10)
    const lowConfRate = totalQueries > 0 ? Math.round((lowConfCount / totalQueries) * 10000) / 100 : 0

    // Map top queries result rows
    const topQueries = (topQueriesRows as any[]).map((r: any) => ({
      query: r.query as string,
      count: parseInt(r.count as string || '0', 10),
      avgConfidence: r.avg_confidence != null ? Math.round(parseFloat(r.avg_confidence) * 1000) / 1000 : null,
    }))

    // Map daily trend rows to date-string / count pairs
    const trend = (trendRows as any[]).map((r: any) => ({
      date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
      count: parseInt(r.count as string || '0', 10),
    }))

    return { totalQueries, avgResponseTime, failedRate, lowConfRate, topQueries, trend }
  }

  /**
   * @description Get feedback analytics metrics scoped to a tenant with optional date range filtering.
   *   Includes satisfaction rate, worst datasets, trend, and recent negative feedback entries.
   * @param {string} tenantId - Tenant ID for org isolation
   * @param {string} startDate - Optional ISO date string for range start
   * @param {string} endDate - Optional ISO date string for range end
   * @returns {Promise<FeedbackAnalytics>} Feedback analytics payload
   */
  async getFeedbackAnalytics(tenantId: string, startDate?: string, endDate?: string): Promise<FeedbackAnalytics> {
    // Delegate all DB queries to the dashboard model
    const { aggregateResult, zeroResultCount, worstRows, trendRows, negativeRows } = await ModelFactory.dashboard.getFeedbackAnalyticsData(tenantId, startDate, endDate)

    const totalFeedback = parseInt((aggregateResult as any)?.total_feedback as string || '0', 10)
    const positiveCount = parseInt((aggregateResult as any)?.positive_feedback as string || '0', 10)
    // Satisfaction rate as percentage (avoid division by zero)
    const satisfactionRate = totalFeedback > 0 ? Math.round((positiveCount / totalFeedback) * 10000) / 100 : 0

    const zeroCount = zeroResultCount?.rows?.[0]?.count ?? 0
    const zeroResultRate = totalFeedback > 0 ? Math.round((zeroCount / totalFeedback) * 10000) / 100 : 0

    // Map worst datasets from raw query result
    const worstDatasets = (worstRows?.rows ?? []).map((r: any) => ({
      datasetId: r.dataset_id as string,
      name: r.name as string,
      satisfactionRate: parseFloat(r.satisfaction_rate ?? '0'),
      feedbackCount: parseInt(r.feedback_count as string || '0', 10),
    }))

    // Map daily trend from raw query result
    const trend = (trendRows?.rows ?? []).map((r: any) => ({
      date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
      count: parseInt(r.count as string || '0', 10),
      satisfactionRate: parseFloat(r.satisfaction_rate ?? '0'),
    }))

    // Map negative feedback entries with Langfuse deep-link URLs and source type
    const negativeFeedback = (negativeRows as any[]).map((r: any) => ({
      id: r.id as string,
      query: r.query as string,
      // Truncate answer to 200 chars for preview
      answerPreview: (r.answer as string).length > 200 ? (r.answer as string).substring(0, 200) + '...' : r.answer as string,
      source: (r.source as string) ?? null,
      traceId: r.trace_id ?? null,
      langfuseUrl: r.trace_id ? this.getLangfuseTraceUrl(r.trace_id) : null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }))

    return { satisfactionRate, totalFeedback, zeroResultRate, worstDatasets, trend, negativeFeedback }
  }

  /**
   * @description Construct a Langfuse trace deep-link URL from a trace ID.
   *   Strips trailing slashes from the base URL to prevent double-slash issues.
   * @param {string} traceId - Langfuse trace identifier
   * @returns {string} Full Langfuse trace URL
   */
  getLangfuseTraceUrl(traceId: string): string {
    // Strip trailing slash from base URL to avoid double-slash in constructed URL
    return `${config.langfuse.baseUrl.replace(/\/$/, '')}/trace/${traceId}`
  }

  /**
   * @description Get feedback count breakdown by source type (chat, search, agent).
   * Queries the answer_feedback table grouped by source column.
   * @param {string} tenantId - Tenant ID for multi-tenancy isolation
   * @param {string} [startDate] - Optional ISO date string for range start
   * @param {string} [endDate] - Optional ISO date string for range end
   * @returns {Promise<{ chat: number; search: number; agent: number }>} Feedback counts per source
   */
  async getFeedbackSourceBreakdown(
    tenantId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{ chat: number; search: number; agent: number }> {
    // Delegate DB query to the dashboard model
    const rows = await ModelFactory.dashboard.getFeedbackSourceBreakdownData(tenantId, startDate, endDate)

    // Initialize all sources to zero, then populate from query results
    const result = { chat: 0, search: 0, agent: 0 }
    for (const row of rows) {
      const source = (row as any).source as keyof typeof result
      if (source in result) {
        result[source] = parseInt((row as any).count as string || '0', 10)
      }
    }

    return result
  }
}

/** Singleton dashboard service instance */
export const dashboardService = new DashboardService()
