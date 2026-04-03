/**
 * @fileoverview Admin history model encapsulating all cross-table analytics queries
 * for the admin history module. Handles chat, search, and agent run history queries
 * with feedback aggregation, full-text search, and pagination.
 * @module modules/admin/models/admin-history
 */
import { Knex } from 'knex'
import { db } from '@/shared/db/knex.js'
import { MessageRole } from '@/shared/constants/message-roles.js'
import { FeedbackFilter as FeedbackFilterConst } from '@/shared/constants/feedback.js'

/** Feedback filter options for session queries. */
export type FeedbackFilter = 'positive' | 'negative' | 'any' | 'none'

/** Common filter parameters shared across history queries */
export interface HistoryFilters {
  page: number
  limit: number
  search: string
  email: string
  startDate: string
  endDate: string
  feedbackFilter?: FeedbackFilter | undefined
  tenantId?: string | undefined
}

/** Extended filters for chat history that include source name */
export interface ChatHistoryFilters extends HistoryFilters {
  sourceName?: string | undefined
}

/**
 * @description Model for admin history analytics queries across multiple tables.
 * Encapsulates all cross-table DB access for chat, search, and agent run history.
 * Unlike standard models extending BaseModel, this model handles complex join
 * and aggregation queries spanning multiple domain tables.
 */
export class AdminHistoryModel {
  /** Knex instance for building queries */
  private knex: Knex = db

  // ─── Feedback helpers ────────────────────────────────────────────────

  /**
   * @description Build a reusable feedback aggregation subquery for source/session-level counts.
   * @param {'chat' | 'search' | 'agent'} source - Feedback source discriminator
   * @param {string} [tenantId] - Optional tenant scope
   * @returns {Knex.QueryBuilder} Grouped feedback aggregate query by source_id
   */
  buildFeedbackAggregate(source: 'chat' | 'search' | 'agent', tenantId?: string): Knex.QueryBuilder {
    const feedbackAgg = this.knex('answer_feedback as af')
      .select('af.source_id')
      .select(
        this.knex.raw('COUNT(*) FILTER (WHERE af.thumbup = true)::int as positive_count'),
        this.knex.raw('COUNT(*) FILTER (WHERE af.thumbup = false)::int as negative_count')
      )
      .where('af.source', source)
      .groupBy('af.source_id')

    if (tenantId) {
      feedbackAgg.where('af.tenant_id', tenantId)
    }

    return feedbackAgg
  }

  /**
   * @description Apply feedback filter EXISTS/NOT EXISTS clause to a query builder.
   * @param {Knex.QueryBuilder} query - Knex query builder
   * @param {string} source - Feedback source type ('chat' | 'search' | 'agent')
   * @param {string} sourceIdColumn - The column expression for source_id matching
   * @param {FeedbackFilter} [feedbackFilter] - Optional feedback filter
   * @returns {Knex.QueryBuilder} Modified query builder
   */
  applyFeedbackFilter(query: Knex.QueryBuilder, source: string, sourceIdColumn: string, feedbackFilter?: FeedbackFilter): Knex.QueryBuilder {
    if (!feedbackFilter) return query

    switch (feedbackFilter) {
      case FeedbackFilterConst.POSITIVE:
        // Only sessions that have at least one positive feedback
        return query.whereExists(function (this: any) {
          this.select(db.raw('1')).from('answer_feedback')
            .whereRaw(`answer_feedback.source_id = ${sourceIdColumn}`)
            .where('answer_feedback.source', source)
            .where('answer_feedback.thumbup', true)
        })
      case FeedbackFilterConst.NEGATIVE:
        // Only sessions that have at least one negative feedback
        return query.whereExists(function (this: any) {
          this.select(db.raw('1')).from('answer_feedback')
            .whereRaw(`answer_feedback.source_id = ${sourceIdColumn}`)
            .where('answer_feedback.source', source)
            .where('answer_feedback.thumbup', false)
        })
      case FeedbackFilterConst.ANY:
        // Only sessions that have any feedback at all
        return query.whereExists(function (this: any) {
          this.select(db.raw('1')).from('answer_feedback')
            .whereRaw(`answer_feedback.source_id = ${sourceIdColumn}`)
            .where('answer_feedback.source', source)
        })
      case FeedbackFilterConst.NONE:
        // Only sessions with no feedback records
        return query.whereNotExists(function (this: any) {
          this.select(db.raw('1')).from('answer_feedback')
            .whereRaw(`answer_feedback.source_id = ${sourceIdColumn}`)
            .where('answer_feedback.source', source)
        })
      default:
        return query
    }
  }

