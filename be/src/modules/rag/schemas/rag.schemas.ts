/**
 * Zod validation schemas for the RAG module.
 * @module schemas/rag
 */
import { z } from 'zod';

/** UUID v4 param schema */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

/** POST /api/rag/datasets – body */
export const createDatasetSchema = z.object({
  name: z.string().min(1, 'Dataset name is required').max(255),
  description: z.string().max(2000).optional(),
  language: z.string().max(50).optional(),
  embedding_model: z.string().max(255).optional(),
  parser_id: z.string().max(50).optional(),
  parser_config: z.record(z.unknown()).optional(),
  access_control: z.object({
    public: z.boolean().optional(),
    team_ids: z.array(z.string().uuid()).optional(),
    user_ids: z.array(z.string().uuid()).optional(),
  }).optional(),
});

/** PUT /api/rag/datasets/:id – body */
export const updateDatasetSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  language: z.string().max(50).optional(),
  embedding_model: z.string().max(255).nullable().optional(),
  parser_id: z.string().max(50).optional(),
  parser_config: z.record(z.unknown()).optional(),
  access_control: z.object({
    public: z.boolean().optional(),
    team_ids: z.array(z.string().uuid()).optional(),
    user_ids: z.array(z.string().uuid()).optional(),
  }).optional(),
});

/** POST /api/rag/datasets/:id/search – body */
export const searchChunksSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  method: z.enum(['hybrid', 'semantic', 'full_text']).optional(),
  top_k: z.number().int().min(1).max(100).optional(),
  similarity_threshold: z.number().min(0).max(1).optional(),
});
