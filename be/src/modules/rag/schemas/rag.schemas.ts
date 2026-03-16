/**
 * @fileoverview Zod validation schemas for the RAG module.
 *
 * Each schema validates request params, body, or query for a specific endpoint.
 * Used with the `validate()` middleware to enforce input constraints.
 *
 * @module modules/rag/schemas/rag
 */
import { z } from 'zod';

/** @description UUID v4 path parameter schema — validates :id param */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

/** @description POST /api/rag/datasets — body schema for dataset creation */
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
  pagerank: z.number().int().min(0).optional(),
});

/** @description PUT /api/rag/datasets/:id — body schema for dataset update (all fields optional) */
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
  pagerank: z.number().int().min(0).optional(),
});

/** @description PUT /api/rag/datasets/:id/access — body schema for access control update */
export const datasetAccessSchema = z.object({
  public: z.boolean().optional(),
  team_ids: z.array(z.string().uuid()).optional().default([]),
  user_ids: z.array(z.string().uuid()).optional().default([]),
})

// ---------------------------------------------------------------------------
// Version schemas
// ---------------------------------------------------------------------------

/** @description UUID version path parameter schema — validates :id and :versionId params */
export const versionParamSchema = z.object({
  id: z.string().uuid('Invalid dataset UUID'),
  versionId: z.string().uuid('Invalid version UUID'),
})

/** @description POST /api/rag/datasets/:id/versions — body schema for version creation */
export const createVersionSchema = z.object({
  version_label: z.string().min(1, 'Version label is required').max(128),
  metadata: z.record(z.unknown()).optional(),
})

/** @description PUT /api/rag/datasets/:id/versions/:versionId — body schema for version update */
export const updateVersionSchema = z.object({
  version_label: z.string().min(1).max(128).optional(),
  status: z.enum(['active', 'archived']).optional(),
  metadata: z.record(z.unknown()).optional(),
  ragflow_dataset_id: z.string().max(255).optional(),
  ragflow_dataset_name: z.string().max(255).optional(),
})

/** @description DELETE /api/rag/datasets/:id/versions/:versionId/documents — body schema for bulk file deletion */
export const bulkDeleteFilesSchema = z.object({
  file_ids: z.array(z.string().uuid()).min(1, 'At least one file ID is required'),
})

/** @description POST /api/rag/datasets/:id/search — body schema for chunk search */
export const searchChunksSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  method: z.enum(['hybrid', 'semantic', 'full_text']).optional(),
  top_k: z.number().int().min(1).max(100).optional(),
  similarity_threshold: z.number().min(0).max(1).optional(),
});

// ---------------------------------------------------------------------------
// Dataset Settings schemas
// ---------------------------------------------------------------------------

/** @description PUT /api/rag/datasets/:id/settings — body schema for dataset settings update */
export const updateDatasetSettingsSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  language: z.string().max(50).optional(),
  embedding_model: z.string().max(255).nullable().optional(),
  permission: z.enum(['me', 'team']).optional(),
  parser_id: z.string().max(50).optional(),
  parser_config: z.record(z.unknown()).optional(),
  pagerank: z.number().int().min(0).optional(),
})

// ---------------------------------------------------------------------------
// Chunk Management schemas
// ---------------------------------------------------------------------------

/** @description POST /api/rag/datasets/:id/chunks — body schema for manual chunk creation */
export const createChunkSchema = z.object({
  content: z.string().min(1, 'Chunk content is required'),
  doc_id: z.string().optional(),
  important_keywords: z.array(z.string()).optional(),
})

/** @description PUT /api/rag/datasets/:id/chunks/:chunkId — body schema for chunk update */
export const updateChunkSchema = z.object({
  content: z.string().min(1, 'Chunk content is required').optional(),
  important_keywords: z.array(z.string()).optional(),
  available: z.boolean().optional(),
})

/** @description Chunk path parameter schema — validates :id (dataset) and :chunkId params */
export const chunkParamSchema = z.object({
  id: z.string().uuid('Invalid dataset UUID'),
  chunkId: z.string().min(1, 'Chunk ID is required'),
})

// ---------------------------------------------------------------------------
// Document Toggle schema
// ---------------------------------------------------------------------------

/** @description Document path parameter schema — validates :id (dataset) and :docId params */
export const docParamSchema = z.object({
  id: z.string().uuid('Invalid dataset UUID'),
  docId: z.string().min(1, 'Document ID is required'),
})

/** @description PATCH /api/rag/datasets/:id/documents/:docId/toggle — body schema for toggling document availability */
export const toggleDocumentSchema = z.object({
  available: z.boolean({ required_error: 'available (boolean) is required' }),
})

// ---------------------------------------------------------------------------
// Retrieval Test schema
// ---------------------------------------------------------------------------

/** @description POST /api/rag/datasets/:id/retrieval-test — body schema for retrieval testing */
export const retrievalTestSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  method: z.enum(['hybrid', 'semantic', 'full_text']).optional().default('hybrid'),
  top_k: z.number().int().min(1).max(100).optional().default(5),
  similarity_threshold: z.number().min(0).max(1).optional().default(0.2),
  doc_ids: z.array(z.string()).optional(),
})

// ---------------------------------------------------------------------------
// Bulk Document Operation schemas
// ---------------------------------------------------------------------------

/** @description POST /api/rag/datasets/:id/documents/bulk-parse — body schema for bulk parse/cancel */
export const bulkParseDocumentsSchema = z.object({
  doc_ids: z.array(z.string().min(1)).min(1, 'At least one document ID is required'),
  /** 1 = start parsing, 2 = cancel parsing */
  run: z.number().int().min(1).max(2),
})

/** @description POST /api/rag/datasets/:id/documents/bulk-toggle — body schema for bulk enable/disable */
export const bulkToggleDocumentsSchema = z.object({
  doc_ids: z.array(z.string().min(1)).min(1, 'At least one document ID is required'),
  enabled: z.boolean({ required_error: 'enabled (boolean) is required' }),
})

/** @description POST /api/rag/datasets/:id/documents/bulk-delete — body schema for bulk document deletion */
export const bulkDeleteDocumentsSchema = z.object({
  doc_ids: z.array(z.string().min(1)).min(1, 'At least one document ID is required'),
})
