
/**
 * @fileoverview Chat conversation controller.
 * Handles HTTP requests for conversation CRUD and streaming chat.
 * All operations are local — no RAGFlow API dependency.
 *
 * @module controllers/chat-conversation
 */

import { Request, Response } from 'express'
import { log } from '@/shared/services/logger.service.js'
import { chatConversationService } from '../services/chat-conversation.service.js'
import { ttsService } from '@/shared/services/tts.service.js'

/**
 * Controller class for chat conversation endpoints.
 */
export class ChatConversationController {
  /**
   * Create a new conversation.
   * @param req - Express request with { name, dialog_id } in body
   * @param res - Express response
   */
  async createConversation(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const { name, dialog_id } = req.body

      // Create conversation in local DB
      const session = await chatConversationService.createConversation(dialog_id, name, userId)
      res.status(201).json(session)
    } catch (error) {
      log.error('Error creating conversation', { error: (error as Error).message })
      res.status(500).json({ error: (error as Error).message })
    }
  }

  /**
   * Get a conversation by ID with its messages.
   * @param req - Express request with :id param
   * @param res - Express response
   */
  async getConversation(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const { id } = req.params

      // Fetch conversation with messages from local DB
      const result = await chatConversationService.getConversation(id!, userId)
      if (!result) {
        res.status(404).json({ error: 'Conversation not found' })
        return
      }
      res.json(result)
    } catch (error) {
      log.error('Error getting conversation', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * List conversations for a dialog.
   * @param req - Express request with dialogId query param
   * @param res - Express response
   */
  async listConversations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const dialogId = req.query.dialogId as string

      if (!dialogId) {
        res.status(400).json({ error: 'dialogId query parameter is required' })
        return
      }

      // List conversations from local DB filtered by user
      const result = await chatConversationService.listConversations(dialogId, userId)
      res.json(result)
    } catch (error) {
      log.error('Error listing conversations', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Bulk delete conversations.
   * @param req - Express request with { ids } in body
   * @param res - Express response
   */
  async deleteConversations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const { ids } = req.body

      // Delete from local DB only
      const deleted = await chatConversationService.deleteConversations(ids, userId)
      res.json({ deleted })
    } catch (error) {
      log.error('Error deleting conversations', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Delete a specific message from a conversation.
   * @param req - Express request with :id and :msgId params
   * @param res - Express response
   */
  async deleteMessage(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const { id, msgId } = req.params

      // Delete message from local DB
      const deleted = await chatConversationService.deleteMessage(id!, msgId!, userId)
      if (!deleted) {
        res.status(404).json({ error: 'Message not found' })
        return
      }
      res.status(204).send()
    } catch (error) {
      log.error('Error deleting message', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Stream a chat completion response via SSE.
   * @param req - Express request with { content, dialog_id } in body
   * @param res - Express response (SSE stream)
   */
  async streamChat(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const { id } = req.params
      const { content, dialog_id } = req.body

      // Delegate to service which handles RAG retrieval, LLM streaming, and local storage
      await chatConversationService.streamChat(id!, content, dialog_id, userId, res)
    } catch (error) {
      log.error('Error in stream chat', { error: (error as Error).message })
      // Only send error if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' })
      }
    }
  }

  /**
   * Send feedback (thumbs up/down) on a message.
   * @param req - Express request with { message_id, thumbup, feedback } in body
   * @param res - Express response
   */
  async sendFeedback(req: Request, res: Response): Promise<void> {
    try {
      const { message_id, thumbup, feedback } = req.body

      // Store feedback locally
      await chatConversationService.sendFeedback(message_id, thumbup, feedback)
      res.json({ success: true })
    } catch (error) {
      log.error('Error sending feedback', { error: (error as Error).message })
      res.status(500).json({ error: (error as Error).message })
    }
  }

  /**
   * Convert text to speech audio.
   * Streams audio response using the configured TTS provider.
   * @param req - Express request with { text, voice?, speed?, format? } in body
   * @param res - Express response (audio stream)
   */
  async textToSpeech(req: Request, res: Response): Promise<void> {
    try {
      const { text, voice, speed, format } = req.body

      // Determine the audio content type from the requested format
      const audioFormat = format || 'mp3'
      const contentType = audioFormat === 'mp3' ? 'audio/mpeg'
        : audioFormat === 'wav' ? 'audio/wav'
        : audioFormat === 'pcm' ? 'audio/pcm'
        : `audio/${audioFormat}`

      // Set response headers for audio streaming
      res.setHeader('Content-Type', contentType)
      res.setHeader('Transfer-Encoding', 'chunked')

      // Stream audio chunks from the TTS service
      for await (const chunk of ttsService.synthesize(text, { voice, speed, format: audioFormat })) {
        res.write(chunk)
      }

      // End the response after all chunks are sent
      res.end()
    } catch (error) {
      log.error('Error in text-to-speech', { error: (error as Error).message })
      // Only send error if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).json({ error: (error as Error).message })
      } else {
        res.end()
      }
    }
  }
}
