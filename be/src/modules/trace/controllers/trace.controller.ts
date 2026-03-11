/**
 * @fileoverview Trace controller for Langfuse trace submission and feedback.
 *
 * Accepts trace payloads and feedback from external clients, validates emails,
 * and forwards data to Langfuse via the shared langfuse service.
 *
 * @module modules/trace/controllers/trace
 */
import { Request, Response } from 'express'
import { getLangfuseClient } from '@/shared/services/langfuse.service.js'
import { traceAuthService } from '@/modules/trace/services/trace-auth.service.js'
import { config } from '@/shared/config/index.js'
import { log } from '@/shared/services/logger.service.js'
import { getClientIp } from '@/shared/utils/ip.js'

/** Default tags applied to all external traces */
const DEFAULT_TAGS = ['knowledge-base', 'external-trace']

/**
 * Controller for external trace submission and feedback endpoints.
 * @description Thin wrapper around shared Langfuse trace service with
 *   email validation and server-side IP injection.
 */
export class TraceController {
  /** In-memory map of active trace handles by chat ID */
  private chatTraces: Map<string, any> = new Map()

  /**
   * Build tags array for a trace.
   * @param metadata - Optional metadata containing tags.
   * @param shareId - Optional share ID to include as a tag.
   * @returns string[] - Array of unique tags.
   * @description Merges default tags, environment, and metadata tags.
   */
  private buildTags(metadata?: any, shareId?: string): string[] {
    // Initialize with default tags
    const tags = [...DEFAULT_TAGS]

    // Add server environment tag
    if (config.nodeEnv) {
      tags.push(config.nodeEnv)
    }

    // Add share_id as tag
    if (shareId) {
      tags.push(`share_id:${shareId}`)
    }

    // Add tags from metadata
    if (metadata?.tags && Array.isArray(metadata.tags)) {
      tags.push(...metadata.tags)
    }

    // Add source as tag
    if (metadata?.source) {
      tags.push(metadata.source)
    }

    // Add task type as tag (filtering out standard response types)
    if (metadata?.task && !['user_response', 'llm_response'].includes(metadata.task)) {
      tags.push(metadata.task)
    }

    // Return unique list
    return [...new Set(tags)]
  }

  /**
   * Submit a trace from an external client.
   * @param req - Express request object containing trace data.
   * @param res - Express response object.
   * @returns Promise<void>
   * @description Validates email, creates/updates Langfuse trace, and logs generation events.
   */
  async submitTrace(req: Request, res: Response): Promise<void> {
    try {
      // Force add server-side IP address for accurate tracking
      const ipAddress = getClientIp(req)
      const { email, message, role = 'user', response, metadata, share_id } = req.body

      // Validate email against user table
      const isValidEmail = await traceAuthService.validateEmailWithCache(email, ipAddress)
      if (!isValidEmail) {
        res.json({ success: false, error: 'Invalid email: not registered in system' })
        return
      }

      // Get Langfuse client singleton
      const langfuse = getLangfuseClient()

      // Determine identifiers and context
      const chatId = metadata?.chatId ?? metadata?.sessionId ?? `chat-${email}-${Date.now()}`
      const taskName = metadata?.task ?? (role === 'assistant' ? 'llm_response' : 'user_response')
      const tags = this.buildTags(metadata, share_id)

      // Access or initialize memory trace object
      let trace = this.chatTraces.get(chatId)

      if (!trace) {
        // Start a new trace
        trace = langfuse.trace({
          name: `chat:${chatId}`,
          userId: email,
          sessionId: chatId,
          tags,
          metadata: {
            source: metadata?.source ?? 'unknown',
            interface: 'knowledge-base',
            type: taskName,
            ipAddress,
            collectedAt: new Date().toISOString(),
            ...metadata,
          },
          input: message,
        })
        this.chatTraces.set(chatId, trace)
      } else {
        // Update existing trace
        trace.update({ tags, input: message })
      }

      // Build enhanced metadata for generation/event
      const enhancedMetadata = {
        email,
        type: taskName,
        interface: 'knowledge-base',
        source: metadata?.source,
        model_id: metadata?.model,
        model_name: metadata?.modelName,
        timestamp: metadata?.timestamp ?? new Date().toISOString(),
        ...metadata,
      }

      // Determine if this is a generation (LLM response) or generic event
      const isGeneration = taskName === 'llm_response' || role === 'assistant'

      if (isGeneration) {
        // Check if usage data is available
        const hasUsage = metadata?.usage &&
          (typeof metadata.usage.promptTokens === 'number' ||
            typeof metadata.usage.completionTokens === 'number')

        // Log generation event with optional usage
        if (hasUsage && metadata?.usage) {
          trace.generation({
            name: `${taskName}:${Date.now()}`,
            model: metadata?.modelName ?? metadata?.model ?? 'unknown',
            input: message,
            output: response,
            metadata: enhancedMetadata,
            usage: {
              input: metadata.usage.promptTokens ?? null,
              output: metadata.usage.completionTokens ?? null,
              total: metadata.usage.totalTokens ?? null,
              unit: 'TOKENS',
            },
          })
        } else {
          trace.generation({
            name: `${taskName}:${Date.now()}`,
            model: metadata?.modelName ?? metadata?.model ?? 'unknown',
            input: message,
            output: response,
            metadata: enhancedMetadata,
          })
        }

        // Update trace output if response is present
        if (response) {
          trace.update({ output: response })
        }
      } else {
        // Log generic event (non-generation)
        trace.event({
          name: `${taskName}:${Date.now()}`,
          input: message,
          metadata: enhancedMetadata,
        })
      }

      // Flush to Langfuse service
      await langfuse.flushAsync()
      log.debug('Trace processed successfully', { traceId: trace.id, ipAddress })
      res.json({ success: true, traceId: trace.id })
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to submit trace', { error: String(error) })
      res.status(500).json({ error: 'Failed to submit trace' })
    }
  }

  /**
   * Submit feedback for an existing trace.
   * @param req - Express request object containing feedback data.
   * @param res - Express response object.
   * @returns Promise<void>
   * @description Sends feedback score to Langfuse for the specified trace.
   */
  async submitFeedback(req: Request, res: Response): Promise<void> {
    try {
      const { traceId, messageId, value, score, comment } = req.body
      const id = traceId || messageId

      // Trace ID is required
      if (!id) {
        res.status(400).json({ error: 'Trace ID required' })
        return
      }

      const langfuse = getLangfuseClient()

      // Submit score with deterministic ID to allow updates
      langfuse.score({
        id: `${id}-user-feedback`,
        traceId: id,
        name: 'user-feedback',
        value: value ?? score,
        comment,
      })

      // Flush async
      await langfuse.flushAsync()
      res.json({ success: true })
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to submit feedback', { error: String(error) })
      res.status(500).json({ error: 'Failed to submit feedback' })
    }
  }

  /**
   * Health check endpoint for the trace API.
   * @param _req - Express request object (unused).
   * @param res - Express response object.
   * @returns Promise<void>
   * @description Returns a simple health status response.
   */
  async getHealth(_req: Request, res: Response): Promise<void> {
    res.status(200).json({
      status: 'ok',
      service: 'trace',
      timestamp: new Date().toISOString(),
    })
  }
}
