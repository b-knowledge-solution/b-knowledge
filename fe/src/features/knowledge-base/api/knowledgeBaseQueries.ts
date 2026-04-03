/**
 * @fileoverview TanStack Query hooks for knowledge base data fetching.
 * @module features/knowledge-base/api/knowledgeBaseQueries
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import {
  getKnowledgeBases,
  getKnowledgeBaseById,
  getDocumentCategories,
  getCategoryVersions,
  getKnowledgeBaseChats,
  getKnowledgeBaseSearches,
  getKnowledgeBasePermissions,
  getKnowledgeBaseDatasets,
  getVersionDocuments,
  fetchKnowledgeBaseMembers,
  addKnowledgeBaseMember,
  removeKnowledgeBaseMember,
  fetchKnowledgeBaseDatasets,
  bindKnowledgeBaseDatasets,
  unbindKnowledgeBaseDataset,
  fetchKnowledgeBaseActivity,
} from './knowledgeBaseApi'

/**
 * @description Fetch all knowledge bases accessible to the current user.
 * @returns TanStack Query result with knowledge base list
 */
export function useKnowledgeBases() {
  return useQuery({
    queryKey: queryKeys.knowledgeBase.list(),
    queryFn: getKnowledgeBases,
  })
}

/**
 * @description Fetch a single knowledge base by ID.
 * @param id - Knowledge Base UUID
 * @returns TanStack Query result with knowledge base details
 */
export function useKnowledgeBase(id: string) {
  return useQuery({
    queryKey: queryKeys.knowledgeBase.detail(id),
    queryFn: () => getKnowledgeBaseById(id),
    enabled: !!id,
  })
}

/**
 * @description Fetch document categories for a knowledge base.
 * @param knowledgeBaseId - Knowledge Base UUID
 * @returns TanStack Query result with categories
 */
export function useDocumentCategories(knowledgeBaseId: string) {
  return useQuery({
    queryKey: queryKeys.knowledgeBase.categories(knowledgeBaseId),
    queryFn: () => getDocumentCategories(knowledgeBaseId),
    enabled: !!knowledgeBaseId,
  })
}

/**
 * @description Fetch versions for a category within a knowledge base.
 * @param knowledgeBaseId - Knowledge Base UUID
 * @param categoryId - Category UUID
 * @returns TanStack Query result with category versions
 */
export function useCategoryVersions(knowledgeBaseId: string, categoryId: string) {
  return useQuery({
    queryKey: queryKeys.knowledgeBase.versions(knowledgeBaseId, categoryId),
    queryFn: () => getCategoryVersions(knowledgeBaseId, categoryId),
    enabled: !!knowledgeBaseId && !!categoryId,
  })
}

/**
 * @description Fetch chat assistants for a knowledge base.
 * @param knowledgeBaseId - Knowledge Base UUID
 * @returns TanStack Query result with knowledge base chats
 */
export function useKnowledgeBaseChats(knowledgeBaseId: string) {
  return useQuery({
    queryKey: queryKeys.knowledgeBase.chats(knowledgeBaseId),
    queryFn: () => getKnowledgeBaseChats(knowledgeBaseId),
    enabled: !!knowledgeBaseId,
  })
}

/**
 * @description Fetch search apps for a knowledge base.
 * @param knowledgeBaseId - Knowledge Base UUID
 * @returns TanStack Query result with knowledge base searches
 */
export function useKnowledgeBaseSearches(knowledgeBaseId: string) {
  return useQuery({
    queryKey: queryKeys.knowledgeBase.searches(knowledgeBaseId),
    queryFn: () => getKnowledgeBaseSearches(knowledgeBaseId),
    enabled: !!knowledgeBaseId,
  })
}

/**
 * @description Fetch permissions for a knowledge base.
 * @param knowledgeBaseId - Knowledge Base UUID
 * @returns TanStack Query result with knowledge base permissions
 */
export function useKnowledgeBasePermissions(knowledgeBaseId: string) {
  return useQuery({
    queryKey: queryKeys.knowledgeBase.permissions(knowledgeBaseId),
    queryFn: () => getKnowledgeBasePermissions(knowledgeBaseId),
    enabled: !!knowledgeBaseId,
  })
}

/**
 * @description Fetch datasets linked to a knowledge base.
 * @param knowledgeBaseId - Knowledge Base UUID
 * @returns TanStack Query result with knowledge base datasets
 */
export function useKnowledgeBaseDatasets(knowledgeBaseId: string) {
  return useQuery({
    queryKey: queryKeys.knowledgeBase.datasets(knowledgeBaseId),
    queryFn: () => getKnowledgeBaseDatasets(knowledgeBaseId),
    enabled: !!knowledgeBaseId,
  })
}

