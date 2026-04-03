
/**
 * @fileoverview OpenAI-compatible search completion controller.
 *
 * Provides a POST /api/v1/search/completions endpoint that accepts OpenAI-format
 * requests and returns search results with AI summary in OpenAI response format.
 * Auth is via Bearer token from the search_embed_tokens table.
 *
 * @module controllers/search-openai
 */

import { Request, Response } from 'express'
import { log } from '@/shared/services/logger.service.js'
import { getUuid } from '@/shared/utils/uuid.js'
import { searchEmbedTokenService } from '@/shared/services/embed-token.service.js'
import { searchService } from '../services/search.service.js'
import {
  buildOaiCompletion,
  buildOaiStreamChunk,
  extractLastUserMessage,
} from '@/shared/services/openai-format.service.js'
import { ComparisonLiteral } from '@/shared/constants/index.js'

/** Default model identifier returned by the search API. */
const MODEL_ID = 'b-knowledge-search'

/**
 * Controller for OpenAI-compatible search endpoints.
 * @description Validates Bearer token against search_embed_tokens,
 *   extracts the user query from the OpenAI messages array, and delegates
 *   to the search service's askSearch pipeline.
 */
export class SearchOpenaiController {
  /**
   * POST /api/v1/search/completions — OpenAI-compatible search completion.
   * @param req - Express request with OpenAI-format body (messages, stream, model)
   * @param res - Express response (JSON or SSE)
   * @description Extracts Bearer token, validates via search embed tokens,
   *   runs the search pipeline, and returns results in OpenAI format.
   */
  async completion(req: Request, res: Response): Promise<void> {
    try {
      // ── Auth: Extract and validate Bearer token ────────────────────────
      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          error: { message: 'Missing API key', type: 'invalid_request_error', code: 'invalid_api_key' },
        })
        return
      }

      const apiKey = authHeader.slice(7)
      const tokenRecord = await searchEmbedTokenService.validateToken(apiKey)
      if (!tokenRecord) {
        res.status(401).json({
          error: { message: 'Invalid API key', type: 'authentication_error', code: 'invalid_api_key' },
        })
        return
      }

      // The search embed token row has app_id
      const appId = tokenRecord.app_id as string

      // ── Extract user message ───────────────────────────────────────────
      const { messages, stream = false, model } = req.body
      const userMessage = extractLastUserMessage(messages)
      if (!userMessage) {
        res.status(400).json({
          error: { message: 'No user message found in messages array', type: 'invalid_request_error' },
        })
        return
      }

      const resolvedModel = model || MODEL_ID
      const completionId = `chatcmpl-${getUuid()}`

      if (stream) {
        // ── Streaming mode: SSE with OpenAI chunk format ─────────────────
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')
        res.flushHeaders()

        // Create a mock response that intercepts search SSE and converts to OpenAI format
        let fullAnswer = ''
        const mockRes = createSearchStreamInterceptor(res, completionId, resolvedModel, (delta) => {
          fullAnswer += delta
        })

        // TODO(ACCS): Resolve tenant from embed token for full multi-tenant isolation
        await searchService.askSearch('', appId, { query: userMessage }, mockRes as any)
      } else {
        // ── Non-streaming mode: buffer the answer and return JSON ─────────
        let fullAnswer = ''
        const bufferRes = createSearchBufferInterceptor((delta) => {
          fullAnswer += delta
        })

        // TODO(ACCS): Resolve tenant from embed token for full multi-tenant isolation
        await searchService.askSearch('', appId, { query: userMessage }, bufferRes as any)

        // Return the complete response in OpenAI format
        const response = buildOaiCompletion(fullAnswer, resolvedModel)
        res.json(response)
      }
    } catch (error) {
      log.error('Error in OpenAI search completion', { error: (error as Error).message })
      if (!res.headersSent) {
        res.status(500).json({
          error: { message: 'Internal server error', type: 'server_error' },
        })
      }
    }
  }
}

/**
 * Create a mock Express response that intercepts search SSE writes and
 * re-formats them as OpenAI streaming chunks.
 * @param realRes - The actual Express response to write to
 * @param completionId - Shared completion ID for all chunks
 * @param model - Model identifier
 * @param onDelta - Callback invoked with each content delta
 * @returns A mock response object compatible with searchService.askSearch
 */
function createSearchStreamInterceptor(
  realRes: Response,
  completionId: string,
  model: string,
  onDelta: (delta: string) => void
) {
  return {
    headersSent: true,
    setHeader: () => {},
    flushHeaders: () => {},
    write: (data: string) => {
      if (typeof data !== 'string') return true
      if (!data.startsWith('data: ')) return true

      const payload = data.slice(6).trim()
      if (payload === ComparisonLiteral.STREAM_DONE) {
        realRes.write(buildOaiStreamChunk(completionId, '', model, true))
        return true
      }

      try {
        const parsed = JSON.parse(payload)

        // Forward content deltas as OpenAI stream chunks
        if (parsed.delta) {
          onDelta(parsed.delta)
          realRes.write(buildOaiStreamChunk(completionId, parsed.delta, model, false))
        }
        // Skip status, reference, and final answer events
      } catch {
        // Ignore parse errors
      }

      return true
    },
    end: () => {
      realRes.end()
    },
  }
}

/**
 * Create a buffer interceptor for non-streaming mode.
 * Collects content deltas without writing to any response.
 * @param onDelta - Callback invoked with each content delta
 * @returns A mock response object compatible with searchService.askSearch
 */
function createSearchBufferInterceptor(onDelta: (delta: string) => void) {
  return {
    headersSent: true,
    setHeader: () => {},
    flushHeaders: () => {},
    write: (data: string) => {
      if (typeof data !== 'string') return true
      if (!data.startsWith('data: ')) return true

      const payload = data.slice(6).trim()
      if (payload === ComparisonLiteral.STREAM_DONE) return true

      try {
        const parsed = JSON.parse(payload)
        if (parsed.delta) {
          onDelta(parsed.delta)
        }
      } catch {
        // Ignore parse errors
      }
      return true
    },
    end: () => {},
  }
}

/** Singleton instance of the search OpenAI controller. */
export const searchOpenaiController = new SearchOpenaiController()
