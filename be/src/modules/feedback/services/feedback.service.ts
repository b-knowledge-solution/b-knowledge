/**
 * @fileoverview Feedback service for answer feedback CRUD operations.
 * @description Provides methods to create and query feedback records
 *   stored in the answer_feedback table.
 * @module services/feedback
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { AnswerFeedback, CreateAnswerFeedback } from '@/shared/models/types.js'
import { log } from '@/shared/services/logger.service.js'

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
   * @param {('chat' | 'search')} source - The feedback source type
   * @param {string} sourceId - The conversation_id (chat) or search_app_id (search)
   * @returns {Promise<AnswerFeedback[]>} Array of feedback records, newest first
   */
  async getFeedbackBySource(source: 'chat' | 'search', sourceId: string): Promise<AnswerFeedback[]> {
    return ModelFactory.answerFeedback.findBySource(source, sourceId)
  }
}

/** @description Singleton instance of FeedbackService */
export const feedbackService = new FeedbackService()
