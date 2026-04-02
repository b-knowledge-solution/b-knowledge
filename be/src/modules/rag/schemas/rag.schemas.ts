/**
 * @fileoverview Zod validation schemas for the RAG module.
 *
 * Each schema validates request params, body, or query for a specific endpoint.
 * Used with the `validate()` middleware to enforce input constraints.
 *
 * @module modules/rag/schemas/rag
 */
import { z } from 'zod';
import { hexId, hexIdWith } from '@/shared/utils/uuid.js'

/** @description UUID v4 path parameter schema — validates :id param */
export const uuidParamSchema = z.object({
  id: hexIdWith('Invalid UUID format'),
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
    team_ids: z.array(hexId).optional(),
    user_ids: z.array(hexId).optional(),
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
    team_ids: z.array(hexId).optional(),
    user_ids: z.array(hexId).optional(),
  }).optional(),
  pagerank: z.number().int().min(0).optional(),
});

/** @description PUT /api/rag/datasets/:id/access — body schema for access control update */
export const datasetAccessSchema = z.object({
  public: z.boolean().optional(),
  team_ids: z.array(hexId).optional().default([]),
  user_ids: z.array(hexId).optional().default([]),
})

// ---------------------------------------------------------------------------
// Version schemas
// ---------------------------------------------------------------------------

/** @description UUID version path parameter schema — validates :id and :versionId params */
export const versionParamSchema = z.object({
  id: hexIdWith('Invalid dataset UUID'),
  versionId: hexIdWith('Invalid version UUID'),
})

/** @description POST /api/rag/datasets/:id/versions — body schema for version creation with optional file upload */
export const createVersionSchema = z.object({
  /** Optional custom display label for this version (e.g., '1.2.0', 'Q1 Release') */
  version_label: z.string().min(1).max(128).optional(),
  /** Optional user-provided description of what changed in this version */
  change_summary: z.string().max(2000).optional(),
  /** Whether to auto-parse uploaded files immediately */
  auto_parse: z.boolean().optional().default(false),
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
  file_ids: z.array(hexId).min(1, 'At least one file ID is required'),
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
  question_keywords: z.array(z.string()).optional(),
})

/** @description PUT /api/rag/datasets/:id/chunks/:chunkId — body schema for chunk update */
export const updateChunkSchema = z.object({
  content: z.string().min(1, 'Chunk content is required').optional(),
  important_keywords: z.array(z.string()).optional(),
  question_keywords: z.array(z.string()).optional(),
  available: z.boolean().optional(),
})

/**
 * @description Schema for bulk chunk enable/disable switch
 */
export const bulkChunkSwitchSchema = z.object({
  chunk_ids: z.array(z.string()).min(1, 'At least one chunk ID is required'),
  available: z.boolean(),
})

/** @description Chunk path parameter schema — validates :id (dataset) and :chunkId params */
export const chunkParamSchema = z.object({
  id: hexIdWith('Invalid dataset UUID'),
  chunkId: z.string().min(1, 'Chunk ID is required'),
})

// ---------------------------------------------------------------------------
// Document Toggle schema
// ---------------------------------------------------------------------------

/** @description Document path parameter schema — validates :id (dataset) and :docId params */
export const docParamSchema = z.object({
  id: hexIdWith('Invalid dataset UUID'),
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
  vector_similarity_weight: z.number().min(0).max(1).optional().default(0.3),
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

/**
 * @description Schema for changing a document's parser/chunking method
 */
export const changeDocumentParserSchema = z.object({
  parser_id: z.enum(['naive', 'qa', 'resume', 'manual', 'table', 'paper', 'book', 'laws', 'presentation', 'one', 'picture', 'audio', 'email']),
  parser_config: z.record(z.unknown()).optional(),
})

/**
 * @description Schema for web crawl document creation
 */
export const webCrawlSchema = z.object({
  url: z.string().url('Invalid URL format'),
  name: z.string().min(1).max(255).optional(),
  auto_parse: z.boolean().optional().default(true),
})

// ---------------------------------------------------------------------------
// GraphRAG schemas
// ---------------------------------------------------------------------------

/**
 * @description POST /api/rag/datasets/:id/graph/run — body schema for triggering GraphRAG indexing.
 * Mode 'light' uses LazyGraphRAG (default); 'full' uses full GraphRAG with entity resolution and community detection.
 */
export const graphRunSchema = z.object({
  mode: z.enum(['light', 'full']).default('light'),
})



// ---------------------------------------------------------------------------
// Bulk Metadata schemas
// ---------------------------------------------------------------------------

/**
 * @description POST /api/rag/datasets/bulk-metadata — body schema for bulk metadata tag update.
 * Updates parser_config.metadata_tags (NOT parser_config.metadata) on multiple datasets.
 */
export const bulkMetadataSchema = z.object({
  /** Array of dataset UUIDs to update */
  dataset_ids: z.array(hexId).min(1, 'At least one dataset ID is required'),
  /** Key-value pairs to set/merge into parser_config.metadata_tags */
  metadata_tags: z.record(z.string()),
  /** 'merge' adds to existing metadata_tags, 'overwrite' replaces metadata_tags entirely */
  mode: z.enum(['merge', 'overwrite']),
})
