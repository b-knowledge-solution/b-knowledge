/**
 * @fileoverview TanStack Query hooks for dataset feature.
 * Centralizes all useQuery/useMutation hooks for datasets, documents,
 * chunks, settings, versions, and version files.
 *
 * @module features/datasets/api/datasetQueries
 */

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { datasetApi } from './datasetApi'
import type {
  Dataset,
  CreateDatasetDto,
  Document,
  DatasetSettings,
  Chunk,
  DocumentVersion,
  CreateVersionDto,
  UpdateVersionDto,
  VersionFile,
  ConverterJob,
} from '../types'
import { globalMessage } from '@/app/App'
import { queryKeys } from '@/lib/queryKeys'

// ============================================================================
// Form data type (used by useDatasets)
// ============================================================================

/** Form data shape for the dataset create/edit form. */
export interface DatasetFormData {
  name: string
  description: string
  language: string
  parser_id: string
}

const EMPTY_FORM: DatasetFormData = {
  name: '',
  description: '',
  language: 'English',
  parser_id: 'naive',
}

// ============================================================================
// useDatasets — Dataset list management
// ============================================================================

export interface UseDatasetsReturn {
  datasets: Dataset[]
  loading: boolean
  search: string
  setSearch: (value: string) => void
  isModalOpen: boolean
  editingDataset: Dataset | null
  submitting: boolean
  formData: DatasetFormData
  setFormField: <K extends keyof DatasetFormData>(key: K, value: DatasetFormData[K]) => void
  openModal: (dataset?: Dataset) => void
  closeModal: () => void
  handleSubmit: () => Promise<void>
  handleDelete: (dataset: Dataset) => void
  refresh: () => void
}

/**
 * Hook for managing the dataset list with create, update, and delete operations.
 *
 * @returns {UseDatasetsReturn} Dataset list state and CRUD handlers
 */
export function useDatasets(): UseDatasetsReturn {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // UI-only state
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDataset, setEditingDataset] = useState<Dataset | null>(null)
  const [formData, setFormData] = useState<DatasetFormData>(EMPTY_FORM)

  // Fetch datasets via TanStack Query
  const { data: datasets = [], isLoading } = useQuery({
    queryKey: queryKeys.datasets.list(),
    queryFn: () => datasetApi.listDatasets(),
  })

  // Filter datasets by search query on the client side
  const filteredDatasets = (() => {
    if (!search.trim()) return datasets
    const query = search.toLowerCase()
    return datasets.filter(
      (ds) =>
        ds.name.toLowerCase().includes(query) ||
        ds.description?.toLowerCase().includes(query),
    )
  })()

  /** Set a single form field value */
  const setFormField = <K extends keyof DatasetFormData>(key: K, value: DatasetFormData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  /** Open create/edit modal, populating form if editing */
  const openModal = (dataset?: Dataset) => {
    if (dataset) {
      setEditingDataset(dataset)
      setFormData({
        name: dataset.name,
        description: dataset.description || '',
        language: dataset.language || 'English',
        parser_id: dataset.parser_id || 'naive',
      })
    } else {
      setEditingDataset(null)
      setFormData(EMPTY_FORM)
    }
    setIsModalOpen(true)
  }

  /** Close modal and reset form state */
  const closeModal = () => {
    setIsModalOpen(false)
    setEditingDataset(null)
    setFormData(EMPTY_FORM)
  }

  // Create mutation
  const createMutation = useMutation({
    mutationKey: ['datasets', 'create'],
    mutationFn: (payload: CreateDatasetDto) => datasetApi.createDataset(payload),
    meta: { successMessage: t('datasets.createSuccess') },
    onSuccess: () => {
      // Invalidate the list to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.list() })
      closeModal()
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationKey: ['datasets', 'update'],
    mutationFn: ({ id, payload }: { id: string; payload: CreateDatasetDto }) =>
      datasetApi.updateDataset(id, payload),
    meta: { successMessage: t('datasets.updateSuccess') },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.list() })
      closeModal()
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationKey: ['datasets', 'delete'],
    mutationFn: (id: string) => datasetApi.deleteDataset(id),
    meta: { successMessage: t('datasets.deleteSuccess') },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.list() })
    },
  })

  /** Submit create or update based on editing state */
  const handleSubmit = async () => {
    const payload: CreateDatasetDto = {
      name: formData.name,
      description: formData.description,
      language: formData.language,
      parser_id: formData.parser_id,
    }
    if (editingDataset) {
      await updateMutation.mutateAsync({ id: editingDataset.id, payload })
    } else {
      await createMutation.mutateAsync(payload)
    }
  }

  /** Delete a dataset after user confirmation */
  const handleDelete = (dataset: Dataset) => {
    if (!window.confirm(t('datasets.confirmDeleteMessage', { name: dataset.name }))) return
    deleteMutation.mutate(dataset.id)
  }

  return {
    datasets: filteredDatasets,
    loading: isLoading,
    search,
    setSearch,
    isModalOpen,
    editingDataset,
    submitting: createMutation.isPending || updateMutation.isPending,
    formData,
    setFormField,
    openModal,
    closeModal,
    handleSubmit,
    handleDelete,
    refresh: () => queryClient.invalidateQueries({ queryKey: queryKeys.datasets.list() }),
  }
}

