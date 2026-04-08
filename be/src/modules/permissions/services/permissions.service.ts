/**
 * @fileoverview Permissions admin module service (P3.4a-d).
 *
 * Business logic for the admin CRUD on roles, user overrides, and resource grants.
 * Strictly layered: this service ONLY calls `ModelFactory.*` and never imports
 * `db` or runs raw queries. Cache invalidation and audit logging are wired here
 * because they're cross-cutting side effects of every mutation.
 *
 * Cache invalidation rules (research §8):
 *   - Role-wide mutation → refresh the boot cache snapshot AND invalidate every
 *     cached ability across the platform (the role default could affect any user
 *     holding that role). This is the broadest invalidation we issue.
 *   - User-scoped override mutation → invalidate every cached ability for that
 *     user. Because the session→user mapping is not directly indexable from
 *     Redis without scanning the session store, we currently fall back to a
 *     platform-wide `invalidateAllAbilities()` and document this as a Phase 5
 *     optimisation TODO. The correctness invariant (the user observes the new
 *     state on the next request) is preserved either way.
 *   - Resource grant mutation → same fall-back: invalidate everything affected
 *     by the grantee. Phase 5 will narrow this to just the grantee's sessions.
 *
 * @module modules/permissions/services
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { abilityService } from '@/shared/services/ability.service.js'
import { rolePermissionCacheService } from '@/shared/services/role-permission-cache.service.js'
import { auditService } from '@/modules/audit/services/audit.service.js'
import { getAllPermissions, type Permission } from '@/shared/permissions/index.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'
import type {
  UserPermissionOverrideRow,
  UserPermissionOverrideEffect,
} from '@/shared/models/user-permission-override.model.js'
import type {
  ResourceGrantRow,
  ResourceGranteeType,
} from '@/shared/models/resource-grant.model.js'
import type { WhoCanDoEntry } from '@/shared/models/permission.model.js'

/**
 * @description Stable audit-action codes emitted by `auditService.logPermissionMutation`.
 * Centralized so dashboards and downstream pipelines can filter on a known
 * vocabulary instead of grepping free-form strings.
 */
export const PermissionAuditAction = {
  RoleUpdated: 'permission_role_updated',
  OverrideCreated: 'permission_override_created',
  OverrideDeleted: 'permission_override_deleted',
  GrantCreated: 'permission_grant_created',
  GrantDeleted: 'permission_grant_deleted',
} as const

/**
 * @description Singleton service backing the permissions admin module. All
 * controller methods delegate to one of these methods; nothing in the
 * controller layer touches a model or the database directly.
 */
export class PermissionsService {
  /**
   * @description Return the full registry catalog. Used by the admin UI to
   * render the permission picker. Read-only — no DB roundtrip beyond the
   * boot-time sync the registry already performed.
   * @returns {readonly Permission[]} Frozen array of every registered permission.
   */
  getCatalog(): readonly Permission[] {
    // The registry is the source of truth for the catalog UI; the DB row is a
    // mirror used by joins and is intentionally NOT consulted here.
    return getAllPermissions()
  }

  /**
   * @description List the permission keys currently granted to `role` within
   * `tenantId`. Passing `null` for tenantId returns the global default scope.
   * @param {string} role - Role name (super-admin/admin/leader/user).
   * @param {string | null} tenantId - Tenant scope or null for global defaults.
   * @returns {Promise<string[]>} Permission keys granted to the role.
   */
  async getRolePermissions(role: string, tenantId: string | null): Promise<string[]> {
    return ModelFactory.rolePermission.findByRole(role, tenantId)
  }