  // ─── External chat history ───────────────────────────────────────────

  /**
   * @description Find paginated external chat sessions from history_chat_sessions with optional filters.
   * @param {ChatHistoryFilters} filters - Search, pagination, date range, email, and feedback filters
   * @returns {Promise<any[]>} Paginated array of external chat session base rows
   */
  async findExternalChatSessions(filters: ChatHistoryFilters): Promise<any[]> {
    const { page, limit, search, email, startDate, endDate, feedbackFilter } = filters
    const offset = (page - 1) * limit

    let query = this.knex('history_chat_sessions')
      .select(
        'history_chat_sessions.session_id',
        'history_chat_sessions.updated_at as created_at',
        'history_chat_sessions.user_email'
      )
      .orderBy('history_chat_sessions.updated_at', 'desc')
      .limit(limit)
      .offset(offset)

    // Apply full-text search filter across email and message content
    if (search) {
      // Strip special characters to prevent tsquery injection
      const cleanSearch = search.replace(/[^\w\s]/g, '').trim()
      const terms = cleanSearch.split(/\s+/).filter(t => t.length > 0)

      query = query.where(builder => {
        // Match sessions by user email (case-insensitive partial match)
        builder.where('history_chat_sessions.user_email', 'ilike', `%${search}%`)
          // Or match sessions containing relevant messages via full-text search
          .orWhereExists(function () {
            const sub = this.select('id').from('history_chat_messages')
              .whereRaw('history_chat_messages.session_id = history_chat_sessions.session_id')

            // Use multiple tsquery strategies for better recall
            if (terms.length > 0) {
              // Prefix query: all terms must appear (AND) with prefix matching
              const prefixQuery = terms.join(' & ') + ':*'
              // OR query: any term can match
              const orQuery = terms.join(' | ')
              sub.where(b => {
                b.whereRaw("search_vector @@ websearch_to_tsquery('english', ?)", [search])
                  .orWhereRaw("search_vector @@ to_tsquery('english', ?)", [prefixQuery])
                  .orWhereRaw("search_vector @@ to_tsquery('english', ?)", [orQuery])
              })
            } else {
              // Fall back to websearch_to_tsquery for single-term or empty search
              sub.whereRaw("search_vector @@ websearch_to_tsquery('english', ?)", [search])
            }
          })
      })
    }

    // Filter by user email (partial, case-insensitive)
    if (email) {
      query = query.where('history_chat_sessions.user_email', 'ilike', `%${email}%`)
    }

    // Filter sessions updated on or after the start date
    if (startDate) {
      query = query.where('history_chat_sessions.updated_at', '>=', startDate)
    }

    // Filter sessions updated on or before the end date (extended to end of day)
    if (endDate) {
      query = query.where('history_chat_sessions.updated_at', '<=', `${endDate} 23:59:59`)
    }

    // Apply feedback filter to external query
    query = this.applyFeedbackFilter(query, 'chat', 'history_chat_sessions.session_id', feedbackFilter)

    return await query
  }

