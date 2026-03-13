/**
 * @fileoverview TanStack Query hooks for project data fetching.
 * @module features/projects/api/projectQueries
 */

import { useQuery } from '@tanstack/react-query'
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
