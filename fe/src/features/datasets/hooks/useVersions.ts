/**
 * @fileoverview Hook for managing document versions within a dataset.
 * Provides CRUD operations for versions with optimistic state updates.
 *
 * @module features/datasets/hooks/useVersions
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { datasetApi } from '../api/datasetApi'
import type { DocumentVersion, CreateVersionDto, UpdateVersionDto } from '../types'
import { globalMessage } from '@/app/App'

// ============================================================================
// Types
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

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing document versions within a dataset.
 *
 * @param {string | undefined} datasetId - The dataset ID to fetch versions for
 * @returns {UseVersionsReturn} Version management state and handlers
 */
export function useVersions(datasetId: string | undefined): UseVersionsReturn {
  const { t } = useTranslation()
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersion | null>(null)

  /** Fetch versions from the API */
  const fetchVersions = useCallback(async () => {
    if (!datasetId) return
    setLoading(true)
    try {
      const data = await datasetApi.getVersions(datasetId)
      setVersions(data)
      // Auto-select first active version if none selected
      if (!selectedVersion) {
        const active = data.find((v) => v.status === 'active') || data[0]
        setSelectedVersion(active || null)
      }
    } catch (error) {
      console.error('Error fetching versions:', error)
    } finally {
      setLoading(false)
    }
  }, [datasetId])

  // Fetch on mount and when datasetId changes
  useEffect(() => {
    setSelectedVersion(null)
    fetchVersions()
  }, [fetchVersions])

  /** Select a version */
  const selectVersion = useCallback((version: DocumentVersion | null) => {
    setSelectedVersion(version)
  }, [])

  /** Create a new version */
  const createVersion = useCallback(async (data: CreateVersionDto) => {
    if (!datasetId) return
    try {
      await datasetApi.createVersion(datasetId, data)
      globalMessage.success(t('versions.createSuccess'))
      await fetchVersions()
    } catch (error: any) {
      globalMessage.error(error?.message || t('common.error'))
      throw error
    }
  }, [datasetId, fetchVersions, t])

  /** Update a version */
  const updateVersion = useCallback(async (versionId: string, data: UpdateVersionDto) => {
    if (!datasetId) return
    try {
      await datasetApi.updateVersion(datasetId, versionId, data)
      globalMessage.success(t('versions.updateSuccess'))
      await fetchVersions()
    } catch (error: any) {
      globalMessage.error(error?.message || t('common.error'))
      throw error
    }
  }, [datasetId, fetchVersions, t])

  /** Archive a version */
  const archiveVersion = useCallback(async (versionId: string) => {
    if (!datasetId) return
    try {
      await datasetApi.updateVersion(datasetId, versionId, { status: 'archived' })
      globalMessage.success(t('versions.archiveSuccess'))
      // Deselect if the archived version was selected
      if (selectedVersion?.id === versionId) {
        setSelectedVersion(null)
      }
      await fetchVersions()
    } catch (error: any) {
      globalMessage.error(error?.message || t('common.error'))
    }
  }, [datasetId, fetchVersions, selectedVersion, t])

  /** Delete a version */
  const deleteVersion = useCallback(async (versionId: string) => {
    if (!datasetId) return
    if (!window.confirm(t('versions.confirmDeleteMessage'))) return
    try {
      await datasetApi.deleteVersion(datasetId, versionId)
      globalMessage.success(t('versions.deleteSuccess'))
      // Deselect if the deleted version was selected
      if (selectedVersion?.id === versionId) {
        setSelectedVersion(null)
      }
      await fetchVersions()
    } catch (error: any) {
      globalMessage.error(error?.message || t('common.error'))
    }
  }, [datasetId, fetchVersions, selectedVersion, t])

  return {
    versions,
    loading,
    selectedVersion,
    selectVersion,
    createVersion,
    updateVersion,
    archiveVersion,
    deleteVersion,
    refresh: fetchVersions,
  }
}
