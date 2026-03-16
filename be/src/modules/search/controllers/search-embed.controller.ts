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
 * Controller class for search embed endpoints.
 */
export class SearchEmbedController {
  // ============================================================================
  // Admin Token Management
  // ============================================================================

  /**
   * Create a new embed token for a search app.
   * @param req - Express request with :id param and { name, expires_at } in body
   * @param res - Express response
   */
  async createToken(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
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
   * List all embed tokens for a search app.
   * @param req - Express request with :id param
   * @param res - Express response
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
   * Revoke (delete) an embed token.
   * @param req - Express request with :tokenId param
   * @param res - Express response
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
   * Get public search app info for an embed token.
   * Returns app name and description only (no sensitive config).
   * @param req - Express request with :token param
   * @param res - Express response
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
   * Stream an AI-generated search answer via SSE for an embed token.
   * Public endpoint — no session auth required, uses token for authorization.
   * @param req - Express request with :token param and search query in body
   * @param res - Express response configured for SSE
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

      // Delegate to the search service (same pipeline as authenticated search)
      await searchService.askSearch(tokenRow.app_id as string, req.body, res)
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
}