// ============================================================================
// useDocuments — Document list for a specific dataset
// ============================================================================

export interface UseDocumentsReturn {
  documents: Document[]
  loading: boolean
  uploading: boolean
  refresh: () => void
  uploadFiles: (files: File[]) => Promise<void>
  deleteDocument: (docId: string) => void
  parseDocument: (docId: string) => Promise<void>
}

/**
 * Hook for managing documents within a dataset.
 *
 * @param {string | undefined} datasetId - The dataset ID
 * @returns {UseDocumentsReturn} Document list state and handlers
 */
export function useDocuments(datasetId: string | undefined): UseDocumentsReturn {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Fetch documents via TanStack Query
  const { data: documents = [], isLoading } = useQuery({
    queryKey: queryKeys.datasets.documents(datasetId ?? ''),
    queryFn: () => datasetApi.listDocuments(datasetId!),
    // Only fetch when datasetId is available
    enabled: !!datasetId,
  })

  // Upload mutation with custom success message including file count
  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => datasetApi.uploadDocuments(datasetId!, files),
    onSuccess: (_data, files) => {
      globalMessage.success(t('datasets.uploadSuccess', { count: files.length }))
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.documents(datasetId!) })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationKey: ['datasets', 'delete', 'document'],
    mutationFn: (docId: string) => datasetApi.deleteDocument(datasetId!, docId),
    meta: { successMessage: t('datasets.deleteDocSuccess') },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.documents(datasetId!) })
    },
  })

  // Parse mutation
  const parseMutation = useMutation({
    mutationFn: (docId: string) => datasetApi.parseDocument(datasetId!, docId),
    meta: { successMessage: t('datasets.parseStarted') },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.documents(datasetId!) })
    },
  })

  /** Upload files to the dataset */
  const uploadFiles = async (files: File[]) => {
    if (!datasetId) return
    await uploadMutation.mutateAsync(files)
  }

  /** Delete a document after user confirmation */
  const deleteDocument = (docId: string) => {
    if (!datasetId) return
    if (!window.confirm(t('datasets.confirmDeleteDocMessage'))) return
    deleteMutation.mutate(docId)
  }

  /** Parse a document */
  const parseDocument = async (docId: string) => {
    if (!datasetId) return
    await parseMutation.mutateAsync(docId)
  }

  return {
    documents,
    loading: isLoading,
    uploading: uploadMutation.isPending,
    refresh: () => queryClient.invalidateQueries({ queryKey: queryKeys.datasets.documents(datasetId!) }),
    uploadFiles,
    deleteDocument,
    parseDocument,
  }
}

// ============================================================================
// useChunks — Chunk management with pagination
// ============================================================================

