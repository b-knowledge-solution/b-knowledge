
/**
 * @fileoverview Chat assistant controller.
 * Handles HTTP requests for assistant (chat configuration) CRUD
 * and RBAC access control management.
 *
 * @module controllers/chat-assistant
 */

import { Request, Response } from 'express'
import { log } from '@/shared/services/logger.service.js'
import { chatAssistantService } from '../services/chat-assistant.service.js'
import { ModelFactory } from '@/shared/models/factory.js'

/**
 * @description Controller class for chat assistant endpoints.
 * Handles CRUD operations and RBAC access control for chat assistant configurations.
 */
export class ChatAssistantController {
  /**
   * @description Create a new assistant configuration.
   * @param {Request} req - Express request with assistant data in body
   * @param {Response} res - Express response
   * @returns {Promise<void>} 201 with created assistant or error response
   */
  async createAssistant(req: Request, res: Response): Promise<void> {
    try {
      // Guard: ensure authenticated user
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Create assistant with validated body data
      const assistant = await chatAssistantService.createAssistant(req.body, userId)
      res.status(201).json(assistant)
    } catch (error) {
      const message = (error as Error).message
      log.error('Error creating assistant', { error: message })
      // Return 409 for name uniqueness violations
      if (message.includes('already exists')) {
        res.status(409).json({ error: message })
        return
      }
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Get an assistant by ID.
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>} 200 with assistant or 404 if not found
   */
  async getAssistant(req: Request, res: Response): Promise<void> {
    try {
      // Fetch assistant by ID from the database
      const assistant = await chatAssistantService.getAssistant(req.params.id!)

      // Return 404 if assistant does not exist
      if (!assistant) {
        res.status(404).json({ error: 'Assistant not found' })
        return
      }

      res.json(assistant)
    } catch (error) {
      log.error('Error getting assistant', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description List all assistants with RBAC filtering, pagination, and search.
   * Admins see all; other users see their own, public, and shared assistants.
   * @param {Request} req - Express request with optional query params (page, page_size, search, sort_by, sort_order)
   * @param {Response} res - Express response
   * @returns {Promise<void>} 200 with paginated assistant list
   */
  async listAssistants(req: Request, res: Response): Promise<void> {
    try {
      // Guard: ensure authenticated user with a known role
      const userId = req.user?.id
      const userRole = req.user?.role

      if (!userId || !userRole) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Extract pagination/search params from validated query
      const { page, page_size, search, sort_by, sort_order } = req.query as {
        page?: number
        page_size?: number
        search?: string
        sort_by?: string
        sort_order?: string
      }

      // Fetch team IDs the user belongs to for RBAC evaluation
      const userTeams = await ModelFactory.userTeam.findAll({ user_id: userId })
      const teamIds = userTeams.map((ut: { team_id: string }) => ut.team_id)

      // Build pagination options, omitting undefined values
      const options: Record<string, unknown> = {}
      if (page) options.page = Number(page)
      if (page_size) options.pageSize = Number(page_size)
      if (search) options.search = search
      if (sort_by) options.sortBy = sort_by
      if (sort_order) options.sortOrder = sort_order

      // List assistants filtered by RBAC rules with pagination
      const result = await chatAssistantService.listAccessibleAssistants(userId, userRole, teamIds, options as {
        page?: number
        pageSize?: number
        search?: string
        sortBy?: string
        sortOrder?: string
      })
      res.json(result)
    } catch (error) {
      log.error('Error listing assistants', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Update an existing assistant.
   * @param {Request} req - Express request with :id param and update data in body
   * @param {Response} res - Express response
   * @returns {Promise<void>} 200 with updated assistant or 404 if not found
   */
  async updateAssistant(req: Request, res: Response): Promise<void> {
    try {
      // Guard: ensure authenticated user
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Update assistant with validated body data
      const updated = await chatAssistantService.updateAssistant(req.params.id!, req.body, userId)

      // Return 404 if assistant does not exist
      if (!updated) {
        res.status(404).json({ error: 'Assistant not found' })
        return
      }

      res.json(updated)
    } catch (error) {
      log.error('Error updating assistant', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Delete an assistant by ID.
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>} 204 on success
   */
  async deleteAssistant(req: Request, res: Response): Promise<void> {
    try {
      // Delete the assistant record
      await chatAssistantService.deleteAssistant(req.params.id!)
      res.status(204).send()
    } catch (error) {
      log.error('Error deleting assistant', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Get access control entries for an assistant.
   * Returns entries enriched with user/team display names.
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>} 200 with access entries array
   */
  async getAssistantAccess(req: Request, res: Response): Promise<void> {
    try {
      // Fetch access entries with resolved display names
      const entries = await chatAssistantService.getAssistantAccess(req.params.id!)
      res.json(entries)
    } catch (error) {
      log.error('Error getting assistant access', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Set (replace) access control entries for an assistant.
   * Bulk replaces all existing entries with the provided list.
   * @param {Request} req - Express request with :id param and entries in body
   * @param {Response} res - Express response
   * @returns {Promise<void>} 200 with newly created access entries
   */
  async setAssistantAccess(req: Request, res: Response): Promise<void> {
    try {
      // Guard: ensure authenticated user
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Bulk replace access entries with validated body data
      const entries = await chatAssistantService.setAssistantAccess(
        req.params.id!,
        req.body.entries,
        userId
      )
      res.json(entries)
    } catch (error) {
      log.error('Error setting assistant access', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
