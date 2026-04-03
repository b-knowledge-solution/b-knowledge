
/**
 * @fileoverview Dashboard model for aggregate analytics queries across multiple tables.
 * Unlike standard models that extend BaseModel for a single table, this model
 * encapsulates cross-table analytics queries used exclusively by the dashboard module.
 * @module modules/dashboard/dashboard.model
 */
import { Knex } from 'knex'
import { db } from '@/shared/db/knex.js'

/**
 * @description Model for dashboard aggregate analytics queries.
 * Encapsulates all cross-table analytics DB access for the dashboard module.
 * Queries span history_chat_sessions, history_search_sessions, chat_sessions,
 * chat_messages, query_log, answer_feedback, users, and knowledgebase tables.
 */
export class DashboardModel {
  /** Knex instance for building queries */
  private knex: Knex = db

  /**
   * @description Count rows in a table with optional date range filter
   * @param {string} table - Table name
   * @param {string} dateCol - Date column for filtering
   * @param {string} [startDate] - Optional start date
   * @param {string} [endDate] - Optional end date
   * @returns {Promise<number>} Row count
   */
  async countRows(table: string, dateCol: string, startDate?: string, endDate?: string): Promise<number> {
    // Build query with optional date range
    let query = this.knex(table).count('* as count')
    if (startDate) query = query.where(dateCol, '>=', startDate)
    if (endDate) query = query.where(dateCol, '<=', `${endDate} 23:59:59`)
    const result = await query.first()
    return parseInt(result?.count as string || '0', 10)
  }

  /**
   * @description Get distinct emails from a session table with optional date filtering
   * @param {string} table - Table name
   * @param {string} emailCol - Column containing email
   * @param {string} dateCol - Date column for filtering
   * @param {string} [startDate] - Optional start date
   * @param {string} [endDate] - Optional end date
   * @returns {Promise<string[]>} Array of unique email strings
   */
  async getDistinctEmails(
    table: string, emailCol: string, dateCol: string,
    startDate?: string, endDate?: string
  ): Promise<string[]> {
    // Query distinct non-null, non-empty emails
    let query = this.knex(table).distinct(emailCol).whereNotNull(emailCol).where(emailCol, '!=', '')
    if (startDate) query = query.where(dateCol, '>=', startDate)
    if (endDate) query = query.where(dateCol, '<=', `${endDate} 23:59:59`)
    const rows = await query
    return rows.map((r: any) => r[emailCol] as string)
  }