export interface UseChunksReturn {
  /** List of chunks */
  chunks: Chunk[]
  /** Total chunk count */
  total: number
  /** Current page */
  page: number
  /** Whether chunks are loading */
  loading: boolean
  /** Search query */
  search: string
  /** Set search query */
  setSearch: (value: string) => void
  /** Set current page */
  setPage: (page: number) => void
  /** Refresh chunks */
  refresh: () => void
  /** Add a manual chunk */
  addChunk: (text: string) => Promise<void>
  /** Update a chunk */
  updateChunk: (chunkId: string, text: string) => Promise<void>
  /** Delete a chunk */
  deleteChunk: (chunkId: string) => Promise<void>
}

const CHUNK_LIMIT = 20

/**
 * Hook for managing dataset chunks with pagination and search.
 *
 * @param {string | undefined} datasetId - Dataset ID
 * @returns {UseChunksReturn} Chunk state and operations
 */
export function useChunks(datasetId: string | undefined): UseChunksReturn {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // UI-only state for pagination and search
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  // Fetch chunks via TanStack Query with pagination params
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.datasets.chunks(datasetId ?? '', { page, search }),
    queryFn: () => datasetApi.listChunks(datasetId!, {
      page,
      limit: CHUNK_LIMIT,
      ...(search ? { search } : {}),
    }),
    enabled: !!datasetId,
  })

  /** Helper to invalidate all chunk queries for this dataset */
  const invalidateChunks = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.datasets.chunks(datasetId!) })
  }

  // Add chunk mutation
  const addMutation = useMutation({
    mutationKey: ['datasets', 'chunks', 'create'],
    mutationFn: (text: string) => datasetApi.addChunk(datasetId!, { text }),
    meta: { successMessage: t('datasetSettings.chunks.addSuccess') },
    onSuccess: invalidateChunks,
  })

  // Update chunk mutation
  const updateMutation = useMutation({
    mutationKey: ['datasets', 'chunks', 'update'],
    mutationFn: ({ chunkId, text }: { chunkId: string; text: string }) =>
      datasetApi.updateChunk(datasetId!, chunkId, { text }),
    meta: { successMessage: t('datasetSettings.chunks.updateSuccess') },
    onSuccess: invalidateChunks,
  })

  // Delete chunk mutation
  const deleteMutation = useMutation({
    mutationKey: ['datasets', 'chunks', 'delete'],
    mutationFn: (chunkId: string) => datasetApi.deleteChunk(datasetId!, chunkId),
    meta: { successMessage: t('datasetSettings.chunks.deleteSuccess') },
    onSuccess: invalidateChunks,
  })

  /** Add a manual chunk */
  const addChunk = async (text: string) => {
    if (!datasetId) return
    await addMutation.mutateAsync(text)
  }

  /** Update a chunk */
  const updateChunk = async (chunkId: string, text: string) => {
    if (!datasetId) return
    await updateMutation.mutateAsync({ chunkId, text })
  }

  /** Delete a chunk */
  const deleteChunk = async (chunkId: string) => {
    if (!datasetId) return
    await deleteMutation.mutateAsync(chunkId)
  }

  return {
    chunks: data?.chunks ?? [],
    total: data?.total ?? 0,
    page,
    loading: isLoading,
    search,
    setSearch,
    setPage,
    refresh: invalidateChunks,
    addChunk,
    updateChunk,
    deleteChunk,
  }
}

// ============================================================================
// useDatasetSettings — Dataset settings CRUD
// ============================================================================

export interface UseDatasetSettingsReturn {
  /** Current settings */
  settings: DatasetSettings | null
  /** Whether settings are loading */
  loading: boolean
  /** Whether settings are saving */
  saving: boolean
  /** Fetch settings */
  refresh: () => Promise<void>
  /** Update settings */
  updateSettings: (data: Partial<DatasetSettings>) => Promise<void>
}

/**
 * Hook for managing dataset settings.
 *
 * @param {string | undefined} datasetId - Dataset ID
 * @returns {UseDatasetSettingsReturn} Settings state and operations
 */
