
/**
 * @fileoverview OpenAI-compatible chat completion controller.
 *
 * Provides endpoints that match the OpenAI API format so external tools
 * (RAGAS, LangChain, Cursor, etc.) can use B-Knowledge as an OpenAI provider.
 * Auth is via Bearer token from the chat_embed_tokens table.
 *
 * @module controllers/chat-openai
 */

import { Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { log } from '@/shared/services/logger.service.js'
import { chatEmbedTokenService } from '@/shared/services/embed-token.service.js'
import { chatConversationService } from '../services/chat-conversation.service.js'
import {
  buildOaiCompletion,
  buildOaiStreamChunk,
  extractLastUserMessage,
} from '@/shared/services/openai-format.service.js'
import { ModelFactory } from '@/shared/models/factory.js'

/** Default model identifier returned by the API. */
const MODEL_ID = 'b-knowledge-rag'

/**
 * Controller for OpenAI-compatible chat endpoints.
 * @description Thin adapter that validates Bearer tokens, extracts user
 *   messages from the OpenAI messages array, and delegates to the existing
 *   chat conversation service with OpenAI-format response wrapping.
 */
export class ChatOpenaiController {
  /**
   * POST /api/v1/chat/completions — OpenAI-compatible chat completion.
   * @param req - Express request with OpenAI-format body (messages, stream, model)
   * @param res - Express response (JSON or SSE depending on stream flag)
   * @description Extracts Bearer token, validates it, gets the last user message,
   *   and routes to the chat pipeline. Supports both streaming and non-streaming.
   */
  async chatCompletion(req: Request, res: Response): Promise<void> {
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
      const tokenRecord = await chatEmbedTokenService.validateToken(apiKey)
      if (!tokenRecord) {
        res.status(401).json({
          error: { message: 'Invalid API key', type: 'authentication_error', code: 'invalid_api_key' },
        })
        return
      }

      // The chat embed token row has dialog_id (not app_id)
      const dialogId = (tokenRecord as any).dialog_id as string

      // ── Extract user message ───────────────────────────────────────────
      const { messages, stream = true, model } = req.body
      const userMessage = extractLastUserMessage(messages)
      if (!userMessage) {
        res.status(400).json({
          error: { message: 'No user message found in messages array', type: 'invalid_request_error' },
        })
        return
      }

      const resolvedModel = model || MODEL_ID
      const completionId = `chatcmpl-${uuidv4()}`

      if (stream) {
        // ── Streaming mode: SSE with OpenAI chunk format ─────────────────
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')
        res.flushHeaders()

        // Create a temporary session for this API call
        const session = await ModelFactory.chatSession.create({
          user_id: tokenRecord.created_by || 'api',
          title: userMessage.slice(0, 100),
          dialog_id: dialogId,
          created_by: tokenRecord.created_by || 'api',
        } as any)

        // Collect the full answer by intercepting the SSE stream
        let fullAnswer = ''
        const mockRes = createStreamInterceptor(res, completionId, resolvedModel, (delta) => {
          fullAnswer += delta
        })

        await chatConversationService.streamChat(
          session.id,
          userMessage,
          dialogId,
          tokenRecord.created_by || 'api',
          mockRes as any
        )
      } else {
        // ── Non-streaming mode: single JSON response ─────────────────────
        // Create a temporary session
        const session = await ModelFactory.chatSession.create({
          user_id: tokenRecord.created_by || 'api',
          title: userMessage.slice(0, 100),
          dialog_id: dialogId,
          created_by: tokenRecord.created_by || 'api',
        } as any)

        // Collect the full answer via stream interception (buffer mode)
        let fullAnswer = ''
        const bufferRes = createBufferInterceptor((delta) => {
          fullAnswer += delta
        })

        await chatConversationService.streamChat(
          session.id,
          userMessage,
          dialogId,
          tokenRecord.created_by || 'api',
          bufferRes as any
        )

        // Return the complete response in OpenAI format
        const response = buildOaiCompletion(fullAnswer, resolvedModel)
        res.json(response)
      }
    } catch (error) {
      log.error('Error in OpenAI chat completion', { error: (error as Error).message })
      if (!res.headersSent) {
        res.status(500).json({
          error: { message: 'Internal server error', type: 'server_error' },
        })
      }
    }
  }

  /**
   * GET /api/v1/models — List available models.
   * @param _req - Express request
   * @param res - Express response with OpenAI model list format
   */
  async listModels(_req: Request, res: Response): Promise<void> {
    res.json({
      object: 'list',
      data: [
        {
          id: MODEL_ID,
          object: 'model',
          created: 0,
          owned_by: 'b-knowledge',
        },
      ],
    })
  }
}

/**
 * Create a mock Express response that intercepts SSE writes and re-formats
 * them as OpenAI streaming chunks.
 * @param realRes - The actual Express response to write to
 * @param completionId - Shared completion ID for all chunks
 * @param model - Model identifier
 * @param onDelta - Callback invoked with each content delta
 * @returns A mock response object compatible with chatConversationService.streamChat
 */
function createStreamInterceptor(
  realRes: Response,
  completionId: string,
  model: string,
  onDelta: (delta: string) => void
) {
  let headersSent = false

  return {
    headersSent: false,
    setHeader: () => { /* no-op: headers already set */ },
    flushHeaders: () => { headersSent = true },
    write: (data: string) => {
      // Parse the B-Knowledge SSE format
      if (typeof data !== 'string') return true
      if (!data.startsWith('data: ')) return true

      const payload = data.slice(6).trim()
      if (payload === '[DONE]') {
        // Send final chunk
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
        // Skip status events, reference events, and final answer events
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
 * Create a buffer interceptor that collects content deltas without writing
 * to any response. Used for non-streaming mode.
 * @param onDelta - Callback invoked with each content delta
 * @returns A mock response object compatible with chatConversationService.streamChat
 */
function createBufferInterceptor(onDelta: (delta: string) => void) {
  return {
    headersSent: false,
    setHeader: () => {},
    flushHeaders: () => {},
    write: (data: string) => {
      if (typeof data !== 'string') return true
      if (!data.startsWith('data: ')) return true

      const payload = data.slice(6).trim()
      if (payload === '[DONE]') return true

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

/** Singleton instance of the chat OpenAI controller. */
export const chatOpenaiController = new ChatOpenaiController()
