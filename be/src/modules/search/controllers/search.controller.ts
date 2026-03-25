
/**
 * @fileoverview Search controller.
 * Handles HTTP requests for search app CRUD and search execution.
 *
 * @module controllers/search
 */

import { Request, Response } from 'express'
import { config } from '@/shared/config/index.js'
import { log } from '@/shared/services/logger.service.js'
import { searchService } from '../services/search.service.js'
import { feedbackService } from '@/modules/feedback/services/feedback.service.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { getTenantId } from '@/shared/middleware/tenant.middleware.js'

/**
 * @description Controller handling search app CRUD, search execution,
 *   AI summary streaming, related questions, mindmap generation, and retrieval testing
 */
export class SearchController {
  /**
   * @description Create a new search app configuration
   * @param {Request} req - Express request with search app data in body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createSearchApp(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      // Guard: require authentication for search app creation
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
   * @description List all search apps with RBAC filtering, pagination, search, and sorting.
   *   Admins see all apps; other users see their own, public, and shared apps.
   * @param {Request} req - Express request with optional query params for pagination/search
   * @param {Response} res - Express response with paginated results
   * @returns {Promise<void>}
   */
  async listSearchApps(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      const userRole = req.user?.role

      // Unauthenticated users only see public apps
      if (!userId || !userRole) {
        const result = await searchService.listPublicApps(req.query as any)
        res.json(result)
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
   * @description Get access control entries for a search app, enriched with display names
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
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
   * @description Bulk replace all access control entries for a search app
   * @param {Request} req - Express request with :id param and entries array in body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async setAppAccess(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      // Guard: require authentication for access control changes
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
   * @description Retrieve a search app by its UUID
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async getSearchApp(req: Request, res: Response): Promise<void> {
    try {
      const app = await searchService.getSearchApp(req.params.id!)

      // Guard: return 404 if search app does not exist
      if (!app) {
        res.status(404).json({ error: 'Search app not found' })
        return
      }

      // If user is not authenticated, only allow access to public apps
      if (!req.user && !app.is_public) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      res.json(app)
    } catch (error) {
      log.error('Error getting search app', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Update an existing search app configuration
   * @param {Request} req - Express request with :id param and update data in body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async updateSearchApp(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      // Guard: require authentication for search app updates
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const updated = await searchService.updateSearchApp(req.params.id!, req.body, userId)

      // Guard: return 404 if search app not found
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
   * @description Delete a search app by its UUID
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
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
      // Check public access for anonymous users
      const app = await searchService.getSearchApp(req.params.id!)
      if (!app) {
        res.status(404).json({ error: 'Search app not found' })
        return
      }
      if (!req.user && !app.is_public) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Set SSE headers for streaming
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      res.flushHeaders()

      // Delegate streaming to service
      // Extract tenant ID from request context for OpenSearch isolation
      const tenantId = getTenantId(req) || ''
      await searchService.askSearch(tenantId, req.params.id!, req.body, res)
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
      // Extract tenant ID from request context for OpenSearch isolation
      const tenantId = getTenantId(req) || ''
      const tree = await searchService.mindmap(tenantId, req.params.id!, req.body)
      res.json({ mindmap: tree })
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
      // Extract tenant ID from request context for OpenSearch isolation
      const tenantId = getTenantId(req) || ''
      const result = await searchService.retrievalTest(tenantId, req.params.id!, req.body)
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
   * @description Submit thumbs up/down feedback on a search answer.
   * Creates a feedback record with source='search' in the answer_feedback table.
   * @param {Request} req - Express request with :id param and feedback data in body
   * @param {Response} res - Express response
   * @returns {Promise<void>} 201 with created feedback record
   */
  async sendFeedback(req: Request, res: Response): Promise<void> {
    try {
      // Guard: ensure authenticated user context
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const searchAppId = req.params.id!
      const { thumbup, comment, query, answer, chunks_used, trace_id } = req.body

      // Extract tenant_id from user context (defaults to system tenant)
      const tenantId = (req.user as any)?.tenant_id || config.opensearch.systemTenantId

      // Create feedback with source='search' and the search app ID
      const feedback = await feedbackService.createFeedback({
        source: 'search',
        source_id: searchAppId,
        message_id: null,
        user_id: userId,
        thumbup,
        comment: comment || null,
        query,
        answer,
        chunks_used: chunks_used || null,
        trace_id: trace_id || null,
        tenant_id: tenantId,
      })

      res.status(201).json(feedback)
    } catch (error) {
      log.error('Error sending search feedback', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Execute a search query against a search app with pagination and filtering
   * @param {Request} req - Express request with :id param and search options in body
   * @param {Response} res - Express response with paginated results
   * @returns {Promise<void>}
   */
  async executeSearch(req: Request, res: Response): Promise<void> {
    try {
      // Check public access for anonymous users
      const app = await searchService.getSearchApp(req.params.id!)
      if (!app) {
        res.status(404).json({ error: 'Search app not found' })
        return
      }
      if (!req.user && !app.is_public) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const { query, top_k, method, similarity_threshold, vector_similarity_weight, page, page_size } = req.body

      // Execute search across configured datasets with pagination
      // Extract tenant ID from request context for OpenSearch isolation
      const tenantIdForSearch = getTenantId(req) || ''
      // Pass userId for analytics query logging (fire-and-forget)
      const result = await searchService.executeSearch(
        tenantIdForSearch,
        req.params.id!,
        query,
        {
          topK: top_k,
          method,
          similarityThreshold: similarity_threshold,
          vectorSimilarityWeight: vector_similarity_weight,
          page,
          pageSize: page_size,
          ...(req.session?.user?.id ? { userId: req.session.user.id } : {}),
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
