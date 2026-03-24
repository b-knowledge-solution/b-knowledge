/**
 * @fileoverview Barrel exports for the datasets feature module.
 * Re-exports API client, query hooks, components, and types
 * as the public API of this feature.
 *
 * @module features/datasets
 */

export { datasetApi } from './api/datasetApi';
export {
  useDatasets, useDocuments, useChunks, useDatasetSettings,
} from './api/datasetQueries';
export type { DatasetFormData, UseDatasetsReturn, UseDocumentsReturn, UseChunksReturn, UseDatasetSettingsReturn } from './api/datasetQueries';
export { default as DatasetAccessDialog } from './components/DatasetAccessDialog';
export { default as DatasetSettingsDrawer } from './components/DatasetSettingsDrawer';
export type {
  Dataset, Document, CreateDatasetDto, UpdateDatasetDto, AccessControl, Chunk, ChunksResponse,
  DatasetSettings, GraphRAGConfig, RAPTORConfig, RetrievalTestResult, RetrievalChunk,
} from './types';
