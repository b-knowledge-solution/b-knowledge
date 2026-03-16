/**
 * Zod validation schemas for the llm-provider module.
 * @module schemas/llm-provider
 */
import { z } from 'zod';

/**
 * All supported model types.
 * Vision support is handled via the `vision` boolean flag on chat models,
 * not as a separate model type.
 * @see https://ragflow.io/docs/references/model-providers
 */
export const MODEL_TYPES = [
  'chat',
  'embedding',
  'speech2text',
  'rerank',
  'tts',
] as const;

/** TypeScript type for the canonical model types */
export type ModelType = (typeof MODEL_TYPES)[number];

/** UUID v4 param schema */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

/** POST /api/llm-providers – body */
export const createProviderSchema = z.object({
  factory_name: z.string().min(1, 'Factory name is required').max(100),
  model_type: z.enum(MODEL_TYPES, {
    errorMap: () => ({
      message: `Model type must be one of: ${MODEL_TYPES.join(', ')}`,
    }),
  }),
  model_name: z.string().min(1, 'Model name is required').max(255),
  api_key: z.string().max(500).nullable().optional(),
  api_base: z.string().url().nullable().optional(),
  max_tokens: z.number().int().min(1).nullable().optional(),
  is_default: z.boolean().optional(),
  vision: z.boolean().optional(),
});

/** PUT /api/llm-providers/:id – body */
export const updateProviderSchema = createProviderSchema.partial();
