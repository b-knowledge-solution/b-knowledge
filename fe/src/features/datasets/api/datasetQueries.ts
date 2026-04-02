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
import { useConfirm } from '@/components/ConfirmDialog'
import { datasetApi } from './datasetApi'
import type {
  Dataset,
  CreateDatasetDto,
  Document,
  DatasetSettings,
  Chunk,
  AbacPolicyRule,
} from '../types'
import { globalMessage } from '@/app/App'
import { queryKeys } from '@/lib/queryKeys'
import { PollInterval } from '@/constants'

// ============================================================================
// Form data type (used by useDatasets)
// ============================================================================

/**
 * @description Form data shape for the dataset create/edit form.
 * Maps UI fields to API payload, including permission model state.
 */
export interface DatasetFormData {
  name: string
  description: string
  language: string
  parser_id: string
  embedding_model: string
  pagerank: number
  permission: 'me' | 'workspace' | 'specific' // UI state
  team_ids: string[]
  user_ids: string[]
}

const EMPTY_FORM: DatasetFormData = {
  name: '',
  description: '',
  language: 'English',
  parser_id: 'naive',
  embedding_model: '',
  pagerank: 0,
  permission: 'me',
  team_ids: [],
  user_ids: [],
}

// ============================================================================
// useDatasets — Dataset list management
// ============================================================================

/**
 * @description Return type for the useDatasets hook with all dataset list management state and handlers.
 */
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
  handleDelete: (dataset: Dataset) => Promise<void>
  refresh: () => void
}

/**
 * Hook for managing the dataset list with create, update, and delete operations.
 *
 * @returns {UseDatasetsReturn} Dataset list state and CRUD handlers
 */
export function useDatasets(): UseDatasetsReturn {
  const { t } = useTranslation()
  const confirm = useConfirm()
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
        embedding_model: dataset.embedding_model || '',
        pagerank: dataset.pagerank || 0,
        permission: dataset.access_control?.public ? 'workspace' : (
          dataset.access_control?.team_ids?.length || dataset.access_control?.user_ids?.length ? 'specific' : 'me'
        ),
        team_ids: dataset.access_control?.team_ids || [],
        user_ids: dataset.access_control?.user_ids || [],
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

  /** Build payload from form state and dispatch create or update mutation */
  const handleSubmit = async () => {
    // Map permission UI state to access_control shape expected by the API
    const payload: CreateDatasetDto = {
      name: formData.name,
      description: formData.description,
      language: formData.language,
      parser_id: formData.parser_id,
      pagerank: formData.pagerank,
      access_control: {
        public: formData.permission === 'workspace',
        team_ids: formData.permission === 'specific' ? formData.team_ids : [],
        user_ids: formData.permission === 'specific' ? formData.user_ids : [],
      }
    }

    // Only include embedding_model when explicitly selected to allow system default fallback
    if (formData.embedding_model) {
      payload.embedding_model = formData.embedding_model;
    }
    // Dispatch update for existing dataset, otherwise create new
    if (editingDataset) {
      await updateMutation.mutateAsync({ id: editingDataset.id, payload })
    } else {
      await createMutation.mutateAsync(payload)
    }
  }

  /** Delete a dataset after user confirmation */
  const handleDelete = async (dataset: Dataset) => {
    // Show styled confirmation dialog before deleting dataset
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('datasets.confirmDeleteMessage', { name: dataset.name }),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return
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
// useCreateDatasetVersion — Upload a new version of an existing dataset
// ============================================================================

/**
 * @description Mutation hook to upload a new version of a dataset.
 * Invalidates the datasets list cache on success so the new version appears immediately.
 * @param {string} datasetId - Parent dataset UUID
 * @returns Mutation hook for creating dataset versions
 */
export function useCreateDatasetVersion(datasetId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ files, changeSummary, versionLabel, autoParse }: {
      files: File[]
      changeSummary?: string
      versionLabel?: string
      autoParse?: boolean
    }) => datasetApi.createDatasetVersion(datasetId, files, changeSummary, versionLabel, autoParse),
    meta: { successMessage: t('datasets.uploadNewVersionSuccess') },
    onSuccess: () => {
      // Invalidate dataset list to show the new version dataset
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.list() })
    },
  })
}

// ============================================================================
// useDocuments — Document list for a specific dataset
// ============================================================================

/**
 * @description Return type for the useDocuments hook with document list state and operations.
 */
