/**
 * @fileoverview TanStack Query hooks for memory pool data fetching and mutations.
 * Wraps memoryApi raw HTTP calls with caching, invalidation, and error handling.
 *
 * @module features/memory/api/memoryQueries
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { memoryApi } from './memoryApi'
import type { CreateMemoryDto, UpdateMemoryDto } from '../types/memory.types'

// ============================================================================
// Query Hooks (Read)
// ============================================================================

/**
 * @description Fetch all memory pools for the current tenant
 * @returns TanStack Query result with memory pool list
 */
export function useMemories() {
  return useQuery({
    queryKey: queryKeys.memory.lists(),
    queryFn: () => memoryApi.getMemories(),
  })
}

/**
 * @description Fetch a single memory pool by ID with automatic caching
 * @param {string} id - Memory pool UUID
 * @returns TanStack Query result with memory pool detail, disabled when id is falsy
 */
export function useMemory(id: string) {
  return useQuery({
    queryKey: queryKeys.memory.detail(id),
    queryFn: () => memoryApi.getMemory(id),
    // Only fetch when id is provided (avoids request with empty string)
    enabled: !!id,
  })
}

/**
 * @description Fetch paginated messages for a memory pool with optional filters
 * @param {string} id - Memory pool UUID
 * @param {object} [params] - Pagination and filter parameters
 * @returns TanStack Query result with paginated message list, disabled when id is falsy
 */
export function useMemoryMessages(
  id: string,
  params?: { page?: number; page_size?: number; keyword?: string; message_type?: number }
) {
  return useQuery({
    queryKey: queryKeys.memory.messages(id),
    queryFn: () => memoryApi.getMemoryMessages(id, params),
    // Only fetch when id is provided
    enabled: !!id,
  })
}

// ============================================================================
// Mutation Hooks (Write)
// ============================================================================

/**
 * @description Create a new memory pool and invalidate the memory list cache on success
 * @returns TanStack useMutation result for creating a memory pool
 */
export function useCreateMemory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateMemoryDto) => memoryApi.createMemory(data),
    onSuccess: () => {
      // Refresh memory list to include newly created pool
      queryClient.invalidateQueries({ queryKey: queryKeys.memory.lists() })
    },
  })
}

/**
 * @description Update an existing memory pool and invalidate both detail and list caches
 * @returns TanStack useMutation result for updating a memory pool
 */
export function useUpdateMemory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMemoryDto }) =>
      memoryApi.updateMemory(id, data),
    onSuccess: (_result, { id }) => {
      // Refresh both the specific pool detail and the pool list
      queryClient.invalidateQueries({ queryKey: queryKeys.memory.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.memory.lists() })
    },
  })
}

/**
 * @description Delete a memory pool and invalidate the memory list cache
 * @returns TanStack useMutation result for deleting a memory pool
 */
export function useDeleteMemory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => memoryApi.deleteMemory(id),
    onSuccess: () => {
      // Refresh memory list to remove deleted pool
      queryClient.invalidateQueries({ queryKey: queryKeys.memory.lists() })
    },
  })
}

/**
 * @description Search memory messages using semantic similarity (POST mutation)
 * @returns TanStack useMutation result for searching memory messages
 */
export function useSearchMemoryMessages() {
  return useMutation({
    mutationFn: ({ id, query, topK }: { id: string; query: string; topK?: number }) =>
      memoryApi.searchMemoryMessages(id, query, topK),
  })
}

/**
 * @description Delete a single message from a memory pool and invalidate message cache
 * @returns TanStack useMutation result for deleting a memory message
 */
export function useDeleteMemoryMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, messageId }: { id: string; messageId: string }) =>
      memoryApi.deleteMemoryMessage(id, messageId),
    onSuccess: (_result, { id }) => {
      // Refresh message list for this memory pool
      queryClient.invalidateQueries({ queryKey: queryKeys.memory.messages(id) })
    },
  })
}

/**
 * @description Mark a memory message as forgotten and invalidate message cache
 * @returns TanStack useMutation result for forgetting a memory message
 */
export function useForgetMemoryMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, messageId }: { id: string; messageId: string }) =>
      memoryApi.forgetMemoryMessage(id, messageId),
    onSuccess: (_result, { id }) => {
      // Refresh message list to reflect forgotten status
      queryClient.invalidateQueries({ queryKey: queryKeys.memory.messages(id) })
    },
  })
}
