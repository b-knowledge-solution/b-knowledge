/**
 * @fileoverview Re-exports type definitions for the knowledge base feature module.
 *
 * Types are co-located with their API files (knowledgeBaseApi, ragflowApi)
 * since they are tightly coupled to the API response shapes.
 * This file provides a convenience re-export barrel.
 *
 * @module features/knowledge-base/types/knowledge-base.types
 */

export type {
  DocumentCategoryType,
  KnowledgeBase,
  KnowledgeBaseDataset,
  SyncSourceType,
  KnowledgeBaseSyncConfig,
  KnowledgeBasePermission,
  DocumentCategory,
  DocumentCategoryVersion,
  KnowledgeBaseChat,
  KnowledgeBaseSearch,
  KnowledgeBaseEntityPermission,
  VersionDocument,
  KnowledgeBaseMember,
  ActivityEntry,
} from '../api/knowledgeBaseApi'

export type {
  Dataset,
  CreateDatasetParams,
  UpdateDatasetParams,
  ListDatasetsParams,
} from '../api/ragflowApi'
