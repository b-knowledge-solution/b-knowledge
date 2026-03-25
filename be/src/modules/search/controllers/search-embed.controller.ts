/**
 * @fileoverview Controller for search embed/widget endpoints.
 * Handles token management (admin) and public embed search execution.
 *
 * @module controllers/search-embed
 */

import { Request, Response } from 'express'
import { log } from '@/shared/services/logger.service.js'
import { searchEmbedTokenService } from '@/shared/services/embed-token.service.js'
import { searchService } from '../services/search.service.js'
import { ModelFactory } from '@/shared/models/factory.js'

/**
 * @description Allowlist of search_config keys safe to expose via the public embed config endpoint.
 *   Sensitive fields like api_key or internal provider details are excluded.
 */
const ALLOWED_CONFIG_KEYS = [
  'search_method', 'top_k', 'similarity_threshold', 'vector_similarity_weight',
  'rerank_id', 'rerank_top_k', 'llm_id', 'llm_setting',
  'enable_summary', 'enable_related_questions', 'enable_mindmap',
  'highlight', 'keyword', 'use_kg', 'web_search', 'cross_languages',
  'metadata_filter',
] as const

/**
 * @description Controller handling search embed/widget endpoints including
 *   admin token management and public token-authenticated search execution
 */
export class SearchEmbedController {
  // ============================================================================
  // Admin Token Management
  // ============================================================================

