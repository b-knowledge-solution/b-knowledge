/**
 * @fileoverview TanStack Query hooks for LLM Provider data fetching.
 * @module features/llm-provider/api/llmProviderQueries
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { getProviders, getPresets, getDefaults } from './llmProviderApi'

/**
 * @description Fetch all active LLM providers.
 * @returns TanStack Query result with provider list
 */
export function useProviders() {
  return useQuery({
    queryKey: queryKeys.llmProvider.list(),
    queryFn: getProviders,
  })
}

/**
 * @description Fetch factory presets with pre-defined models.
 * @returns TanStack Query result with preset list
 */
export function usePresets() {
  return useQuery({
    queryKey: queryKeys.llmProvider.presets(),
    queryFn: getPresets,
  })
}

/**
 * @description Fetch the default providers (one per model_type).
 * @returns TanStack Query result with default providers
 */
export function useDefaultProviders() {
  return useQuery({
    queryKey: queryKeys.llmProvider.defaults(),
    queryFn: getDefaults,
  })
}

/**
 * @description Helper to invalidate the providers list cache.
 * @returns A function that triggers cache invalidation
 */
export function useInvalidateProviders() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.llmProvider.list() })
}
