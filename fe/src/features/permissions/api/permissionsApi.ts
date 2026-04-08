/**
 * @fileoverview Raw HTTP client for the permissions admin API (Phase 3 Wave 4).
 *
 * Covers all 10 endpoints mounted under `/api/permissions`:
 *   - Catalog read
 *   - who-can-do lookup
 *   - Role permission read/replace
 *   - Per-user override list/create/delete (delete uses flat `/overrides/:id`)
 *   - Resource grant list/create/delete
 *
 * Every function is a thin typed wrapper around `@/lib/api` — no caching,
 * no state. For cache-aware hooks see `./permissionsQueries`.
 *
 * @module features/permissions/api/permissionsApi
 */
import { api } from '@/lib/api'
import type {
  CreateGrantBody,
  CreateOverrideBody,
  GrantResourceType,
  PermissionCatalogResult,
  ResourceGrant,
  RolePermissions,
  UpdateRolePermissionsBody,
  UserPermissionOverride,
  WhoCanDoResult,
} from '../types/permissions.types'

// ----------------------------------------------------------------------------
// Local path constants (no hardcoded path literals inside functions)
// ----------------------------------------------------------------------------

/** @description Base path for every permissions admin endpoint. */
const PERMISSIONS_API_BASE = '/api/permissions'

/** @description Sub-path for catalog endpoint. */
const CATALOG_PATH = `${PERMISSIONS_API_BASE}/catalog`

/** @description Sub-path for the who-can-do lookup endpoint. */
const WHO_CAN_DO_PATH = `${PERMISSIONS_API_BASE}/who-can-do`

/** @description Sub-path for role-scoped endpoints. */
const ROLES_PATH = `${PERMISSIONS_API_BASE}/roles`

/** @description Sub-path for user-scoped override list/create endpoints. */
const USERS_PATH = `${PERMISSIONS_API_BASE}/users`

/** @description Flat sub-path for override delete (NOT nested under /users). */
const OVERRIDES_PATH = `${PERMISSIONS_API_BASE}/overrides`

/** @description Sub-path for resource grant endpoints. */
const GRANTS_PATH = `${PERMISSIONS_API_BASE}/grants`

// ============================================================================
// Catalog
// ============================================================================

/**
 * @description Fetches the full registered permission catalog from the backend.
 * Phase 4 normally uses the committed build-time snapshot; this is available
 * for runtime refresh scenarios.
 * @returns {Promise<PermissionCatalogResult>} Catalog keys + version tag.
 */
export async function getCatalog(): Promise<PermissionCatalogResult> {
  return api.get<PermissionCatalogResult>(CATALOG_PATH)
}

// ============================================================================
// who-can-do
// ============================================================================

/**
 * @description Lists users in the caller's tenant who effectively have the
 * given `(action, subject)` pair, optionally narrowed to a specific resource id.
 * @param {string} action - CASL action (e.g. 'read', 'update').
 * @param {string} subject - CASL subject class name (e.g. 'KnowledgeBase').
 * @param {string} [resourceId] - Optional specific resource id to narrow on.
 * @returns {Promise<WhoCanDoResult>} List of users with effective access.
 */
export async function whoCanDo(
  action: string,
  subject: string,
  resourceId?: string,
): Promise<WhoCanDoResult> {
  // Build query string defensively — URLSearchParams handles encoding
  const params = new URLSearchParams({ action, subject })
  if (resourceId) params.set('resource_id', resourceId)
  return api.get<WhoCanDoResult>(`${WHO_CAN_DO_PATH}?${params.toString()}`)
}

// ============================================================================
// Role permissions
// ============================================================================

/**
 * @description Returns the permission keys granted to the given role within
 * the caller's tenant.
 * @param {string} role - Role name (e.g. 'admin', 'leader', 'member').
 * @returns {Promise<RolePermissions>} Role + permission key list.
 */
export async function getRolePermissions(role: string): Promise<RolePermissions> {
  return api.get<RolePermissions>(`${ROLES_PATH}/${encodeURIComponent(role)}`)
}

