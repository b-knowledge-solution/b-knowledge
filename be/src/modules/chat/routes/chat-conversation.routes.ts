
/**
 * @fileoverview Chat conversation routes.
 * Defines endpoints for conversation CRUD, message management, and streaming chat.
 *
 * @module routes/chat-conversation
 */
import { Router } from 'express'
import { ChatConversationController } from '../controllers/chat-conversation.controller.js'
import { requireAuth, checkSession, requirePermission, requireAbility } from '@/shared/middleware/auth.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import {
  createConversationSchema,
  deleteConversationsSchema,
  chatCompletionSchema,
  feedbackSchema,
  conversationIdParamSchema,
  deleteMessageParamsSchema,
  renameConversationSchema,
  ttsSchema,
} from '../schemas/chat-conversation.schemas.js'

const router = Router()
const controller = new ChatConversationController()

/**
 * @route POST /api/chat/conversations
 * @description Create a new conversation for a dialog.
 * @access Private
 */
router.post(
  '/conversations',
  checkSession,
  requirePermission('chat.create'),
  validate(createConversationSchema),
  controller.createConversation.bind(controller)
)

/**
 * @route GET /api/chat/conversations/:id
 * @description Get a conversation by ID.
 * @access Private
 */
router.get(
  '/conversations/:id',
  checkSession,
  validate({ params: conversationIdParamSchema }),
  controller.getConversation.bind(controller)
)

/**
 * @route GET /api/chat/conversations
 * @description List conversations for a dialog (query: dialogId).
 * @access Private
 */
router.get(
  '/conversations',
  checkSession,
  controller.listConversations.bind(controller)
)

/**
 * @route PATCH /api/chat/conversations/:id
 * @description Rename a conversation.
 * @access Private
 */
router.patch(
  '/conversations/:id',
  requireAuth,
  requireAbility('update', 'ChatAssistant', 'id'),
  validate({ body: renameConversationSchema, params: conversationIdParamSchema }),
  controller.renameConversation.bind(controller)
)

/**
 * @route DELETE /api/chat/conversations
 * @description Bulk delete conversations.
 * @access Private
 */
router.delete(
  '/conversations',
  requireAuth,
  requirePermission('chat.delete'),
  validate(deleteConversationsSchema),
  controller.deleteConversations.bind(controller)
)

/**
 * @route DELETE /api/chat/conversations/:id/messages/:msgId
 * @description Delete a specific message from a conversation.
 * @access Private
 */
router.delete(
  '/conversations/:id/messages/:msgId',
  requireAuth,
  requireAbility('delete', 'ChatAssistant', 'id'),
  validate({ params: deleteMessageParamsSchema }),
  controller.deleteMessage.bind(controller)
)

/**
 * @route POST /api/chat/conversations/:id/completion
 * @description Stream a chat completion response via SSE.
 * @access Private
 */
router.post(
  '/conversations/:id/completion',
  checkSession,
  requireAbility('read', 'ChatAssistant', 'id'),
  validate({ body: chatCompletionSchema, params: conversationIdParamSchema }),
  controller.streamChat.bind(controller)
)

/**
 * @route POST /api/chat/conversations/:id/feedback
 * @description Send thumbs up/down feedback on a message.
 * @access Private
 */
router.post(
  '/conversations/:id/feedback',
  checkSession,
  requireAbility('read', 'ChatAssistant', 'id'),
  validate({ body: feedbackSchema, params: conversationIdParamSchema }),
  controller.sendFeedback.bind(controller)
)

/**
 * @route POST /api/chat/tts
 * @description Convert text to speech audio stream.
 * @access Private
 */
router.post(
  '/tts',
  checkSession,
  requirePermission('chat.view'),
  validate({ body: ttsSchema }),
  controller.textToSpeech.bind(controller)
)

export default router
