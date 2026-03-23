/**
 * @fileoverview Controller for memory pool HTTP request handlers.
 *
 * Each method maps to an Express route and delegates business logic to memoryService
 * and memoryMessageService. Extracts tenantId from requireTenant middleware and
 * userId from session.
 *
 * @module modules/memory/controllers/memory
 */
import { Request, Response } from 'express'
import { memoryService } from '../services/memory.service.js'
import { memoryMessageService } from '../services/memory-message.service.js'
import { getTenantId } from '@/shared/middleware/tenant.middleware.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * @description Controller handling all memory pool and message HTTP endpoints.
 *   Includes pool CRUD, message listing, search, forget, and delete operations.
 */
class MemoryController {
  /**
   * @description POST / -- Create a new memory pool.
   *   Body validated by createMemorySchema via middleware.
   * @param {Request} req - Express request with validated body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const userId = req.user?.id || ''
      const pool = await memoryService.createPool(req.body, userId, tenantId)
      res.status(201).json(pool)
    } catch (error: any) {
      log.error('Failed to create memory pool', { error: String(error) })
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to create memory pool' })
    }
  }

  /**
   * @description GET / -- List memory pools visible to the current user.
   *   Returns team-visible pools and user's own private pools.
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async list(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const userId = req.user?.id || ''
      const pools = await memoryService.listPools(tenantId, userId)
      res.json(pools)
    } catch (error: any) {
      log.error('Failed to list memory pools', { error: String(error) })
      res.status(500).json({ error: 'Failed to list memory pools' })
    }
  }

  /**
   * @description GET /:id -- Retrieve a single memory pool by UUID.
   *   Returns 404 if pool not found or belongs to different tenant.
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async getById(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const pool = await memoryService.getPool(req.params['id']!, tenantId)

      // Return 404 if pool not found in this tenant
      if (!pool) {
        res.status(404).json({ error: 'Memory pool not found' })
        return
      }

      res.json(pool)
    } catch (error: any) {
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to get memory pool' })
    }
  }

  /**
   * @description PUT /:id -- Update an existing memory pool.
   *   Body validated by updateMemorySchema via middleware.
   * @param {Request} req - Express request with :id param and update body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async update(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const pool = await memoryService.updatePool(req.params['id']!, req.body, tenantId)
      res.json(pool)
    } catch (error: any) {
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to update memory pool' })
    }
  }

  /**
   * @description DELETE /:id -- Delete a memory pool and all its messages.
   *   Removes OpenSearch messages first, then deletes the database record.
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async remove(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      await memoryService.deletePool(req.params['id']!, tenantId)
      res.status(204).send()
    } catch (error: any) {
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to delete memory pool' })
    }
  }

  /**
   * @description GET /:id/messages -- List messages in a memory pool with pagination.
   *   Query validated by queryMemoryMessagesSchema via middleware.
   * @param {Request} req - Express request with :id param and query params
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listMessages(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const { page, page_size, keyword, message_type } = req.query as any

      const result = await memoryMessageService.listMessages(
        tenantId,
        req.params['id']!,
        Number(page) || 1,
        Number(page_size) || 20,
        keyword as string | undefined,
        message_type !== undefined ? Number(message_type) : undefined,
      )

      res.json(result)
    } catch (error: any) {
      log.error('Failed to list memory messages', { error: String(error) })
      res.status(500).json({ error: 'Failed to list memory messages' })
    }
  }

  /**
   * @description DELETE /:id/messages/:messageId -- Delete a single memory message.
   * @param {Request} req - Express request with :id and :messageId params
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async deleteMessage(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      await memoryMessageService.deleteMessage(tenantId, req.params['messageId']!)
      res.status(204).send()
    } catch (error: any) {
      log.error('Failed to delete memory message', { error: String(error) })
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to delete memory message' })
    }
  }

  /**
   * @description POST /:id/search -- Perform hybrid vector+text search over memory messages.
   *   Body should contain { query: string, top_k?: number }.
   *   Generates embedding vector internally (placeholder for now -- full embedding via llmClientService in later plan).
   * @param {Request} req - Express request with :id param and search body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async searchMessages(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const { query, top_k } = req.body as { query: string; top_k?: number }

      // TODO: Generate embedding via llmClientService in extraction plan (02-03)
      // For now, perform text-only search with empty vector
      const results = await memoryMessageService.searchMemory(
        tenantId,
        req.params['id']!,
        query,
        [], // Empty vector -- full embedding wired in extraction plan
        top_k || 10,
      )

      res.json(results)
    } catch (error: any) {
      log.error('Failed to search memory messages', { error: String(error) })
      res.status(500).json({ error: 'Failed to search memory messages' })
    }
  }

  /**
   * @description PUT /:id/messages/:messageId/forget -- Mark a memory message as forgotten.
   *   Sets status to 0, excluding the message from future search results.
   * @param {Request} req - Express request with :id and :messageId params
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async forgetMessage(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      await memoryMessageService.updateMessageStatus(tenantId, req.params['messageId']!, 0)
      res.json({ message: 'Message forgotten' })
    } catch (error: any) {
      log.error('Failed to forget memory message', { error: String(error) })
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to forget memory message' })
    }
  }
}

/** @description Singleton memory controller instance */
export const memoryController = new MemoryController()
