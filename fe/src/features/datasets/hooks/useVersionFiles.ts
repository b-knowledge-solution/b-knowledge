/**
 * @fileoverview Hook for managing files within a document version.
 * Handles file listing, upload, delete, and conversion operations via TanStack Query.
 *
 * @module features/datasets/hooks/useVersionFiles
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { datasetApi } from '../api/datasetApi'
import type { VersionFile, ConverterJob } from '../types'
import { globalMessage } from '@/app/App'
import { queryKeys } from '@/lib/queryKeys'

// ============================================================================
// Types
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

// ============================================================================
// Hook
// ============================================================================

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
