/**
 * Zod validation schemas for the llm-provider module.
 * @module schemas/llm-provider
 */
import { z } from 'zod';

/** UUID v4 param schema */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

/** POST /api/llm-providers – body */
export const createProviderSchema = z.object({
  factory_name: z.string().min(1, 'Factory name is required').max(100),
  model_type: z.string().min(1, 'Model type is required').max(50),
  model_name: z.string().min(1, 'Model name is required').max(255),
  api_key: z.string().max(500).nullable().optional(),
  api_base: z.string().url().nullable().optional(),
  max_tokens: z.number().int().min(1).nullable().optional(),
  is_default: z.boolean().optional(),
});

/** PUT /api/llm-providers/:id – body */
export const updateProviderSchema = createProviderSchema.partial();
