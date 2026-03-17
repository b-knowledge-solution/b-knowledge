/**
 * Zod validation schemas for the chat module.
 * @module schemas/chat
 */
import { z } from 'zod'

/**
 * @description UUID v4 path parameter schema for generic resource lookups.
 */
export const uuidParamSchema = z.object({
  /** Resource UUID */
  id: z.string().uuid('Invalid UUID format'),
})

/**
 * @description Schema for bulk deleting chat history sessions.
 * Validates an array of session UUIDs with minimum one entry.
 */
export const deleteSessionsSchema = z.object({
  /** Array of session UUIDs to delete */
  ids: z.array(z.string().uuid()).min(1, 'At least one session ID is required'),
})
