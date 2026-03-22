/**
 * @fileoverview Controller for external evaluation API endpoints.
 *   All endpoints require API key authentication via Bearer token.
 *   Returns structured JSON responses compatible with promptfoo evaluation.
 * @module controllers/external-api
 */

import { Request, Response } from 'express'
import { externalApiService } from '../services/external-api.service.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * @description Controller handling external evaluation API requests.
 *   Provides chat, search, and retrieval-only endpoints returning
 *   structured responses with answer, contexts, sources, and metadata.
 */
export class ExternalApiController {
  /**
   * @description POST /api/v1/external/chat — Full RAG chat with structured response.
   *   Retrieves context from knowledge bases, generates an answer via LLM,
   *   and returns everything in a promptfoo-compatible format.
   * @param {Request} req - Express request with validated body and API key
   * @param {Response} res - Express response with EvalChatResponse JSON
   * @returns {Promise<void>}
   */
  async chat(req: Request, res: Response): Promise<void> {
    try {
      const { query, assistant_id, dataset_ids, options } = req.body
      const userId = req.apiKey!.user_id

      const result = await externalApiService.chat(
        query,
        { assistant_id, dataset_ids, options },
        userId
      )

      res.json(result)
    } catch (error) {
      const message = (error as Error).message
      log.error('External chat API error', { error: message })

      // Return user-friendly errors for known cases
      if (message.includes('not found') || message.includes('No datasets')) {
        res.status(400).json({
          error: { message, type: 'invalid_request_error' },
        })
        return
      }

      res.status(500).json({
        error: { message: 'Internal server error', type: 'server_error' },
      })
    }
  }

  /**
   * @description POST /api/v1/external/search — Search with AI summary and structured response.
   *   Uses a search app or direct dataset IDs for retrieval, generates a summary,
   *   and returns the full evaluation response.
   * @param {Request} req - Express request with validated body and API key
   * @param {Response} res - Express response with EvalChatResponse JSON
   * @returns {Promise<void>}
   */
  async search(req: Request, res: Response): Promise<void> {
    try {
      const { query, search_app_id, dataset_ids, options } = req.body
      const userId = req.apiKey!.user_id

      const result = await externalApiService.search(
        query,
        { search_app_id, dataset_ids, options },
        userId
      )

      res.json(result)
    } catch (error) {
      const message = (error as Error).message
      log.error('External search API error', { error: message })

      if (message.includes('not found') || message.includes('No datasets')) {
        res.status(400).json({
          error: { message, type: 'invalid_request_error' },
        })
        return
      }

      res.status(500).json({
        error: { message: 'Internal server error', type: 'server_error' },
      })
    }
  }

  /**
   * @description POST /api/v1/external/retrieval — Retrieval-only (no LLM generation).
   *   Returns raw retrieved chunks and sources without generating an answer.
   *   Useful for evaluating retrieval quality independently.
   * @param {Request} req - Express request with validated body and API key
   * @param {Response} res - Express response with EvalRetrievalResponse JSON
   * @returns {Promise<void>}
   */
  async retrieval(req: Request, res: Response): Promise<void> {
    try {
      const { query, dataset_ids, options } = req.body
      const result = await externalApiService.retrieval(query, dataset_ids, options)
      res.json(result)
    } catch (error) {
      const message = (error as Error).message
      log.error('External retrieval API error', { error: message })
      res.status(500).json({
        error: { message: 'Internal server error', type: 'server_error' },
      })
    }
  }
}

/** Singleton instance */
export const externalApiController = new ExternalApiController()