  /**
   * @description Replace `role`'s permission key set in `tenantId` with exactly
   * `permissionKeys`. The replacement is performed as delete-then-insert via
   * `db.transaction()` so partial failures cannot leave the table in a half-
   * updated state. Empty `permissionKeys` is valid and means "revoke all".
   *
   * Layering note: the atomic delete-then-insert lives inside
   * `RolePermissionModel.replaceForRole` so this service never touches `db`
   * directly. Strict layering — controllers → services → models — is preserved.
   *
   * After the swap completes the boot cache is rebuilt and ALL cached
   * abilities are invalidated, because a role default can affect every user
   * holding that role.
   *
   * @param {string} role - Role to replace.
   * @param {string[]} permissionKeys - Desired end-state key set.
   * @param {string | null} tenantId - Tenant scope (`null` for global defaults).
   * @param {string} actorId - Admin id for the audit log.
   * @returns {Promise<{ permission_keys: string[] }>} The new key set.
   */
  async replaceRolePermissions(
    role: string,
    permissionKeys: string[],
    tenantId: string | null,
    actorId: string,
  ): Promise<{ permission_keys: string[] }> {
    // Snapshot the prior state before the mutation so the audit log captures
    // both the before and after for the admin history view.
    const beforeKeys = await ModelFactory.rolePermission.findByRole(role, tenantId)

    // Atomic delete-then-insert is owned by the model layer (`replaceForRole`)
    // so the service never imports `db` or runs raw queries — strict layering.
    await ModelFactory.rolePermission.replaceForRole(role, permissionKeys, tenantId)

    // Rebuild the boot cache snapshot so the legacy sync `hasPermission` shim
    // immediately reflects the new role default. The atomic swap inside the
    // cache service guarantees no concurrent reader sees a partial map.
    await rolePermissionCacheService.refresh()

    // Invalidate every cached ability platform-wide because any user holding
    // this role could now have a different ability rule set. This is the
    // broadest invalidation we issue — narrower scoping is impossible without
    // walking the session store for users with this role.
    await abilityService.invalidateAllAbilities()

    // Audit log — fire-and-forget so a logging outage never blocks the admin.
    auditService
      .logPermissionMutation({
        actor: actorId,
        tenantId: tenantId ?? '',
        action: PermissionAuditAction.RoleUpdated,
        target: role,
        before: { permission_keys: beforeKeys, tenant_id: tenantId },
        after: { permission_keys: permissionKeys, tenant_id: tenantId },
      })
      .catch((err) =>
        log.warn('[permissionsService] audit log failed', { err: String(err) }),
      )

    return { permission_keys: permissionKeys }
  }

  /**
   * @description List every active override row for `userId` in `tenantId`.
   * Expired rows are filtered out at the SQL layer by the model.
   * @param {string} userId - Target user.
   * @param {string} tenantId - Tenant scope.
   * @returns {Promise<UserPermissionOverrideRow[]>} Active overrides.
   */
  async getUserOverrides(
    userId: string,
    tenantId: string,
  ): Promise<UserPermissionOverrideRow[]> {
    return ModelFactory.userPermissionOverride.findActiveForUser(userId, tenantId)
  }

  /**
   * @description Create a single allow/deny override for `userId`. Bumps the
   * cached ability for the affected user (currently via the platform-wide
   * fallback — see file header) and writes an audit log entry.
   *
   * @param {string} userId - Target user.
   * @param {string} permissionKey - Registry key being overridden.
   * @param {UserPermissionOverrideEffect} effect - `allow` or `deny`.
   * @param {string | null} expiresAt - Optional ISO datetime for auto-expiry.
   * @param {string} tenantId - Tenant scope.
   * @param {string} actorId - Admin id for the audit log.
   * @returns {Promise<{ inserted: number }>} Insert count from the model.
   */
  async createOverride(
    userId: string,
    permissionKey: string,
    effect: UserPermissionOverrideEffect,
    expiresAt: string | null,
    tenantId: string,
    actorId: string,
  ): Promise<{ inserted: number }> {
    // Delegate the insert to the model so the unique-key conflict handling
    // and tenant scoping live in one place.
    const result = await ModelFactory.userPermissionOverride.bulkCreate([
      {
        tenant_id: tenantId,
        user_id: userId,
        permission_key: permissionKey,
        effect,
        expires_at: expiresAt,
        created_by: actorId,
      },
    ])

    // TODO(Phase 5): swap this for a per-user session lookup so we only blow
    // away the affected user's cached abilities. Today we fall back to a
    // platform-wide invalidate because the session store is not indexed by
    // user id — correctness is preserved (the user sees the new ability on
    // the next request) but the cache miss footprint is wider than ideal.
    await abilityService.invalidateAllAbilities()

    auditService
      .logPermissionMutation({
        actor: actorId,
        tenantId,
        action: PermissionAuditAction.OverrideCreated,
        target: userId,
        before: null,
        after: { permission_key: permissionKey, effect, expires_at: expiresAt },
      })
      .catch((err) =>
        log.warn('[permissionsService] audit log failed', { err: String(err) }),
      )

    return result
  }

