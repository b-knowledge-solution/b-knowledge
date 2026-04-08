/**
 * @fileoverview Zod request schemas for the permissions admin module (P3.4a-d).
 *
 * Every mutation endpoint in `permissions.routes.ts` validates its body/params/query
 * through one of these schemas before reaching the controller. Centralizing the
 * shapes here keeps the route file declarative and gives the controller compile-
 * time access to the inferred TypeScript types.
 *
 * @module modules/permissions/schemas
 */
import { z } from 'zod'

/**
 * @description Generic UUID parameter schema reused by override/grant delete routes.
 */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
})

/**
 * @description Path-parameter schema for routes that target a specific role name.
 * The enum mirrors the `Role` union in `shared/config/rbac.ts` so an admin cannot
 * accidentally create permission mappings for an unknown role.
 */
export const roleParamSchema = z.object({
  role: z.enum(['super-admin', 'admin', 'leader', 'user']),
})

/**
 * @description Body schema for `PUT /api/permissions/roles/:role`. Replaces a
 * role's full permission key set. An empty `permission_keys` array is allowed
 * and means "revoke every key for this role" — the service emits an explicit
 * deletion in that case.
 *
 * `tenant_id` is nullable: `null` (or omitted) targets the global default
 * scope, a uuid targets a tenant-specific overlay row.
 */
export const replaceRolePermissionsSchema = z.object({
  permission_keys: z.array(z.string().min(1)),
  tenant_id: z.string().uuid().nullable().optional(),
})

/**
 * @description Path-parameter schema for routes that target a specific user
 * (used by the override list/create endpoints).
 */
export const userIdParamSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
})

/**
 * @description Body schema for `POST /api/permissions/users/:userId/overrides`.
 * Creates a single allow/deny override row. `expires_at` is an optional ISO
 * datetime — when present the override is auto-skipped past that instant by
 * the V2 ability builder's SQL-side expiry filter.
 */
export const createOverrideSchema = z.object({
  permission_key: z.string().min(1),
  effect: z.enum(['allow', 'deny']),
  expires_at: z.string().datetime().nullable().optional(),
})

/**
 * @description Body schema for `POST /api/permissions/grants`. Creates a row-level
 * resource grant. `actions` MUST contain at least one CASL action verb so the
 * grant grants something concrete (the V2 builder skips empty actions arrays).
 */
export const createGrantSchema = z.object({
  resource_type: z.string().min(1),
  resource_id: z.string().uuid('Invalid resource ID'),
  grantee_type: z.enum(['user', 'team', 'role']),
  grantee_id: z.string().min(1),
  actions: z.array(z.string().min(1)).min(1, 'At least one action is required'),
  expires_at: z.string().datetime().nullable().optional(),
})

/**
 * @description Query-string schema for `GET /api/permissions/grants`. Both filters
 * are optional but, when provided, must be a valid `(resource_type, resource_id)`
 * pair so the underlying model query can hit the compound index.
 */
export const listGrantsQuerySchema = z.object({
  resource_type: z.string().min(1).optional(),
  resource_id: z.string().uuid().optional(),
})

/**
 * @description Query-string schema for `GET /api/permissions/who-can-do`. Both
 * `action` and `subject` are required because the introspection helper joins
 * the registry on `(action, subject)` to resolve matching keys. `resource_id`
 * is optional and narrows the resource_grant branch to a specific row.
 */
export const whoCanDoQuerySchema = z.object({
  action: z.string().min(1),
  subject: z.string().min(1),
  resource_id: z.string().uuid().optional(),
})