  /**
   * @description Create a new embed token for a search app (admin only)
   * @param {Request} req - Express request with :id param and { name, expires_at } in body
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async createToken(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      // Guard: require authentication for token creation
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const appId = req.params.id!
      const { name, expires_at } = req.body

      // Verify the search app exists
      const app = await ModelFactory.searchApp.findById(appId)
      if (!app) {
        res.status(404).json({ error: 'Search app not found' })
        return
      }

      // Create the token
      const expiresDate = expires_at ? new Date(expires_at) : null
      const token = await searchEmbedTokenService.createToken(appId, name, userId, expiresDate)

      res.status(201).json(token)
    } catch (error) {
      log.error('Error creating search embed token', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description List all embed tokens for a search app with masked values
   * @param {Request} req - Express request with :id param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async listTokens(req: Request, res: Response): Promise<void> {
    try {
      const appId = req.params.id!

      // Verify the search app exists
      const app = await ModelFactory.searchApp.findById(appId)
      if (!app) {
        res.status(404).json({ error: 'Search app not found' })
        return
      }

      // Service masks token values automatically for security
      const tokens = await searchEmbedTokenService.listTokens(appId)
      res.json(tokens)
    } catch (error) {
      log.error('Error listing search embed tokens', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Revoke (permanently delete) an embed token
   * @param {Request} req - Express request with :tokenId param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async revokeToken(req: Request, res: Response): Promise<void> {
    try {
      const tokenId = req.params.tokenId!

      // Verify the token exists
      const token = await searchEmbedTokenService.findById(tokenId)
      if (!token) {
        res.status(404).json({ error: 'Token not found' })
        return
      }

      await searchEmbedTokenService.revokeToken(tokenId)
      res.status(204).send()
    } catch (error) {
      log.error('Error revoking search embed token', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  // ============================================================================
  // Public Embed Endpoints (token-based auth)
  // ============================================================================

  /**
   * @description Get public search app info for an embed token, returning only name and description
   * @param {Request} req - Express request with :token param
   * @param {Response} res - Express response
   * @returns {Promise<void>}
   */
  async getInfo(req: Request, res: Response): Promise<void> {
    try {
      const tokenString = req.params.token!

      // Validate the token
      const tokenRow = await searchEmbedTokenService.validateToken(tokenString)
      if (!tokenRow) {
        res.status(401).json({ error: 'Invalid or expired token' })
        return
      }

      // Load the search app
      const app = await ModelFactory.searchApp.findById(tokenRow.app_id as string)
      if (!app) {
        res.status(404).json({ error: 'Search app not found' })
        return
      }

      // Return only public-safe info
      res.json({
        name: app.name,
        description: app.description,
      })
    } catch (error) {
      log.error('Error getting search embed info', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Get public search app config for an embed token.
   *   Returns name, description, avatar, empty_response, and an allowlisted subset of search_config.
   * @param {Request} req - Express request with :token param
   * @param {Response} res - Express response with filtered config
   * @returns {Promise<void>}
   */
  async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const tokenString = req.params.token!

      // Validate the token
      const tokenRow = await searchEmbedTokenService.validateToken(tokenString)
      if (!tokenRow) {
        res.status(401).json({ error: 'Invalid or expired token' })
        return
      }

      // Load the search app
      const app = await ModelFactory.searchApp.findById(tokenRow.app_id as string)
      if (!app) {
        res.status(404).json({ error: 'Search app not found' })
        return
      }

      // Strip sensitive fields from search_config using allowlist
      const rawConfig = (app.search_config as Record<string, unknown>) || {}
      const filteredConfig: Record<string, unknown> = {}
      for (const key of ALLOWED_CONFIG_KEYS) {
        if (key in rawConfig) {
          filteredConfig[key] = rawConfig[key]
        }
      }

      // Return public-safe config
      res.json({
        name: app.name,
        description: app.description,
        avatar: app.avatar ?? null,
        empty_response: app.empty_response ?? null,
        search_config: filteredConfig,
      })
    } catch (error) {
      log.error('Error getting search embed config', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Execute a non-streaming search query via embed token.
   *   Validates the token, resolves the tenant, and delegates to searchService.executeSearch.
   * @param {Request} req - Express request with :token param and search query in body
   * @param {Response} res - Express response with paginated search results
   * @returns {Promise<void>}
   */
  async executeSearch(req: Request, res: Response): Promise<void> {
    try {
      const tokenString = req.params.token!

      // Validate the token
      const tokenRow = await searchEmbedTokenService.validateToken(tokenString)
      if (!tokenRow) {
        res.status(401).json({ error: 'Invalid or expired token' })
        return
      }

      // Load app to resolve tenant ID
      const app = await ModelFactory.searchApp.findById(tokenRow.app_id as string)
      if (!app) {
        res.status(404).json({ error: 'Search app not found' })
        return
      }

      // Use app creator as tenant context for embed searches
      const tenantId = app.created_by ?? ''

      const {
        query,
        top_k,
        method,
        similarity_threshold,
        vector_similarity_weight,
        metadata_filter,
        page,
        page_size,
      } = req.body

      // Delegate to search service with embed-resolved tenant ID
      const result = await searchService.executeSearch(
        tenantId,
        tokenRow.app_id as string,
        query,
        {
          topK: top_k,
          method,
          similarityThreshold: similarity_threshold,
          vectorSimilarityWeight: vector_similarity_weight,
          metadataFilter: metadata_filter,
          page,
          pageSize: page_size,
        }
      )

      res.json(result)
    } catch (error) {
      const errMsg = (error as Error).message

      if (errMsg === 'Search app not found') {
        res.status(404).json({ error: errMsg })
        return
      }

      log.error('Error in embed executeSearch', { error: errMsg })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Stream an AI-generated search answer via SSE for an embed token.
   *   Public endpoint using token-based authorization instead of session auth.
   * @param {Request} req - Express request with :token param and search query in body
   * @param {Response} res - Express response configured for SSE
   * @returns {Promise<void>}
   */
  async askSearch(req: Request, res: Response): Promise<void> {
    try {
      const tokenString = req.params.token!

      // Validate the token
      const tokenRow = await searchEmbedTokenService.validateToken(tokenString)
      if (!tokenRow) {
        res.status(401).json({ error: 'Invalid or expired token' })
        return
      }

      // Set SSE headers for streaming
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      res.flushHeaders()

      // Resolve tenant from app creator for proper multi-tenant isolation
      const app = await ModelFactory.searchApp.findById(tokenRow.app_id as string)
      if (!app) {
        res.write(`data: ${JSON.stringify({ error: 'Search app not found' })}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }
      const tenantId = app.created_by ?? ''

      // Delegate to the search service (same pipeline as authenticated search)
      await searchService.askSearch(tenantId, tokenRow.app_id as string, req.body, res)
    } catch (error) {
      const errMsg = (error as Error).message

      // If headers already sent, send error via SSE
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }

      log.error('Error in embed askSearch', { error: errMsg })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Generate related questions for a search query via embed token.
   *   Validates the token and delegates to searchService.relatedQuestions.
   * @param {Request} req - Express request with :token param and { query } in body
   * @param {Response} res - Express response with array of related questions
   * @returns {Promise<void>}
   */
  async relatedQuestions(req: Request, res: Response): Promise<void> {
    try {
      const tokenString = req.params.token!

      // Validate the token
      const tokenRow = await searchEmbedTokenService.validateToken(tokenString)
      if (!tokenRow) {
        res.status(401).json({ error: 'Invalid or expired token' })
        return
      }

      const { query } = req.body

      // Delegate to search service for related question generation
      const questions = await searchService.relatedQuestions(tokenRow.app_id as string, query)
      res.json({ questions })
    } catch (error) {
      const errMsg = (error as Error).message

      if (errMsg === 'Search app not found') {
        res.status(404).json({ error: errMsg })
        return
      }

      log.error('Error generating embed related questions', { error: errMsg })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @description Generate a mind map JSON tree from search results via embed token.
   *   Validates the token, resolves tenant, and delegates to searchService.mindmap.
   * @param {Request} req - Express request with :token param and mindmap query in body
   * @param {Response} res - Express response with hierarchical JSON mindmap
   * @returns {Promise<void>}
   */
  async mindmap(req: Request, res: Response): Promise<void> {
    try {
      const tokenString = req.params.token!

      // Validate the token
      const tokenRow = await searchEmbedTokenService.validateToken(tokenString)
      if (!tokenRow) {
        res.status(401).json({ error: 'Invalid or expired token' })
        return
      }

      // Load app to resolve tenant ID
      const app = await ModelFactory.searchApp.findById(tokenRow.app_id as string)
      if (!app) {
        res.status(404).json({ error: 'Search app not found' })
        return
      }

      // Use app creator as tenant context for embed mindmap
      const tenantId = app.created_by ?? ''

      // Delegate to search service for mindmap generation
      const tree = await searchService.mindmap(tenantId, tokenRow.app_id as string, req.body)
      res.json({ mindmap: tree })
    } catch (error) {
      const errMsg = (error as Error).message

      if (errMsg === 'Search app not found') {
        res.status(404).json({ error: errMsg })
        return
      }

      log.error('Error generating embed mindmap', { error: errMsg })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
