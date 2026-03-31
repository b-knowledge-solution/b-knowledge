/**
 * @fileoverview Agent embed widget service — token generation, config retrieval,
 * and SSE streaming for embeddable agent widgets on external sites.
 *
 * Reuses the shared EmbedTokenService pattern established by chat and search embeds.
 * Requires an `agent_embed_tokens` table with `agent_id` FK.
 *
 * @module modules/agents/services/agent-embed
 */

import { Response } from 'express'
import { EmbedTokenService } from '@/shared/services/embed-token.service.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { agentExecutorService } from './agent-executor.service.js'
import { log } from '@/shared/services/logger.service.js'

// Singleton instance for the agent_embed_tokens table
const tokenService = new EmbedTokenService('agent_embed_tokens', 'agent_id')

/**
 * @description Singleton service providing agent embed widget functionality.
 *   Handles embed token lifecycle, agent config retrieval for widget display,
 *   and SSE-streamed agent execution from embed contexts.
 */
class AgentEmbedService {
  /**
   * @description Generate an embed token for an agent widget.
   *   The token allows unauthenticated external access to the agent via the widget.
   * @param {string} agentId - UUID of the agent to embed
   * @param {string} tenantId - Tenant/organization identifier for isolation
   * @param {string} userId - UUID of the user generating the token
   * @param {string} [name] - Optional human-readable label for the token
   * @returns {Promise<{ token: string; id: string }>} The generated token value and record ID
   * @throws {Error} 404 if agent not found or belongs to different tenant
   */
  async generateEmbedToken(
    agentId: string,
    tenantId: string,
    userId: string,
    name?: string,
  ): Promise<{ token: string; id: string }> {
    // Verify agent exists and belongs to tenant before creating token
    const agent = await ModelFactory.agent.findById(agentId)
    if (!agent || agent.tenant_id !== tenantId) {
      const error = new Error('Agent not found')
      ;(error as any).statusCode = 404
      throw error
    }

    const row = await tokenService.createToken(
      agentId,
      name ?? `Embed token for ${agent.name}`,
      userId,
    )

    log.info('Agent embed token generated', { agentId, tokenId: row.id })
    return { token: row.token, id: row.id }
  }

  /**
   * @description Validate an embed token and start an agent run with SSE streaming.
   *   Sets SSE headers and delegates to the executor service for run lifecycle.
   * @param {string} agentId - UUID of the agent to run
   * @param {string} input - User input text from the widget
   * @param {string} embedToken - The embed token string for authentication
   * @param {Response} res - Express response for SSE streaming
   * @returns {Promise<void>}
   * @throws {Error} 401 if token is invalid or expired
   */
  async runFromEmbed(
    agentId: string,
    input: string,
    embedToken: string,
    res: Response,
  ): Promise<void> {
    // Validate embed token and extract associated agent_id
    const tokenRow = await tokenService.validateToken(embedToken)
    if (!tokenRow || tokenRow.agent_id !== agentId) {
      const error = new Error('Invalid or expired embed token')
      ;(error as any).statusCode = 401
      throw error
    }

    // Start the agent run with embed trigger type
    const agent = await ModelFactory.agent.findById(agentId)
    const tenantId = agent?.tenant_id ?? ''
    const runId = await agentExecutorService.startRun(
      agentId,
      input,
      tenantId,
      '', // No authenticated user for embed requests
      'embed',
    )

    // Stream the run output via SSE
    await agentExecutorService.streamRun(runId, res)
  }

  /**
   * @description Retrieve minimal agent configuration for widget header display.
   *   Validates the embed token before returning agent info.
   * @param {string} agentId - UUID of the agent
   * @param {string} embedToken - The embed token string for authentication
   * @returns {Promise<{ name: string; avatar: string | null; description: string | null }>}
   * @throws {Error} 401 if token is invalid, 404 if agent not found
   */
  async getAgentConfig(
    agentId: string,
    embedToken: string,
  ): Promise<{ name: string; avatar: string | null; description: string | null }> {
    // Validate embed token
    const tokenRow = await tokenService.validateToken(embedToken)
    if (!tokenRow || tokenRow.agent_id !== agentId) {
      const error = new Error('Invalid or expired embed token')
      ;(error as any).statusCode = 401
      throw error
    }

    const agent = await ModelFactory.agent.findById(agentId)
    if (!agent) {
      const error = new Error('Agent not found')
      ;(error as any).statusCode = 404
      throw error
    }

    return {
      name: agent.name,
      avatar: agent.avatar ?? null,
      description: agent.description ?? null,
    }
  }

  /**
   * @description List all embed tokens for an agent (masked for security).
   * @param {string} agentId - UUID of the agent
   * @returns {Promise<Array<Record<string, unknown>>>} Array of token records with masked values
   */
  async listTokens(agentId: string): Promise<Array<Record<string, unknown>>> {
    return tokenService.listTokens(agentId)
  }

  /**
   * @description Revoke (delete) an embed token by its ID.
   * @param {string} tokenId - UUID of the token record to revoke
   * @returns {Promise<void>}
   */
  async revokeToken(tokenId: string): Promise<void> {
    await tokenService.revokeToken(tokenId)
  }
}

/** @description Singleton agent embed service instance */
export const agentEmbedService = new AgentEmbedService()
