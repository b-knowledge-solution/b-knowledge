
/**
 * Zod validation schemas for chat conversation endpoints.
 * @module schemas/chat-conversation
 */
import { z } from 'zod'

/**
 * @description Schema for creating a new conversation.
 * Requires a name and valid dialog (assistant) UUID.
 */
export const createConversationSchema = z.object({
  /** Name/title of the conversation */
  name: z.string().min(1, 'Name is required').max(256),
  /** Dialog ID this conversation belongs to */
  dialog_id: z.string().uuid('Invalid dialog ID format'),
})

/**
 * @description Schema for bulk deleting conversations.
 * Requires at least one conversation UUID.
 */
export const deleteConversationsSchema = z.object({
  /** Array of conversation IDs to delete */
  ids: z.array(z.string().uuid()).min(1, 'At least one conversation ID is required'),
})

/**
 * @description Schema for sending a chat completion request.
 * Supports per-message overrides for variables, filtering, and LLM settings.
 */
export const chatCompletionSchema = z.object({
  /** User message text */
  content: z.string().min(1, 'Message content is required'),
  /** Dialog ID for the chat configuration */
  dialog_id: z.string().uuid('Invalid dialog ID').optional(),
  /** Custom prompt variable values (key → value map) */
  variables: z.record(z.string(), z.string()).optional(),
  /** Per-message metadata filter conditions for RAG search */
  metadata_condition: z.object({
    /** Logical operator to combine conditions */
    logic: z.enum(['and', 'or']).default('and'),
    /** Array of filter conditions */
    conditions: z.array(z.object({
      /** Field name in the OpenSearch document metadata */
      name: z.string().min(1),
      /** Comparison operator */
      comparison_operator: z.enum(['is', 'is_not', 'contains', 'gt', 'lt', 'range']),
      /** Value to compare against */
      value: z.union([z.string(), z.number(), z.tuple([z.number(), z.number()])]),
    })).max(20),
  }).optional(),
  /** Document IDs to restrict RAG search to specific documents */
  doc_ids: z.array(z.string()).max(50).optional(),
  /** Per-message LLM provider override */
  llm_id: z.string().max(128).optional(),
  /** Per-message temperature override */
  temperature: z.number().min(0).max(2).optional(),
  /** Per-message max tokens override */
  max_tokens: z.number().int().min(1).max(128000).optional(),
  /** File attachment IDs from chat file uploads */
  file_ids: z.array(z.string().uuid()).max(5).optional(),
})

/**
 * @description Schema for sending feedback on a message.
 * Validates message ID and thumbs up/down boolean.
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
 * @description Schema for deleting a specific message.
 * Validates both conversation ID and message ID path params.
 */
export const deleteMessageParamsSchema = z.object({
  /** Conversation ID */
  id: z.string().uuid('Invalid conversation ID'),
  /** Message ID to delete */
  msgId: z.string().min(1, 'Message ID is required'),
})

/**
 * @description Schema for conversation UUID path param.
 */
export const conversationIdParamSchema = z.object({
  id: z.string().uuid('Invalid conversation ID'),
})

/**
 * @description Schema for renaming a conversation.
 */
export const renameConversationSchema = z.object({
  /** New name/title for the conversation */
  name: z.string().min(1, 'Name is required').max(256),
})

/**
 * @description Schema for text-to-speech request body.
 * Validates text content and optional voice/speed/format parameters.
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
