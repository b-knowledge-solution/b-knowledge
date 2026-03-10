/**
 * Zod validation schemas for the broadcast module.
 * @module schemas/broadcast
 */
import { z } from 'zod';

/** UUID v4 param schema */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

/** POST /api/broadcast-messages – body */
export const createBroadcastSchema = z.object({
  message: z.string().min(1, 'Message is required').max(5000),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color').optional(),
  font_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color').optional(),
  is_active: z.boolean().optional(),
  is_dismissible: z.boolean().optional(),
});

/** PUT /api/broadcast-messages/:id – body */
export const updateBroadcastSchema = createBroadcastSchema.partial();
