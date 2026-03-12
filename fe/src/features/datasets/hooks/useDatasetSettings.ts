/**
 * @fileoverview Hook for dataset settings CRUD operations.
 * Uses TanStack Query for fetching and mutating dataset settings.
 *
 * @module features/datasets/hooks/useDatasetSettings
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { datasetApi } from '../api/datasetApi'
import type { DatasetSettings } from '../types'
import { queryKeys } from '@/lib/queryKeys'

// ============================================================================
// Types
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

// ============================================================================
// Hook
// ============================================================================

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
