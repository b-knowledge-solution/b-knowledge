/**
 * @fileoverview Hook for managing document versions within a dataset.
 * Uses TanStack Query for server state with local UI state for selection.
 *
 * @module features/datasets/hooks/useVersions
 */

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { datasetApi } from '../api/datasetApi'
import type { DocumentVersion, CreateVersionDto, UpdateVersionDto } from '../types'
import { queryKeys } from '@/lib/queryKeys'

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