/**
 * @description Fetch documents in a version's dataset.
 * @param knowledgeBaseId - Knowledge Base UUID
 * @param categoryId - Category UUID
 * @param versionId - Version UUID
 * @param query - Optional pagination/search params
 * @returns TanStack Query result with version documents
 */
export function useVersionDocuments(
  knowledgeBaseId: string,
  categoryId: string,
  versionId: string,
  query?: { page?: number; page_size?: number; keywords?: string },
) {
  return useQuery({
    queryKey: queryKeys.knowledgeBase.documents(knowledgeBaseId, categoryId, versionId),
    queryFn: () => getVersionDocuments(knowledgeBaseId, categoryId, versionId, query),
    enabled: !!knowledgeBaseId && !!categoryId && !!versionId,
  })
}

// ============================================================================
// Knowledge Base Members Hooks
// ============================================================================

/**
 * @description Fetch all members of a knowledge base with caching via queryKeys.knowledgeBase.members
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @returns TanStack Query result with knowledge base member list
 */
export function useKnowledgeBaseMembers(knowledgeBaseId: string) {
  return useQuery({
    queryKey: queryKeys.knowledgeBase.members(knowledgeBaseId),
    queryFn: () => fetchKnowledgeBaseMembers(knowledgeBaseId),
    enabled: !!knowledgeBaseId,
  })
}

/**
 * @description Mutation to add a user as a member to a knowledge base. Invalidates members query on success.
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @returns TanStack useMutation result for adding a member
 */
export function useAddMember(knowledgeBaseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => addKnowledgeBaseMember(knowledgeBaseId, userId),
    onSuccess: () => {
      // Refresh member list after successful add
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBase.members(knowledgeBaseId) })
    },
  })
}

/**
 * @description Mutation to remove a member from a knowledge base. Invalidates members query on success.
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @returns TanStack useMutation result for removing a member
 */
export function useRemoveMember(knowledgeBaseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => removeKnowledgeBaseMember(knowledgeBaseId, userId),
    onSuccess: () => {
      // Refresh member list after successful removal
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBase.members(knowledgeBaseId) })
    },
  })
}

// ============================================================================
// Knowledge Base Dataset Binding Hooks
// ============================================================================

/**
 * @description Fetch datasets bound to a knowledge base with caching via queryKeys.knowledgeBase.datasets
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @returns TanStack Query result with bound dataset list
 */
export function useKnowledgeBaseBoundDatasets(knowledgeBaseId: string) {
  return useQuery({
    queryKey: queryKeys.knowledgeBase.datasets(knowledgeBaseId),
    queryFn: () => fetchKnowledgeBaseDatasets(knowledgeBaseId),
    enabled: !!knowledgeBaseId,
  })
}

/**
 * @description Mutation to bind multiple datasets to a knowledge base. Invalidates datasets query on success.
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @returns TanStack useMutation result for binding datasets
 */
export function useBindDatasets(knowledgeBaseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datasetIds: string[]) => bindKnowledgeBaseDatasets(knowledgeBaseId, datasetIds),
    onSuccess: () => {
      // Refresh bound dataset list after binding
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBase.datasets(knowledgeBaseId) })
    },
  })
}

/**
 * @description Mutation to unbind a dataset from a knowledge base. Invalidates datasets query on success.
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @returns TanStack useMutation result for unbinding a dataset
 */
export function useUnbindDataset(knowledgeBaseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datasetId: string) => unbindKnowledgeBaseDataset(knowledgeBaseId, datasetId),
    onSuccess: () => {
      // Refresh bound dataset list after unbinding
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBase.datasets(knowledgeBaseId) })
    },
  })
}

// ============================================================================
// Knowledge Base Activity Hook
// ============================================================================

/**
 * @description Fetch paginated activity feed for a knowledge base with caching via queryKeys.knowledgeBase.activity
 * @param {string} knowledgeBaseId - Knowledge Base UUID
 * @param {number} [limit=20] - Number of items per page
 * @param {number} [offset=0] - Pagination offset
 * @returns TanStack Query result with paginated activity entries
 */
export function useKnowledgeBaseActivity(knowledgeBaseId: string, limit: number = 20, offset: number = 0) {
  return useQuery({
    queryKey: [...queryKeys.knowledgeBase.activity(knowledgeBaseId), { limit, offset }],
    queryFn: () => fetchKnowledgeBaseActivity(knowledgeBaseId, limit, offset),
    enabled: !!knowledgeBaseId,
  })
}
