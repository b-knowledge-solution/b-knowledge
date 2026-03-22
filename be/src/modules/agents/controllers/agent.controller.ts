/**
 * @fileoverview Controller for agent-related HTTP request handlers.
 *
 * Each method maps to an Express route and delegates business logic to agentService.
 * Extracts tenantId from requireTenant middleware and userId from session.
 *
 * @module modules/agents/controllers/agent
 */
import { Request, Response } from 'express'
import { agentService } from '../services/agent.service.js'
import { getTenantId } from '@/shared/middleware/tenant.middleware.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * @description Controller handling all agent-related HTTP endpoints including
 *   CRUD operations, versioning, duplication, and JSON export.
 */
class AgentController {
  /**
   * @description GET /agents — List agents with optional filters and pagination.
   *   Requires authentication and tenant context.
   * @param {Request} req - Express request with query params
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listAgents(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      // Query params are already validated and coerced by Zod middleware
      const result = await agentService.list(tenantId, req.query as any)
      res.json(result)
    } catch (error) {
      log.error('Failed to list agents', { error: String(error) })
      res.status(500).json({ error: 'Failed to list agents' })
    }
  }

  /**
   * @description GET /agents/:id — Retrieve a single agent by UUID.
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async getAgent(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const agent = await agentService.getById(req.params['id']!, tenantId)
      res.json(agent)
    } catch (error: any) {
      // Forward service-level status codes (404, etc.)
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to get agent' })
    }
  }

  /**
   * @description POST /agents — Create a new agent.
   *   Body validated by createAgentSchema via middleware.
   * @param {Request} req - Express request with agent body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createAgent(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const userId = req.user?.id || ''
      const agent = await agentService.create(req.body, tenantId, userId)
      res.status(201).json(agent)
    } catch (error: any) {
      log.error('Failed to create agent', { error: String(error) })
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to create agent' })
    }
  }

  /**
   * @description PUT /agents/:id — Update an existing agent.
   *   Body validated by updateAgentSchema via middleware.
   * @param {Request} req - Express request with :id param and update body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async updateAgent(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const agent = await agentService.update(req.params['id']!, req.body, tenantId)
      res.json(agent)
    } catch (error: any) {
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to update agent' })
    }
  }

  /**
   * @description DELETE /agents/:id — Delete an agent and all its versions.
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async deleteAgent(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      await agentService.delete(req.params['id']!, tenantId)
      res.status(204).send()
    } catch (error: any) {
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to delete agent' })
    }
  }

  /**
   * @description POST /agents/:id/duplicate — Clone an agent with "(copy)" suffix.
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async duplicateAgent(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const userId = req.user?.id || ''
      const clone = await agentService.duplicate(req.params['id']!, tenantId, userId)
      res.status(201).json(clone)
    } catch (error: any) {
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to duplicate agent' })
    }
  }

  /**
   * @description POST /agents/:id/versions — Save a version snapshot of the agent's DSL.
   *   Body validated by saveVersionSchema via middleware.
   * @param {Request} req - Express request with :id param and optional version label/summary
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async saveVersion(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const userId = req.user?.id || ''
      const version = await agentService.saveVersion(
        req.params['id']!,
        tenantId,
        userId,
        req.body.version_label,
        req.body.change_summary,
      )
      res.status(201).json(version)
    } catch (error: any) {
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to save version' })
    }
  }

  /**
   * @description GET /agents/:id/versions — List all versions of an agent.
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listVersions(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const versions = await agentService.listVersions(req.params['id']!, tenantId)
      res.json(versions)
    } catch (error: any) {
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to list versions' })
    }
  }

  /**
   * @description POST /agents/:id/versions/:versionId/restore — Restore a version's DSL to the parent.
   * @param {Request} req - Express request with :id and :versionId params
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async restoreVersion(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const agent = await agentService.restoreVersion(
        req.params['id']!,
        req.params['versionId']!,
        tenantId,
      )
      res.json(agent)
    } catch (error: any) {
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to restore version' })
    }
  }

  /**
   * @description DELETE /agents/:id/versions/:versionId — Delete a specific version row.
   * @param {Request} req - Express request with :id and :versionId params
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async deleteVersion(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      await agentService.deleteVersion(req.params['versionId']!, tenantId)
      res.status(204).send()
    } catch (error: any) {
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to delete version' })
    }
  }

  /**
   * @description GET /agents/:id/export — Export agent with DSL as JSON download.
   *   Sets Content-Disposition header for file download.
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async exportAgent(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const agent = await agentService.exportJson(req.params['id']!, tenantId)

      // Set Content-Disposition for file download with agent name as filename
      const safeName = agent.name.replace(/[^a-zA-Z0-9_-]/g, '_')
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.json"`)
      res.setHeader('Content-Type', 'application/json')
      res.json(agent)
    } catch (error: any) {
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to export agent' })
    }
  }
}

/** @description Singleton controller instance */
export const agentController = new AgentController()
