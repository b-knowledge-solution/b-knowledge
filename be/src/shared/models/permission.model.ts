/**
 * @fileoverview PermissionModel — catalog of every permission key registered
 * in the code-side registry. The boot sync service (`shared/permissions/sync.ts`)
 * is the only writer; CASL ability builders are the primary readers.
 *
 * The table has no FK from `role_permissions.permission_key` to `permissions.key`,
 * so the registry is the source of truth and the boot sync may temporarily
 * diverge during a deploy without crashing the server.
 */

import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import {
  PERMISSIONS_TABLE,
  ROLE_PERMISSIONS_TABLE,
  USER_PERMISSION_OVERRIDES_TABLE,
  RESOURCE_GRANTS_TABLE,
} from '@/shared/constants/permissions.js'

/**
 * @description One row returned by {@link PermissionModel.whoCanDo}: identifies a
 * user that can perform a given (action, subject) pair within a tenant, plus the
 * source from which the permission was derived.
 */
export interface WhoCanDoEntry {
  /** Target user id. */
  user_id: string
  /** Target user email — denormalized for admin UI display. */
  user_email: string
  /** Target user role at the time of the query. */
  user_role: string
  /** Provenance of the permission: role default, per-user override, or resource grant. */
  source: 'role' | 'override' | 'resource_grant'
  /** Source row id (role_permission id, override id, or grant id). */
  source_id: string | null
}

/**
 * @description Row shape of the `permissions` table. Mirrors the columns
 * created by migration `20260407052126_phase1_create_permission_tables.ts`.
 */
export interface PermissionRow {
  /** Hex UUID primary key (DB-generated). */
  id: string
  /** Globally unique permission key, e.g. `knowledge_base.view`. */
  key: string
  /** Owning feature/module slug. */
  feature: string
  /** Action verb (`view`, `create`, `edit`, ...). */
  action: string
  /** CASL subject the ability builder will check against. */
  subject: string
  /** Human-readable label for the admin UI. */
  label: string
  /** Optional long-form description. */
  description?: string | null
  /** Audit timestamps. */
  created_at?: Date
  updated_at?: Date
}

/**
 * @description Shape accepted by `upsertMany` — only the registry-controlled
 * columns. `id`, `created_at`, `updated_at` are managed by the database.
 */
export type PermissionUpsertInput = {
  key: string
  feature: string
  action: string
  subject: string
  label: string
  description?: string
}

/**
 * @description Result returned by `upsertMany`. `inserted` counts rows that
 * did not previously exist; `updated` counts rows whose payload changed.
 */
export interface UpsertResult {
  inserted: number
  updated: number
}

/**
 * @description Model for the `permissions` catalog table. All queries that
 * touch the catalog MUST live here per the strict layering rules — services
 * (including the boot sync) call these methods rather than building inline
 * Knex queries.
 */
export class PermissionModel extends BaseModel<PermissionRow> {
  /** Database table name (constant — no string literals). */
  protected tableName = PERMISSIONS_TABLE
  /** Shared Knex database instance. */
  protected knex = db

  /**
   * @description Return every catalog row, ordered by `key` for deterministic
   * test assertions and admin-UI rendering.
   * @returns {Promise<PermissionRow[]>} All registered permissions.
   */
  async findAll(): Promise<PermissionRow[]> {
    // Order by key so callers and tests get a stable, predictable sequence.
    return this.knex(this.tableName).select('*').orderBy('key', 'asc')
  }

  /**
   * @description Return just the `key` column for every row. Used by the boot
   * sync diff step which only needs the set of currently-registered keys.
   * @returns {Promise<string[]>} All catalog keys.
   */
  async findAllKeys(): Promise<string[]> {
    // Pluck just the key column to avoid transferring unused payload.
    const rows = await this.knex(this.tableName).select('key')
    return rows.map((r: { key: string }) => r.key)
  }

