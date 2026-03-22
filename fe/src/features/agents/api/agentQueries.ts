/**
 * @fileoverview TanStack Query hooks for agent data fetching and mutations.
 * Wraps agentApi raw HTTP calls with caching, invalidation, and optimistic updates.
 *
 * @module features/agents/api/agentQueries
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { agentApi } from './agentApi'
import type { CreateAgentDto, UpdateAgentDto } from '../types/agent.types'

// ============================================================================
// Query Hooks (Read)
// ============================================================================

/**
 * @description Fetch paginated list of agents with optional filters for mode, status, search
 * @param {Record<string, unknown>} [filters] - Optional filter parameters passed to the list API
 * @returns TanStack Query result with paginated agent list
 */
export function useAgents(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.agents.list(filters ?? {}),
    queryFn: () => agentApi.list(filters as Parameters<typeof agentApi.list>[0]),
  })
}

/**
 * @description Fetch a single agent by ID with automatic caching and refetch
 * @param {string} id - Agent UUID
 * @returns TanStack Query result with agent detail, disabled when id is falsy
 */
export function useAgent(id: string) {
  return useQuery({
    queryKey: queryKeys.agents.detail(id),
    queryFn: () => agentApi.getById(id),
    // Only fetch when id is provided (avoids request with empty string)
    enabled: !!id,
  })
}

/**
 * @description Fetch all saved version snapshots for an agent
 * @param {string} id - Agent UUID
 * @returns TanStack Query result with version list, disabled when id is falsy
 */
export function useAgentVersions(id: string) {
  return useQuery({
    queryKey: [...queryKeys.agents.detail(id), 'versions'],
    queryFn: () => agentApi.listVersions(id),
    enabled: !!id,
  })
}

/**
 * @description Fetch execution run records for an agent
 * @param {string} agentId - Agent UUID
 * @returns TanStack Query result with run list, disabled when agentId is falsy
 */
export function useAgentRuns(agentId: string) {
  return useQuery({
    queryKey: queryKeys.agents.runs(agentId),
    queryFn: () => agentApi.listRuns(agentId),
    enabled: !!agentId,
  })
}

/**
 * @description Fetch all available agent templates for the template gallery
 * @returns TanStack Query result with template list
 */
export function useAgentTemplates() {
  return useQuery({
    queryKey: queryKeys.agents.templates(),
    queryFn: () => agentApi.listTemplates(),
  })
}

// ============================================================================
// Mutation Hooks (Write)
// ============================================================================

/**
 * @description Create a new agent and invalidate the agent list cache on success
 * @returns TanStack useMutation result for creating an agent
 */
export function useCreateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateAgentDto) => agentApi.create(data),
    onSuccess: () => {
      // Refresh agent list to include newly created agent
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.lists() })
    },
  })
}

/**
 * @description Update an existing agent and invalidate both detail and list caches
 * @returns TanStack useMutation result for updating an agent
 */
export function useUpdateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAgentDto }) =>
      agentApi.update(id, data),
    onSuccess: (_result, { id }) => {
      // Refresh both the specific agent detail and the agent list
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.lists() })
    },
  })
}

/**
 * @description Delete an agent and invalidate the agent list cache
 * @returns TanStack useMutation result for deleting an agent
 */
export function useDeleteAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => agentApi.delete(id),
    onSuccess: () => {
      // Refresh agent list to remove deleted agent
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.lists() })
    },
  })
}

/**
 * @description Duplicate an agent and invalidate the agent list cache
 * @returns TanStack useMutation result for duplicating an agent
 */
export function useDuplicateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => agentApi.duplicate(id),
    onSuccess: () => {
      // Refresh agent list to include the duplicate
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.lists() })
    },
  })
}

/**
 * @description Save the current agent state as a new version snapshot
 * @returns TanStack useMutation result for saving a version
 */
export function useSaveVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: { version_label?: string } }) =>
      agentApi.saveVersion(id, data),
    onSuccess: (_result, { id }) => {
      // Refresh version list for this agent
      queryClient.invalidateQueries({ queryKey: [...queryKeys.agents.detail(id), 'versions'] })
    },
  })
}

/**
 * @description Restore an agent to a previously saved version
 * @returns TanStack useMutation result for restoring a version
 */
export function useRestoreVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, versionId }: { id: string; versionId: string }) =>
      agentApi.restoreVersion(id, versionId),
    onSuccess: (_result, { id }) => {
      // Refresh agent detail and version list after restore
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(id) })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.agents.detail(id), 'versions'] })
    },
  })
}

/**
 * @description Delete a specific version snapshot
 * @returns TanStack useMutation result for deleting a version
 */
export function useDeleteVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, versionId }: { id: string; versionId: string }) =>
      agentApi.deleteVersion(id, versionId),
    onSuccess: (_result, { id }) => {
      // Refresh version list after deletion
      queryClient.invalidateQueries({ queryKey: [...queryKeys.agents.detail(id), 'versions'] })
    },
  })
}
