/**
 * @fileoverview RolePermissionModel — join table mapping roles to permission
 * keys. The day-one seed migration (P1.5) populates this table; Phase 2's
 * CASL ability builder reads from it on every authorization check.
 *
 * `tenant_id` is nullable: NULL means "global default for this role"; a
 * non-NULL value layers a tenant-specific role customization on top of the
 * global default.
 */

import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { PERMISSIONS_TABLE, ROLE_PERMISSIONS_TABLE } from '@/shared/constants/permissions.js'

/**
 * @description Shape returned by {@link RolePermissionModel.findByRoleWithSubjects}.
 * Each row carries the permission `key` plus the pre-joined `(action, subject)`
 * pair that the V2 ability builder feeds directly into CASL's `can(action, subject)`.
 */
export interface RolePermissionWithSubject {
  /** Permission key (e.g. `knowledge_base.view`). */
  key: string
  /** CASL action verb (e.g. `view`). */
  action: string
  /** CASL subject (e.g. `KnowledgeBase`). */
  subject: string
}

/**
 * @description Row shape of the `role_permissions` table. Mirrors the
 * columns created by migration `20260407052126_phase1_create_permission_tables.ts`.
 */
export interface RolePermissionRow {
  /** Hex UUID primary key (DB-generated). */
  id: string
  /** Role name (`super-admin`, `admin`, `leader`, `user`, ...). */
  role: string
  /** Permission key referenced by the registry. */
  permission_key: string
  /** Optional tenant scope; NULL = global default. */
  tenant_id: string | null
  /** Audit timestamp. */
  created_at?: Date
}

/**
 * @description Shape accepted by `seedFromMap` — the seeder controls
 * `role`, `permission_key`, and the optional `tenant_id` scope only.
 */
export type RolePermissionSeedInput = {
  role: string
  permission_key: string
  tenant_id?: string | null
}

/**
 * @description Result returned by `seedFromMap`. `inserted` counts rows that
 * did not previously exist (the unique constraint silently ignores duplicates).
 */
export interface SeedResult {
  inserted: number
}

/**
 * @description Model for the `role_permissions` join table. All queries that
 * touch role-to-permission grants MUST live here per the strict layering rules.
 */
export class RolePermissionModel extends BaseModel<RolePermissionRow> {
  /** Database table name (constant — no string literals). */
  protected tableName = ROLE_PERMISSIONS_TABLE
  /** Shared Knex database instance. */
  protected knex = db

  /**
   * @description Return the permission keys granted to a given role within an
   * optional tenant scope. When `tenantId` is undefined the query matches
   * `tenant_id IS NULL` (the global default rows shipped by the day-one seed).
   *
   * @param {string} role - Role name to look up.
   * @param {string | null} [tenantId] - Tenant scope; omit or pass null for global default.
   * @returns {Promise<string[]>} Permission keys granted to the role.
   */
  async findByRole(role: string, tenantId?: string | null): Promise<string[]> {
    // Build the base query scoped to the requested role.
    const query = this.knex(this.tableName).where({ role })

    // Distinguish "tenant scope omitted" (global default — tenant_id IS NULL)
    // from a real tenant ID, since `where({ tenant_id: null })` does not
    // generate `IS NULL` in Knex.
    if (tenantId === undefined || tenantId === null) {
      query.whereNull('tenant_id')
    } else {
      query.where({ tenant_id: tenantId })
    }

    // Pluck just the permission_key column to avoid transferring unused fields.
    const rows = await query.select('permission_key')
    return rows.map((r: { permission_key: string }) => r.permission_key)
  }