export function useDatasetSettings(datasetId: string | undefined): UseDatasetSettingsReturn {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Fetch settings via TanStack Query
  const { data: settings = null, isLoading } = useQuery({
    queryKey: queryKeys.datasets.settings(datasetId ?? ''),
    queryFn: () => datasetApi.getDatasetSettings(datasetId!),
    enabled: !!datasetId,
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationKey: ['datasets', 'settings', 'save'],
    mutationFn: (data: Partial<DatasetSettings>) =>
      datasetApi.updateDatasetSettings(datasetId!, data),
    meta: { successMessage: t('datasetSettings.saveSuccess') },
    onSuccess: (updated) => {
      // Update the cache directly with the returned data
      queryClient.setQueryData(queryKeys.datasets.settings(datasetId!), updated)
    },
  })

  /** Update settings */
  const updateSettings = async (data: Partial<DatasetSettings>) => {
    if (!datasetId) return
    await updateMutation.mutateAsync(data)
  }

  /** Refresh settings by invalidating the query */
  const refresh = async () => {
    if (!datasetId) return
    await queryClient.invalidateQueries({ queryKey: queryKeys.datasets.settings(datasetId) })
  }

  return {
    settings,
    loading: isLoading,
    saving: updateMutation.isPending,
    refresh,
    updateSettings,
  }
}

// ============================================================================
// useVersions — Document version management
// ============================================================================

/** @description Return type for the useVersions hook */
export interface UseVersionsReturn {
  /** List of versions for the dataset */
  versions: DocumentVersion[]
  /** Whether versions are loading */
  loading: boolean
  /** Currently selected version */
  selectedVersion: DocumentVersion | null
  /** Select a version */
  selectVersion: (version: DocumentVersion | null) => void
  /** Create a new version */
  createVersion: (data: CreateVersionDto) => Promise<void>
  /** Update a version */
  updateVersion: (versionId: string, data: UpdateVersionDto) => Promise<void>
  /** Archive a version */
  archiveVersion: (versionId: string) => Promise<void>
  /** Delete a version */
  deleteVersion: (versionId: string) => Promise<void>
  /** Refresh version list */
  refresh: () => void
}

/**
 * Hook for managing document versions within a dataset.
 *
 * @param {string | undefined} datasetId - The dataset ID to fetch versions for
 * @returns {UseVersionsReturn} Version management state and handlers
 */
