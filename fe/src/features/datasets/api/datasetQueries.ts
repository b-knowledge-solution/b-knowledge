/**
 * @fileoverview TanStack Query hooks for dataset feature.
 * Centralizes all useQuery/useMutation hooks for datasets, documents,
 * chunks, settings, versions, and version files.
 *
 * @module features/datasets/api/datasetQueries
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { datasetApi } from './datasetApi'
import type {
  Dataset,
  CreateDatasetDto,
  Document,
  DatasetSettings,
  Chunk,
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
  pagerank: number
}

const EMPTY_FORM: DatasetFormData = {
  name: '',
  description: '',
  language: 'English',
  parser_id: 'naive',
  pagerank: 0,
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
        pagerank: dataset.pagerank || 0,
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
      pagerank: formData.pagerank,
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
export function useChunks(datasetId: string | undefined, docId?: string): UseChunksReturn {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // UI-only state for pagination and search
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  // Fetch chunks via TanStack Query with pagination params
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.datasets.chunks(datasetId ?? '', { page, search, docId }),
    queryFn: () => datasetApi.listChunks(datasetId!, {
      page,
      limit: CHUNK_LIMIT,
      ...(search ? { search } : {}),
      ...(docId ? { doc_id: docId } : {}),
    }),
    enabled: !!datasetId,
  })

  /** Helper to invalidate all chunk queries for this dataset */
  const invalidateChunks = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.datasets.chunks(datasetId!) })
  }

  const addMutation = useMutation({
    mutationKey: ['datasets', 'chunks', 'create'],
    mutationFn: (text: string) => datasetApi.addChunk(datasetId!, { text, ...(docId ? { doc_id: docId } : {}) }),
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