  /**
   * @description Get daily record counts grouped by day from a table
   * @param {string} table - Table name
   * @param {string} dateCol - Timestamp column
   * @param {string} [startDate] - Optional start date
   * @param {string} [endDate] - Optional end date
   * @returns {Promise<Map<string, number>>} Map of date string to count
   */
  async getDailyCount(
    table: string, dateCol: string,
    startDate?: string, endDate?: string
  ): Promise<Map<string, number>> {
    // Group by day, count records per day
    let query = this.knex(table)
      .select(this.knex.raw(`date_trunc('day', ${dateCol})::date as date`))
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
   * @description Get distinct user emails from internal chat_sessions via users table join.
   * Internal sessions store user_id, not email, so we join with users to get emails.
   * @param {string} [startDate] - Optional start date
   * @param {string} [endDate] - Optional end date
   * @returns {Promise<string[]>} Array of unique email strings
   */
  async getInternalChatUserEmails(startDate?: string, endDate?: string): Promise<string[]> {
    let query = this.knex('chat_sessions')
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
   * @description Get query analytics aggregate data from query_log table for a tenant.
   * Returns totals, rates, top queries, and daily trend in a single parallel batch.
   * @param {string} tenantId - Tenant ID for org isolation
   * @param {string} [startDate] - Optional ISO date string for range start
   * @param {string} [endDate] - Optional ISO date string for range end
   * @returns {Promise<{ aggregateResult: any; topQueriesRows: any[]; trendRows: any[] }>} Raw query results
   */
  async getQueryAnalyticsData(
    tenantId: string, startDate?: string, endDate?: string
  ): Promise<{ aggregateResult: any; topQueriesRows: any[]; trendRows: any[] }> {
    // Helper to build tenant-scoped, date-filtered base query on query_log
    const baseQuery = () => {
      let q = this.knex('query_log').where('tenant_id', tenantId)
      if (startDate) q = q.where('created_at', '>=', startDate)
      if (endDate) q = q.where('created_at', '<=', `${endDate} 23:59:59`)
      return q
    }

    // Run all 3 analytics query groups in parallel
    const [aggregateResult, topQueriesRows, trendRows] = await Promise.all([
      // Single aggregate pass for totals/rates to reduce repeated table scans
      baseQuery()
        .select(
          this.knex.raw('COUNT(*)::int as total_queries'),
          this.knex.raw('COALESCE(AVG(response_time_ms), 0)::numeric as avg_response_time'),
          this.knex.raw('COUNT(*) FILTER (WHERE failed_retrieval = true)::int as failed_queries'),
          this.knex.raw('COUNT(*) FILTER (WHERE confidence_score IS NOT NULL AND confidence_score < 0.5)::int as low_conf_queries')
        )
        .first(),
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
        .select(this.knex.raw(`date_trunc('day', created_at)::date as date`))
        .count('* as count')
        .groupByRaw(`date_trunc('day', created_at)::date`)
        .orderBy('date', 'asc'),
    ])

    return { aggregateResult, topQueriesRows: topQueriesRows as any[], trendRows: trendRows as any[] }
  }

  /**
   * @description Get feedback analytics aggregate data from answer_feedback table for a tenant.
   * Returns satisfaction totals, zero-result count, worst datasets, daily trend, and negative feedback.
   * @param {string} tenantId - Tenant ID for org isolation
   * @param {string} [startDate] - Optional ISO date string for range start
   * @param {string} [endDate] - Optional ISO date string for range end
   * @returns {Promise<{ aggregateResult: any; zeroResultCount: any; worstRows: any; trendRows: any; negativeRows: any[] }>} Raw query results
   */
  async getFeedbackAnalyticsData(
    tenantId: string, startDate?: string, endDate?: string
  ): Promise<{ aggregateResult: any; zeroResultCount: any; worstRows: any; trendRows: any; negativeRows: any[] }> {
    // Helper to build tenant-scoped, date-filtered base query on answer_feedback
    const baseQuery = () => {
      let q = this.knex('answer_feedback').where('answer_feedback.tenant_id', tenantId)
      if (startDate) q = q.where('answer_feedback.created_at', '>=', startDate)
      if (endDate) q = q.where('answer_feedback.created_at', '<=', `${endDate} 23:59:59`)
      return q
    }

    // Build reusable bound date conditions for raw SQL fragments to avoid interpolation
    const afDateConditions: string[] = []
    const afDateParams: string[] = []
    if (startDate) {
      afDateConditions.push('AND af.created_at >= ?')
      afDateParams.push(startDate)
    }
    if (endDate) {
      afDateConditions.push('AND af.created_at <= ?')
      afDateParams.push(`${endDate} 23:59:59`)
    }

    const feedbackDateConditions: string[] = []
    const feedbackDateParams: string[] = []
    if (startDate) {
      feedbackDateConditions.push('AND created_at >= ?')
      feedbackDateParams.push(startDate)
    }
    if (endDate) {
      feedbackDateConditions.push('AND created_at <= ?')
      feedbackDateParams.push(`${endDate} 23:59:59`)
    }

    // Run all analytics queries in parallel
    const [aggregateResult, zeroResultCount, worstRows, trendRows, negativeRows] = await Promise.all([
      // Single aggregate pass for total + positive counts
      baseQuery()
        .select(
          this.knex.raw('COUNT(*)::int as total_feedback'),
          this.knex.raw('COUNT(*) FILTER (WHERE thumbup = true)::int as positive_feedback')
        )
        .first(),
      // Zero-result rate: feedback entries linked to failed queries via query text + tenant
      this.knex.raw(`
        SELECT COUNT(DISTINCT af.id)::int as count
        FROM answer_feedback af
        INNER JOIN query_log ql ON af.query = ql.query AND af.tenant_id = ql.tenant_id
        WHERE af.tenant_id = ? AND ql.failed_retrieval = true
        ${afDateConditions.join('\n        ')}
      `, [tenantId, ...afDateParams]),
      // Worst datasets: bottom 5 by satisfaction ratio (search feedback only)
      this.knex.raw(`
        SELECT af.source_id as dataset_id,
               COALESCE(kb.name, af.source_id) as name,
               COUNT(*) as feedback_count,
               ROUND(COUNT(*) FILTER (WHERE af.thumbup = true)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as satisfaction_rate
        FROM answer_feedback af
        LEFT JOIN knowledgebase kb ON af.source_id = kb.id
        WHERE af.tenant_id = ? AND af.source = 'search'
        ${afDateConditions.join('\n        ')}
        GROUP BY af.source_id, kb.name
        ORDER BY satisfaction_rate ASC
        LIMIT 5
      `, [tenantId, ...afDateParams]),
      // Daily feedback trend with per-day satisfaction rate
      this.knex.raw(`
        SELECT date_trunc('day', created_at)::date as date,
               COUNT(*) as count,
               ROUND(COUNT(*) FILTER (WHERE thumbup = true)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as satisfaction_rate
        FROM answer_feedback
        WHERE tenant_id = ?
        ${feedbackDateConditions.join('\n        ')}
        GROUP BY date_trunc('day', created_at)::date
        ORDER BY date ASC
      `, [tenantId, ...feedbackDateParams]),
      // Recent negative feedback entries (last 20) including source for column display
      baseQuery()
        .where('thumbup', false)
        .select('id', 'query', 'answer', 'source', 'trace_id', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(20),
    ])

    return { aggregateResult, zeroResultCount, worstRows, trendRows, negativeRows: negativeRows as any[] }
  }

  /**
   * @description Get the top 50 most active users by session count across all sources using UNION ALL.
   * Combines external chat, external search, and internal chat session counts.
   * @param {string} [startDate] - Optional start date
   * @param {string} [endDate] - Optional end date
   * @returns {Promise<{ email: string; sessionCount: number }[]>} Array of top user rows sorted descending by session count
   */
  async getTopUsers(startDate?: string, endDate?: string): Promise<{ email: string; sessionCount: number }[]> {
    // Build separate queries for each source, then combine with raw SQL
    // External chat sessions
    const chatQ = this.knex('history_chat_sessions')
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
    const searchQ = this.knex('history_search_sessions')
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
    const internalChatQ = this.knex('chat_sessions')
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
    const result = await this.knex.raw(`
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
   * @description Get feedback count breakdown grouped by source type (chat, search, agent).
   * Queries the answer_feedback table with tenant isolation and optional date filtering.
   * @param {string} tenantId - Tenant ID for multi-tenancy isolation
   * @param {string} [startDate] - Optional ISO date string for range start
   * @param {string} [endDate] - Optional ISO date string for range end
   * @returns {Promise<{ source: string; count: string }[]>} Raw rows with source and count
   */
  async getFeedbackSourceBreakdownData(
    tenantId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{ source: string; count: string }[]> {
    // Query answer_feedback grouped by source with tenant isolation
    const query = this.knex('answer_feedback')
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
    return rows as any[]
  }
}
