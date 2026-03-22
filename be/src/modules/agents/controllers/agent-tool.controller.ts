/**
 * @fileoverview Controller for tool credential CRUD endpoints.
 *
 * Handles HTTP requests for managing encrypted tool credentials.
 * All endpoints require authentication and tenant context.
 *
 * @module modules/agents/controllers/agent-tool
 */
import type { Request, Response } from 'express'
import { agentToolCredentialService } from '../services/agent-tool-credential.service.js'
import { getTenantId } from '@/shared/middleware/tenant.middleware.js'
import { logger } from '@/shared/services/logger.service.js'

/**
 * @description Controller class for tool credential REST endpoints.
 *   Provides CRUD handlers mounted under /api/agents/tools/credentials.
 */
class AgentToolController {
  /**
   * @description List all tool credentials for the authenticated user's tenant.
   *   Returns credential metadata without decrypted values.
   * @param {Request} req - Express request with tenant context
   * @param {Response} res - Express response
   * @returns {Promise<void>} JSON array of credential records
   */
  async listCredentials(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const credentials = await agentToolCredentialService.list(tenantId)

      // Strip encrypted_credentials from response for security
      const sanitized = credentials.map(({ encrypted_credentials: _, ...rest }) => rest)

      res.json({ data: sanitized })
    } catch (error) {
      logger.error(`listCredentials failed: ${String(error)}`)
      res.status(500).json({ error: 'Failed to list tool credentials' })
    }
  }

  /**
   * @description Create a new tool credential with encrypted storage.
   * @param {Request} req - Express request with validated body (tool_type, name, credentials)
   * @param {Response} res - Express response
   * @returns {Promise<void>} JSON with created credential (without decrypted values)
   */
  async createCredential(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const userId = req.user?.id || ''
      const { tool_type, name, credentials, agent_id } = req.body

      const created = await agentToolCredentialService.create(tenantId, {
        tool_type,
        name,
        credentials,
        agent_id,
      }, userId)

      // Return created record without the encrypted payload
      const { encrypted_credentials: _, ...sanitized } = created
      res.status(201).json({ data: sanitized })
    } catch (error) {
      logger.error(`createCredential failed: ${String(error)}`)
      res.status(500).json({ error: 'Failed to create tool credential' })
    }
  }

  /**
   * @description Update an existing tool credential. Re-encrypts if credentials change.
   * @param {Request} req - Express request with :id param and update body
   * @param {Response} res - Express response
   * @returns {Promise<void>} 204 No Content on success
   */
  async updateCredential(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const { id } = req.params
      const { name, credentials } = req.body

      await agentToolCredentialService.update(id!, tenantId, { name, credentials })
      res.status(204).end()
    } catch (error) {
      const message = String(error)

      // Return 404 for not-found errors, 500 for unexpected failures
      if (message.includes('not found')) {
        res.status(404).json({ error: 'Tool credential not found' })
        return
      }

      logger.error(`updateCredential failed: ${message}`)
      res.status(500).json({ error: 'Failed to update tool credential' })
    }
  }

  /**
   * @description Delete a tool credential by ID.
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>} 204 No Content on success
   */
  async deleteCredential(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const { id } = req.params

      await agentToolCredentialService.delete(id!, tenantId)
      res.status(204).end()
    } catch (error) {
      const message = String(error)

      if (message.includes('not found')) {
        res.status(404).json({ error: 'Tool credential not found' })
        return
      }

      logger.error(`deleteCredential failed: ${message}`)
      res.status(500).json({ error: 'Failed to delete tool credential' })
    }
  }
}

/** @description Singleton tool controller instance */
export const agentToolController = new AgentToolController()