  /**
   * @description Delete an override row by id within `tenantId`. The tenant
   * filter prevents an admin in T1 from accidentally (or maliciously) wiping
   * an override in T2.
   *
   * @param {string} overrideId - Override row id.
   * @param {string} tenantId - Tenant scope of the calling admin.
   * @param {string} actorId - Admin id for the audit log.
   * @returns {Promise<number>} Number of rows deleted (0 if not found / wrong tenant).
   */
  async deleteOverride(
    overrideId: string,
    tenantId: string,
    actorId: string,
  ): Promise<number> {
    // Snapshot the row before deletion so the audit log can record what was
    // removed. We re-query through the model to keep the layering intact.
    const existing = await ModelFactory.userPermissionOverride.findById(overrideId)
    // Defence in depth: refuse to act on a row that doesn't belong to the
    // caller's tenant, even if the model would later filter it out.
    if (!existing || existing.tenant_id !== tenantId) {
      return 0
    }

    // The base model exposes a generic `delete(id)` — we wrap it with the
    // tenant guard above. The cross-tenant guard is the real safety net.
    await ModelFactory.userPermissionOverride.delete(overrideId)
    const deleted = 1

    // Same broad invalidation as createOverride — see TODO above.
    await abilityService.invalidateAllAbilities()

    auditService
      .logPermissionMutation({
        actor: actorId,
        tenantId,
        action: PermissionAuditAction.OverrideDeleted,
        target: existing.user_id,
        before: {
          permission_key: existing.permission_key,
          effect: existing.effect,
          expires_at: existing.expires_at,
        },
        after: null,
      })
      .catch((err) =>
        log.warn('[permissionsService] audit log failed', { err: String(err) }),
      )

    return deleted
  }

  /**
   * @description List resource grants. When `resourceType` and `resourceId`
   * are both supplied the model uses the compound index to fetch all grants
   * on that one row; when neither is supplied the call falls back to a
   * tenant-scoped scan. Phase 5 will add richer filters.
   *
   * @param {object} filters - Optional `(resource_type, resource_id)` pair.
   * @param {string} tenantId - Tenant scope.
   * @returns {Promise<ResourceGrantRow[]>} Matching grant rows.
   */
  async listGrants(
    filters: { resource_type?: string; resource_id?: string },
    tenantId: string,
  ): Promise<ResourceGrantRow[]> {
    // The compound (resource_type, resource_id) lookup is the primary path —
    // the admin UI almost always wants "who has access to this row?". When
    // only one half of the pair is supplied we still require both for the
    // index to participate, so partial filters are rejected at the controller.
    if (filters.resource_type && filters.resource_id) {
      return ModelFactory.resourceGrant.findByResource(
        filters.resource_type,
        filters.resource_id,
        tenantId,
      )
    }
    // Fallback path: list every grant in the tenant. The base model's
    // `findAll` accepts a where clause keyed by column name.
    return ModelFactory.resourceGrant.findAll({ tenant_id: tenantId } as any)
  }

