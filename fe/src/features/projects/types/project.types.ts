/**
 * @fileoverview Re-exports type definitions for the projects feature module.
 *
 * Types are co-located with their API files (projectApi, ragflowApi)
 * since they are tightly coupled to the API response shapes.
 * This file provides a convenience re-export barrel.
 *
 * @module features/projects/types/project.types
 */

export type {
  ProjectCategory,
  Project,
  ProjectDataset,
  SyncSourceType,
  ProjectSyncConfig,
  ProjectPermission,
  DocumentCategory,
  DocumentCategoryVersion,
  ProjectChat,
  ProjectSearch,
  ProjectEntityPermission,
  VersionDocument,
  ProjectMember,
  ActivityEntry,
} from '../api/projectApi'

export type {
  Dataset,
  CreateDatasetParams,
  UpdateDatasetParams,
  ListDatasetsParams,
} from '../api/ragflowApi'
