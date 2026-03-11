/**
 * Zod validation schemas for the knowledge-base module.
 * @module schemas/knowledge-base
 */
import { z } from 'zod';

/** UUID v4 param schema */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

/** POST /api/knowledge-base/sources – body */
export const createSourceSchema = z.object({
  type: z.string().min(1, 'Type is required').max(50),
  name: z.string().min(1, 'Name is required').max(255),
  url: z.string().url('Invalid URL'),
  description: z.string().max(2000).nullable().optional(),
  share_id: z.string().max(255).nullable().optional(),
  chat_widget_url: z.string().url().nullable().optional(),
  access_control: z.object({
    public: z.boolean().optional(),
    team_ids: z.array(z.string().uuid()).optional(),
    user_ids: z.array(z.string().uuid()).optional(),
  }).optional(),
});

/** PUT /api/knowledge-base/sources/:id – body */
export const updateSourceSchema = createSourceSchema.partial();
