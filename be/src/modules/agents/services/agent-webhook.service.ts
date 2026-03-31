/**
 * @fileoverview Webhook service for triggering agent execution from external HTTP requests.
 *
 * Handles validation of webhook payloads, agent status checks, and delegation
 * to the agent executor service. Webhook endpoints are unauthenticated — callers
 * don't have user sessions, so the trigger_type is always 'webhook'.
 *
 * @module modules/agents/services/agent-webhook
 */

import { ModelFactory } from '@/shared/models/factory.js'
import { agentExecutorService } from './agent-executor.service.js'
import { log } from '@/shared/services/logger.service.js'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Result of a successful webhook trigger containing the created run ID
 */
interface WebhookResult {
  run_id: string
}

// ============================================================================
// Service
// ============================================================================

/**
 * @description Singleton service for handling webhook-triggered agent execution.
 *   Validates the agent exists and is published, extracts input from the webhook
 *   payload, and delegates to the executor service.
 */
class AgentWebhookService {
  /**
   * @description Handle an incoming webhook request to trigger agent execution.
   *   Validates the agent exists, is published, extracts input from the body,
   *   and starts an asynchronous execution run.
   * @param {string} agentId - UUID of the agent to trigger
   * @param {Record<string, unknown>} body - Webhook request body
   * @returns {Promise<WebhookResult>} Object containing the created run_id
   * @throws {Error} 404 if agent not found, 400 if agent not published or invalid payload
   */
  async handleWebhook(agentId: string, body: Record<string, unknown>): Promise<WebhookResult> {
    // Validate the agent exists
    const agent = await ModelFactory.agent.findById(agentId)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { statusCode: 404 })
    }

    // Only published agents can be triggered via webhook
    if (agent.status !== 'published') {
      throw Object.assign(
        new Error('Agent must be published before it can be triggered via webhook'),
        { statusCode: 400 },
      )
    }

    // Extract and validate input from the webhook payload
    const { input } = this.validateWebhookPayload(body)

    log.info('Webhook triggered agent execution', { agentId, inputLength: input.length })

    // Start the run with 'webhook' trigger type and no authenticated user
    const runId = await agentExecutorService.startRun(
      agentId,
      input,
      agent.tenant_id,
      'webhook',       // userId — webhook has no user session
      'webhook',
    )

    return { run_id: runId }
  }

  /**
   * @description Validate and extract input from a webhook request body.
   *   Accepts 'input', 'message', or 'query' field names for flexibility.
   * @param {unknown} body - Raw request body
   * @returns {{ input: string }} Validated input text
   * @throws {Error} 400 if no recognizable input field is found
   */
  validateWebhookPayload(body: unknown): { input: string } {
    if (!body || typeof body !== 'object') {
      throw Object.assign(
        new Error('Request body must be a JSON object'),
        { statusCode: 400 },
      )
    }

    const payload = body as Record<string, unknown>

    // Accept multiple common field names for the input text
    const input = payload['input'] ?? payload['message'] ?? payload['query']

    if (typeof input !== 'string' || input.trim().length === 0) {
      throw Object.assign(
        new Error('Request body must contain a non-empty "input", "message", or "query" string field'),
        { statusCode: 400 },
      )
    }

    return { input: input.trim() }
  }
}

/** @description Singleton instance of the webhook service */
export const agentWebhookService = new AgentWebhookService()
