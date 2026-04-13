/**
 * @fileoverview UserPermissionOverrideModel — per-user allow/deny overrides
 * that layer on top of the role-permission defaults. Read by the Phase 2 V2
 * CASL ability builder; written by the Phase 5 admin UI.
 *
 * Locked decisions honored by this model:
 *   - The `expires_at` filter is ALWAYS applied in SQL
 *     (`expires_at IS NULL OR expires_at > NOW()`) — NEVER in JavaScript via
 *     `Date.now()`. This keeps the check index-friendly and consistent with
 *     the Postgres clock used by every other timestamped query.
 *   - Both `allow` and `deny` rows are returned in a single result set; the
 *     V2 builder is responsible for emitting `can()` rules before `cannot()`
 *     rules so CASL's deny-wins precedence evaluates correctly.
 */

import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { USER_PERMISSION_OVERRIDES_TABLE } from '@/shared/constants/permissions.js'

/**
 * @description The `allow` | `deny` effect values accepted by the table's
 * CHECK constraint. Kept as a string-literal union so callers get compile-time
 * safety without importing a runtime enum.
 */
export type UserPermissionOverrideEffect = 'allow' | 'deny'

/**
 * @description Row shape of the `user_permission_overrides` table. Mirrors the
 * columns created by migration `20260407052126_phase1_create_permission_tables.ts`.
 */
export interface UserPermissionOverrideRow {
  /** Hex UUID primary key (DB-generated). */
  id: string
  /** Tenant scope — overrides never cross tenants. */
  tenant_id: string
  /** Target user id (FK to users.id, CASCADE on delete). */
  user_id: string
  /** Permission key being overridden (no FK — registry is source of truth). */
  permission_key: string
  /** `allow` adds the permission, `deny` masks it; CASL evaluates deny first. */
  effect: UserPermissionOverrideEffect
  /** Optional expiry; rows past this instant are skipped by the ability builder. */
  expires_at: string | null
  /** Optional audit: id of the admin who created the override. */
  created_by: string | null
  /** Audit timestamp. */
  created_at: string
  /** Audit timestamp. */
  updated_at: string
}

/**
 * @description Insert payload for {@link UserPermissionOverrideModel.bulkCreate}.
 * Excludes columns that are managed by the database (`id`, `created_at`,
 * `updated_at`).
 */
export type UserPermissionOverrideInsert = Omit<
  UserPermissionOverrideRow,
  'id' | 'created_at' | 'updated_at'
>

/**
 * @description Model for the `user_permission_overrides` table. All queries
 * that touch per-user overrides MUST live here per the strict layering rules.
 */
export class UserPermissionOverrideModel extends BaseModel<UserPermissionOverrideRow> {
  /** Database table name (constant — no string literals). */
  protected tableName = USER_PERMISSION_OVERRIDES_TABLE
  /** Shared Knex database instance. */
  protected knex = db

  /**
   * @description Return every ACTIVE override for a given user within a
   * tenant. "Active" means the row has not expired — the expiry check is
   * performed in SQL (`expires_at IS NULL OR expires_at > NOW()`) so the
   * database's clock is the single source of truth and the partial index on
   * `expires_at` can participate in the plan.
   *
   * Both `allow` and `deny` rows are returned in a single round-trip; the V2
   * ability builder is responsible for emitting `can()` rules before
   * `cannot()` rules so CASL's deny-wins precedence evaluates correctly.
   *
   * Query shape: filters on `(tenant_id, user_id)` which are both indexed and
   * enforce tenant isolation as the leading predicate.
   *
   * @param {string} userId - Target user id.
   * @param {string} tenantId - Tenant scope; rows in other tenants are ignored.
   * @returns {Promise<UserPermissionOverrideRow[]>} Active override rows.
   */
  async findActiveForUser(
    userId: string,
    tenantId: string,
  ): Promise<UserPermissionOverrideRow[]> {
    // Tenant isolation first, then user, then the SQL-side expiry filter.
    // The `whereRaw` below is the ONLY place we filter by expires_at — never
    // do this in JavaScript (see locked decision in the file header).
    return this.knex(this.tableName)
      .where({ tenant_id: tenantId, user_id: userId })
      .andWhere((qb) => {
        // `IS NULL OR > NOW()` keeps non-expiring rows (the common case) and
        // live-ttl rows; the partial index on expires_at handles the latter.
        qb.whereNull('expires_at').orWhereRaw('expires_at > NOW()')
      })
      .select('*')
  }

  /**
   * @description Idempotent bulk insert of override rows. Conflicts on the
   * `(tenant_id, user_id, permission_key, effect)` unique key are silently
   * ignored so re-running the Phase 5 admin-UI sync is safe. Used primarily
   * by tests and the Phase 5 admin UI.
   *
   * @param {UserPermissionOverrideInsert[]} overrides - Rows to insert.
   * @returns {Promise<{ inserted: number }>} Number of rows actually inserted.
   */
  async bulkCreate(
    overrides: UserPermissionOverrideInsert[],
  ): Promise<{ inserted: number }> {
    // Empty input is a legal no-op so callers don't need to guard.
    if (overrides.length === 0) return { inserted: 0 }

    // Single round-trip insert; unique-key conflicts are silently ignored so
    // the operation is safe to re-run.
    const result = await this.knex(this.tableName)
      .insert(overrides)
      .onConflict(['tenant_id', 'user_id', 'permission_key', 'effect'])
      .ignore()
      .returning('id')

    // `.returning('id')` returns one row per actually-inserted record on
    // Postgres; conflicting rows are skipped.
    return { inserted: Array.isArray(result) ? result.length : 0 }
  }

  /**
   * @description Return every DISTINCT `permission_key` currently referenced
   * in the `user_permission_overrides` table, irrespective of tenant or user.
   * Used by the Phase 3 boot drift guardrail which diffs this set against the
   * live registry catalog to surface orphan overrides.
   * @returns {Promise<string[]>} Distinct permission keys referenced by any override.
   */
  async findAllDistinctKeys(): Promise<string[]> {
    // `distinct().pluck()` yields a flat string[] in one round-trip; the
    // boot guardrail needs the global set so no tenant/user filter is applied.
    return this.knex(this.tableName)
      .distinct('permission_key')
      .pluck('permission_key')
  }

  /**
   * @description Delete every override row for a given user in a tenant.
   * Used by the Phase 5 admin UI "reset overrides" action.
   *
   * @param {string} userId - Target user id.
   * @param {string} tenantId - Tenant scope; cross-tenant rows are untouched.
   * @returns {Promise<number>} Number of rows actually deleted.
   */
  async deleteByUser(userId: string, tenantId: string): Promise<number> {
    // Tenant scope is part of the WHERE so a caller passing the wrong tenant
    // cannot accidentally wipe another tenant's overrides.
    return this.knex(this.tableName)
      .where({ tenant_id: tenantId, user_id: userId })
      .delete()
  }
}