export interface UseDocumentsReturn {
  documents: Document[]
  loading: boolean
  uploading: boolean
  refresh: () => void
  uploadFiles: (files: File[]) => Promise<void>
  deleteDocument: (docId: string) => void
  parseDocument: (docId: string) => Promise<void>
  toggleAvailability: (docId: string, enabled: boolean) => Promise<void>
  bulkParse: (docIds: string[], run?: number) => Promise<void>
  bulkDelete: (docIds: string[]) => Promise<void>
  bulkToggle: (docIds: string[], enabled: boolean) => Promise<void>
}

/**
 * Hook for managing documents within a dataset.
 *
 * @param {string | undefined} datasetId - The dataset ID
 * @returns {UseDocumentsReturn} Document list state and handlers
 */
export function useDocuments(datasetId: string | undefined): UseDocumentsReturn {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  // Fetch documents via TanStack Query
  const { data: documents = [], isLoading } = useQuery({
    queryKey: queryKeys.datasets.documents(datasetId ?? ''),
    queryFn: () => datasetApi.listDocuments(datasetId!),
    // Only fetch when datasetId is available
    enabled: !!datasetId,
    // Auto-refresh every 5s when any document is parsing
    refetchInterval: (query) => {
      const docs = query.state.data
      if (docs && docs.some((d: Document) => d.run === '1')) return PollInterval.STANDARD
      return false
    },
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

  // Toggle availability mutation (single doc)
  const toggleMutation = useMutation({
    mutationFn: ({ docId, enabled }: { docId: string; enabled: boolean }) =>
      datasetApi.toggleDocumentAvailability(datasetId!, docId, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.documents(datasetId!) })
    },
  })

  // Bulk parse mutation
  const bulkParseMutation = useMutation({
    mutationFn: ({ docIds, run }: { docIds: string[]; run: number }) =>
      datasetApi.bulkParseDocuments(datasetId!, docIds, run),
    onSuccess: (_data, variables) => {
      // Show different messages for parse vs cancel
      const message = variables.run === 2
        ? t('datasets.parseCancelled', 'Parsing cancelled')
        : t('datasets.bulkParseStarted')
      globalMessage.success(message)
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.documents(datasetId!) })
    },
  })

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: (docIds: string[]) =>
      datasetApi.bulkDeleteDocuments(datasetId!, docIds),
    meta: { successMessage: t('datasets.bulkDeleteSuccess') },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.documents(datasetId!) })
    },
  })

  // Bulk toggle mutation
  const bulkToggleMutation = useMutation({
    mutationFn: ({ docIds, enabled }: { docIds: string[]; enabled: boolean }) =>
      datasetApi.bulkToggleDocuments(datasetId!, docIds, enabled),
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
  const deleteDocument = async (docId: string) => {
    if (!datasetId) return
    // Show styled confirmation dialog before deleting document
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('datasets.confirmDeleteDocMessage'),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return
    deleteMutation.mutate(docId)
  }

  /** Parse a document */
  const parseDocument = async (docId: string) => {
    if (!datasetId) return
    await parseMutation.mutateAsync(docId)
  }

  /** Toggle single document availability */
  const toggleAvailability = async (docId: string, enabled: boolean) => {
    if (!datasetId) return
    await toggleMutation.mutateAsync({ docId, enabled })
  }

  /** Bulk parse/cancel multiple documents */
  const bulkParse = async (docIds: string[], run = 1) => {
    if (!datasetId) return
    await bulkParseMutation.mutateAsync({ docIds, run })
  }

  /** Bulk delete multiple documents after confirmation */
  const bulkDelete = async (docIds: string[]) => {
    if (!datasetId) return
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('datasets.confirmBulkDelete', { count: docIds.length }),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return
    await bulkDeleteMutation.mutateAsync(docIds)
  }

  /** Bulk toggle availability for multiple documents */
  const bulkToggle = async (docIds: string[], enabled: boolean) => {
    if (!datasetId) return
    await bulkToggleMutation.mutateAsync({ docIds, enabled })
  }

  return {
    documents,
    loading: isLoading,
    uploading: uploadMutation.isPending,
    refresh: () => queryClient.invalidateQueries({ queryKey: queryKeys.datasets.documents(datasetId!) }),
    uploadFiles,
    deleteDocument,
    parseDocument,
    toggleAvailability,
    bulkParse,
    bulkDelete,
    bulkToggle,
  }
}

// ============================================================================
// useChunks — Chunk management with pagination
// ============================================================================

/**
 * @description Return type for the useChunks hook with paginated chunk state and operations.
 */
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
  /** Add a manual chunk with optional keywords and questions */
  addChunk: (data: { content: string; important_keywords?: string[]; question_keywords?: string[] }) => Promise<void>
  /** Update a chunk's content, keywords, or questions */
  updateChunk: (chunkId: string, data: { content?: string; important_keywords?: string[]; question_keywords?: string[] }) => Promise<void>
  /** Delete a chunk */
  deleteChunk: (chunkId: string) => Promise<void>
  /** Available filter: undefined = all, true = enabled, false = disabled */
  availableFilter: boolean | undefined
  /** Set available filter */
  setAvailableFilter: (value: boolean | undefined) => void
  /** Toggle a single chunk's availability */
  toggleChunk: (chunkId: string, available: boolean) => Promise<void>
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

  // UI-only state for pagination, search, and availability filter
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [availableFilter, setAvailableFilter] = useState<boolean | undefined>(undefined)

  // Fetch chunks via TanStack Query with pagination params
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.datasets.chunks(datasetId ?? '', { page, search, docId, available: availableFilter }),
    queryFn: () => datasetApi.listChunks(datasetId!, {
      page,
      limit: CHUNK_LIMIT,
      ...(search ? { search } : {}),
      ...(docId ? { doc_id: docId } : {}),
      ...(availableFilter !== undefined ? { available: availableFilter } : {}),
    }),
    enabled: !!datasetId,
  })

  /** Helper to invalidate all chunk queries for this dataset */
  const invalidateChunks = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.datasets.chunks(datasetId!) })
  }

  const addMutation = useMutation({
    mutationKey: ['datasets', 'chunks', 'create'],
    mutationFn: (data: { content: string; important_keywords?: string[]; question_keywords?: string[] }) =>
      datasetApi.addChunk(datasetId!, { ...data, ...(docId ? { doc_id: docId } : {}) }),
    meta: { successMessage: t('datasetSettings.chunks.addSuccess') },
    onSuccess: invalidateChunks,
  })

  // Update chunk mutation — supports content, keywords, and questions
  const updateMutation = useMutation({
    mutationKey: ['datasets', 'chunks', 'update'],
    mutationFn: ({ chunkId, data }: { chunkId: string; data: { content?: string; important_keywords?: string[]; question_keywords?: string[] } }) =>
      datasetApi.updateChunk(datasetId!, chunkId, data),
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

  // Toggle single chunk availability via updateChunk API
  const toggleMutation = useMutation({
    mutationKey: ['datasets', 'chunks', 'toggle'],
    mutationFn: ({ chunkId, available }: { chunkId: string; available: boolean }) =>
      datasetApi.updateChunk(datasetId!, chunkId, { available }),
    meta: { successMessage: t('datasetSettings.chunks.toggleSuccess') },
    onSuccess: invalidateChunks,
  })

  /** Add a manual chunk with optional keywords and questions */
  const addChunk = async (data: { content: string; important_keywords?: string[]; question_keywords?: string[] }) => {
    if (!datasetId) return
    await addMutation.mutateAsync(data)
  }

  /** Update a chunk's content, keywords, or questions */
  const updateChunk = async (chunkId: string, data: { content?: string; important_keywords?: string[]; question_keywords?: string[] }) => {
    if (!datasetId) return
    await updateMutation.mutateAsync({ chunkId, data })
  }

  /** Delete a chunk */
  const deleteChunk = async (chunkId: string) => {
    if (!datasetId) return
    await deleteMutation.mutateAsync(chunkId)
  }

  /** Toggle a single chunk's availability */
  const toggleChunk = async (chunkId: string, available: boolean) => {
    if (!datasetId) return
    await toggleMutation.mutateAsync({ chunkId, available })
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
    availableFilter,
    setAvailableFilter,
    toggleChunk,
  }
}

// ============================================================================
// useDatasetSettings — Dataset settings CRUD
// ============================================================================

/**
 * @description Return type for the useDatasetSettings hook with settings state and save operations.
 */
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
// Dataset Overview
// ============================================================================

/**
 * @description Hook to fetch dataset overview statistics.
 * @param datasetId - Dataset UUID
 * @returns Overview stats (total_documents, finished, failed, processing, cancelled)
 */
export function useDatasetOverview(datasetId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.datasets.overview(datasetId ?? ''),
    queryFn: () => datasetApi.getOverview(datasetId!),
    enabled: !!datasetId,
  })
}

