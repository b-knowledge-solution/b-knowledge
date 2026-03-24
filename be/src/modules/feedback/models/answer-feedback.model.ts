/**
 * @fileoverview Answer feedback model for the answer_feedback table.
 * @description Provides CRUD operations and custom queries for feedback
 *   on chat and search answers.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { AnswerFeedback } from '@/shared/models/types.js'

/**
 * @description AnswerFeedbackModel extends BaseModel to provide feedback-specific queries.
 * Maps to the 'answer_feedback' table created by the 20260318000000 migration.
 */
export class AnswerFeedbackModel extends BaseModel<AnswerFeedback> {
  /** Table name in the database */
  protected tableName = 'answer_feedback'
  /** Knex connection instance */
  protected knex = db

  /**
   * @description Find all feedback records for a given source type and source ID.
   * @param {('chat' | 'search')} source - The feedback source type
   * @param {string} sourceId - The conversation_id (chat) or search_app_id (search)
   * @returns {Promise<AnswerFeedback[]>} Array of matching feedback records, newest first
   */
  async findBySource(source: 'chat' | 'search', sourceId: string): Promise<AnswerFeedback[]> {
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
}