  /**
   * @description Idempotent bulk insert of role→permission grants. Conflicts
   * on the `(role, permission_key, tenant_id)` unique key are silently ignored
   * so re-running the seed migration is safe.
   *
   * @param {RolePermissionSeedInput[]} rows - Grants to insert.
   * @returns {Promise<SeedResult>} Number of rows actually inserted.
   */
  async seedFromMap(rows: RolePermissionSeedInput[]): Promise<SeedResult> {
    // Empty input is a legal no-op so callers don't need to guard.
    if (rows.length === 0) return { inserted: 0 }

    // Normalize tenant_id to null so the unique constraint matches uniformly.
    const payload = rows.map((r) => ({
      role: r.role,
      permission_key: r.permission_key,
      tenant_id: r.tenant_id ?? null,
    }))

    // Insert all rows in one round-trip; ignore conflicts on the unique key
    // so re-running the seed migration is idempotent.
    const result = await this.knex(this.tableName)
      .insert(payload)
      .onConflict(['role', 'permission_key', 'tenant_id'])
      .ignore()
      .returning('id')

    // `.returning('id')` returns one row per actually-inserted record on
    // Postgres; conflicting rows are skipped.
    return { inserted: Array.isArray(result) ? result.length : 0 }
  }

  /**
   * @description Return every DISTINCT `permission_key` currently referenced
   * in the `role_permissions` table, irrespective of role or tenant. Used by
   * the Phase 3 boot drift guardrail which diffs this set against the live
   * registry catalog to surface dead seed rows.
   * @returns {Promise<string[]>} Distinct permission keys referenced by any role.
   */
  async findAllDistinctKeys(): Promise<string[]> {
    // `distinct().pluck()` yields a flat string[] in one round-trip; no
    // tenant/role filter here because the boot guardrail needs the global set.
    return this.knex(this.tableName)
      .distinct('permission_key')
      .pluck('permission_key')
  }

  /**
   * @description Return every permission granted to a role — pre-joined to
   * the `permissions` catalog so the caller receives `(key, action, subject)`
   * triples in a single round-trip. This is THE primary read path for the
   * Phase 2 V2 ability builder: it lets the builder translate a role's
   * grants directly into CASL `can(action, subject)` rules without N+1
   * lookups against the catalog.
   *
   * Query shape: uses the `(role, tenant_id)` index from Phase 1 on the
   * leading predicate, then an equality JOIN to `permissions.key` (unique).
   * Tenant scoping follows the day-one seed convention — rows with
   * `tenant_id IS NULL` are the global defaults and ALWAYS apply; rows with
   * a matching `tenant_id` layer tenant-specific customizations on top.
   *
   * Permission keys that do NOT exist in the `permissions` catalog are
   * dropped by the JOIN. That matches the boot-sync contract: the registry
   * is source of truth and stale seed rows are ignored rather than crashing.
   *
   * @param {string} role - Role name to look up.
   * @param {string} tenantId - Tenant scope for tenant-specific overlays.
   * @returns {Promise<RolePermissionWithSubject[]>} Triples consumed by the V2 builder.
   */
  async findByRoleWithSubjects(
    role: string,
    tenantId: string,
  ): Promise<RolePermissionWithSubject[]> {
    // Alias both tables so the SELECT list and WHERE clause stay unambiguous
    // even when `role_permissions.role` collides with reserved words in logs.
    const rows = await this.knex({ rp: this.tableName })
      // Inner JOIN — rows with orphan permission_keys (no catalog entry) are
      // intentionally dropped; the boot sync is expected to keep the catalog
      // in step with the registry so the gap should be zero at runtime.
      .innerJoin({ p: PERMISSIONS_TABLE }, 'rp.permission_key', 'p.key')
      .where('rp.role', role)
      // Global defaults (tenant_id IS NULL) always apply; plus any rows that
      // match the caller's tenant. Knex does not generate `IS NULL` from
      // `where({ tenant_id: null })` so we use an explicit callback.
      .andWhere((qb) => {
        qb.whereNull('rp.tenant_id').orWhere('rp.tenant_id', tenantId)
      })
      .select<Array<RolePermissionWithSubject>>(
        'p.key as key',
        'p.action as action',
        'p.subject as subject',
      )

    return rows
  }
}