  /**
   * @description Look up a single permission row by its canonical key.
   * @param {string} key - Permission key to fetch.
   * @returns {Promise<PermissionRow | null>} Row if found, otherwise null.
   */
  async findByKey(key: string): Promise<PermissionRow | null> {
    // Query by the unique `key` column rather than the synthetic `id`.
    const row = await this.knex(this.tableName).where({ key }).first()
    return row ?? null
  }

  /**
   * @description Idempotently upsert a batch of registry rows. New keys are
   * inserted, existing keys have their payload columns merged. Returns the
   * count of inserted vs. updated rows so the boot sync can log both deltas.
   *
   * Implementation: snapshot the pre-existing keys, run a single
   * `INSERT ... ON CONFLICT (key) DO UPDATE` so the operation is one
   * round-trip, then derive `inserted` from the set difference and `updated`
   * from rows whose payload actually changed.
   *
   * @param {PermissionUpsertInput[]} rows - Registry rows to upsert.
   * @returns {Promise<UpsertResult>} Counts of inserted vs. updated rows.
   */
  async upsertMany(rows: PermissionUpsertInput[]): Promise<UpsertResult> {
    // Empty input is a legal no-op — return zero counts so callers can branch.
    if (rows.length === 0) return { inserted: 0, updated: 0 }

    // Snapshot existing payloads BEFORE the upsert so we can compute both
    // `inserted` (new keys) and `updated` (changed payloads) accurately.
    const incomingKeys = rows.map((r) => r.key)
    const existingRows = await this.knex(this.tableName)
      .whereIn('key', incomingKeys)
      .select('key', 'feature', 'action', 'subject', 'label', 'description')
    const existingByKey = new Map<string, Omit<PermissionRow, 'id' | 'created_at' | 'updated_at'>>(
      existingRows.map((r) => [r.key, r as Omit<PermissionRow, 'id' | 'created_at' | 'updated_at'>]),
    )

    // Bump updated_at on every conflict so audit pipelines can detect changes.
    const insertPayload = rows.map((r) => ({
      key: r.key,
      feature: r.feature,
      action: r.action,
      subject: r.subject,
      label: r.label,
      // Convert undefined → null so Postgres accepts the nullable column.
      description: r.description ?? null,
      updated_at: this.knex.fn.now(),
    }))

    // Single round-trip: insert all rows, merge non-key columns on conflict.
    await this.knex(this.tableName)
      .insert(insertPayload)
      .onConflict('key')
      .merge(['feature', 'action', 'subject', 'label', 'description', 'updated_at'])

    // Compute insert vs. update counts from the pre-snapshot.
    let inserted = 0
    let updated = 0
    for (const r of rows) {
      const prior = existingByKey.get(r.key)
      if (!prior) {
        inserted += 1
        continue
      }
      // A row counts as "updated" only if any payload column actually changed.
      const payloadChanged =
        prior.feature !== r.feature ||
        prior.action !== r.action ||
        prior.subject !== r.subject ||
        prior.label !== r.label ||
        (prior.description ?? null) !== (r.description ?? null)
      if (payloadChanged) updated += 1
    }
    return { inserted, updated }
  }

  /**
   * @description Delete catalog rows whose keys are no longer in the registry.
   * Used by the boot sync stale-row removal step. No-op when `keys` is empty.
   * @param {string[]} keys - Catalog keys that should be removed.
   * @returns {Promise<number>} Number of rows actually deleted.
   */
  async deleteByKeys(keys: string[]): Promise<number> {
    // Guard against an empty array — Knex would emit `WHERE key IN ()` which
    // is a SQL syntax error in some drivers and is wasteful in all of them.
    if (keys.length === 0) return 0
    // Batch delete by key — `whereIn` is index-friendly because `key` is unique.
    return this.knex(this.tableName).whereIn('key', keys).delete()
  }

