/**
 * @fileoverview Public API barrel for knowledge base feature.
 */
export {
  getKnowledgeBases,
  getKnowledgeBaseById,
  createKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  getKnowledgeBasePermissions,
  setKnowledgeBasePermission,
  removeKnowledgeBasePermission,
  getDocumentCategories,
  createDocumentCategory,
  updateDocumentCategory,
  deleteDocumentCategory,
  getCategoryVersions,
  createCategoryVersion,
  syncCategoryVersion,
  archiveCategoryVersion,
  deleteCategoryVersion,
  getVersionDocuments,
  uploadVersionDocument,
  getKnowledgeBaseChats,
  getKnowledgeBaseChatById,
  createKnowledgeBaseChat,
  updateKnowledgeBaseChat,
  deleteKnowledgeBaseChat,
  syncKnowledgeBaseChat,
  getKnowledgeBaseSearches,
  getKnowledgeBaseSearchById,
  createKnowledgeBaseSearch,
  updateKnowledgeBaseSearch,
  deleteKnowledgeBaseSearch,
  syncKnowledgeBaseSearch,
  getSyncConfigs,
  createSyncConfig,
  updateSyncConfig,
  deleteSyncConfig,
  testSyncConnection,
  triggerSync,
  getKnowledgeBaseDatasets,
  linkKnowledgeBaseDataset,
  unlinkKnowledgeBaseDataset,
  type KnowledgeBase,
  type KnowledgeBasePermission,
  type DocumentCategory,
  type DocumentCategoryVersion,
  type KnowledgeBaseChat,
  type KnowledgeBaseSearch,
  type DocumentCategoryType,
  type KnowledgeBaseDataset,
  type KnowledgeBaseSyncConfig,
  type SyncSourceType,
} from "./api/knowledgeBaseApi";

export {
  createDataset,
  listDatasets,
  updateDataset,
  deleteDatasets,
  type Dataset,
  type CreateDatasetParams,
  type UpdateDatasetParams,
  type ListDatasetsParams,
} from "./api/ragflowApi";

// Component exports
export { default as CategorySidebar } from "./components/CategorySidebar";
export { default as KnowledgeBaseSettingsSheet } from "./components/KnowledgeBaseSettingsSheet";
export { default as StandardCategoryView } from "./components/StandardCategoryView";
export { default as CodeCategoryView } from "./components/CodeCategoryView";
export { default as StandardTabRedesigned } from "./components/StandardTabRedesigned";
export { default as CodeTabRedesigned } from "./components/CodeTabRedesigned";
export { default as CodeCategoryModal } from "./components/CodeCategoryModal";
export { default as VersionList } from "./components/VersionList";
export { default as VersionCard } from "./components/VersionCard";