/**
 * @description Hook to fetch paginated dataset processing logs.
 * @param datasetId - Dataset UUID
 * @param params - Pagination and filter params
 * @returns Paginated logs and total count
 */
export function useDatasetLogs(
  datasetId: string | undefined,
  params: { page?: number; limit?: number; status?: string } = {},
) {
  return useQuery({
    queryKey: queryKeys.datasets.logs(datasetId ?? '', params),
    queryFn: () => datasetApi.getLogs(datasetId!, params),
    enabled: !!datasetId,
  })
}

// ============================================================================
// Document Logs (Process Log Modal)
// ============================================================================

/**
 * @description Hook to fetch processing logs for a specific document.
 * @param datasetId - Dataset UUID
 * @param docId - Document ID
 * @returns Document info + array of task logs
 */
export function useDocumentLogs(
  datasetId: string | undefined,
  docId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.datasets.documentLogs(datasetId ?? '', docId ?? ''),
    queryFn: () => datasetApi.getDocumentLogs(datasetId!, docId!),
    enabled: !!datasetId && !!docId,
  })
}

// ============================================================================
// Knowledge Graph & RAPTOR
// ============================================================================

/**
 * @description Hook to fetch knowledge graph data for visualization.
 * @param datasetId - Dataset UUID
 * @returns Graph nodes and edges
 */
