
/**
 * Zod validation schemas for chat conversation endpoints.
 * @module schemas/chat-conversation
 */
import { z } from 'zod'

/**
 * Schema for creating a new conversation.
 */
export const createConversationSchema = z.object({
  /** Name/title of the conversation */
  name: z.string().min(1, 'Name is required').max(256),
  /** Dialog ID this conversation belongs to */
  dialog_id: z.string().uuid('Invalid dialog ID format'),
})

/**
 * Schema for bulk deleting conversations.
 */
export const deleteConversationsSchema = z.object({
  /** Array of conversation IDs to delete */
  ids: z.array(z.string().uuid()).min(1, 'At least one conversation ID is required'),
})

/**
 * Schema for sending a chat completion request.
 */
export const chatCompletionSchema = z.object({
  /** User message text */
  content: z.string().min(1, 'Message content is required'),
  /** Dialog ID for the chat configuration */
  dialog_id: z.string().uuid('Invalid dialog ID').optional(),
})

/**
 * Schema for sending feedback on a message.
 */
export const feedbackSchema = z.object({
  /** Message ID to provide feedback on */
  message_id: z.string().min(1, 'Message ID is required'),
  /** Thumbs up (true) or thumbs down (false) */
  thumbup: z.boolean(),
  /** Optional text feedback */
  feedback: z.string().optional(),
})

/**
 * Schema for deleting a specific message.
 */
export const deleteMessageParamsSchema = z.object({
  /** Conversation ID */
  id: z.string().uuid('Invalid conversation ID'),
  /** Message ID to delete */
  msgId: z.string().min(1, 'Message ID is required'),
})

/**
 * Schema for UUID path param.
 */
export const conversationIdParamSchema = z.object({
  id: z.string().uuid('Invalid conversation ID'),
})

/**
 * Schema for text-to-speech request body.
 */
export const ttsSchema = z.object({
  /** Text to synthesize into speech */
  text: z.string().min(1, 'Text is required').max(5000, 'Text too long'),
  /** Voice name (e.g., "alloy", "echo", "fable") */
  voice: z.string().optional(),
  /** Speech speed multiplier (0.25-4.0) */
  speed: z.number().min(0.25).max(4.0).optional(),
  /** Audio output format */
  format: z.enum(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']).optional(),
})
