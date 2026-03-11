/**
 * @fileoverview Trace history controller for chat and search history collection.
 *
 * Handles incoming requests from external clients to persist
 * chat and search history records.
 *
 * @module modules/trace/controllers/trace-history
 */
import { Request, Response } from 'express'
import { traceHistoryService } from '@/modules/trace/services/trace-history.service.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * Controller for external history collection endpoints.
 * @description Receives and validates chat/search history from external clients.
 */
export class TraceHistoryController {
  /**
   * Collects chat history from external clients.
   * @param req - Express request object.
   * @param res - Express response object.
   * @returns Promise<void>
   * @description Validates required fields and saves chat history via service.
   */
  async collectChatHistory(req: Request, res: Response): Promise<void> {
    try {
      // Debug log incoming request
      log.debug('Trace Chat History Request', { body: req.body })
      const { session_id, share_id, user_email, user_prompt, llm_response, citations } = req.body

      // Validate required fields
      if (!session_id || !user_prompt || !llm_response) {
        log.warn('Trace Chat History Missing Fields', { body: req.body })
        res.status(400).json({ error: 'Missing required fields' })
        return
      }

      // Save chat history via service
      await traceHistoryService.saveChatHistory({
        session_id,
        share_id,
        user_email,
        user_prompt,
        llm_response,
        citations: citations || [],
      })

      log.debug('Trace Chat History Success', { session_id })
      res.status(201).json({ message: 'Chat history saved successfully' })
    } catch (error) {
      // Log error and return 500 status
      log.error('Error collecting chat history', error as Record<string, unknown>)
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Collects search history from external clients.
   * @param req - Express request object.
   * @param res - Express response object.
   * @returns Promise<void>
   * @description Validates required fields and saves search history via service.
   */
  async collectSearchHistory(req: Request, res: Response): Promise<void> {
    try {
      // Debug log incoming request
      log.debug('Trace Search History Request', { body: req.body })
      const { session_id, share_id, search_input, user_email, ai_summary, file_results } = req.body

      // Validate required fields
      if (!search_input) {
        log.warn('Trace Search History Missing Fields', { body: req.body })
        res.status(400).json({ error: 'Missing required fields' })
        return
      }

      // Save search history via service
      await traceHistoryService.saveSearchHistory({
        session_id,
        share_id,
        search_input,
        user_email,
        ai_summary: ai_summary || '',
        file_results: file_results || [],
      })

      log.debug('Trace Search History Success', { search_input })
      res.status(201).json({ message: 'Search history saved successfully' })
    } catch (error) {
      // Log error and return 500 status
      log.error('Error collecting search history', error as Record<string, unknown>)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