export function useGraphData(datasetId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.datasets.graph(datasetId ?? ''),
    queryFn: () => datasetApi.getGraphData(datasetId!),
    enabled: !!datasetId,
  })
}

/**
 * @description Hook to poll GraphRAG task status.
 * @param datasetId - Dataset UUID
 */
export function useGraphRAGStatus(datasetId: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.datasets.graphragStatus(datasetId ?? ''),
    queryFn: () => datasetApi.getAdvancedTaskStatus(datasetId!, 'graphrag'),
    enabled: !!datasetId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'running' ? PollInterval.FAST : false
    },
  })
  return query
}

/**
 * @description Hook to poll RAPTOR task status.
 * @param datasetId - Dataset UUID
 */
export function useRaptorStatus(datasetId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.datasets.raptorStatus(datasetId ?? ''),
    queryFn: () => datasetApi.getAdvancedTaskStatus(datasetId!, 'raptor'),
    enabled: !!datasetId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'running' ? PollInterval.FAST : false
    },
  })
}

/**
 * @description Hook to fetch GraphRAG metrics (entity/relation/community counts, last-built timestamp).
 * Auto-refreshes every 30 seconds while the tab is open.
 * @param datasetId - Dataset UUID
 * @returns Query result with graph metrics
 */
export function useGraphMetrics(datasetId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.datasets.graphMetrics(datasetId ?? ''),
    queryFn: () => datasetApi.getGraphMetrics(datasetId!),
    enabled: !!datasetId,
    // Refresh every 30s so metrics stay current while viewing
    refetchInterval: PollInterval.DEFAULT,
  })
}

/**
 * @description Mutation to trigger a GraphRAG task.
 * Accepts optional mode parameter for Light/Full mode selection.
 * @param datasetId - Dataset UUID
 */
export function useRunGraphRAG(datasetId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ docIds, mode }: { docIds?: string[]; mode?: 'light' | 'full' } = {}) => {
      // Route to mode-aware endpoint when mode is specified, fallback to legacy endpoint
      if (mode) return datasetApi.runGraphRAGWithMode(datasetId, mode)
      return datasetApi.runGraphRAG(datasetId, docIds) as unknown as Promise<{ task_id: string; mode: string; message: string }>
    },
    meta: { successMessage: t('datasets.graphRAGStarted') },
    onSuccess: () => {
      // Invalidate both status and metrics after triggering build
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.graphragStatus(datasetId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.graphMetrics(datasetId) })
    },
  })
}

/**
 * @description Mutation to trigger a RAPTOR task.
 * @param datasetId - Dataset UUID
 */
export function useRunRaptor(datasetId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (docIds?: string[]) => datasetApi.runRaptor(datasetId, docIds),
    meta: { successMessage: t('datasets.raptorStarted') },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.raptorStatus(datasetId) })
    },
  })
}

// ============================================================================
// Metadata Management
// ============================================================================

