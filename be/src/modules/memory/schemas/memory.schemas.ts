/**
 * @fileoverview Zod validation schemas for the Memory module.
 *
 * Each schema validates request params, body, or query for a specific memory endpoint.
 * Used with the `validate()` middleware to enforce input constraints.
 *
 * @module modules/memory/schemas/memory
 */
import { z } from 'zod'
import { hexId } from '@/shared/utils/uuid.js'

/** @description POST /api/memories — body schema for memory pool creation */
export const createMemorySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  // Bitmask 1-15: RAW=1, SEMANTIC=2, EPISODIC=4, PROCEDURAL=8
  memory_type: z.number().int().min(1).max(15).default(15),
  storage_type: z.enum(['table', 'graph']).default('table'),
  // Memory pool size in bytes (min 1 byte, practical default 5MB)
  memory_size: z.number().int().min(1).default(5242880),
  embd_id: z.string().max(255).optional(),
  llm_id: z.string().max(255).optional(),
  temperature: z.number().min(0).max(2).default(0.1),
  system_prompt: z.string().max(10000).optional(),
  user_prompt: z.string().max(10000).optional(),
  extraction_mode: z.enum(['batch', 'realtime']).default('batch'),
  permission: z.enum(['me', 'team']).default('me'),
  scope_type: z.enum(['user', 'agent', 'team']).default('user'),
  scope_id: hexId.optional(),
})

/** @description PUT /api/memories/:id — body schema for memory pool update (all fields optional) */
export const updateMemorySchema = createMemorySchema.partial()

/** @description GET /api/memories/:id/messages — query schema for paginated message listing */
export const queryMemoryMessagesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().max(255).optional(),
  // Filter by memory message type bitmask value
  message_type: z.coerce.number().int().min(1).max(8).optional(),
})

/** @description UUID path parameter schema — validates :id param */
export const memoryIdParamSchema = z.object({
  id: hexId,
})

/** @description POST /api/memories/:id/import — body schema for importing chat history */
export const importHistorySchema = z.object({
  session_id: hexId,
})

/** @description POST /api/memories/:id/messages — body schema for direct message insertion */
export const addMessageSchema = z.object({
  content: z.string().min(1).max(50000),
  // Memory type bitmask value: RAW=1, SEMANTIC=2, EPISODIC=4, PROCEDURAL=8
  message_type: z.number().int().min(1).max(8).default(1),
})

/** @description Inferred types for service layer consumption */
export type CreateMemoryDto = z.infer<typeof createMemorySchema>
export type UpdateMemoryDto = z.infer<typeof updateMemorySchema>
export type QueryMemoryMessagesDto = z.infer<typeof queryMemoryMessagesSchema>
