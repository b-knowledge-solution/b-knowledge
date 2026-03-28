/**
 * @fileoverview TanStack Query hooks for connector (external source) operations.
 * Wraps connectorApi functions with useQuery/useMutation for cache management.
 *
 * @module features/datasets/api/connectorQueries
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { queryKeys } from '@/lib/queryKeys'
import { connectorApi } from './connectorApi'
import type { CreateConnectorDto, UpdateConnectorDto } from '../types'

/**
 * @description Fetch all connectors for a specific knowledge base (dataset).
 * @param {string} kbId - Knowledge base UUID
 * @returns {object} Query result with connectors data, loading state, and refetch
 */
export function useConnectors(kbId: string) {
  return useQuery({
    queryKey: queryKeys.datasets.connectors(kbId),
    queryFn: () => connectorApi.listConnectors(kbId),
    enabled: !!kbId,
  })
}

/**
 * @description Create a new external source connector and invalidate the connectors list.
 * @param {string} kbId - Knowledge base UUID for cache invalidation
 * @returns {object} Mutation result with mutateAsync and status
 */
export function useCreateConnector(kbId: string) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: CreateConnectorDto) => connectorApi.createConnector(data),
    meta: { successMessage: t('datasets.connectors.createSuccess') },
    onSuccess: () => {
      // Invalidate connectors list to show the new connector
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.connectors(kbId) })
    },
  })
}

/**
 * @description Update an existing connector and invalidate the connectors list.
 * @param {string} kbId - Knowledge base UUID for cache invalidation
 * @returns {object} Mutation result with mutateAsync and status
 */
export function useUpdateConnector(kbId: string) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateConnectorDto }) =>
      connectorApi.updateConnector(id, data),
    meta: { successMessage: t('datasets.connectors.updateSuccess') },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.connectors(kbId) })
    },
  })
}

/**
 * @description Delete a connector and invalidate the connectors list.
 * @param {string} kbId - Knowledge base UUID for cache invalidation
 * @returns {object} Mutation result with mutateAsync and status
 */
export function useDeleteConnector(kbId: string) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => connectorApi.deleteConnector(id),
    meta: { successMessage: t('datasets.connectors.deleteSuccess') },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.connectors(kbId) })
    },
  })
}

/**
 * @description Trigger an immediate sync for a connector.
 * @param {string} kbId - Knowledge base UUID for cache invalidation
 * @returns {object} Mutation result with mutateAsync and status
 */
export function useTriggerSync(kbId: string) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, pollRangeStart }: { id: string; pollRangeStart?: string }) =>
      connectorApi.triggerSync(id, pollRangeStart),
    meta: { successMessage: t('datasets.connectors.syncTriggered') },
    onSuccess: (_data, variables) => {
      // Invalidate both connectors list and sync logs for the triggered connector
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.connectors(kbId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.syncLogs(variables.id) })
    },
  })
}

/**
 * @description Fetch sync logs for a specific connector with pagination.
 * @param {string} connectorId - Connector UUID
 * @param {object} [params] - Pagination and filter options
 * @returns {object} Query result with sync logs data
 */
export function useSyncLogs(connectorId: string, params?: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: queryKeys.datasets.syncLogs(connectorId),
    queryFn: () => connectorApi.listSyncLogs(connectorId, params),
    enabled: !!connectorId,
  })
}
