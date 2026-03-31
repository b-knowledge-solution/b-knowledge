/**
 * @fileoverview Answer feedback model for the answer_feedback table.
 * @description Provides CRUD operations and custom queries for feedback
 *   on chat, search, and agent answers.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { AnswerFeedback } from '@/shared/models/types.js'

/**
 * @description Filter options for paginated feedback queries.
 */
export interface FeedbackPaginationFilters {
  /** Filter by feedback source type */
  source?: 'chat' | 'search' | 'agent'
  /** Filter by thumbup value */
  thumbup?: boolean
  /** ISO date string for range start */
  startDate?: string
  /** ISO date string for range end */
  endDate?: string
  /** Tenant ID for multi-tenancy isolation */
  tenantId: string
  /** Page number (1-indexed) */
  page: number
  /** Items per page */
  limit: number
}

/**
 * @description Result shape for paginated feedback queries.
 */
export interface PaginatedFeedbackResult {
  /** Array of feedback records for the current page */
  data: AnswerFeedback[]
  /** Total count of matching records */
  total: number
}

/**
 * @description Source breakdown counts for feedback analytics.
 */
export interface SourceBreakdown {
  /** Count of chat feedback records */
  chat: number
  /** Count of search feedback records */
  search: number
  /** Count of agent feedback records */
  agent: number
}

/**
 * @description Top flagged session entry for feedback analytics.
 */
export interface TopFlaggedSession {
  /** Feedback source type */
  source: string
  /** Source ID (conversation_id, search_app_id, or agent_run_id) */
  source_id: string
  /** Count of negative feedback records */
  negative_count: number
  /** Total count of feedback records */
  total_count: number
}

/**
 * @description AnswerFeedbackModel extends BaseModel to provide feedback-specific queries.
 * Maps to the 'answer_feedback' table created by the initial schema migration.
 */
export class AnswerFeedbackModel extends BaseModel<AnswerFeedback> {
  /** Table name in the database */
  protected tableName = 'answer_feedback'
  /** Knex connection instance */
  protected knex = db

  /**
   * @description Find all feedback records for a given source type and source ID.
   * @param {('chat' | 'search' | 'agent')} source - The feedback source type
   * @param {string} sourceId - The conversation_id (chat), search_app_id (search), or agent_run_id (agent)
   * @returns {Promise<AnswerFeedback[]>} Array of matching feedback records, newest first
   */
  async findBySource(source: 'chat' | 'search' | 'agent', sourceId: string): Promise<AnswerFeedback[]> {
    return this.knex(this.tableName)
      .where({ source, source_id: sourceId })
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find all feedback records submitted by a specific user.
   * @param {string} userId - The user ID to filter by
   * @returns {Promise<AnswerFeedback[]>} Array of matching feedback records, newest first
   */
  async findByUser(userId: string): Promise<AnswerFeedback[]> {
    return this.knex(this.tableName)
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find feedback records with filters and pagination for admin listing.
   * @param {FeedbackPaginationFilters} filters - Filter and pagination options
   * @returns {Promise<PaginatedFeedbackResult>} Paginated feedback records with total count
   */
  async findPaginated(filters: FeedbackPaginationFilters): Promise<PaginatedFeedbackResult> {
    // Build base query with tenant isolation
    const baseQuery = this.knex(this.tableName).where('tenant_id', filters.tenantId)

    // Apply optional source filter
    if (filters.source) {
      baseQuery.where('source', filters.source)
    }

    // Apply optional thumbup filter
    if (filters.thumbup !== undefined) {
      baseQuery.where('thumbup', filters.thumbup)
    }

    // Apply optional date range filters
    if (filters.startDate) {
      baseQuery.where('created_at', '>=', filters.startDate)
    }
    if (filters.endDate) {
      baseQuery.where('created_at', '<=', `${filters.endDate} 23:59:59`)
    }

    // Count total matching records for pagination metadata
    const countResult = await baseQuery.clone().count('* as count').first()
    const total = parseInt(countResult?.count as string || '0', 10)

    // Calculate offset from page number
    const offset = (filters.page - 1) * filters.limit

    // Fetch paginated data ordered by newest first
    const data = await baseQuery
      .clone()
      .orderBy('created_at', 'desc')
      .limit(filters.limit)
      .offset(offset)

    return { data, total }
  }

  /**
   * @description Count feedback records grouped by source type for analytics.
   * @param {string} tenantId - Tenant ID for isolation
   * @param {string} [startDate] - Optional ISO date string for range start
   * @param {string} [endDate] - Optional ISO date string for range end
   * @returns {Promise<SourceBreakdown>} Counts per source type (chat, search, agent)
   */
  async countBySource(tenantId: string, startDate?: string, endDate?: string): Promise<SourceBreakdown> {
    // Build query with tenant isolation and optional date filters before groupBy
    const query = this.knex(this.tableName)
      .where('tenant_id', tenantId)
      .modify((qb: any) => {
        // Apply optional date range filters before aggregation
        if (startDate) qb.where('created_at', '>=', startDate)
        if (endDate) qb.where('created_at', '<=', `${endDate} 23:59:59`)
      })
      .select('source')
      .count('* as count')
      .groupBy('source')

    const rows = await query

    // Initialize all sources to zero, then populate from query results
    const result: SourceBreakdown = { chat: 0, search: 0, agent: 0 }
    for (const row of rows) {
      const source = (row as any).source as keyof SourceBreakdown
      if (source in result) {
        result[source] = parseInt((row as any).count as string || '0', 10)
      }
    }

    return result
  }

  /**
   * @description Get sessions with the most negative feedback for quality analysis.
   * Groups by source + source_id, counts negative and total feedback, sorted by negative count descending.
   * @param {string} tenantId - Tenant ID for isolation
   * @param {number} limit - Maximum number of sessions to return
   * @param {string} [startDate] - Optional ISO date string for range start
   * @param {string} [endDate] - Optional ISO date string for range end
   * @returns {Promise<TopFlaggedSession[]>} Array of top flagged sessions
   */
  async getTopFlaggedSessions(
    tenantId: string,
    limit: number,
    startDate?: string,
    endDate?: string
  ): Promise<TopFlaggedSession[]> {
    // Build query with filters before aggregation, then group and limit
    const rows = await this.knex(this.tableName)
      .where('tenant_id', tenantId)
      .modify((qb: any) => {
        // Apply optional date range filters before aggregation
        if (startDate) qb.where('created_at', '>=', startDate)
        if (endDate) qb.where('created_at', '<=', `${endDate} 23:59:59`)
      })
      .select('source', 'source_id')
      .count('* as total_count')
      .select(this.knex.raw("SUM(CASE WHEN thumbup = false THEN 1 ELSE 0 END)::int as negative_count"))
      .groupBy('source', 'source_id')
      // Only include sessions with at least one negative feedback
      .havingRaw('SUM(CASE WHEN thumbup = false THEN 1 ELSE 0 END) > 0')
      .orderBy('negative_count', 'desc')
      .limit(limit)

    return rows.map((row: any) => ({
      source: row.source,
      source_id: row.source_id,
      negative_count: parseInt(row.negative_count as string || '0', 10),
      total_count: parseInt(row.total_count as string || '0', 10),
    }))
  }
}
