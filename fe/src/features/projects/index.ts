/**
 * @fileoverview Public API barrel for projects feature.
 */
export {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getProjectPermissions,
  setProjectPermission,
  removeProjectPermission,
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
  getProjectChats,
  getProjectChatById,
  createProjectChat,
  updateProjectChat,
  deleteProjectChat,
  syncProjectChat,
  getProjectSearches,
  getProjectSearchById,
  createProjectSearch,
  updateProjectSearch,
  deleteProjectSearch,
  syncProjectSearch,
  getSyncConfigs,
  createSyncConfig,
  updateSyncConfig,
  deleteSyncConfig,
  testSyncConnection,
  triggerSync,
  getProjectDatasets,
  linkProjectDataset,
  unlinkProjectDataset,
  type Project,
  type ProjectPermission,
  type DocumentCategory,
  type DocumentCategoryVersion,
  type ProjectChat,
  type ProjectSearch,
  type DocumentCategoryType,
  type ProjectDataset,
  type ProjectSyncConfig,
  type SyncSourceType,
} from "./api/projectApi";

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
export { default as ProjectSettingsSheet } from "./components/ProjectSettingsSheet";
export { default as StandardCategoryView } from "./components/StandardCategoryView";
export { default as CodeCategoryView } from "./components/CodeCategoryView";
export { default as VersionList } from "./components/VersionList";
export { default as VersionCard } from "./components/VersionCard";