/**
 * @description Atomically replaces the full permission set for the given role
 * within the caller's tenant. Empty array revokes all keys.
 * @param {string} role - Role name to update.
 * @param {UpdateRolePermissionsBody} body - New permission_keys list (optional tenant_id).
 * @returns {Promise<RolePermissions>} Updated role snapshot.
 */
export async function updateRolePermissions(
  role: string,
  body: UpdateRolePermissionsBody,
): Promise<RolePermissions> {
  return api.put<RolePermissions>(`${ROLES_PATH}/${encodeURIComponent(role)}`, body)
}

// ============================================================================
// Per-user overrides
// ============================================================================

/**
 * @description Lists active per-user permission overrides for the given user.
 * Expired rows are excluded server-side.
 * @param {number} userId - Target user id.
 * @returns {Promise<UserPermissionOverride[]>} Override rows.
 */
export async function getUserOverrides(userId: number): Promise<UserPermissionOverride[]> {
  return api.get<UserPermissionOverride[]>(`${USERS_PATH}/${userId}/overrides`)
}

/**
 * @description Creates an allow/deny override on a single permission key for a user.
 * @param {number} userId - Target user id.
 * @param {CreateOverrideBody} body - Permission key, effect, optional expires_at.
 * @returns {Promise<UserPermissionOverride>} Newly created override row.
 */
export async function createOverride(
  userId: number,
  body: CreateOverrideBody,
): Promise<UserPermissionOverride> {
  return api.post<UserPermissionOverride>(`${USERS_PATH}/${userId}/overrides`, body)
}

/**
 * @description Deletes an override row by id.
 *
 * NOTE: the route is FLAT (`/api/permissions/overrides/:id`) — it is NOT nested
 * under `/users/:userId`. Scope checks use the caller's tenant server-side.
 * @param {number} id - Override row id to delete.
 * @returns {Promise<void>} Resolves on success.
 */
export async function deleteOverride(id: number): Promise<void> {
  return api.delete<void>(`${OVERRIDES_PATH}/${id}`)
}

// ============================================================================
// Resource grants
// ============================================================================

/**
 * @description Lists resource grants for the given `(resource_type, resource_id)` pair.
 * @param {GrantResourceType} resourceType - 'KnowledgeBase' or 'DocumentCategory'.
 * @param {string} resourceId - Resource identifier.
 * @returns {Promise<ResourceGrant[]>} Matching grant rows.
 */
export async function getGrants(
  resourceType: GrantResourceType,
  resourceId: string,
): Promise<ResourceGrant[]> {
  // Build filter query params — BE requires both for indexed lookup
  const params = new URLSearchParams({
    resource_type: resourceType,
    resource_id: resourceId,
  })
  return api.get<ResourceGrant[]>(`${GRANTS_PATH}?${params.toString()}`)
}

/**
 * @description Creates a row-scoped resource grant.
 * @param {CreateGrantBody} body - Grant payload (actions must have ≥1 entry per BE Zod schema).
 * @returns {Promise<ResourceGrant>} Newly created grant row.
 */
export async function createGrant(body: CreateGrantBody): Promise<ResourceGrant> {
  return api.post<ResourceGrant>(GRANTS_PATH, body)
}

/**
 * @description Deletes a resource grant by id, scoped to the caller's tenant.
 * @param {number} id - Grant row id to delete.
 * @returns {Promise<void>} Resolves on success.
 */
export async function deleteGrant(id: number): Promise<void> {
  return api.delete<void>(`${GRANTS_PATH}/${id}`)
}

// ============================================================================
// Namespace object (for import * as permissionsApi)
// ============================================================================

/**
 * @description Aggregated namespace object — convenient for call sites that
 * prefer `permissionsApi.fn()` over individual named imports.
 */
export const permissionsApi = {
  getCatalog,
  whoCanDo,
  getRolePermissions,
  updateRolePermissions,
  getUserOverrides,
  createOverride,
  deleteOverride,
  getGrants,
  createGrant,
  deleteGrant,
}
