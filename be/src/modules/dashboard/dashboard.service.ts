
/**
 * Dashboard Service
 * Provides aggregate statistics for admin activity dashboard.
 * Queries across external chat and external search data sources.
 * Also provides query analytics and feedback aggregation for observability.
 * @module services/dashboard
 */
import { db } from '@/shared/db/knex.js'
import { config } from '@/shared/config/index.js'

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
  /** Recent negative feedback entries with trace links */
  negativeFeedback: { id: string; query: string; answerPreview: string; traceId: string | null; langfuseUrl: string | null; createdAt: string }[]
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
      this.countRows('history_chat_sessions', 'updated_at', startDate, endDate),
      this.countRows('history_search_sessions', 'updated_at', startDate, endDate),
      // External message counts
      this.countRows('history_chat_messages', 'created_at', startDate, endDate),
      this.countRows('history_search_records', 'created_at', startDate, endDate),
      // External unique users
      this.getDistinctEmails('history_chat_sessions', 'user_email', 'updated_at', startDate, endDate),
      this.getDistinctEmails('history_search_sessions', 'user_email', 'updated_at', startDate, endDate),
      // External daily trends
      this.getDailyCount('history_chat_messages', 'created_at', startDate, endDate),
      this.getDailyCount('history_search_records', 'created_at', startDate, endDate),
      // Internal chat_sessions count
      this.countRows('chat_sessions', 'created_at', startDate, endDate),
      // Internal chat_messages count (uses 'timestamp' column)
      this.countRows('chat_messages', 'timestamp', startDate, endDate),
      // Internal unique user emails (resolved via users table join)
      this.getInternalChatUserEmails(startDate, endDate),
      // Internal daily chat trend (uses 'timestamp' column)
      this.getDailyCount('chat_messages', 'timestamp', startDate, endDate),
      // Top users (now includes internal data)
      this.getTopUsers(startDate, endDate)
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
   * @description Count rows in a table with optional date range filter
   * @param {string} table - Table name
   * @param {string} dateCol - Date column for filtering
   * @param {string} startDate - Optional start date
   * @param {string} endDate - Optional end date
   * @returns {Promise<number>} Row count
   */
  private async countRows(table: string, dateCol: string, startDate?: string, endDate?: string): Promise<number> {
    // Build query with optional date range
    let query = db(table).count('* as count')
    if (startDate) query = query.where(dateCol, '>=', startDate)
    if (endDate) query = query.where(dateCol, '<=', `${endDate} 23:59:59`)
    const result = await query.first()
    return parseInt(result?.count as string || '0', 10)
  }

  /**
   * @description Get distinct emails from an external session table
   * @param {string} table - Table name
   * @param {string} emailCol - Column containing email
   * @param {string} dateCol - Date column for filtering
   * @param {string} startDate - Optional start date
   * @param {string} endDate - Optional end date
   * @returns {Promise<string[]>} Array of unique email strings
   */
  private async getDistinctEmails(
    table: string, emailCol: string, dateCol: string,
    startDate?: string, endDate?: string
  ): Promise<string[]> {
    // Query distinct non-null, non-empty emails
    let query = db(table).distinct(emailCol).whereNotNull(emailCol).where(emailCol, '!=', '')
    if (startDate) query = query.where(dateCol, '>=', startDate)
    if (endDate) query = query.where(dateCol, '<=', `${endDate} 23:59:59`)
    const rows = await query
    return rows.map((r: any) => r[emailCol] as string)
  }

  /**
   * @description Get daily message/record counts grouped by day from a table
   * @param {string} table - Table name
   * @param {string} dateCol - Timestamp column
   * @param {string} startDate - Optional start date
   * @param {string} endDate - Optional end date
   * @returns {Promise<Map<string, number>>} Map of date string to count
   */
  private async getDailyCount(
    table: string, dateCol: string,
    startDate?: string, endDate?: string
  ): Promise<Map<string, number>> {
    // Group by day, count records per day
    let query = db(table)
      .select(db.raw(`date_trunc('day', ${dateCol})::date as date`))
      .count('* as count')
      .groupByRaw(`date_trunc('day', ${dateCol})::date`)
      .orderBy('date', 'asc')
    if (startDate) query = query.where(dateCol, '>=', startDate)
    if (endDate) query = query.where(dateCol, '<=', `${endDate} 23:59:59`)

    const rows = await query
    const map = new Map<string, number>()
    rows.forEach((r: any) => {
      // Normalize date to YYYY-MM-DD string
      const dateStr = r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date)
      map.set(dateStr, parseInt(r.count as string || '0', 10))
    })
    return map
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
   * @description Get distinct user emails from internal chat_sessions via users table join.
   * Internal sessions store user_id, not email, so we join with users to get emails.
   * @param {string} startDate - Optional start date
   * @param {string} endDate - Optional end date
   * @returns {Promise<string[]>} Array of unique email strings
   */
  private async getInternalChatUserEmails(
    startDate?: string, endDate?: string
  ): Promise<string[]> {
    let query = db('chat_sessions')
      .distinct('users.email')
      .join('users', 'chat_sessions.user_id', 'users.id')
      .whereNotNull('users.email')
      .where('users.email', '!=', '')
    if (startDate) query = query.where('chat_sessions.created_at', '>=', startDate)
    if (endDate) query = query.where('chat_sessions.created_at', '<=', `${endDate} 23:59:59`)
    const rows = await query
    return rows.map((r: any) => r.email as string)
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
    // Helper to build tenant-scoped, date-filtered base query on query_log
    const baseQuery = () => {
      let q = db('query_log').where('tenant_id', tenantId)
      if (startDate) q = q.where('created_at', '>=', startDate)
      if (endDate) q = q.where('created_at', '<=', `${endDate} 23:59:59`)
      return q
    }

    // Run all 6 analytics queries in parallel
    const [totalResult, avgTimeResult, failedResult, lowConfResult, topQueriesRows, trendRows] = await Promise.all([
      // Total query count
      baseQuery().count('* as count').first(),
      // Average response time
      baseQuery().avg('response_time_ms as avg').first(),
      // Failed retrieval count
      baseQuery().where('failed_retrieval', true).count('* as count').first(),
      // Low confidence count (score below 0.5 threshold)
      baseQuery().whereNotNull('confidence_score').where('confidence_score', '<', 0.5).count('* as count').first(),
      // Top 10 most frequent queries with average confidence
      baseQuery()
        .select('query')
        .count('* as count')
        .avg('confidence_score as avg_confidence')
        .groupBy('query')
        .orderBy('count', 'desc')
        .limit(10),
      // Daily query volume trend
      baseQuery()
        .select(db.raw(`date_trunc('day', created_at)::date as date`))
        .count('* as count')
        .groupByRaw(`date_trunc('day', created_at)::date`)
        .orderBy('date', 'asc'),
    ])

    const totalQueries = parseInt(totalResult?.count as string || '0', 10)
    const avgResponseTime = Math.round(parseFloat(avgTimeResult?.avg as string || '0') * 100) / 100

    // Calculate failed and low-confidence rates as percentages (avoid division by zero)
    const failedCount = parseInt(failedResult?.count as string || '0', 10)
    const failedRate = totalQueries > 0 ? Math.round((failedCount / totalQueries) * 10000) / 100 : 0

    const lowConfCount = parseInt(lowConfResult?.count as string || '0', 10)
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
    // Helper to build tenant-scoped, date-filtered base query on answer_feedback
    const baseQuery = () => {
      let q = db('answer_feedback').where('answer_feedback.tenant_id', tenantId)
      if (startDate) q = q.where('answer_feedback.created_at', '>=', startDate)
      if (endDate) q = q.where('answer_feedback.created_at', '<=', `${endDate} 23:59:59`)
      return q
    }

    // Run all analytics queries in parallel
    const [totalResult, positiveResult, zeroResultCount, worstRows, trendRows, negativeRows] = await Promise.all([
      // Total feedback count
      baseQuery().count('* as count').first(),
      // Positive feedback count for satisfaction rate
      baseQuery().where('thumbup', true).count('* as count').first(),
      // Zero-result rate: feedback entries linked to failed queries via query text + tenant
      db.raw(`
        SELECT COUNT(DISTINCT af.id)::int as count
        FROM answer_feedback af
        INNER JOIN query_log ql ON af.query = ql.query AND af.tenant_id = ql.tenant_id
        WHERE af.tenant_id = ? AND ql.failed_retrieval = true
        ${startDate ? `AND af.created_at >= '${startDate}'` : ''}
        ${endDate ? `AND af.created_at <= '${endDate} 23:59:59'` : ''}
      `, [tenantId]),
      // Worst datasets: bottom 5 by satisfaction ratio (search feedback only)
      db.raw(`
        SELECT af.source_id as dataset_id,
               COALESCE(kb.name, af.source_id) as name,
               COUNT(*) as feedback_count,
               ROUND(COUNT(*) FILTER (WHERE af.thumbup = true)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as satisfaction_rate
        FROM answer_feedback af
        LEFT JOIN knowledgebase kb ON af.source_id = kb.id
        WHERE af.tenant_id = ? AND af.source = 'search'
        ${startDate ? `AND af.created_at >= '${startDate}'` : ''}
        ${endDate ? `AND af.created_at <= '${endDate} 23:59:59'` : ''}
        GROUP BY af.source_id, kb.name
        ORDER BY satisfaction_rate ASC
        LIMIT 5
      `, [tenantId]),
      // Daily feedback trend with per-day satisfaction rate
      db.raw(`
        SELECT date_trunc('day', created_at)::date as date,
               COUNT(*) as count,
               ROUND(COUNT(*) FILTER (WHERE thumbup = true)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as satisfaction_rate
        FROM answer_feedback
        WHERE tenant_id = ?
        ${startDate ? `AND created_at >= '${startDate}'` : ''}
        ${endDate ? `AND created_at <= '${endDate} 23:59:59'` : ''}
        GROUP BY date_trunc('day', created_at)::date
        ORDER BY date ASC
      `, [tenantId]),
      // Recent negative feedback entries (last 20)
      baseQuery()
        .where('thumbup', false)
        .select('id', 'query', 'answer', 'trace_id', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(20),
    ])

    const totalFeedback = parseInt(totalResult?.count as string || '0', 10)
    const positiveCount = parseInt(positiveResult?.count as string || '0', 10)
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

    // Map negative feedback entries with Langfuse deep-link URLs
    const negativeFeedback = (negativeRows as any[]).map((r: any) => ({
      id: r.id as string,
      query: r.query as string,
      // Truncate answer to 200 chars for preview
      answerPreview: (r.answer as string).length > 200 ? (r.answer as string).substring(0, 200) + '...' : r.answer as string,
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
   * @description Get the top 50 most active users by session count across all sources using UNION ALL
   * @param {string} startDate - Optional start date
   * @param {string} endDate - Optional end date
   * @returns {Promise<TopUser[]>} Array of top user objects sorted descending by session count
   */
  private async getTopUsers(startDate?: string, endDate?: string): Promise<TopUser[]> {
    // Build separate queries for each source, then combine with raw SQL
    // External chat sessions
    const chatQ = db('history_chat_sessions')
      .select('user_email as email')
      .count('* as cnt')
      .whereNotNull('user_email')
      .where('user_email', '!=', '')
      .modify(qb => {
        if (startDate) qb.where('updated_at', '>=', startDate)
        if (endDate) qb.where('updated_at', '<=', `${endDate} 23:59:59`)
      })
      .groupBy('user_email')

    // External search sessions
    const searchQ = db('history_search_sessions')
      .select('user_email as email')
      .count('* as cnt')
      .whereNotNull('user_email')
      .where('user_email', '!=', '')
      .modify(qb => {
        if (startDate) qb.where('updated_at', '>=', startDate)
        if (endDate) qb.where('updated_at', '<=', `${endDate} 23:59:59`)
      })
      .groupBy('user_email')

    // Internal chat sessions (join users for email resolution)
    const internalChatQ = db('chat_sessions')
      .select('users.email as email')
      .count('* as cnt')
      .join('users', 'chat_sessions.user_id', 'users.id')
      .whereNotNull('users.email')
      .where('users.email', '!=', '')
      .modify(qb => {
        if (startDate) qb.where('chat_sessions.created_at', '>=', startDate)
        if (endDate) qb.where('chat_sessions.created_at', '<=', `${endDate} 23:59:59`)
      })
      .groupBy('users.email')

    // Use UNION ALL to combine all sources, then aggregate by email
    const result = await db.raw(`
      SELECT email, SUM(cnt)::int as "sessionCount"
      FROM (
        (${chatQ.toQuery()})
        UNION ALL
        (${searchQ.toQuery()})
        UNION ALL
        (${internalChatQ.toQuery()})
      ) combined
      GROUP BY email
      ORDER BY "sessionCount" DESC
      LIMIT 50
    `)

    return result.rows.map((row: any) => ({
      email: row.email,
      sessionCount: row.sessionCount || 0
    }))
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
    // Query answer_feedback grouped by source with tenant isolation
    const query = db('answer_feedback')
      .select('source')
      .count('* as count')
      .where('tenant_id', tenantId)
      .modify((qb: any) => {
        // Apply optional date range filters
        if (startDate) qb.where('created_at', '>=', startDate)
        if (endDate) qb.where('created_at', '<=', `${endDate} 23:59:59`)
      })
      .groupBy('source')

    const rows = await query

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