  /**
   * @description Fetch enrichment data (first prompts, message counts, feedback) for external chat sessions.
   * @param {string[]} sessionIds - Array of session IDs to enrich
   * @param {string} [tenantId] - Optional tenant scope for feedback
   * @returns {Promise<{ firstPrompts: any[], messageCounts: any[], feedbackRows: any[] }>} Enrichment data maps
   */
  async findExternalChatEnrichmentData(sessionIds: string[], tenantId?: string): Promise<{ firstPrompts: any[], messageCounts: any[], feedbackRows: any[] }> {
    const [firstPrompts, messageCounts, feedbackRows] = await Promise.all([
      // Get first user prompt per session (ordered by created_at ascending)
      this.knex('history_chat_messages as hcm_first')
        .distinctOn('hcm_first.session_id')
        .select('hcm_first.session_id', 'hcm_first.user_prompt')
        .whereIn('hcm_first.session_id', sessionIds)
        .orderBy('hcm_first.session_id')
        .orderBy('hcm_first.created_at', 'asc'),
      // Count messages per session
      this.knex('history_chat_messages as hcm_count')
        .select('hcm_count.session_id')
        .count('* as message_count')
        .whereIn('hcm_count.session_id', sessionIds)
        .groupBy('hcm_count.session_id'),
      // Aggregate feedback counts per session
      this.buildFeedbackAggregate('chat', tenantId).whereIn('af.source_id', sessionIds),
    ])

    return { firstPrompts, messageCounts, feedbackRows }
  }

  // ─── Internal chat history ───────────────────────────────────────────

  /**
   * @description Find paginated internal chat sessions from chat_sessions with user join and optional filters.
   * @param {ChatHistoryFilters} filters - Search, pagination, date range, email, and feedback filters
   * @returns {Promise<any[]>} Paginated array of internal chat session base rows
   */
  async findInternalChatSessions(filters: ChatHistoryFilters): Promise<any[]> {
    const { page, limit, search, email, startDate, endDate, feedbackFilter } = filters
    const offset = (page - 1) * limit

    let query = this.knex('chat_sessions')
      .leftJoin('users', 'chat_sessions.user_id', 'users.id')
      .select(
        'chat_sessions.id as session_id',
        'chat_sessions.created_at',
        'users.email as user_email',
        'chat_sessions.title'
      )
      .orderBy('chat_sessions.created_at', 'desc')
      .limit(limit)
      .offset(offset)

    // Apply search filter
    if (search) {
      query = query.where(builder => {
        builder.where('chat_sessions.title', 'ilike', `%${search}%`)
          .orWhere('users.email', 'ilike', `%${search}%`)
          .orWhereExists(function () {
            this.select('id').from('chat_messages')
              .whereRaw('chat_messages.session_id = chat_sessions.id')
              .where('content', 'ilike', `%${search}%`)
          })
      })
    }

    // Filter by user email
    if (email) {
      query = query.where('users.email', 'ilike', `%${email}%`)
    }

    // Date range filters
    if (startDate) {
      query = query.where('chat_sessions.created_at', '>=', startDate)
    }
    if (endDate) {
      query = query.where('chat_sessions.created_at', '<=', `${endDate} 23:59:59`)
    }

    // Apply feedback filter to internal query
    query = this.applyFeedbackFilter(query, 'chat', 'chat_sessions.id::text', feedbackFilter)

    return await query
  }

  /**
   * @description Fetch enrichment data (first prompts, message counts, feedback) for internal chat sessions.
   * @param {string[]} sessionIds - Array of session IDs to enrich
   * @param {string} [tenantId] - Optional tenant scope for feedback
   * @returns {Promise<{ firstPrompts: any[], messageCounts: any[], feedbackRows: any[] }>} Enrichment data maps
   */
  async findInternalChatEnrichmentData(sessionIds: string[], tenantId?: string): Promise<{ firstPrompts: any[], messageCounts: any[], feedbackRows: any[] }> {
    const [firstPrompts, messageCounts, feedbackRows] = await Promise.all([
      // Get first user prompt per session (ordered by timestamp ascending)
      this.knex('chat_messages as cm_first')
        .distinctOn('cm_first.session_id')
        .select('cm_first.session_id', 'cm_first.content as user_prompt')
        .where('cm_first.role', MessageRole.USER)
        .whereIn('cm_first.session_id', sessionIds)
        .orderBy('cm_first.session_id')
        .orderBy('cm_first.timestamp', 'asc'),
      // Count messages per session
      this.knex('chat_messages as cm_count')
        .select('cm_count.session_id')
        .count('* as message_count')
        .whereIn('cm_count.session_id', sessionIds)
        .groupBy('cm_count.session_id'),
      // Aggregate feedback counts per session
      this.buildFeedbackAggregate('chat', tenantId).whereIn('af.source_id', sessionIds),
    ])

    return { firstPrompts, messageCounts, feedbackRows }
  }

