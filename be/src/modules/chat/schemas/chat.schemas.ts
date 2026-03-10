/**
 * Zod validation schemas for the chat module.
 * @module schemas/chat
 */
import { z } from 'zod';

/** UUID v4 param schema */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

/** DELETE /api/chat-history/sessions – body (bulk delete) */
export const deleteSessionsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'At least one session ID is required'),
});
