/**
 * @fileoverview ResourceGrantModel — row-level access grants on knowledge
 * bases, document categories, and other resources. Read by the Phase 2 V2
 * CASL ability builder to emit resource-scoped `can()` rules; written by the
 * Phase 5 admin UI and by resource-creation flows that auto-grant owners.
 *
 * Locked decisions honored by this model:
 *   - Tenant isolation is the FIRST WHERE clause on every query so the
 *     `idx_resource_grants_tenant_id` index can participate in the plan.
 *   - The `expires_at` filter is ALWAYS applied in SQL
 *     (`expires_at IS NULL OR expires_at > NOW()`) — NEVER in JavaScript.
 *   - The team-membership join contract: `findActiveForUser` returns rows
 *     matching `(grantee_type='user' AND grantee_id=$userId)` OR, when the
 *     caller passes a non-empty `teamIds` array,
 *     `(grantee_type='team' AND grantee_id IN $teamIds)`. Role grantees are
 *     intentionally NOT handled here — that's role_permissions territory.
 */

import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { RESOURCE_GRANTS_TABLE } from '@/shared/constants/permissions.js'

/**
 * @description The grantee-type values stored in the `grantee_type` column.
 * `role` is reserved for future use; the V2 builder currently only consumes
 * `user` and `team` rows.
 */
export type ResourceGranteeType = 'user' | 'team' | 'role'

/**
 * @description Row shape of the `resource_grants` table. Mirrors the columns
 * produced by the initial schema plus the Phase 1 rename/backfill migration.
 *
 * Note on `updated_by`: the initial schema added `updated_by` as an optional
 * audit column; it is exposed here as nullable so reads return the full row
 * shape, but callers never need to set it on insert.
 */
export interface ResourceGrantRow {
  /** Hex UUID primary key (DB-generated). */
  id: string
  /** Owning knowledge base id (FK to knowledge_bases.id, CASCADE on delete). */
  knowledge_base_id: string
  /** Resource kind, e.g. `KnowledgeBase` or `DocumentCategory`. */
  resource_type: string
  /** Specific resource row id. */
  resource_id: string
  /** Grantee kind. */
  grantee_type: ResourceGranteeType
  /** Specific grantee id (user id / team id / role name). */
  grantee_id: string
  /** Legacy permission level (`none`|`view`|`create`|`edit`|`delete`). */
  permission_level: string
  /** Postgres `text[]` of CASL action verbs (the new canonical source). */
  actions: string[]
  /** Tenant scope. Nullable on disk for legacy rows pending backfill. */
  tenant_id: string | null
  /** Optional expiry honored by the ability builder in SQL. */
  expires_at: string | null
  /** Audit: creator id. */
  created_by: string | null
  /** Audit: last editor id. */
  updated_by: string | null
  /** Audit timestamp. */
  created_at: string
  /** Audit timestamp. */
  updated_at: string
}

/**
 * @description Insert payload for {@link ResourceGrantModel.bulkCreate}.
 * Excludes DB-managed columns (`id`, `created_at`, `updated_at`).
 */
export type ResourceGrantInsert = Omit<
  ResourceGrantRow,
  'id' | 'created_at' | 'updated_at'
>

/**
 * @description Model for the `resource_grants` table. All queries that touch
 * resource-scoped grants MUST live here per the strict layering rules.
 */
export class ResourceGrantModel extends BaseModel<ResourceGrantRow> {
  /** Database table name (constant — no string literals). */
  protected tableName = RESOURCE_GRANTS_TABLE
  /** Shared Knex database instance. */
  protected knex = db

