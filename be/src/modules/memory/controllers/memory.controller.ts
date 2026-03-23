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
import { getUuid } from '@/shared/utils/uuid.js'
import { memoryMessageService } from '../services/memory-message.service.js'
import { memoryExtractionService } from '../services/memory-extraction.service.js'
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

  /**
   * @description POST /:id/import -- Import chat history into a memory pool (D-11).
   *   Delegates to memoryExtractionService.importChatHistory which loads chat messages,
   *   groups them into user+assistant pairs, and extracts memories via LLM pipeline.
   * @param {Request} req - Express request with :id param and body { session_id: string }
   * @param {Response} res - Express response with { imported: number }
   * @returns {Promise<void>}
   */
  async importHistory(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const userId = req.user?.id || ''
      const { session_id } = req.body as { session_id: string }

      const result = await memoryExtractionService.importChatHistory(
        req.params['id']!,
        session_id,
        userId,
        tenantId,
      )

      res.status(200).json(result)
    } catch (error: any) {
      log.error('Failed to import chat history into memory pool', { error: String(error) })
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to import chat history' })
    }
  }

  /**
   * @description POST /:id/messages -- Insert a single message directly into a memory pool.
   *   Used by the agent memory_write node to store content without LLM extraction.
   *   Generates UUID for message_id, generates embedding, and inserts via memoryMessageService.
   * @param {Request} req - Express request with :id param and body { content: string, message_type?: number }
   * @param {Response} res - Express response with { message_id: string }
   * @returns {Promise<void>}
   */
  async addMessage(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req) || ''
      const { content, message_type } = req.body as { content: string; message_type?: number }
      const messageId = getUuid()

      // Ensure the OpenSearch index exists before inserting
      await memoryMessageService.ensureIndex(tenantId)

      // Insert the memory message with empty embedding (full embedding wired in extraction plan)
      await memoryMessageService.insertMessage(tenantId, {
        message_id: messageId,
        memory_id: req.params['id']!,
        content,
        content_embed: [],
        message_type: message_type ?? 1,
        status: 1,
        tenant_id: tenantId,
        source_id: '',
      })

      res.status(201).json({ message_id: messageId })
    } catch (error: any) {
      log.error('Failed to add message to memory pool', { error: String(error) })
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to add message' })
    }
  }
}

/** @description Singleton memory controller instance */
export const memoryController = new MemoryController()
