/**
 * @fileoverview TypeScript request/response shapes for the permissions admin API.
 *
 * Mirrors the Zod schemas in `be/src/modules/permissions/schemas/permissions.schemas.ts`.
 * Cross-language: must match the BE source of truth.
 *
 * @module features/permissions/types/permissions.types
 */

// ============================================================================
// Constants (no hardcoded string literals per root CLAUDE.md rule)
// ============================================================================

/** @description Override effect literal — allow grants the permission. */
export const OVERRIDE_EFFECT_ALLOW = 'allow' as const

/** @description Override effect literal — deny revokes the permission. */
export const OVERRIDE_EFFECT_DENY = 'deny' as const

/** @description Grantee type literal — a user principal. */
export const GRANTEE_TYPE_USER = 'user' as const

/** @description Grantee type literal — a team principal. */
export const GRANTEE_TYPE_TEAM = 'team' as const

/** @description Grantee type literal — a role principal. */
export const GRANTEE_TYPE_ROLE = 'role' as const

/** @description Grant resource type literal — a knowledge base. */
export const GRANT_RESOURCE_KNOWLEDGE_BASE = 'KnowledgeBase' as const

/** @description Grant resource type literal — a document category. */
export const GRANT_RESOURCE_DOCUMENT_CATEGORY = 'DocumentCategory' as const

// ============================================================================
// Literal Unions
// ============================================================================

/**
 * @description Effect direction of a per-user permission override.
 */
export type OverrideEffect =
  | typeof OVERRIDE_EFFECT_ALLOW
  | typeof OVERRIDE_EFFECT_DENY

/**
 * @description Principal type that can receive a resource grant.
 */
export type GranteeType =
  | typeof GRANTEE_TYPE_USER
  | typeof GRANTEE_TYPE_TEAM
  | typeof GRANTEE_TYPE_ROLE

/**
 * @description Resource types supported by `/api/permissions/grants`.
 */
export type GrantResourceType =
  | typeof GRANT_RESOURCE_KNOWLEDGE_BASE
  | typeof GRANT_RESOURCE_DOCUMENT_CATEGORY

// ============================================================================
// Entity Shapes
// ============================================================================

/**
 * @description A row in `user_permission_overrides` — a per-user allow or deny
 * override on a single catalog permission key.
 */
export interface UserPermissionOverride {
  id: number
  user_id: number
  permission_key: string
  effect: OverrideEffect
  expires_at: string | null
  created_at: string
  updated_at: string
}

/**
 * @description A row in `resource_grants` — a row-scoped grant giving a
 * principal (user/team/role) a set of actions on a single resource instance.
 */
export interface ResourceGrant {
  id: number
  resource_type: GrantResourceType
  resource_id: string
  knowledge_base_id: number | null
  grantee_type: GranteeType
  grantee_id: number | string
  actions: string[]
  tenant_id: string
  expires_at: string | null
  created_at: string
  updated_at: string
}

/**
 * @description Full permission set granted to a role within the caller's tenant.
 */
export interface RolePermissions {
  role: string
  permission_keys: string[]
}

/**
 * @description Result shape for `GET /api/permissions/who-can-do` — the list of
 * users in the caller's tenant who effectively have the given `(action, subject)` pair.
 */
export interface WhoCanDoResult {
  users: Array<{
    id: number
    display_name: string
    email: string
    role: string
  }>
}

/**
 * @description Minimal permission metadata returned by the live catalog
 * endpoint and consumed by the runtime permission provider.
 */
export interface PermissionCatalogEntry {
  key: string
  action: string
  subject: string
}

/**
 * @description Result shape for `GET /api/permissions/catalog` — the full
 * registered permission catalog plus a deterministic version token for
 * runtime cache refresh.
 */
export interface PermissionCatalogResult {
  version: string
  permissions: PermissionCatalogEntry[]
}

// ============================================================================
// Request Body Shapes
// ============================================================================

/**
 * @description Request body for `POST /api/permissions/users/:userId/overrides`.
 */
export interface CreateOverrideBody {
  permission_key: string
  effect: OverrideEffect
  expires_at?: string
}

/**
 * @description Request body for `POST /api/permissions/grants`.
 * Note: `actions` must contain at least one entry per the BE Zod schema.
 */
export interface CreateGrantBody {
  resource_type: GrantResourceType
  resource_id: string
  knowledge_base_id?: number | null
  grantee_type: GranteeType
  grantee_id: number | string
  actions: string[]
  expires_at?: string
}

/**
 * @description Request body for `PUT /api/permissions/roles/:role` — atomic
 * replacement of the role's full permission key set.
 */
export interface UpdateRolePermissionsBody {
  permission_keys: string[]
  tenant_id?: string | null
}
