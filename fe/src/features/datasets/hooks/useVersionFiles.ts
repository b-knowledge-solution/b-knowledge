/**
 * @fileoverview Hook for managing files within a document version.
 * Handles file listing, upload with progress, delete, and conversion operations.
 *
 * @module features/datasets/hooks/useVersionFiles
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { datasetApi } from '../api/datasetApi'
import type { VersionFile, ConverterJob } from '../types'
import { globalMessage } from '@/app/App'

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
  const [files, setFiles] = useState<VersionFile[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [jobs, setJobs] = useState<ConverterJob[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)

  /** Fetch files from the API */
  const fetchFiles = useCallback(async () => {
    if (!datasetId || !versionId) return
    setLoading(true)
    try {
      const data = await datasetApi.getVersionFiles(datasetId, versionId)
      setFiles(data)
    } catch (error) {
      console.error('Error fetching version files:', error)
    } finally {
      setLoading(false)
    }
  }, [datasetId, versionId])

  /** Fetch converter jobs */
  const fetchJobs = useCallback(async () => {
    if (!datasetId || !versionId) return
    setLoadingJobs(true)
    try {
      const data = await datasetApi.getConverterJobs(datasetId, versionId)
      setJobs(data)
    } catch (error) {
      console.error('Error fetching converter jobs:', error)
    } finally {
      setLoadingJobs(false)
    }
  }, [datasetId, versionId])

  // Fetch on mount and when IDs change
  useEffect(() => {
    fetchFiles()
    fetchJobs()
  }, [fetchFiles, fetchJobs])

  // Auto-refresh when files are in-progress
  useEffect(() => {
    const hasInProgress = files.some(
      (f) => f.status === 'pending' || f.status === 'converting' || f.status === 'parsing',
    )
    if (!hasInProgress || files.length === 0) return

    const interval = setInterval(() => {
      fetchFiles()
    }, 5000)

    return () => clearInterval(interval)
  }, [files, fetchFiles])

  /** Upload files to the version */
  const uploadFiles = useCallback(async (fileList: File[]) => {
    if (!datasetId || !versionId) return
    setUploading(true)
    setUploadProgress(0)
    try {
      await datasetApi.uploadVersionFiles(datasetId, versionId, fileList)
      setUploadProgress(100)
      globalMessage.success(t('versions.uploadSuccess', { count: fileList.length }))
      await fetchFiles()
    } catch (error: any) {
      globalMessage.error(error?.message || t('common.error'))
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }, [datasetId, versionId, fetchFiles, t])

  /** Delete files by ID */
  const deleteFiles = useCallback(async (fileIds: string[]) => {
    if (!datasetId || !versionId) return
    try {
      await datasetApi.deleteVersionFiles(datasetId, versionId, fileIds)
      globalMessage.success(t('versions.deleteFilesSuccess', { count: fileIds.length }))
      await fetchFiles()
    } catch (error: any) {
      globalMessage.error(error?.message || t('common.error'))
    }
  }, [datasetId, versionId, fetchFiles, t])

  /** Start file conversion */
  const convertFiles = useCallback(async () => {
    if (!datasetId || !versionId) return
    try {
      await datasetApi.convertFiles(datasetId, versionId)
      globalMessage.success(t('versions.convertStarted'))
      await fetchFiles()
      await fetchJobs()
    } catch (error: any) {
      globalMessage.error(error?.message || t('common.error'))
    }
  }, [datasetId, versionId, fetchFiles, fetchJobs, t])

  /** Start file parsing in RAGFlow */
  const parseFiles = useCallback(async () => {
    if (!datasetId || !versionId) return
    try {
      await datasetApi.parseFiles(datasetId, versionId)
      globalMessage.success(t('versions.parseStarted'))
      await fetchFiles()
    } catch (error: any) {
      globalMessage.error(error?.message || t('common.error'))
    }
  }, [datasetId, versionId, fetchFiles, t])

  /** Sync file statuses from RAGFlow */
  const syncStatus = useCallback(async () => {
    if (!datasetId || !versionId) return
    try {
      await datasetApi.syncFileStatus(datasetId, versionId)
      globalMessage.success(t('versions.syncSuccess'))
      await fetchFiles()
    } catch (error: any) {
      globalMessage.error(error?.message || t('common.error'))
    }
  }, [datasetId, versionId, fetchFiles, t])

  /** Re-queue failed files for conversion */
  const requeueFiles = useCallback(async () => {
    if (!datasetId || !versionId) return
    try {
      await datasetApi.requeueFiles(datasetId, versionId)
      globalMessage.success(t('versions.requeueSuccess'))
      await fetchFiles()
    } catch (error: any) {
      globalMessage.error(error?.message || t('common.error'))
    }
  }, [datasetId, versionId, fetchFiles, t])

  return {
    files,
    loading,
    uploading,
    uploadProgress,
    uploadFiles,
    deleteFiles,
    convertFiles,
    parseFiles,
    syncStatus,
    requeueFiles,
    refresh: fetchFiles,
    jobs,
    loadingJobs,
    refreshJobs: fetchJobs,
  }
}