  /**
   * @description Return every user in `tenantId` who can perform `(action, subject)`,
   * walking role defaults, user overrides, and resource grants. The result lists
   * each authorized user once per source row, so the same user may appear multiple
   * times when permission flows from more than one source — callers can group by
   * `user_id` if a deduped view is needed.
   *
   * Algorithm:
   *   1. Resolve every catalog `permission.key` whose `(action, subject)` matches.
   *      If none match, return [] immediately.
   *   2. UNION three SELECTs joined to `users` (always filtered by
   *      `users.current_org_id = tenantId` to prevent cross-tenant leakage):
   *        a. role_permissions where the user's role grants any matching key,
   *           and tenant_id is NULL (global default) OR matches `tenantId`.
   *        b. user_permission_overrides with effect='allow' for any matching key,
   *           tenant-scoped, and not expired (`expires_at IS NULL OR > NOW()`).
   *        c. resource_grants where actions[] contains the target action and
   *           grantee is the user (Phase 5 will widen to teams/roles), tenant-scoped,
   *           not expired, and (when `resourceId` is provided) row-scoped.
   *   3. Subtract any users with an active deny override on a matching key.
   *
   * Tenant isolation: every join carries `users.current_org_id = tenantId` AND
   * each subquery filters its source table by `tenant_id`, so a user in T2 can
   * never appear in a query for T1 even if they happen to have a stale row.
   *
   * @param {string} action - CASL action verb (e.g. `read`, `manage`).
   * @param {string} subject - CASL subject (e.g. `KnowledgeBase`).
   * @param {string | null} resourceId - Optional resource id for instance-scoped checks.
   * @param {string} tenantId - Tenant to query within. Required.
   * @returns {Promise<WhoCanDoEntry[]>} Authorized users with provenance.
   */
  async whoCanDo(
    action: string,
    subject: string,
    resourceId: string | null,
    tenantId: string,
  ): Promise<WhoCanDoEntry[]> {
    // Step 1 — find every catalog key whose (action, subject) matches the
    // requested pair. CASL `manage` is a wildcard at evaluation time but at the
    // catalog level we still record it as a literal action verb, so any key
    // whose action is either the requested action OR `manage` should count.
    const matchingKeyRows = await this.knex(this.tableName)
      .where({ subject })
      .andWhere((qb) => {
        qb.where({ action }).orWhere({ action: 'manage' })
      })
      .select('key')
    const matchingKeys = matchingKeyRows.map((r: { key: string }) => r.key)
    // Empty registry match → no users can possibly have this permission.
    if (matchingKeys.length === 0) return []

    // Step 2a — role-default grants. Tenant filter on `users.current_org_id`
    // is the structural cross-tenant guard; the `(tenant_id IS NULL OR =)`
    // clause covers both global defaults and tenant-specific overlays.
    const roleRows = await this.knex('users')
      .innerJoin(
        ROLE_PERMISSIONS_TABLE,
        'users.role',
        `${ROLE_PERMISSIONS_TABLE}.role`,
      )
      .where('users.current_org_id', tenantId)
      .whereIn(`${ROLE_PERMISSIONS_TABLE}.permission_key`, matchingKeys)
      .andWhere((qb) => {
        qb.whereNull(`${ROLE_PERMISSIONS_TABLE}.tenant_id`).orWhere(
          `${ROLE_PERMISSIONS_TABLE}.tenant_id`,
          tenantId,
        )
      })
      .select(
        'users.id as user_id',
        'users.email as user_email',
        'users.role as user_role',
        `${ROLE_PERMISSIONS_TABLE}.id as source_id`,
      )

    // Step 2b — explicit allow overrides on a matching key, not expired.
    // Tenant scope is enforced both on the override row and on the user join.
    const allowOverrideRows = await this.knex('users')
      .innerJoin(
        USER_PERMISSION_OVERRIDES_TABLE,
        'users.id',
        `${USER_PERMISSION_OVERRIDES_TABLE}.user_id`,
      )
      .where('users.current_org_id', tenantId)
      .where(`${USER_PERMISSION_OVERRIDES_TABLE}.tenant_id`, tenantId)
      .whereIn(
        `${USER_PERMISSION_OVERRIDES_TABLE}.permission_key`,
        matchingKeys,
      )
      .where(`${USER_PERMISSION_OVERRIDES_TABLE}.effect`, 'allow')
      // Index-friendly SQL-side expiry filter — never compare in JS.
      .andWhere((qb) => {
        qb.whereNull(`${USER_PERMISSION_OVERRIDES_TABLE}.expires_at`).orWhereRaw(
          `${USER_PERMISSION_OVERRIDES_TABLE}.expires_at > NOW()`,
        )
      })
      .select(
        'users.id as user_id',
        'users.email as user_email',
        'users.role as user_role',
        `${USER_PERMISSION_OVERRIDES_TABLE}.id as source_id`,
      )

    // Step 2c — resource grants. Phase 2 only resolves `grantee_type='user'`
    // here; team/role grants land in Phase 5 alongside user_team membership.
    // When `resourceId` is provided, narrow to that specific row so the query
    // answers "who can do X on resource R" rather than "who can do X anywhere".
    const grantQuery = this.knex('users')
      .innerJoin(
        RESOURCE_GRANTS_TABLE,
        'users.id',
        `${RESOURCE_GRANTS_TABLE}.grantee_id`,
      )
      .where('users.current_org_id', tenantId)
      .where(`${RESOURCE_GRANTS_TABLE}.tenant_id`, tenantId)
      .where(`${RESOURCE_GRANTS_TABLE}.grantee_type`, 'user')
      .where(`${RESOURCE_GRANTS_TABLE}.resource_type`, subject)
      // `actions @> ARRAY[?]` checks Postgres text[] containment. Manage is a
      // CASL wildcard so we also accept rows that explicitly list `manage`.
      .andWhere((qb) => {
        qb.whereRaw(`${RESOURCE_GRANTS_TABLE}.actions @> ARRAY[?]::text[]`, [action])
          .orWhereRaw(`${RESOURCE_GRANTS_TABLE}.actions @> ARRAY['manage']::text[]`)
      })
      .andWhere((qb) => {
        qb.whereNull(`${RESOURCE_GRANTS_TABLE}.expires_at`).orWhereRaw(
          `${RESOURCE_GRANTS_TABLE}.expires_at > NOW()`,
        )
      })
    if (resourceId) {
      grantQuery.where(`${RESOURCE_GRANTS_TABLE}.resource_id`, resourceId)
    }
    const grantRows = await grantQuery.select(
      'users.id as user_id',
      'users.email as user_email',
      'users.role as user_role',
      `${RESOURCE_GRANTS_TABLE}.id as source_id`,
    )

    // Step 3 — collect users who hold an active deny override on any matching
    // key in this tenant. Deny wins over every allow source, so these user ids
    // are subtracted from the union below before returning to the caller.
    const denyRows = await this.knex(USER_PERMISSION_OVERRIDES_TABLE)
      .where({ tenant_id: tenantId, effect: 'deny' })
      .whereIn('permission_key', matchingKeys)
      .andWhere((qb) => {
        qb.whereNull('expires_at').orWhereRaw('expires_at > NOW()')
      })
      .select('user_id')
    const deniedUserIds = new Set<string>(
      denyRows.map((r: { user_id: string }) => r.user_id),
    )

    // Build the final union, tagging each row with its provenance and dropping
    // any user that an active deny masks. We intentionally keep duplicates
    // across sources so the admin UI can show "this user is granted via role
    // AND a resource grant" rather than collapsing to a single row.
    const out: WhoCanDoEntry[] = []
    for (const r of roleRows) {
      if (deniedUserIds.has(r.user_id)) continue
      out.push({ ...r, source: 'role' })
    }
    for (const r of allowOverrideRows) {
      if (deniedUserIds.has(r.user_id)) continue
      out.push({ ...r, source: 'override' })
    }
    for (const r of grantRows) {
      if (deniedUserIds.has(r.user_id)) continue
      out.push({ ...r, source: 'resource_grant' })
    }
    return out
  }
}
