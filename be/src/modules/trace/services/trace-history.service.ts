/**
 * @fileoverview Trace history service for persisting chat and search history.
 *
 * Handles saving chat and search history records from external clients
 * using database transactions for data integrity.
 *
 * @module modules/trace/services/trace-history
 */
import { db } from '@/shared/db/knex.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'

/** Chat history data from external clients */
interface ChatHistoryData {
  /** External session identifier */
  session_id: string
  /** Share ID linking to knowledge base source */
  share_id?: string
  /** User email */
  user_email?: string
  /** User prompt text */
  user_prompt: string
  /** LLM response text */
  llm_response: string
  /** Citation references */
  citations: any[]
}

/** Search history data from external clients */
interface SearchHistoryData {
  /** External session identifier */
  session_id?: string
  /** Share ID linking to knowledge base source */
  share_id?: string
  /** User email */
  user_email?: string
  /** Search query text */
  search_input: string
  /** AI-generated summary */
  ai_summary: string
  /** Array of file results */
  file_results: any[]
}

/**
 * Service for persisting external chat and search history.
 * @description Uses transactions to ensure atomic writes of session + message/record pairs.
 */
export class TraceHistoryService {
  /**
   * Save chat history from external clients using a database transaction.
   * @param data - The chat history data object.
   * @returns Promise<void>
   * @description Upserts the session and creates a message record atomically.
   */
  async saveChatHistory(data: ChatHistoryData): Promise<void> {
    // Start a database transaction
    return db.transaction(async (trx) => {
      log.debug(`Starting transaction for chat history session ${data.session_id}`)
      try {
        // Upsert session record
        const sessionData = {
          session_id: data.session_id,
          share_id: data.share_id || null,
          user_email: data.user_email || '',
        }

        await ModelFactory.historyChatSession.getKnex()
          .transacting(trx)
          .insert(sessionData)
          .onConflict('session_id')
          .merge(['updated_at', 'user_email'])

        // Create chat message record within transaction
        await ModelFactory.historyChatMessage.create({
          session_id: data.session_id,
          user_prompt: data.user_prompt,
          llm_response: data.llm_response,
          citations: JSON.stringify(data.citations) as any,
        } as any, trx as any)

        log.debug(`Successfully saved chat history for session ${data.session_id}`)
      } catch (error) {
        // Log and rethrow error to trigger rollback
        log.error(`Failed to save chat history for session ${data.session_id}`, error as Record<string, unknown>)
        throw error
      }
    })
  }

  /**
   * Save search history from external clients using a database transaction.
   * @param data - The search history data object.
   * @returns Promise<void>
   * @description Upserts the session and creates a search record atomically.
   */
  async saveSearchHistory(data: SearchHistoryData): Promise<void> {
    // Start a database transaction
    return db.transaction(async (trx) => {
      log.debug('Starting transaction for search history')
      try {
        // Upsert session record
        const sessionData = {
          session_id: data.session_id || `search-${Date.now()}`,
          share_id: data.share_id || null,
          user_email: data.user_email || '',
        }

        await ModelFactory.historySearchSession.getKnex()
          .transacting(trx)
          .insert(sessionData)
          .onConflict('session_id')
          .merge(['updated_at', 'user_email'])

        // Create search record within transaction
        await ModelFactory.historySearchRecord.create({
          session_id: sessionData.session_id,
          search_input: data.search_input,
          ai_summary: data.ai_summary,
          file_results: JSON.stringify(data.file_results) as any,
        } as any, trx as any)

        log.debug('Successfully saved search history')
      } catch (error) {
        // Log and rethrow error to trigger rollback
        log.error('Failed to save search history', error as Record<string, unknown>)
        throw error
      }
    })
  }
}

/** Singleton instance of the trace history service */
export const traceHistoryService = new TraceHistoryService()