export function useVersions(datasetId: string | undefined): UseVersionsReturn {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // UI-only state for version selection
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersion | null>(null)

  // Fetch versions via TanStack Query
  const { data: versions = [], isLoading } = useQuery({
    queryKey: queryKeys.datasets.versions(datasetId ?? ''),
    queryFn: () => datasetApi.getVersions(datasetId!),
    enabled: !!datasetId,
  })

  // Auto-select first active version when data loads
  useEffect(() => {
    if (versions.length > 0 && !selectedVersion) {
      const active = versions.find((v) => v.status === 'active') || versions[0]
      setSelectedVersion(active || null)
    }
  }, [versions, selectedVersion])

  // Reset selection when datasetId changes
  useEffect(() => {
    setSelectedVersion(null)
  }, [datasetId])

  /** Helper to invalidate version queries */
  const invalidateVersions = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.datasets.versions(datasetId!) })
  }

  // Create version mutation
  const createMutation = useMutation({
    mutationKey: ['datasets', 'versions', 'create'],
    mutationFn: (data: CreateVersionDto) => datasetApi.createVersion(datasetId!, data),
    meta: { successMessage: t('versions.createSuccess') },
    onSuccess: invalidateVersions,
  })

  // Update version mutation
  const updateMutation = useMutation({
    mutationKey: ['datasets', 'versions', 'update'],
    mutationFn: ({ versionId, data }: { versionId: string; data: UpdateVersionDto }) =>
      datasetApi.updateVersion(datasetId!, versionId, data),
    meta: { successMessage: t('versions.updateSuccess') },
    onSuccess: invalidateVersions,
  })

  // Archive version mutation
  const archiveMutation = useMutation({
    mutationFn: (versionId: string) =>
      datasetApi.updateVersion(datasetId!, versionId, { status: 'archived' }),
    meta: { successMessage: t('versions.archiveSuccess') },
    onSuccess: (_data, versionId) => {
      // Deselect if the archived version was selected
      if (selectedVersion?.id === versionId) {
        setSelectedVersion(null)
      }
      invalidateVersions()
    },
  })

  // Delete version mutation
  const deleteMutation = useMutation({
    mutationKey: ['datasets', 'versions', 'delete'],
    mutationFn: (versionId: string) => datasetApi.deleteVersion(datasetId!, versionId),
    meta: { successMessage: t('versions.deleteSuccess') },
    onSuccess: (_data, versionId) => {
      // Deselect if the deleted version was selected
      if (selectedVersion?.id === versionId) {
        setSelectedVersion(null)
      }
      invalidateVersions()
    },
  })

  /** Select a version */
  const selectVersion = (version: DocumentVersion | null) => {
    setSelectedVersion(version)
  }

  /** Create a new version */
  const createVersion = async (data: CreateVersionDto) => {
    if (!datasetId) return
    await createMutation.mutateAsync(data)
  }

  /** Update a version */
  const updateVersion = async (versionId: string, data: UpdateVersionDto) => {
    if (!datasetId) return
    await updateMutation.mutateAsync({ versionId, data })
  }

  /** Archive a version */
  const archiveVersion = async (versionId: string) => {
    if (!datasetId) return
    await archiveMutation.mutateAsync(versionId)
  }

  /** Delete a version after user confirmation */
  const deleteVersion = async (versionId: string) => {
    if (!datasetId) return
    if (!window.confirm(t('versions.confirmDeleteMessage'))) return
    await deleteMutation.mutateAsync(versionId)
  }

  return {
    versions,
    loading: isLoading,
    selectedVersion,
    selectVersion,
    createVersion,
    updateVersion,
    archiveVersion,
    deleteVersion,
    refresh: invalidateVersions,
  }
}

// ============================================================================
// useVersionFiles — File management within a document version
// ============================================================================

/** @description Return type for the useVersionFiles hook */
export interface UseVersionFilesReturn {
  /** List of files in the version */
  files: VersionFile[]
  /** Whether files are loading */
  loading: boolean
  /** Whether files are being uploaded */
  uploading: boolean
  /** Upload progress (0-100) */
  uploadProgress: number
  /** Upload files to the version */
  uploadFiles: (files: File[]) => Promise<void>
  /** Delete files by ID */
  deleteFiles: (fileIds: string[]) => Promise<void>
  /** Start file conversion */
  convertFiles: () => Promise<void>
  /** Start file parsing in RAGFlow */
  parseFiles: () => Promise<void>
  /** Sync file statuses from RAGFlow */
  syncStatus: () => Promise<void>
  /** Re-queue failed files */
  requeueFiles: () => Promise<void>
  /** Refresh file list */
  refresh: () => void
  /** Converter jobs for this version */
  jobs: ConverterJob[]
  /** Whether jobs are loading */
  loadingJobs: boolean
  /** Refresh converter jobs */
  refreshJobs: () => void
}

/**
 * Hook for managing files within a document version.
 *
 * @param {string | undefined} datasetId - The dataset ID
 * @param {string | undefined} versionId - The version ID
 * @returns {UseVersionFilesReturn} File management state and handlers
 */