  /**
   * @description Create a row-scoped resource grant. For Phase 2/3 we only
   * support `resource_type === 'KnowledgeBase'` because the underlying table
   * has a NOT-NULL FK to `knowledge_bases.id` which we satisfy by reusing the
   * grant's resource_id. Phase 5 will widen this once the FK is relaxed or a
   * separate row-grant table is introduced.
   *
   * @param {string} resourceType - Resource kind (must be `KnowledgeBase` today).
   * @param {string} resourceId - Specific resource row id.
   * @param {ResourceGranteeType} granteeType - `user`, `team`, or `role`.
   * @param {string} granteeId - Specific grantee id.
   * @param {string[]} actions - CASL action verbs the grant authorizes.
   * @param {string | null} expiresAt - Optional ISO datetime for auto-expiry.
   * @param {string} tenantId - Tenant scope.
   * @param {string} actorId - Admin id for the audit log.
   * @returns {Promise<{ inserted: number }>} Insert count from the model.
   */
  async createGrant(
    resourceType: string,
    resourceId: string,
    granteeType: ResourceGranteeType,
    granteeId: string,
    actions: string[],
    expiresAt: string | null,
    tenantId: string,
    actorId: string,
  ): Promise<{ inserted: number }> {
    // Reject anything other than KnowledgeBase until Phase 5 widens the schema.
    // The error message is intentionally explicit so admins know it's a Phase
    // 5 follow-up rather than a permanent restriction.
    if (resourceType !== PermissionSubjects.KnowledgeBase) {
      throw new Error(
        `[permissionsService] resource_type=${resourceType} not yet supported (Phase 5 follow-up); only ${PermissionSubjects.KnowledgeBase} is allowed today`,
      )
    }

    const result = await ModelFactory.resourceGrant.bulkCreate([
      {
        // For KB grants the grant row's KB FK is the same as the resource id.
        knowledge_base_id: resourceId,
        resource_type: resourceType,
        resource_id: resourceId,
        grantee_type: granteeType,
        grantee_id: granteeId,
        // Legacy column kept for backward-compat with the V1 ability builder.
        // The V2 builder uses `actions[]` exclusively.
        permission_level: 'view',
        actions,
        tenant_id: tenantId,
        expires_at: expiresAt,
        created_by: actorId,
        updated_by: actorId,
      },
    ])

    // Invalidate every cached ability — Phase 5 will narrow this to just the
    // grantee's sessions (user/team membership / role lookup).
    await abilityService.invalidateAllAbilities()

    auditService
      .logPermissionMutation({
        actor: actorId,
        tenantId,
        action: PermissionAuditAction.GrantCreated,
        target: resourceId,
        before: null,
        after: {
          resource_type: resourceType,
          resource_id: resourceId,
          grantee_type: granteeType,
          grantee_id: granteeId,
          actions,
          expires_at: expiresAt,
        },
      })
      .catch((err) =>
        log.warn('[permissionsService] audit log failed', { err: String(err) }),
      )

    return result
  }

  /**
   * @description Delete a resource grant by id, gated on the caller's tenant
   * so a misconfigured admin UI cannot wipe grants belonging to a different
   * tenant. Mirrors `deleteOverride`'s defence-in-depth pattern.
   *
   * @param {string} grantId - Grant row id.
   * @param {string} tenantId - Tenant scope.
   * @param {string} actorId - Admin id for the audit log.
   * @returns {Promise<number>} Number of rows deleted.
   */
  async deleteGrant(
    grantId: string,
    tenantId: string,
    actorId: string,
  ): Promise<number> {
    // Snapshot first so the audit log records the removed row's payload.
    const existing = await ModelFactory.resourceGrant.findById(grantId)
    if (!existing || existing.tenant_id !== tenantId) {
      return 0
    }

    // Use the model's tenant-aware delete helper — same guard, double layer.
    const deleted = await ModelFactory.resourceGrant.deleteById(grantId, tenantId)

    await abilityService.invalidateAllAbilities()

    auditService
      .logPermissionMutation({
        actor: actorId,
        tenantId,
        action: PermissionAuditAction.GrantDeleted,
        target: existing.resource_id,
        before: {
          resource_type: existing.resource_type,
          resource_id: existing.resource_id,
          grantee_type: existing.grantee_type,
          grantee_id: existing.grantee_id,
          actions: existing.actions,
        },
        after: null,
      })
      .catch((err) =>
        log.warn('[permissionsService] audit log failed', { err: String(err) }),
      )

    return deleted
  }

  /**
   * @description Introspection helper: list every user in `tenantId` who can
   * perform `(action, subject)`, optionally constrained to a specific
   * `resourceId`. Pure read-only — no cache invalidation, no audit log.
   *
   * @param {string} action - CASL action verb.
   * @param {string} subject - CASL subject.
   * @param {string | null} resourceId - Optional resource id for instance-scoped queries.
   * @param {string} tenantId - Tenant scope.
   * @returns {Promise<WhoCanDoEntry[]>} Authorized users with provenance.
   */
  async whoCanDo(
    action: string,
    subject: string,
    resourceId: string | null,
    tenantId: string,
  ): Promise<WhoCanDoEntry[]> {
    return ModelFactory.permission.whoCanDo(action, subject, resourceId, tenantId)
  }
}

/**
 * @description Singleton service instance exported through the module barrel.
 */
export const permissionsService = new PermissionsService()
