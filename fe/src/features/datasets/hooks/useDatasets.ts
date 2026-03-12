/**
 * @fileoverview Hooks for dataset and document list management.
 * Uses TanStack Query for server state and local useState for UI state.
 *
 * @module features/datasets/hooks/useDatasets
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { datasetApi } from '../api/datasetApi'
import type { Dataset, CreateDatasetDto, Document } from '../types'
import { globalMessage } from '@/app/App'
import { queryKeys } from '@/lib/queryKeys'

// ============================================================================
// Form data type
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