  // ─── Chat session details ───────────────────────────────────────────

  /**
   * @description Find all external chat messages for a given session ordered chronologically.
   * @param {string} sessionId - The unique session identifier
   * @returns {Promise<any[]>} Array of history_chat_messages rows
   */
  async findExternalChatMessages(sessionId: string): Promise<any[]> {
    return this.knex('history_chat_messages')
      .select('*')
      .where('session_id', sessionId)
      .orderBy('created_at', 'asc')
  }

  /**
   * @description Find feedback records for a specific source and session, optionally scoped by tenant.
   * @param {'chat' | 'search' | 'agent'} source - Feedback source type
   * @param {string} sessionId - The session/source ID to match
   * @param {string} [tenantId] - Optional tenant ID for scoping
   * @returns {Promise<any[]>} Array of feedback records with message_id, thumbup, comment
   */
  async findFeedbackBySourceAndSession(source: 'chat' | 'search' | 'agent', sessionId: string, tenantId?: string): Promise<any[]> {
    let query = this.knex('answer_feedback')
      .where('source', source)
      .where('source_id', sessionId)
      .select('message_id', 'thumbup', 'comment')
    if (tenantId) {
      query = query.where('tenant_id', tenantId)
    }
    return query
  }

  /**
   * @description Find all internal chat messages for a given session ordered by timestamp.
   * @param {string} sessionId - The unique session identifier
   * @returns {Promise<any[]>} Array of chat_messages rows
   */
  async findInternalChatMessages(sessionId: string): Promise<any[]> {
    return this.knex('chat_messages')
      .where('session_id', sessionId)
      .orderBy('timestamp', 'asc')
  }

  // ─── Search history ─────────────────────────────────────────────────

  /**
   * @description Find paginated search sessions from history_search_sessions with optional filters.
   * @param {HistoryFilters} filters - Search, pagination, date range, email, and feedback filters
   * @returns {Promise<any[]>} Paginated array of search session base rows
   */
  async findSearchSessions(filters: HistoryFilters): Promise<any[]> {
    const { page, limit, search, email, startDate, endDate, feedbackFilter } = filters
    const offset = (page - 1) * limit

    let query = this.knex('history_search_sessions')
      .select(
        'history_search_sessions.session_id',
        'history_search_sessions.updated_at as created_at',
        'history_search_sessions.user_email',
      )
      .orderBy('history_search_sessions.updated_at', 'desc')
      .limit(limit)
      .offset(offset)

    // Apply full-text search filter across email and search record content
    if (search) {
      // Strip special characters to prevent tsquery injection
      const cleanSearch = search.replace(/[^\w\s]/g, '').trim()
      const terms = cleanSearch.split(/\s+/).filter(t => t.length > 0)

      query = query.where(builder => {
        // Match sessions by user email (case-insensitive partial match)
        builder.where('history_search_sessions.user_email', 'ilike', `%${search}%`)
          // Or match sessions with relevant search records via full-text search
          .orWhereExists(function () {
            const sub = this.select('id').from('history_search_records')
              .whereRaw('history_search_records.session_id = history_search_sessions.session_id')

            // Use multiple tsquery strategies for better recall
            if (terms.length > 0) {
              const prefixQuery = terms.join(' & ') + ':*'
              const orQuery = terms.join(' | ')
              sub.where(b => {
                b.whereRaw("search_vector @@ websearch_to_tsquery('english', ?)", [search])
                  .orWhereRaw("search_vector @@ to_tsquery('english', ?)", [prefixQuery])
                  .orWhereRaw("search_vector @@ to_tsquery('english', ?)", [orQuery])
              })
            } else {
              // Fall back to websearch_to_tsquery for single-term or empty search
              sub.whereRaw("search_vector @@ websearch_to_tsquery('english', ?)", [search])
            }
          })
      })
    }

    // Filter by user email (partial, case-insensitive)
    if (email) {
      query = query.where('history_search_sessions.user_email', 'ilike', `%${email}%`)
    }

    // Filter sessions updated on or after the start date
    if (startDate) {
      query = query.where('history_search_sessions.updated_at', '>=', startDate)
    }

    // Filter sessions updated on or before the end date (extended to end of day)
    if (endDate) {
      query = query.where('history_search_sessions.updated_at', '<=', `${endDate} 23:59:59`)
    }

    // Apply feedback filter before pagination
    query = this.applyFeedbackFilter(query, 'search', 'history_search_sessions.session_id', feedbackFilter)

    return await query
  }

