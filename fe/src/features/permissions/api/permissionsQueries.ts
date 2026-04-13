/**
 * @fileoverview TanStack Query hooks wrapping `permissionsApi`.
 *
 * Every admin endpoint has a corresponding `useX` / `useXMutation` hook.
 * Mutations invalidate the narrowest matching cache key so role/override/grant
 * edits reflect immediately in downstream consumers.
 *
 * @module features/permissions/api/permissionsQueries
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { permissionsApi } from './permissionsApi'
import type {
  CreateGrantBody,
  CreateOverrideBody,
  GrantResourceType,
  UpdateRolePermissionsBody,
} from '../types/permissions.types'

/** @description Bounded fallback polling interval for the live permission catalog. */
export const PERMISSION_CATALOG_POLL_INTERVAL_MS = 5 * 60 * 1000

// ============================================================================
// Catalog
// ============================================================================

/**
 * @description Fetches the live permission catalog from the BE. Most call sites
 * should prefer the build-time snapshot (`PERMISSION_KEYS`); use this only for
 * runtime refresh scenarios.
 * @param {boolean} [enabled=true] - Whether the query should be active for the current session.
 */
export function usePermissionCatalog(enabled = true) {
  return useQuery({
    queryKey: queryKeys.permissions.catalog(),
    queryFn: permissionsApi.getCatalog,
    enabled,
    // Bound the fallback to minutes so missed socket events self-heal without
    // turning the catalog endpoint into a hot loop.
    refetchInterval: PERMISSION_CATALOG_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
  })
}

// ============================================================================
// Role permissions
// ============================================================================

/**
 * @description Fetches the permission keys granted to a single role in the
 * caller's tenant. Drives the P5.1 role × permission matrix.
 * @param {string} role - Role name.
 */
export function useRolePermissions(role: string) {
  return useQuery({
    queryKey: queryKeys.permissions.rolePermissions(role),
    queryFn: () => permissionsApi.getRolePermissions(role),
    // Only fire when a role is specified — matrix rows may mount before selection
    enabled: Boolean(role),
  })
}

/**
 * @description Mutation that atomically replaces a role's permission set.
 * Invalidates the matching role cache on success.
 */
export function useUpdateRolePermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      role,
      body,
    }: {
      role: string
      body: UpdateRolePermissionsBody
    }) => permissionsApi.updateRolePermissions(role, body),
    onSuccess: (_data, { role }) => {
      // Re-read the freshly replaced role so consumers see the new key set
      qc.invalidateQueries({ queryKey: queryKeys.permissions.rolePermissions(role) })
    },
  })
}

// ============================================================================
// Per-user overrides
// ============================================================================

/**
 * @description Fetches active overrides for the given user.
 * @param {number} userId - Target user id.
 */
export function useUserOverrides(userId: number) {
  return useQuery({
    queryKey: queryKeys.permissions.userOverrides(userId),
    queryFn: () => permissionsApi.getUserOverrides(userId),
    enabled: Number.isFinite(userId) && userId > 0,
  })
}

/**
 * @description Mutation to create an allow/deny override on a user.
 * Invalidates that user's override list on success.
 * @param {number} userId - Target user id (captured so mutation callers only pass the body).
 */
export function useCreateOverride(userId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateOverrideBody) =>
      permissionsApi.createOverride(userId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.permissions.userOverrides(userId) })
    },
  })
}

/**
 * @description Mutation to delete an override row by id.
 *
 * The BE route is flat (`/overrides/:id`) but we still invalidate the
 * owning user's override list — caller provides `userId` at hook-call time
 * for cache scoping.
 * @param {number} userId - Owning user id, used for cache invalidation scope.
 */
export function useDeleteOverride(userId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => permissionsApi.deleteOverride(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.permissions.userOverrides(userId) })
    },
  })
}

// ============================================================================
// Resource grants
// ============================================================================

/**
 * @description Fetches grants attached to a single resource.
 * @param {GrantResourceType} resourceType - 'KnowledgeBase' or 'DocumentCategory'.
 * @param {string} resourceId - Resource identifier.
 */
export function useGrants(resourceType: GrantResourceType, resourceId: string) {
  return useQuery({
    queryKey: queryKeys.permissions.grants(resourceType, resourceId),
    queryFn: () => permissionsApi.getGrants(resourceType, resourceId),
    enabled: Boolean(resourceType && resourceId),
  })
}

/**
 * @description Mutation to create a resource grant. Invalidates the owning
 * `(resource_type, resource_id)` grant list.
 */
export function useCreateGrant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateGrantBody) => permissionsApi.createGrant(body),
    onSuccess: (_data, body) => {
      qc.invalidateQueries({
        queryKey: queryKeys.permissions.grants(body.resource_type, body.resource_id),
      })
    },
  })
}

/**
 * @description Mutation to delete a resource grant. Caller passes both the
 * grant id (for the HTTP delete) and the owning resource (for cache invalidation).
 */
export function useDeleteGrant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
    }: {
      id: number
      resourceType: GrantResourceType
      resourceId: string
    }) => permissionsApi.deleteGrant(id),
    onSuccess: (_data, { resourceType, resourceId }) => {
      qc.invalidateQueries({
        queryKey: queryKeys.permissions.grants(resourceType, resourceId),
      })
    },
  })
}

// ============================================================================
// who-can-do
// ============================================================================

/**
 * @description Fetches the list of users in the caller's tenant who effectively
 * have the given `(action, subject[, resourceId])` permission. Drives the P5.6
 * Effective Access page and the P5.2 effective panel.
 * @param {string} action - CASL action (e.g. 'read').
 * @param {string} subject - CASL subject class name (e.g. 'KnowledgeBase').
 * @param {string} [resourceId] - Optional specific resource id.
 */
export function useWhoCanDo(action: string, subject: string, resourceId?: string) {
  return useQuery({
    queryKey: queryKeys.permissions.whoCanDo(action, subject, resourceId),
    queryFn: () => permissionsApi.whoCanDo(action, subject, resourceId),
    // Guard against empty inputs during form typing
    enabled: Boolean(action && subject),
  })
}
