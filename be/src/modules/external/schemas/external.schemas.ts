/**
 * @fileoverview Zod validation schemas for the external API module.
 *   Covers API key CRUD and external evaluation endpoints.
 * @module schemas/external
 */

import { z } from 'zod'

// ============================================================================
// API Key CRUD Schemas
// ============================================================================

/**
 * @description Schema for creating a new API key
 */
export const createApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  scopes: z
    .array(z.enum(['chat', 'search', 'retrieval']))
    .min(1, 'At least one scope is required')
    .default(['chat', 'search', 'retrieval']),
  expires_at: z.string().datetime().nullable().optional(),
})

/**
 * @description Schema for updating an API key
 */
export const updateApiKeySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  scopes: z.array(z.enum(['chat', 'search', 'retrieval'])).min(1).optional(),
  is_active: z.boolean().optional(),
})

/**
 * @description Schema for UUID path parameter
 */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
})

// ============================================================================
// External Evaluation API Schemas
// ============================================================================

/**
 * @description Options for controlling retrieval and generation behavior
 */
const evaluationOptionsSchema = z.object({
  top_k: z.number().int().min(1).max(100).default(10),
  method: z.enum(['full_text', 'semantic', 'hybrid']).default('hybrid'),
  similarity_threshold: z.number().min(0).max(1).default(0.2),
  vector_similarity_weight: z.number().min(0).max(1).optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().int().min(1).max(32768).optional(),
  include_contexts: z.boolean().default(true),
  include_metadata: z.boolean().default(true),
}).partial().default({})

/**
 * @description Schema for the external chat evaluation endpoint
 */
export const externalChatSchema = z.object({
  query: z.string().min(1, 'Query is required').max(10000),
  assistant_id: z.string().uuid().optional(),
  dataset_ids: z.array(z.string().uuid()).optional(),
  options: evaluationOptionsSchema,
})

/**
 * @description Schema for the external search evaluation endpoint
 */
export const externalSearchSchema = z.object({
  query: z.string().min(1, 'Query is required').max(10000),
  search_app_id: z.string().uuid().optional(),
  dataset_ids: z.array(z.string().uuid()).optional(),
  options: evaluationOptionsSchema,
})

/**
 * @description Schema for the external retrieval-only endpoint
 */
export const externalRetrievalSchema = z.object({
  query: z.string().min(1, 'Query is required').max(10000),
  dataset_ids: z.array(z.string().uuid()).min(1, 'At least one dataset_id is required'),
  options: evaluationOptionsSchema,
})
