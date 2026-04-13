/**
 * @fileoverview RolePermissionCacheService — in-process boot-cached snapshot
 * of the `role_permissions` table (global-default rows, `tenant_id IS NULL`).
 *
 * Why this exists (Phase 3 / P3.2a):
 *   The legacy `rbac.ts::hasPermission(role, key)` is a SYNCHRONOUS function
 *   consulted by `auth.middleware.ts`. Phase 1+2 moved the source of truth
 *   for role→permission mappings from the hardcoded `ROLE_PERMISSIONS` map
 *   into the DB-backed `role_permissions` table. To let the legacy sync
 *   caller transparently read from the new source of truth without changing
 *   its signature, we keep an in-memory snapshot of the global-default rows
 *   and have `hasPermission` consult it via a thin sync shim.
 *
 * Atomic-swap guarantee:
 *   The snapshot is a `ReadonlyMap<role, ReadonlySet<permission_key>>`. Both
 *   `loadAll()` and `refresh()` build a brand-new Map off to the side and
 *   then reassign the singleton's internal field in ONE operation. Because
 *   Node's runtime is single-threaded at the JS level, any concurrent
 *   `has()` read observes either the old snapshot or the new one — never
 *   a partially-populated Map. In-place mutation (`.clear()` + repopulate)
 *   is explicitly forbidden here; see the load-bearing concurrency test at
 *   `be/tests/permissions/role-permission-cache.test.ts`.
 *
 * Lifecycle:
 *   - `loadAll()` is called once at boot from `be/src/app/index.ts` after
 *     the permission catalog sync. Subsequent `has()` reads are synchronous.
 *   - `refresh()` is called by admin mutation endpoints that touch
 *     `role_permissions` (wired in a later plan). It's safe to call under
 *     concurrent reads thanks to the atomic-swap pattern.
 *   - Tenant-scoped overrides (rows with non-null `tenant_id`) are NOT in
 *     the cache; the V2 ability builder reads them on demand.
 *
 * @module shared/services/role-permission-cache.service
 */

import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { UserRole } from '@/shared/constants/index.js'

/**
 * @description Canonical list of legacy roles whose global-default grants
 * must be held in the cache. These are the roles the legacy `hasPermission`
 * shim can be asked about. The list is exhaustive for Phase 3; Phase 6
 * retires the shim entirely and this file with it.
 */
const CACHED_ROLES: readonly string[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.LEADER,
  UserRole.USER,
] as const

/**
 * @description Singleton cache of global-default `role_permissions` rows.
 * Exposes a synchronous `has()` check used by the legacy `hasPermission`
 * shim in `rbac.ts`. See the file-level JSDoc for the atomic-swap contract.
 */
class RolePermissionCacheService {
  /**
   * Immutable snapshot of the current role→permission-keys map. Never
   * mutated in place: `loadAll()` and `refresh()` reassign this field
   * atomically with a freshly-built Map.
   */
  private snapshot: ReadonlyMap<string, ReadonlySet<string>> = new Map()

  /** True once `loadAll()` has successfully populated `snapshot` at least once. */
  private loaded = false

  /**
   * @description Load the global (`tenant_id IS NULL`) role_permissions
   * rows into the in-memory snapshot. Intended to be called once at boot
   * from `be/src/app/index.ts` after the permission catalog sync completes.
   * Calling `loadAll()` more than once is allowed and behaves like `refresh()`.
   *
   * @returns {Promise<void>} Resolves after the snapshot has been atomically swapped in.
   */
  async loadAll(): Promise<void> {
    // Build off to the side, then swap — guarantees readers never see a
    // half-populated Map.
    const fresh = await this.buildSnapshot()
    this.snapshot = fresh
    this.loaded = true
    log.info('[RolePermissionCacheService] loaded snapshot', {
      rolesLoaded: fresh.size,
    })
  }

  /**
   * @description Rebuild the snapshot from the DB and swap it in atomically.
   * Called after admin mutations to `role_permissions`. Concurrent `has()`
   * reads during the rebuild continue to observe the previous snapshot until
   * the single-operation field assignment below runs, at which point
   * subsequent reads observe the new snapshot. No read ever observes a
   * partially-loaded Map.
   *
   * @returns {Promise<void>} Resolves after the atomic swap completes.
   */
  async refresh(): Promise<void> {
    // Build the NEW snapshot in a fresh Map — do NOT mutate `this.snapshot`
    // in place; doing so would expose a half-loaded state to concurrent reads.
    const fresh = await this.buildSnapshot()
    // Single-operation assignment. Node's JS runtime is single-threaded so
    // this field-swap is atomic with respect to any other JS code.
    this.snapshot = fresh
    this.loaded = true
    log.info('[RolePermissionCacheService] refreshed snapshot', {
      rolesLoaded: fresh.size,
    })
  }

  /**
   * @description Synchronous check: does `role` hold `permissionKey` in the
   * global-default scope (`tenant_id IS NULL`)? Returns `false` if the cache
   * has not been loaded yet — callers must ensure `loadAll()` ran during
   * boot. A warning is logged on the unloaded-read path so stray callers
   * surface during development.
   *
   * @param {string} role - Role name to check (e.g. `'admin'`, `'user'`).
   * @param {string} permissionKey - Permission key from the registry.
   * @returns {boolean} True iff the role has the permission in the global scope.
   */
  has(role: string, permissionKey: string): boolean {
    // Guard against reads before boot-time loadAll() has completed; the
    // legacy shim will propagate `false` which is the safe default.
    if (!this.loaded) {
      log.warn(
        '[RolePermissionCacheService] has() called before loadAll() — returning false',
        { role, permissionKey },
      )
      return false
    }
    // Single map lookup + set membership check — O(1) expected.
    const keys = this.snapshot.get(role)
    return keys ? keys.has(permissionKey) : false
  }

  /**
   * @description Test-only hook: reset the singleton so unit tests can
   * assert the "unloaded" behavior of `has()`. NOT called by production code.
   *
   * @returns {void}
   */
  resetForTests(): void {
    this.snapshot = new Map()
    this.loaded = false
  }

  /**
   * @description Internal helper — query the DB once per role and return a
   * freshly-allocated `Map<role, Set<permission_key>>`. The `role_permissions`
   * table is small (~4 roles × ~50 keys = ~210 rows) so per-role queries are
   * fine; no pagination required.
   *
   * @returns {Promise<ReadonlyMap<string, ReadonlySet<string>>>} Fresh snapshot.
   */
  private async buildSnapshot(): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
    // Allocate a brand-new Map every call. Callers MUST reassign
    // `this.snapshot` in one operation — never mutate the existing map.
    const fresh = new Map<string, Set<string>>()
    for (const role of CACHED_ROLES) {
      // `null` tenant scope = global defaults (tenant_id IS NULL).
      const keys = await ModelFactory.rolePermission.findByRole(role, null)
      fresh.set(role, new Set(keys))
    }
    return fresh
  }
}

/**
 * @description Singleton instance used by the legacy `hasPermission` shim
 * in `rbac.ts` and the boot sequence in `app/index.ts`.
 */
export const rolePermissionCacheService = new RolePermissionCacheService()
