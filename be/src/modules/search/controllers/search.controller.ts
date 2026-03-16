
/**
 * @fileoverview Search controller.
 * Handles HTTP requests for search app CRUD and search execution.
 *
 * @module controllers/search
 */

import { Request, Response } from 'express'
import { log } from '@/shared/services/logger.service.js'
import { searchService } from '../services/search.service.js'
import { ModelFactory } from '@/shared/models/factory.js'

/**
 * Controller class for search endpoints.
 */
export class SearchController {
  /**
   * Create a new search app.
   * @param req - Express request with search app data in body
   * @param res - Express response
   */
  async createSearchApp(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Create search app with validated body
      const app = await searchService.createSearchApp(req.body, userId)
      res.status(201).json(app)
    } catch (error) {
      const errMsg = (error as Error).message

      // Return 409 for duplicate name
      if (errMsg === 'A search app with this name already exists') {
        res.status(409).json({ error: errMsg })
        return
      }

      log.error('Error creating search app', { error: errMsg })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * List all search apps with RBAC filtering, pagination, search, and sorting.
   * Admins see all; other users see their own, public, and shared apps.
   * @param req - Express request with optional query params for pagination/search
   * @param res - Express response with paginated results
   */
  async listSearchApps(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      const userRole = req.user?.role

      if (!userId || !userRole) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Extract validated query params
      const { page, page_size, search, sort_by, sort_order } = req.query as any

      // Fetch team IDs the user belongs to for RBAC evaluation
      const userTeams = await ModelFactory.userTeam.findAll({ user_id: userId })
      const teamIds = userTeams.map((ut: { team_id: string }) => ut.team_id)

      // List apps filtered by RBAC rules with pagination
      const result = await searchService.listAccessibleApps(userId, userRole, teamIds, {
        page,
        pageSize: page_size,
        search,
        sortBy: sort_by,
        sortOrder: sort_order,
      })
      res.json(result)
    } catch (error) {
      log.error('Error listing search apps', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Get access control entries for a search app.
   * Returns entries enriched with user/team display names.
   * @param req - Express request with :id param
   * @param res - Express response
   */
  async getAppAccess(req: Request, res: Response): Promise<void> {
    try {
      // Fetch access entries with resolved display names
      const entries = await searchService.getAppAccess(req.params.id!)
      res.json(entries)
    } catch (error) {
      log.error('Error getting search app access', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Set (replace) access control entries for a search app.
   * Bulk replaces all existing entries with the provided list.
   * @param req - Express request with :id param and entries in body
   * @param res - Express response
   */
  async setAppAccess(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Bulk replace access entries with validated body data
      const entries = await searchService.setAppAccess(
        req.params.id!,
        req.body.entries,
        userId
      )
      res.json(entries)
    } catch (error) {
      log.error('Error setting search app access', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Get a search app by ID.
   * @param req - Express request with :id param
   * @param res - Express response
   */
  async getSearchApp(req: Request, res: Response): Promise<void> {
    try {
      const app = await searchService.getSearchApp(req.params.id!)

      if (!app) {
        res.status(404).json({ error: 'Search app not found' })
        return
      }

      res.json(app)
    } catch (error) {
      log.error('Error getting search app', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Update an existing search app.
   * @param req - Express request with :id param and update data in body
   * @param res - Express response
   */
  async updateSearchApp(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const updated = await searchService.updateSearchApp(req.params.id!, req.body, userId)

      if (!updated) {
        res.status(404).json({ error: 'Search app not found' })
        return
      }

      res.json(updated)
    } catch (error) {
      log.error('Error updating search app', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Delete a search app.
   * @param req - Express request with :id param
   * @param res - Express response
   */
  async deleteSearchApp(req: Request, res: Response): Promise<void> {
    try {
      await searchService.deleteSearchApp(req.params.id!)
      res.status(204).send()
    } catch (error) {
      log.error('Error deleting search app', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Stream an AI-generated summary answer for a search query via SSE.
   * @param req - Express request with :id param and ask query in body
   * @param res - Express response configured for SSE
   * @returns void
   * @description Sets SSE headers and delegates streaming to the search service
   */
  async askSearch(req: Request, res: Response): Promise<void> {
    try {
      // Set SSE headers for streaming
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      res.flushHeaders()

      // Delegate streaming to service
      await searchService.askSearch(req.params.id!, req.body, res)
    } catch (error) {
      const errMsg = (error as Error).message

      // If headers already sent, send error via SSE
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }

      if (errMsg === 'Search app not found') {
        res.status(404).json({ error: errMsg })
        return
      }

      log.error('Error in askSearch', { error: errMsg })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Generate related questions from a user query.
   * @param req - Express request with :id param and { query } in body
   * @param res - Express response
   * @description Uses LLM to generate related search questions
   */
  async relatedQuestions(req: Request, res: Response): Promise<void> {
    try {
      const { query } = req.body

      // Generate related questions via service
      const questions = await searchService.relatedQuestions(req.params.id!, query)
      res.json({ questions })
    } catch (error) {
      const errMsg = (error as Error).message

      if (errMsg === 'Search app not found') {
        res.status(404).json({ error: errMsg })
        return
      }

      log.error('Error generating related questions', { error: errMsg })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Generate a mind map JSON tree from search results.
   * @param req - Express request with :id param and mindmap query in body
   * @param res - Express response
   * @description Retrieves chunks and generates a hierarchical JSON mindmap via LLM
   */
  async mindmap(req: Request, res: Response): Promise<void> {
    try {
      // Generate mindmap from search results
      const tree = await searchService.mindmap(req.params.id!, req.body)
      res.json(tree)
    } catch (error) {
      const errMsg = (error as Error).message

      if (errMsg === 'Search app not found') {
        res.status(404).json({ error: errMsg })
        return
      }

      log.error('Error generating mindmap', { error: errMsg })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Perform a dry-run retrieval test without LLM summary.
   * Returns raw chunks with scores for testing search quality.
   * @param req - Express request with :id param and retrieval test options in body
   * @param res - Express response with paginated chunks and doc aggregations
   */
  async retrievalTest(req: Request, res: Response): Promise<void> {
    try {
      const result = await searchService.retrievalTest(req.params.id!, req.body)
      res.json(result)
    } catch (error) {
      const errMsg = (error as Error).message

      if (errMsg === 'Search app not found') {
        res.status(404).json({ error: errMsg })
        return
      }

      log.error('Error in retrieval test', { error: errMsg })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Execute a search query against a search app with pagination.
   * @param req - Express request with :id param and search options in body
   * @param res - Express response with paginated results
   */
  async executeSearch(req: Request, res: Response): Promise<void> {
    try {
      const { query, top_k, method, similarity_threshold, page, page_size } = req.body

      // Execute search across configured datasets with pagination
      const result = await searchService.executeSearch(
        req.params.id!,
        query,
        {
          topK: top_k,
          method,
          similarityThreshold: similarity_threshold,
          page,
          pageSize: page_size,
        }
      )
      res.json(result)
    } catch (error) {
      const errMsg = (error as Error).message

      // Return 404 if search app not found
      if (errMsg === 'Search app not found') {
        res.status(404).json({ error: errMsg })
        return
      }

      log.error('Error executing search', { error: errMsg })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
