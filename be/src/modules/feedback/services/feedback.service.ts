/**
 * @fileoverview Feedback service for answer feedback CRUD and analytics operations.
 * @description Provides methods to create, query, list, aggregate, and export feedback records
 *   stored in the answer_feedback table.
 * @module services/feedback
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { AnswerFeedback, CreateAnswerFeedback } from '@/shared/models/types.js'
import { log } from '@/shared/services/logger.service.js'
import type {
  FeedbackPaginationFilters,
  PaginatedFeedbackResult,
  SourceBreakdown,
  TopFlaggedSession,
} from '../models/answer-feedback.model.js'

/**
 * @description Shape of feedback statistics returned by getStats.
 */
export interface FeedbackStats {
  /** Feedback count breakdown by source type */
  sourceBreakdown: SourceBreakdown
  /** Sessions with the most negative feedback */
  topFlagged: TopFlaggedSession[]
}

/**
 * @description Filter options for exporting feedback records (no pagination).
 */
export interface ExportFeedbackFilters {
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
}

/**
 * @description FeedbackService class encapsulating feedback business logic.
 * Uses ModelFactory.answerFeedback for data access.
 */
class FeedbackService {
  /**
   * @description Create a new feedback record in the answer_feedback table.
   * @param {CreateAnswerFeedback} data - Feedback data including source, query, answer, and thumbup
   * @returns {Promise<AnswerFeedback>} The created feedback record
   */
  async createFeedback(data: CreateAnswerFeedback): Promise<AnswerFeedback> {
    log.info('Creating answer feedback', { source: data.source, source_id: data.source_id, thumbup: data.thumbup })
    return ModelFactory.answerFeedback.create(data)
  }

  /**
   * @description Get all feedback records for a given source type and source ID.
   * @param {('chat' | 'search' | 'agent')} source - The feedback source type
   * @param {string} sourceId - The conversation_id (chat), search_app_id (search), or agent_run_id (agent)
   * @returns {Promise<AnswerFeedback[]>} Array of feedback records, newest first
   */
  async getFeedbackBySource(source: 'chat' | 'search' | 'agent', sourceId: string): Promise<AnswerFeedback[]> {
    return ModelFactory.answerFeedback.findBySource(source, sourceId)
  }

  /**
   * @description List feedback records with filters and pagination for admin listing.
   * Delegates to AnswerFeedbackModel.findPaginated for query execution.
   * @param {FeedbackPaginationFilters} filters - Filter and pagination options
   * @returns {Promise<PaginatedFeedbackResult>} Paginated feedback records with total count
   */
  async listFeedback(filters: FeedbackPaginationFilters): Promise<PaginatedFeedbackResult> {
    log.info('Listing feedback', {
      source: filters.source,
      thumbup: filters.thumbup,
      page: filters.page,
      limit: filters.limit,
    })
    return ModelFactory.answerFeedback.findPaginated(filters)
  }

  /**
   * @description Get aggregated feedback statistics for admin analytics.
   * Returns source breakdown counts and top flagged sessions.
   * @param {string} tenantId - Tenant ID for isolation
   * @param {string} [startDate] - Optional ISO date string for range start
   * @param {string} [endDate] - Optional ISO date string for range end
   * @returns {Promise<FeedbackStats>} Source breakdown and top flagged sessions
   */
  async getStats(tenantId: string, startDate?: string, endDate?: string): Promise<FeedbackStats> {
    // Run both aggregate queries in parallel for performance
    const [sourceBreakdown, topFlagged] = await Promise.all([
      ModelFactory.answerFeedback.countBySource(tenantId, startDate, endDate),
      ModelFactory.answerFeedback.getTopFlaggedSessions(tenantId, 10, startDate, endDate),
    ])

    return { sourceBreakdown, topFlagged }
  }

  /**
   * @description Export all feedback records matching filters (no pagination, max 10000).
   * Joins with users table to include user_email in exported data.
   * Returns enriched records for CSV conversion on the frontend.
   * @param {ExportFeedbackFilters} filters - Filter options for export
   * @returns {Promise<any[]>} Array of matching feedback records with user_email
   */
  async exportFeedback(filters: ExportFeedbackFilters): Promise<any[]> {
    // Delegate export query with user email join to the model layer
    const data = await ModelFactory.answerFeedback.findForExport({
      tenantId: filters.tenantId,
      ...(filters.source ? { source: filters.source } : {}),
      ...(filters.thumbup !== undefined ? { thumbup: filters.thumbup } : {}),
      ...(filters.startDate ? { startDate: filters.startDate } : {}),
      ...(filters.endDate ? { endDate: filters.endDate } : {}),
    })

    log.info('Exporting feedback', { count: data.length, tenantId: filters.tenantId })
    return data
  }
}

/** @description Singleton instance of FeedbackService */
export const feedbackService = new FeedbackService()
