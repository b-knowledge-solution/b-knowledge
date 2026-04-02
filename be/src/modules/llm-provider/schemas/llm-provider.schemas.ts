/**
 * Zod validation schemas for the llm-provider module.
 * @module schemas/llm-provider
 */
import { z } from 'zod';

/**
 * @description All supported model types. Vision-capable chat models get a
 * paired `image2text` row auto-created by the service layer.
 * @see https://ragflow.io/docs/references/model-providers
 */
export const MODEL_TYPES = [
  'chat',
  'embedding',
  'image2text',
  'speech2text',
  'rerank',
  'tts',
] as const;

/**
 * @description TypeScript type for the canonical model types
 */
export type ModelType = (typeof MODEL_TYPES)[number];

/**
 * @description UUID v4 param validation schema for route parameters
 */
export const uuidParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{32}$|^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, 'Invalid UUID format'),
});

/**
 * @description Validation schema for creating a new LLM provider configuration
 */
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

/**
 * @description Validation schema for updating an LLM provider configuration (all fields optional)
 */
export const updateProviderSchema = createProviderSchema.partial();
