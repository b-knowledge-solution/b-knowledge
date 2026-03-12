/**
 * @fileoverview Hook for chunk management operations.
 * Uses TanStack Query for server state with pagination and search support.
 *
 * @module features/datasets/hooks/useChunks
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { datasetApi } from '../api/datasetApi'
import type { Chunk } from '../types'
import { queryKeys } from '@/lib/queryKeys'

// ============================================================================
// Types
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

// ============================================================================
// Hook
// ============================================================================

const LIMIT = 20

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
      limit: LIMIT,
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
