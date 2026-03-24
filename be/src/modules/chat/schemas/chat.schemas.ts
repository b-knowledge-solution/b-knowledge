/**
 * Zod validation schemas for the chat module.
 * @module schemas/chat
 */
import { z } from 'zod'
import { hexId, hexIdWith } from '@/shared/utils/uuid.js'

/**
 * @description UUID v4 path parameter schema for generic resource lookups.
 */
export const uuidParamSchema = z.object({
  /** Resource UUID */
  id: hexIdWith('Invalid UUID format'),
})

/**
 * @description Schema for bulk deleting chat history sessions.
 * Validates an array of session UUIDs with minimum one entry.
 */
export const deleteSessionsSchema = z.object({
  /** Array of session UUIDs to delete */
  ids: z.array(hexId).min(1, 'At least one session ID is required'),
})