export function useVersionFiles(
  datasetId: string | undefined,
  versionId: string | undefined,
): UseVersionFilesReturn {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Upload progress is ephemeral UI state
  const [uploadProgress, setUploadProgress] = useState(0)

  const enabled = !!datasetId && !!versionId

  // Fetch files via TanStack Query
  const { data: files = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.datasets.versionFiles(datasetId ?? '', versionId ?? ''),
    queryFn: () => datasetApi.getVersionFiles(datasetId!, versionId!),
    enabled,
    // Auto-refresh every 5s when files are in progress
    refetchInterval: (query) => {
      const data = query.state.data as VersionFile[] | undefined
      const hasInProgress = data?.some(
        (f) => f.status === 'pending' || f.status === 'converting' || f.status === 'parsing',
      )
      return hasInProgress ? 5000 : false
    },
  })

  // Fetch converter jobs
  const { data: jobs = [], isLoading: loadingJobs } = useQuery({
    queryKey: queryKeys.datasets.converterJobs(datasetId ?? '', versionId ?? ''),
    queryFn: () => datasetApi.getConverterJobs(datasetId!, versionId!),
    enabled,
  })

  /** Helper to invalidate file queries */
  const invalidateFiles = () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.datasets.versionFiles(datasetId!, versionId!),
    })
  }

  /** Helper to invalidate job queries */
  const invalidateJobs = () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.datasets.converterJobs(datasetId!, versionId!),
    })
  }

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (fileList: File[]) =>
      datasetApi.uploadVersionFiles(datasetId!, versionId!, fileList),
    onMutate: () => {
      setUploadProgress(0)
    },
    onSuccess: (_data, fileList) => {
      setUploadProgress(100)
      globalMessage.success(t('versions.uploadSuccess', { count: fileList.length }))
      invalidateFiles()
    },
    onSettled: () => {
      setUploadProgress(0)
    },
  })

  // Delete files mutation
  const deleteMutation = useMutation({
    mutationKey: ['datasets', 'versions', 'files', 'delete'],
    mutationFn: (fileIds: string[]) =>
      datasetApi.deleteVersionFiles(datasetId!, versionId!, fileIds),
    onSuccess: (_data, fileIds) => {
      globalMessage.success(t('versions.deleteFilesSuccess', { count: fileIds.length }))
      invalidateFiles()
    },
  })

  // Convert files mutation
  const convertMutation = useMutation({
    mutationFn: () => datasetApi.convertFiles(datasetId!, versionId!),
    meta: { successMessage: t('versions.convertStarted') },
    onSuccess: () => {
      invalidateFiles()
      invalidateJobs()
    },
  })

  // Parse files mutation
  const parseMutation = useMutation({
    mutationFn: () => datasetApi.parseFiles(datasetId!, versionId!),
    meta: { successMessage: t('versions.parseStarted') },
    onSuccess: invalidateFiles,
  })

  // Sync status mutation
  const syncMutation = useMutation({
    mutationFn: () => datasetApi.syncFileStatus(datasetId!, versionId!),
    meta: { successMessage: t('versions.syncSuccess') },
    onSuccess: invalidateFiles,
  })

  // Requeue mutation
  const requeueMutation = useMutation({
    mutationFn: () => datasetApi.requeueFiles(datasetId!, versionId!),
    meta: { successMessage: t('versions.requeueSuccess') },
    onSuccess: invalidateFiles,
  })

  /** Upload files to the version */
  const uploadFiles = async (fileList: File[]) => {
    if (!datasetId || !versionId) return
    await uploadMutation.mutateAsync(fileList)
  }

  /** Delete files by ID */
  const deleteFiles = async (fileIds: string[]) => {
    if (!datasetId || !versionId) return
    await deleteMutation.mutateAsync(fileIds)
  }

  /** Start file conversion */
  const convertFiles = async () => {
    if (!datasetId || !versionId) return
    await convertMutation.mutateAsync()
  }

  /** Start file parsing in RAGFlow */
  const parseFiles = async () => {
    if (!datasetId || !versionId) return
    await parseMutation.mutateAsync()
  }

  /** Sync file statuses from RAGFlow */
  const syncStatus = async () => {
    if (!datasetId || !versionId) return
    await syncMutation.mutateAsync()
  }

  /** Re-queue failed files for conversion */
  const requeueFiles = async () => {
    if (!datasetId || !versionId) return
    await requeueMutation.mutateAsync()
  }

  return {
    files,
    loading,
    uploading: uploadMutation.isPending,
    uploadProgress,
    uploadFiles,
    deleteFiles,
    convertFiles,
    parseFiles,
    syncStatus,
    requeueFiles,
    refresh: invalidateFiles,
    jobs,
    loadingJobs,
    refreshJobs: invalidateJobs,
  }
}