  /**
   * @description Return every ACTIVE resource grant that applies to a given
   * user within a tenant, including grants attached to any of the user's
   * teams. "Active" means the row has not expired — the expiry check is
   * performed in SQL (`expires_at IS NULL OR expires_at > NOW()`) so the
   * database clock is the single source of truth.
   *
   * Grantee-match contract:
   *   - `(grantee_type='user' AND grantee_id=$userId)` — always considered.
   *   - `(grantee_type='team' AND grantee_id IN $teamIds)` — only when the
   *     caller passes a non-empty teamIds array.
   *   - `grantee_type='role'` is intentionally NOT handled here; role grants
   *     live in `role_permissions` and are resolved by a different code path.
   *
   * Rows from BOTH `KnowledgeBase` and `DocumentCategory` (and any other
   * resource_type) are returned in one round-trip; the V2 builder filters by
   * subject when emitting CASL rules.
   *
   * @param {string} userId - Target user id.
   * @param {string} tenantId - Tenant scope; cross-tenant grants are excluded.
   * @param {readonly string[]} [teamIds] - Optional team ids the user belongs to.
   * @returns {Promise<ResourceGrantRow[]>} Active grants.
   */
  async findActiveForUser(
    userId: string,
    tenantId: string,
    teamIds: readonly string[] = [],
  ): Promise<ResourceGrantRow[]> {
    // Tenant filter FIRST so the tenant_id index participates in the plan.
    const query = this.knex(this.tableName)
      .where({ tenant_id: tenantId })
      // SQL-side expiry — see locked decision in the file header.
      .andWhere((qb) => {
        qb.whereNull('expires_at').orWhereRaw('expires_at > NOW()')
      })
      // Grantee-match disjunction: user-direct OR team-membership.
      .andWhere((qb) => {
        // Always include user-direct grants.
        qb.where({ grantee_type: 'user', grantee_id: userId })
        // Only add the team branch when we actually have team ids — an empty
        // `whereIn([])` in Knex would match zero rows, which is what we want,
        // but guarding here avoids emitting a dead OR subclause.
        if (teamIds.length > 0) {
          qb.orWhere((teamQb) => {
            teamQb.where({ grantee_type: 'team' }).whereIn('grantee_id', teamIds as string[])
          })
        }
      })
      .select('*')

    return query
  }

  /**
   * @description List every grant attached to a specific resource row within
   * a tenant. Used by the Phase 5 admin UI "who has access to this KB?" view.
   *
   * @param {string} resourceType - Resource kind (`KnowledgeBase`, `DocumentCategory`, ...).
   * @param {string} resourceId - Specific resource row id.
   * @param {string} tenantId - Tenant scope; cross-tenant rows are excluded.
   * @returns {Promise<ResourceGrantRow[]>} All grants on the resource.
   */
  async findByResource(
    resourceType: string,
    resourceId: string,
    tenantId: string,
  ): Promise<ResourceGrantRow[]> {
    // Compound filter uses the (resource_type, resource_id) index plus the
    // tenant_id index — Postgres picks whichever is more selective.
    return this.knex(this.tableName)
      .where({
        tenant_id: tenantId,
        resource_type: resourceType,
        resource_id: resourceId,
      })
      .select('*')
  }

  /**
   * @description Idempotent bulk upsert of resource grants. Conflicts on the
   * `(resource_type, resource_id, grantee_type, grantee_id)` unique key merge
   * the `actions` array and bump `updated_at` — so the Phase 5 admin UI can
   * call this with the desired end-state list and have existing rows refresh
   * their action set in place.
   *
   * @param {ResourceGrantInsert[]} grants - Rows to insert or merge.
   * @returns {Promise<{ inserted: number }>} Rowcount returned by Postgres.
   */
  async bulkCreate(
    grants: ResourceGrantInsert[],
  ): Promise<{ inserted: number }> {
    // Empty input is a legal no-op so callers don't need to guard.
    if (grants.length === 0) return { inserted: 0 }

    // `.merge(['actions', 'updated_at'])` is chosen over `.ignore()` so the
    // admin UI can submit a desired-state payload and have existing rows
    // refresh their action set in place. `updated_at` is bumped via a
    // constant so the merge has a non-key column to update.
    const payload = grants.map((g) => ({
      ...g,
      updated_at: this.knex.fn.now(),
    }))

    const result = await this.knex(this.tableName)
      .insert(payload)
      .onConflict(['resource_type', 'resource_id', 'grantee_type', 'grantee_id'])
      .merge(['actions', 'updated_at'])
      .returning('id')

    return { inserted: Array.isArray(result) ? result.length : 0 }
  }

  /**
   * @description Delete a grant by id, gated on the caller's tenant so a
   * misconfigured admin UI cannot accidentally wipe grants belonging to a
   * different tenant.
   *
   * @param {string} id - Grant row id to delete.
   * @param {string} tenantId - Tenant scope; rows outside the tenant are untouched.
   * @returns {Promise<number>} Number of rows actually deleted (0 or 1).
   */
  async deleteById(id: string, tenantId: string): Promise<number> {
    // Explicit tenant_id filter prevents cross-tenant deletes even if an
    // attacker or bug passes a guessed id from another tenant.
    return this.knex(this.tableName)
      .where({ id, tenant_id: tenantId })
      .delete()
  }
}