  /**
   * @description Fetch enrichment data (first search inputs, record counts, feedback) for search sessions.
   * @param {string[]} sessionIds - Array of session IDs to enrich
   * @param {string} [tenantId] - Optional tenant scope for feedback
   * @returns {Promise<{ firstInputs: any[], messageCounts: any[], feedbackRows: any[] }>} Enrichment data
   */
  async findSearchEnrichmentData(sessionIds: string[], tenantId?: string): Promise<{ firstInputs: any[], messageCounts: any[], feedbackRows: any[] }> {
    const [firstInputs, messageCounts, feedbackRows] = await Promise.all([
      // Get first search input per session (ordered by created_at ascending)
      this.knex('history_search_records as hsr_first')
        .distinctOn('hsr_first.session_id')
        .select('hsr_first.session_id', 'hsr_first.search_input')
        .whereIn('hsr_first.session_id', sessionIds)
        .orderBy('hsr_first.session_id')
        .orderBy('hsr_first.created_at', 'asc'),
      // Count records per session
      this.knex('history_search_records as hsr_count')
        .select('hsr_count.session_id')
        .count('* as message_count')
        .whereIn('hsr_count.session_id', sessionIds)
        .groupBy('hsr_count.session_id'),
      // Aggregate feedback counts per session
      this.buildFeedbackAggregate('search', tenantId).whereIn('af.source_id', sessionIds),
    ])

    return { firstInputs, messageCounts, feedbackRows }
  }

  // ─── Search session details ─────────────────────────────────────────

  /**
   * @description Find all search records for a given session ordered chronologically.
   * @param {string} sessionId - The unique session identifier
   * @returns {Promise<any[]>} Array of history_search_records rows
   */
  async findSearchRecords(sessionId: string): Promise<any[]> {
    return this.knex('history_search_records')
      .select('*')
      .where('session_id', sessionId)
      .orderBy('created_at', 'asc')
  }

  // ─── Agent run history ──────────────────────────────────────────────

  /**
   * @description Find paginated agent runs with joins to agents and users tables.
   * @param {HistoryFilters} filters - Search, pagination, date range, email, and feedback filters
   * @returns {Promise<any[]>} Paginated array of agent run rows with agent name and user email
   */
  async findAgentRuns(filters: HistoryFilters): Promise<any[]> {
    const { page, limit, search, email, startDate, endDate, feedbackFilter, tenantId } = filters
    const offset = (page - 1) * limit

    let query = this.knex('agent_runs')
      .leftJoin('agents', 'agent_runs.agent_id', 'agents.id')
      .leftJoin('users', 'agent_runs.triggered_by', 'users.id')
      .select(
        'agent_runs.id as run_id',
        'agents.title as agent_name',
        'agent_runs.agent_id',
        'agent_runs.status',
        'agent_runs.input',
        'agent_runs.output',
        'agent_runs.started_at',
        'agent_runs.completed_at',
        'agent_runs.duration_ms',
        'users.email as user_email',
      )
      .orderBy('agent_runs.created_at', 'desc')
      .limit(limit)
      .offset(offset)

    // Scope agent runs to the current tenant via the agents table
    if (tenantId) {
      query = query.where('agents.tenant_id', tenantId)
    }

    // Filter by agent name or input text
    if (search) {
      query = query.where(builder => {
        builder.where('agents.title', 'ilike', `%${search}%`)
          .orWhere('agent_runs.input', 'ilike', `%${search}%`)
      })
    }

    // Filter by triggering user email
    if (email) {
      query = query.where('users.email', 'ilike', `%${email}%`)
    }

    // Date range filters on run start time
    if (startDate) {
      query = query.where('agent_runs.started_at', '>=', startDate)
    }
    if (endDate) {
      query = query.where('agent_runs.started_at', '<=', `${endDate} 23:59:59`)
    }

    // Apply feedback filter before pagination
    query = this.applyFeedbackFilter(query, 'agent', 'agent_runs.id::text', feedbackFilter)

    return await query
  }

