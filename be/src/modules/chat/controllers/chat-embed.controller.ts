
/**
 * @fileoverview Chat embed controller.
 * Handles HTTP requests for embed token CRUD (admin) and
 * public embed endpoints for external widget access.
 *
 * @module controllers/chat-embed
 */

import { Request, Response } from 'express'
import { log } from '@/shared/services/logger.service.js'
import { chatEmbedTokenService } from '@/shared/services/embed-token.service.js'
import { chatConversationService } from '../services/chat-conversation.service.js'
import { ModelFactory } from '@/shared/models/factory.js'

/**
 * Controller class for chat embed token endpoints.
 */
export class ChatEmbedController {
  // ==========================================================================
  // Admin endpoints (authenticated, manage_users permission)
  // ==========================================================================

  /**
   * Create a new embed token for a dialog.
   * @param req - Express request with :id param (dialog ID) and { name, expires_at } in body
   * @param res - Express response
   */
  async createToken(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const dialogId = req.params.id!

      // Verify assistant exists
      const assistant = await ModelFactory.chatAssistant.findById(dialogId)
      if (!assistant) {
        res.status(404).json({ error: 'Assistant not found' })
        return
      }

      // Parse optional expiration date
      const expiresAt = req.body.expires_at ? new Date(req.body.expires_at) : null

      // Create the token
      const token = await chatEmbedTokenService.createToken(
        dialogId,
        req.body.name,
        userId,
        expiresAt,
      )

      res.status(201).json(token)
    } catch (error) {
      log.error('Error creating embed token', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * List all embed tokens for a dialog.
   * Token values are masked for security.
   * @param req - Express request with :id param (dialog ID)
   * @param res - Express response
   */
  async listTokens(req: Request, res: Response): Promise<void> {
    try {
      const dialogId = req.params.id!
      const tokens = await chatEmbedTokenService.listTokens(dialogId)
      res.json(tokens)
    } catch (error) {
      log.error('Error listing embed tokens', { error: (error as Error).message })
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
      const { tokenId } = req.params

      await chatEmbedTokenService.revokeToken(tokenId!)
      res.status(204).send()
    } catch (error) {
      log.error('Error revoking embed token', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  // ==========================================================================
  // Public embed endpoints (API key auth via token)
  // ==========================================================================

  /**
   * Get dialog info for the embed widget (public, token-based).
   * Returns dialog name, icon, and prologue for widget display.
   * @param req - Express request with :token param
   * @param res - Express response
   */
  async getInfo(req: Request, res: Response): Promise<void> {
    try {
      const tokenStr = req.params.token!

      // Validate the token
      const tokenRow = await chatEmbedTokenService.validateToken(tokenStr)
      if (!tokenRow) {
        res.status(401).json({ error: 'Invalid or expired embed token' })
        return
      }

      // Fetch the assistant
      const assistant = await ModelFactory.chatAssistant.findById(tokenRow.dialog_id as string)
      if (!assistant) {
        res.status(404).json({ error: 'Assistant not found' })
        return
      }

      // Return only public-safe info
      const promptConfig = assistant.prompt_config as Record<string, unknown>
      res.json({
        name: assistant.name,
        icon: assistant.icon ?? null,
        description: assistant.description ?? null,
        prologue: promptConfig?.prologue ?? null,
      })
    } catch (error) {
      log.error('Error getting embed info', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Create an anonymous session for the embed widget (public, token-based).
   * @param req - Express request with :token param and optional { name } in body
   * @param res - Express response
   */
  async createSession(req: Request, res: Response): Promise<void> {
    try {
      const tokenStr = req.params.token!

      // Validate the token
      const tokenRow = await chatEmbedTokenService.validateToken(tokenStr)
      if (!tokenRow) {
        res.status(401).json({ error: 'Invalid or expired embed token' })
        return
      }

      // Create a session using a synthetic user ID for anonymous embed users
      const syntheticUserId = `embed:${tokenRow.id}`
      const dialogId = tokenRow.dialog_id as string
      const sessionName = req.body?.name || 'Widget Session'

      const session = await chatConversationService.createConversation(
        dialogId,
        sessionName,
        syntheticUserId,
      )

      res.status(201).json(session)
    } catch (error) {
      log.error('Error creating embed session', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Stream a chat completion via SSE for the embed widget (public, token-based).
   * Validates the token, resolves the dialog, and delegates to the existing
   * chat conversation service for RAG retrieval and LLM streaming.
   * @param req - Express request with :token param and { content, session_id } in body
   * @param res - Express response (SSE stream)
   */
  async streamCompletion(req: Request, res: Response): Promise<void> {
    try {
      const tokenStr = req.params.token!

      // Validate the token
      const tokenRow = await chatEmbedTokenService.validateToken(tokenStr)
      if (!tokenRow) {
        res.status(401).json({ error: 'Invalid or expired embed token' })
        return
      }

      const dialogId = tokenRow.dialog_id as string
      const { content, session_id } = req.body

      // Use synthetic user ID for anonymous embed users
      const syntheticUserId = `embed:${tokenRow.id}`

      // If no session_id provided, create a new session automatically
      let sessionId = session_id
      if (!sessionId) {
        const session = await chatConversationService.createConversation(
          dialogId,
          content.slice(0, 100),
          syntheticUserId,
        )
        sessionId = session.id
      }

      // Delegate to the existing streaming chat pipeline
      await chatConversationService.streamChat(
        sessionId,
        content,
        dialogId,
        syntheticUserId,
        res,
      )
    } catch (error) {
      log.error('Error in embed stream completion', { error: (error as Error).message })
      // Only send error if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' })
      }
    }
  }
}
