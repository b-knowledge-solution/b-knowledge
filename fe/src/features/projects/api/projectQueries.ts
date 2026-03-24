/**
 * @fileoverview TanStack Query hooks for project data fetching.
 * @module features/projects/api/projectQueries
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import {
  getProjects,
  getProjectById,
  getDocumentCategories,
  getCategoryVersions,
  getProjectChats,
  getProjectSearches,
  getProjectPermissions,
  getProjectDatasets,
  getVersionDocuments,
  fetchProjectMembers,
  addProjectMember,
  removeProjectMember,
  fetchProjectDatasets,
  bindProjectDatasets,
  unbindProjectDataset,
  fetchProjectActivity,
} from './projectApi'

/**
 * @description Fetch all projects accessible to the current user.
 * @returns TanStack Query result with project list
 */
export function useProjects() {
  return useQuery({
    queryKey: ['projects', 'list'],
    queryFn: getProjects,
  })
}

/**
 * @description Fetch a single project by ID.
 * @param id - Project UUID
 * @returns TanStack Query result with project details
 */
export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', 'detail', id],
    queryFn: () => getProjectById(id),
    enabled: !!id,
  })
}

/**
 * @description Fetch document categories for a project.
 * @param projectId - Project UUID
 * @returns TanStack Query result with categories
 */
export function useDocumentCategories(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'categories'],
    queryFn: () => getDocumentCategories(projectId),
    enabled: !!projectId,
  })
}

/**
 * @description Fetch versions for a category within a project.
 * @param projectId - Project UUID
 * @param categoryId - Category UUID
 * @returns TanStack Query result with category versions
 */
export function useCategoryVersions(projectId: string, categoryId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'categories', categoryId, 'versions'],
    queryFn: () => getCategoryVersions(projectId, categoryId),
    enabled: !!projectId && !!categoryId,
  })
}

/**
 * @description Fetch chat assistants for a project.
 * @param projectId - Project UUID
 * @returns TanStack Query result with project chats
 */
export function useProjectChats(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'chats'],
    queryFn: () => getProjectChats(projectId),
    enabled: !!projectId,
  })
}

/**
 * @description Fetch search apps for a project.
 * @param projectId - Project UUID
 * @returns TanStack Query result with project searches
 */
export function useProjectSearches(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'searches'],
    queryFn: () => getProjectSearches(projectId),
    enabled: !!projectId,
  })
}

/**
 * @description Fetch permissions for a project.
 * @param projectId - Project UUID
 * @returns TanStack Query result with project permissions
 */
export function useProjectPermissions(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'permissions'],
    queryFn: () => getProjectPermissions(projectId),
    enabled: !!projectId,
  })
}

/**
 * @description Fetch datasets linked to a project.
 * @param projectId - Project UUID
 * @returns TanStack Query result with project datasets
 */
export function useProjectDatasets(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'datasets'],
    queryFn: () => getProjectDatasets(projectId),
    enabled: !!projectId,
  })
}

/**
 * @description Fetch documents in a version's dataset.
 * @param projectId - Project UUID
 * @param categoryId - Category UUID
 * @param versionId - Version UUID
 * @param query - Optional pagination/search params
 * @returns TanStack Query result with version documents
 */
export function useVersionDocuments(
  projectId: string,
  categoryId: string,
  versionId: string,
  query?: { page?: number; page_size?: number; keywords?: string },
) {
  return useQuery({
    queryKey: ['projects', projectId, 'categories', categoryId, 'versions', versionId, 'documents', query],
    queryFn: () => getVersionDocuments(projectId, categoryId, versionId, query),
    enabled: !!projectId && !!categoryId && !!versionId,
  })
}

// ============================================================================
// Project Members Hooks
// ============================================================================

/**
 * @description Fetch all members of a project with caching via queryKeys.projects.members
 * @param {string} projectId - Project UUID
 * @returns TanStack Query result with project member list
 */
export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projects.members(projectId),
    queryFn: () => fetchProjectMembers(projectId),
    enabled: !!projectId,
  })
}

/**
 * @description Mutation to add a user as a member to a project. Invalidates members query on success.
 * @param {string} projectId - Project UUID
 * @returns TanStack useMutation result for adding a member
 */
export function useAddMember(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => addProjectMember(projectId, userId),
    onSuccess: () => {
      // Refresh member list after successful add
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.members(projectId) })
    },
  })
}

/**
 * @description Mutation to remove a member from a project. Invalidates members query on success.
 * @param {string} projectId - Project UUID
 * @returns TanStack useMutation result for removing a member
 */
export function useRemoveMember(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => removeProjectMember(projectId, userId),
    onSuccess: () => {
      // Refresh member list after successful removal
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.members(projectId) })
    },
  })
}

// ============================================================================
// Project Dataset Binding Hooks
// ============================================================================

/**
 * @description Fetch datasets bound to a project with caching via queryKeys.projects.datasets
 * @param {string} projectId - Project UUID
 * @returns TanStack Query result with bound dataset list
 */
export function useProjectBoundDatasets(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projects.datasets(projectId),
    queryFn: () => fetchProjectDatasets(projectId),
    enabled: !!projectId,
  })
}

/**
 * @description Mutation to bind multiple datasets to a project. Invalidates datasets query on success.
 * @param {string} projectId - Project UUID
 * @returns TanStack useMutation result for binding datasets
 */
export function useBindDatasets(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datasetIds: string[]) => bindProjectDatasets(projectId, datasetIds),
    onSuccess: () => {
      // Refresh bound dataset list after binding
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.datasets(projectId) })
    },
  })
}

/**
 * @description Mutation to unbind a dataset from a project. Invalidates datasets query on success.
 * @param {string} projectId - Project UUID
 * @returns TanStack useMutation result for unbinding a dataset
 */
export function useUnbindDataset(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datasetId: string) => unbindProjectDataset(projectId, datasetId),
    onSuccess: () => {
      // Refresh bound dataset list after unbinding
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.datasets(projectId) })
    },
  })
}

// ============================================================================
// Project Activity Hook
// ============================================================================

/**
 * @description Fetch paginated activity feed for a project with caching via queryKeys.projects.activity
 * @param {string} projectId - Project UUID
 * @param {number} [limit=20] - Number of items per page
 * @param {number} [offset=0] - Pagination offset
 * @returns TanStack Query result with paginated activity entries
 */
export function useProjectActivity(projectId: string, limit: number = 20, offset: number = 0) {
  return useQuery({
    queryKey: [...queryKeys.projects.activity(projectId), { limit, offset }],
    queryFn: () => fetchProjectActivity(projectId, limit, offset),
    enabled: !!projectId,
  })
}