  /**
   * @description Fetch aggregated feedback counts for a set of agent run IDs.
   * @param {string[]} runIds - Array of agent run IDs
   * @param {string} [tenantId] - Optional tenant scope for feedback
   * @returns {Promise<any[]>} Array of feedback aggregate rows with source_id, positive_count, negative_count
   */
  async findAgentRunFeedback(runIds: string[], tenantId?: string): Promise<any[]> {
    return this.buildFeedbackAggregate('agent', tenantId)
      .whereIn('af.source_id', runIds)
  }

  // ─── Agent run details ──────────────────────────────────────────────

  /**
   * @description Find a single agent run with agent name and user email, optionally scoped by tenant.
   * @param {string} runId - UUID of the agent run
   * @param {string} [tenantId] - Optional tenant ID for scoping via agents table
   * @returns {Promise<any | undefined>} The agent run record or undefined if not found
   */
  async findAgentRunWithDetails(runId: string, tenantId?: string): Promise<any | undefined> {
    let query = this.knex('agent_runs')
      .leftJoin('agents', 'agent_runs.agent_id', 'agents.id')
      .leftJoin('users', 'agent_runs.triggered_by', 'users.id')
      .select(
        'agent_runs.*',
        'agents.title as agent_name',
        'users.email as user_email'
      )
      .where('agent_runs.id', runId)
    // Scope to tenant via the agents table
    if (tenantId) {
      query = query.where('agents.tenant_id', tenantId)
    }
    return query.first()
  }

  /**
   * @description Find all steps for a given agent run ordered by execution sequence.
   * @param {string} runId - UUID of the agent run
   * @returns {Promise<any[]>} Array of agent_run_steps rows
   */
  async findAgentRunSteps(runId: string): Promise<any[]> {
    return this.knex('agent_run_steps')
      .where('run_id', runId)
      .orderBy('started_at', 'asc')
  }

  /**
   * @description Find feedback records for a specific agent run, ordered by creation date descending.
   * @param {string} runId - UUID of the agent run
   * @param {string} [tenantId] - Optional tenant ID for scoping
   * @returns {Promise<any[]>} Array of feedback records
   */
  async findAgentRunDetailFeedback(runId: string, tenantId?: string): Promise<any[]> {
    let query = this.knex('answer_feedback')
      .where('source', 'agent')
      .where('source_id', runId)
      .orderBy('created_at', 'desc')
    if (tenantId) {
      query = query.where('tenant_id', tenantId)
    }
    return query
  }

  // ─── System chat ────────────────────────────────────────────────────

  /**
   * @description Find paginated system chat sessions with user details and aggregated messages as JSON.
   * Uses a raw subquery to aggregate chat_messages into a JSON array per session.
   * @param {number} page - Page number (1-based)
   * @param {number} limit - Maximum items per page
   * @param {string} search - Search query to filter by title, email, display name, or message content
   * @returns {Promise<any[]>} Array of system chat session records with embedded messages
   */
  async findSystemChatSessionsWithMessages(page: number, limit: number, search: string): Promise<any[]> {
    // Build base query joining chat_sessions with users
    let query = this.knex
      .from('chat_sessions')
      .leftJoin('users', 'chat_sessions.user_id', 'users.id')
      .select(
        'chat_sessions.*',
        'users.email as user_email',
        'users.display_name as user_name',
        // Subquery to aggregate chat messages as JSON array
        this.knex.raw(`
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
      .offset((page - 1) * limit)

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
              .andWhere('content', 'ilike', `%${search}%`)
          })
      })
    }

    // Execute query and return results
    return await query
  }
}
