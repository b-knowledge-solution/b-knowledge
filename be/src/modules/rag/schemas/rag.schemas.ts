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

/** PUT /api/rag/datasets/:id/access – body */
export const datasetAccessSchema = z.object({
  public: z.boolean().optional(),
  team_ids: z.array(z.string().uuid()).optional().default([]),
  user_ids: z.array(z.string().uuid()).optional().default([]),
})

// ---------------------------------------------------------------------------
// Version schemas
// ---------------------------------------------------------------------------

/** UUID version param schema */
export const versionParamSchema = z.object({
  id: z.string().uuid('Invalid dataset UUID'),
  versionId: z.string().uuid('Invalid version UUID'),
})

/** POST /api/rag/datasets/:id/versions – body */
export const createVersionSchema = z.object({
  version_label: z.string().min(1, 'Version label is required').max(128),
  metadata: z.record(z.unknown()).optional(),
})

/** PUT /api/rag/datasets/:id/versions/:versionId – body */
export const updateVersionSchema = z.object({
  version_label: z.string().min(1).max(128).optional(),
  status: z.enum(['active', 'archived']).optional(),
  metadata: z.record(z.unknown()).optional(),
  ragflow_dataset_id: z.string().max(255).optional(),
  ragflow_dataset_name: z.string().max(255).optional(),
})

/** DELETE /api/rag/datasets/:id/versions/:versionId/documents – body */
export const bulkDeleteFilesSchema = z.object({
  file_ids: z.array(z.string().uuid()).min(1, 'At least one file ID is required'),
})

/** POST /api/rag/datasets/:id/search – body */
export const searchChunksSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  method: z.enum(['hybrid', 'semantic', 'full_text']).optional(),
  top_k: z.number().int().min(1).max(100).optional(),
  similarity_threshold: z.number().min(0).max(1).optional(),
});

// ---------------------------------------------------------------------------
// Dataset Settings schemas
// ---------------------------------------------------------------------------

/** PUT /api/rag/datasets/:id/settings – body */
export const updateDatasetSettingsSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  language: z.string().max(50).optional(),
  embedding_model: z.string().max(255).nullable().optional(),
  permission: z.enum(['me', 'team']).optional(),
  parser_id: z.string().max(50).optional(),
  parser_config: z.record(z.unknown()).optional(),
})

// ---------------------------------------------------------------------------
// Chunk Management schemas
// ---------------------------------------------------------------------------

/** POST /api/rag/datasets/:id/chunks – body (add manual chunk) */
export const createChunkSchema = z.object({
  content: z.string().min(1, 'Chunk content is required'),
  doc_id: z.string().optional(),
  important_keywords: z.array(z.string()).optional(),
})

/** PUT /api/rag/datasets/:id/chunks/:chunkId – body */
export const updateChunkSchema = z.object({
  content: z.string().min(1, 'Chunk content is required').optional(),
  important_keywords: z.array(z.string()).optional(),
  available: z.boolean().optional(),
})

/** Chunk ID param schema */
export const chunkParamSchema = z.object({
  id: z.string().uuid('Invalid dataset UUID'),
  chunkId: z.string().min(1, 'Chunk ID is required'),
})

// ---------------------------------------------------------------------------
// Document Toggle schema
// ---------------------------------------------------------------------------

/** Document param schema (dataset + document IDs) */
export const docParamSchema = z.object({
  id: z.string().uuid('Invalid dataset UUID'),
  docId: z.string().min(1, 'Document ID is required'),
})

/** PATCH /api/rag/datasets/:id/documents/:docId/toggle – body */
export const toggleDocumentSchema = z.object({
  available: z.boolean({ required_error: 'available (boolean) is required' }),
})

// ---------------------------------------------------------------------------
// Retrieval Test schema
// ---------------------------------------------------------------------------

/** POST /api/rag/datasets/:id/retrieval-test – body */
export const retrievalTestSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  method: z.enum(['hybrid', 'semantic', 'full_text']).optional().default('hybrid'),
  top_k: z.number().int().min(1).max(100).optional().default(5),
  similarity_threshold: z.number().min(0).max(1).optional().default(0.2),
  doc_ids: z.array(z.string()).optional(),
})