/**
 * @description Hook to fetch metadata fields for a dataset.
 * @param datasetId - Dataset UUID
 */
export function useMetadata(datasetId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.datasets.metadata(datasetId ?? ''),
    queryFn: () => datasetApi.getMetadata(datasetId!),
    enabled: !!datasetId,
  })
}

/**
 * @description Mutation to update metadata fields for a dataset.
 * @param datasetId - Dataset UUID
 */
export function useUpdateMetadata(datasetId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (fields: import('../types').MetadataField[]) =>
      datasetApi.updateMetadata(datasetId, fields),
    meta: { successMessage: t('datasets.metadataUpdated') },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.metadata(datasetId) })
    },
  })
}

// ============================================================================
// Bulk Metadata Tags
// ============================================================================

/**
 * @description Mutation hook to bulk update metadata tags across multiple datasets.
 * Writes to parser_config.metadata_tags (free-form key-value tags).
 * Invalidates dataset list on success to reflect tag changes.
 * @returns Mutation hook for bulk metadata tag updates
 */
export function useBulkUpdateMetadata() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ datasetIds, metadataTags, mode }: {
      datasetIds: string[]
      metadataTags: Record<string, string>
      mode: 'merge' | 'overwrite'
    }) => datasetApi.bulkUpdateMetadata(datasetIds, metadataTags, mode),
    meta: { successMessage: t('datasets.applyTagChanges') },
    onSuccess: () => {
      // Invalidate dataset list and tag aggregations to reflect changes
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.list() })
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.tagAggregations() })
    },
  })
}

/**
 * @description Query hook to fetch aggregated tag keys and values from datasets.
 * Used by TagFilterChips to discover available metadata filter options.
 * @param {string[]} [datasetIds] - Optional dataset UUIDs to scope aggregation
 * @returns Query result with tag aggregation data
 */
export function useTagAggregations(datasetIds?: string[]) {
  return useQuery({
    queryKey: queryKeys.datasets.tagAggregations(datasetIds),
    queryFn: () => datasetApi.getTagAggregations(datasetIds),
  })
}

// ============================================================================
// Per-Document Parser Change
// ============================================================================

/**
 * @description Mutation to change a document's parser method.
 * Invalidates both documents and chunks queries on success.
 * @param {string} datasetId - Dataset UUID
 * @returns Mutation hook for changing document parser
 */
export function useChangeDocumentParser(datasetId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ docId, parser_id, parser_config }: {
      docId: string
      parser_id: string
      parser_config?: Record<string, unknown>
    }) => {
      // Build payload, omitting parser_config when undefined to satisfy exactOptionalPropertyTypes
      const payload: { parser_id: string; parser_config?: Record<string, unknown> } = { parser_id }
      if (parser_config !== undefined) payload.parser_config = parser_config
      return datasetApi.changeDocumentParser(datasetId, docId, payload)
    },
    meta: { successMessage: t('datasets.changeParserSuccess') },
    onSuccess: () => {
      // Invalidate documents to reflect reset progress and chunks to clear stale data
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.documents(datasetId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.chunks(datasetId) })
    },
  })
}

// ============================================================================
// Web Crawl
// ============================================================================

/**
 * @description Mutation to create a document from a web URL.
 * Invalidates documents query on success.
 * @param {string} datasetId - Dataset UUID
 * @returns Mutation hook for web crawl document creation
 */
export function useWebCrawl(datasetId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { url: string; name?: string; auto_parse?: boolean }) =>
      datasetApi.webCrawlDocument(datasetId, data),
    meta: { successMessage: t('datasets.webCrawlSuccess') },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.documents(datasetId) })
    },
  })
}

// ============================================================================
// Dataset Policy
// ============================================================================

/**
 * @description Mutation hook to update ABAC policy rules for a dataset.
 * Invalidates the dataset list and detail queries on success.
 * @param {string} datasetId - Dataset UUID
 * @returns Mutation hook for updating dataset policy rules
 */
export function useUpdateDatasetPolicy(datasetId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (policyRules: AbacPolicyRule[]) =>
      datasetApi.updateDatasetPolicy(datasetId, policyRules),
    meta: { successMessage: t('accessControl.policy.saveSuccess') },
    onSuccess: () => {
      // Invalidate dataset queries to reflect updated policy rules
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.all })
    },
    onError: () => {
      // Error toast handled by global mutation handler via meta
    },
  })
}

