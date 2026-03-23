/**
 * @fileoverview TanStack Query hooks for the API Keys feature.
 *   Provides useQuery for listing keys and useMutation for CRUD operations.
 * @module features/api-keys/api/apiKeyQueries
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { queryKeys } from '@/lib/queryKeys'
import { apiKeyApi } from './apiKeyApi'
import type { CreateApiKeyDto, UpdateApiKeyDto } from '../types/apiKey.types'

/**
 * @description Hook to fetch all API keys for the current user
 * @returns {UseQueryResult} TanStack Query result with API key array
 */
export function useApiKeys() {
  return useQuery({
    queryKey: queryKeys.apiKeys.list(),
    queryFn: () => apiKeyApi.list(),
  })
}

/**
 * @description Hook to create a new API key.
 *   Invalidates the list cache on success.
 * @returns {UseMutationResult} Mutation with the created key (including plaintext)
 */
export function useCreateApiKey() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateApiKeyDto) => apiKeyApi.create(data),
    meta: { successMessage: t('apiKeys.createdSuccess') },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all })
    },
  })
}

/**
 * @description Hook to update an API key (name, scopes, active status).
 *   Invalidates the list cache on success.
 * @returns {UseMutationResult} Mutation with the updated key
 */
export function useUpdateApiKey() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateApiKeyDto }) =>
      apiKeyApi.update(id, data),
    meta: { successMessage: t('apiKeys.updateSuccess') },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all })
    },
  })
}

/**
 * @description Hook to delete an API key permanently.
 *   Invalidates the list cache on success.
 * @returns {UseMutationResult} Mutation returning void on success
 */
export function useDeleteApiKey() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => apiKeyApi.remove(id),
    meta: { successMessage: t('apiKeys.deleteSuccess') },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all })
    },
  })
}
