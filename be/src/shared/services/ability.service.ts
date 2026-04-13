/**
 * @fileoverview CASL-based ability service for attribute-based access control (ABAC).
 *
 * This module provides:
 * - Role-based CASL ability building for 4-role hierarchy (super-admin, admin, leader, user)
 * - ABAC policy overlay for fine-grained conditional rules
 * - Valkey (Redis) caching of serialized abilities keyed by session ID
 * - Cache invalidation for single sessions and platform-wide policy changes
 *
 * @module services/ability
 */

import { AbilityBuilder, createMongoAbility, MongoAbility, RawRuleOf } from '@casl/ability'
import { getRedisClient } from '@/shared/services/redis.service.js'
import { config } from '@/shared/config/index.js'
import { log } from '@/shared/services/logger.service.js'
import { ResourceType, UserRole } from '@/shared/constants/index.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { getAllPermissions } from '@/shared/permissions/index.js'
import { PermissionSubjects, ABILITY_CACHE_PREFIX } from '@/shared/constants/permissions.js'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** @description CASL action verbs used across the authorization system */
type Actions = 'manage' | 'create' | 'read' | 'update' | 'delete'

/**
 * @description CASL subject types corresponding to application resources.
 * This union is the canonical set of subjects the ability builder (V1 or V2)
 * may emit. The V2 builder is purely data-driven off the permission registry,
 * so this union MUST stay in sync with `PermissionSubjects` at
 * `shared/constants/permissions.ts`. `Policy` and `Org` are legacy subjects
 * kept for V1 ABAC policy overlays; `all` is CASL's wildcard.
 */
type Subjects =
  | 'KnowledgeBase'
  | 'DocumentCategory'
  | 'Document'
  | 'Dataset'
  | 'Chunk'
  | 'ChatAssistant'
  | 'SearchApp'
  | 'User'
  | 'Team'
  | 'Agent'
  | 'Memory'
  | 'AuditLog'
  | 'System'
  | 'SystemTool'
  | 'SystemHistory'
  | 'LlmProvider'
  | 'Glossary'
  | 'Broadcast'
  | 'Dashboard'
  | 'CodeGraph'
  | 'ApiKey'
  | 'Feedback'
  | 'Preview'
  | 'UserHistory'
  | 'SyncConnector'
  | 'Policy'
  | 'Org'
  | 'all'

/** @description Application-wide CASL ability type combining actions and subjects */
export type AppAbility = MongoAbility<[Actions, Subjects]>

/**
 * @description User context required for building CASL abilities.
 * Contains the minimal user info needed to compute permissions.
 */
export interface AbilityUserContext {
  /** User's unique identifier */
  id: string
  /** User's role within the current org (e.g., 'admin', 'leader', 'user') */
  role: string
  /** Whether the user is a platform-level super admin */
  is_superuser?: boolean | null | undefined
  /** Current active org/tenant ID for tenant-scoped rules */
  current_org_id: string
  /** User's department from identity provider */
  department?: string | null | undefined
  /** Additional attributes for ABAC policy evaluation */
  attributes?: Record<string, unknown> | undefined
}

/**
 * @description ABAC policy rule definition for fine-grained conditional access.
 * Policies are stored in the database and evaluated at ability-build time.
 */
export interface AbacPolicyRule {
  /** Unique policy rule identifier */
  id: string
  /** Whether this rule grants or denies access */
  effect: 'allow' | 'deny'
  /** CASL action (e.g., 'read', 'create', 'manage') */
  action: string
  /** CASL subject (e.g., 'Dataset', 'Document') */
  subject: string
  /** CASL conditions object for attribute-based filtering */
  conditions: Record<string, unknown>
  /** Human-readable description of the policy rule */
  description?: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** @description Default TTL for cached abilities (matches session TTL: 7 days) */
const ABILITY_CACHE_TTL_SECONDS = config.session.ttlSeconds || 604800
/** @description Soft cap on Phase 6 grant-derived dataset fan-out. */
const GRANT_DATASET_SOFT_CAP = 10000

// ============================================================================
// ABILITY BUILDER
// ============================================================================

/**
 * @description Builds a CASL ability instance for a user based on their role, org context, and optional ABAC policies.
 *
 * Role hierarchy:
 * - super-admin: manage all resources across all orgs
 * - admin: manage all resources within their org (tenant_id scoped)
 * - leader: CRUD datasets/documents/assistants/search-apps within their org
 * - user: read-only access to datasets/documents within their org
 *
 * @param {AbilityUserContext} user - User context including role and org
 * @param {AbacPolicyRule[]} policies - Optional ABAC policy rules to overlay
 * @returns {AppAbility} Compiled CASL ability instance
 *
 * @example
 * const ability = buildAbilityFor({ id: '123', role: 'admin', current_org_id: 'org1' })
 * ability.can('manage', 'Dataset') // true (with tenant_id condition)
 */
function buildAbilityForV1Sync(user: AbilityUserContext, policies: AbacPolicyRule[] = []): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

  // Super-admin gets unrestricted access across all orgs
  if (user.is_superuser === true || user.role === UserRole.SUPER_ADMIN) {
    can('manage', 'all')
    return build()
  }

  const tenantCondition = { tenant_id: user.current_org_id }

  // Base permissions: all authenticated users can read datasets and documents within their org
  can('read', 'Dataset', tenantCondition)
  can('read', 'Document', tenantCondition)

  // Admin: full management within their org
  if (user.role === UserRole.ADMIN) {
    can('manage', 'User', tenantCondition)
    can('manage', 'Dataset', tenantCondition)
    can('manage', 'Document', tenantCondition)
    can('manage', 'KnowledgeBase', tenantCondition)
    can('read', 'AuditLog', tenantCondition)
    can('manage', 'ChatAssistant', tenantCondition)
    can('manage', 'SearchApp', tenantCondition)
    can('manage', 'Agent', tenantCondition)
    can('manage', 'Memory', tenantCondition)
  }

  // Leader: create/update/delete datasets, manage documents and apps within their org
  if (user.role === UserRole.LEADER) {
    can('create', 'Dataset', tenantCondition)
    can('update', 'Dataset', tenantCondition)
    can('delete', 'Dataset', tenantCondition)
    can('manage', 'Document', tenantCondition)
    can('manage', 'KnowledgeBase', tenantCondition)
    can('manage', 'ChatAssistant', tenantCondition)
    can('manage', 'SearchApp', tenantCondition)
    can('manage', 'Agent', tenantCondition)
    can('manage', 'Memory', tenantCondition)
  }

  // User role: only the base read permissions above (no additional grants)

  // Apply ABAC policy overlays from database
  for (const policy of policies) {
    if (policy.effect === 'deny') {
      // Deny rules restrict previously granted permissions
      cannot(policy.action as Actions, policy.subject as Subjects, policy.conditions as any)
    } else {
      // Allow rules add additional permissions
      can(policy.action as Actions, policy.subject as Subjects, policy.conditions as any)
    }
  }

  return build()
}

/**
 * @description Phase 2 V2 CASL ability builder — purely data-driven from the
 * `role_permissions`, `user_permission_overrides`, and `resource_grants`
 * tables plus the in-process permission registry. Sits behind
 * `config.permissions.useV2Engine` (default false) so V1 remains the active
 * path until Phase 3 flips the flag after parity is proven.
 *
 * Emission order (the 7-step contract):
 *   1. Super-admin shortcut — mirrors V1 at `buildAbilityForV1Sync` to preserve
 *      the unrestricted-access invariant for platform admins.
 *   2. Role-default rules — one `can(action, subject)` per row returned by
 *      `role_permissions JOIN permissions`, scoped to the user's tenant.
 *   3. Resource grants — per-row `can()` rules with `{id: resourceId}` on top
 *      of the tenant condition. Team-membership resolution is a Phase 5
 *      follow-up (see TODO below); we currently pass `teamIds=[]`.
 *   4. KB→Category cascade — a SINGLE lazy rule so DocumentCategory reads
 *      piggy-back on KB reads. This is READ-ONLY by design (TS8 lock); write
 *      actions on categories MUST be granted explicitly via role_permissions
 *      or a resource_grant.
 *   5. Override ALLOW rules — `can()` for every `effect='allow'` override.
 *   6. ABAC policy overlay — preserves V1's per-policy `can/cannot` loop so
 *      existing ABAC rows keep working unchanged.
 *   7. Override DENY rules — `cannot()` LAST per CASL's "later wins" rule
 *      (R-G lock); this guarantees admin-issued denies always beat any allow
 *      emitted earlier in the build, regardless of which step produced it.
 *
 * Every emitted rule carries the `{tenant_id: user.current_org_id}` condition
 * (or for resource-grants, `{tenant_id, id: resource_id}`), so cross-tenant
 * leakage is structurally impossible.
 *
 * Carry-over: resource_grant rows from before the P1.2 backfill may carry
 * `permission_level` without populating `actions[]`. Those rows are logged
 * and skipped — production data should already be migrated.
 *
 * @param {AbilityUserContext} user - User context including role and org
 * @param {AbacPolicyRule[]} policies - Optional ABAC policy rules to overlay
 * @returns {Promise<AppAbility>} Compiled CASL ability instance
 */
async function buildAbilityForV2(
  user: AbilityUserContext,
  policies: AbacPolicyRule[] = [],
): Promise<AppAbility> {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility)
  const { can, cannot, build } = builder

  // STEP 1 — Super-admin shortcut. Mirrors V1 (see buildAbilityForV1Sync).
  // Platform admins get unrestricted access across all tenants; no DB reads.
  if (user.is_superuser === true || user.role === UserRole.SUPER_ADMIN) {
    can('manage', 'all')
    return build()
  }

  // Every subsequent rule is tenant-scoped. This is the structural guarantee
  // that prevents cross-tenant data leakage at the ability layer.
  const tenantCondition = { tenant_id: user.current_org_id }

  // STEP 2 — Role defaults. One `can(action, subject)` per row from the
  // (role_permissions JOIN permissions) read path. The JOIN drops keys that
  // are not in the registry catalog, so stale seed rows are ignored safely.
  const rolePerms = await ModelFactory.rolePermission.findByRoleWithSubjects(
    user.role,
    user.current_org_id,
  )
  for (const p of rolePerms) {
    can(p.action as Actions, p.subject as Subjects, tenantCondition)
  }

  // STEP 3 — Resource grants. User-direct grants only in Phase 2; team
  // grants will layer in during Phase 5 once the team-membership lookup is
  // wired into the auth session.
  // TODO(Phase 5): resolve teamIds from user_team membership and pass here.
  const resourceGrants = await ModelFactory.resourceGrant.findActiveForUser(
    user.id,
    user.current_org_id,
    [],
  )
  for (const grant of resourceGrants) {
    // Defensive: legacy rows from before the P1.2 backfill may have an empty
    // actions[] array. Log once and skip — production data should be migrated.
    if (!Array.isArray(grant.actions) || grant.actions.length === 0) {
      log.warn('[V2] resource_grant missing actions[] — skipping', {
        grantId: grant.id,
        resourceType: grant.resource_type,
        permissionLevel: grant.permission_level,
      })
      continue
    }
    // Emit one CASL rule per (action, resource_type) pair, constrained to the
    // specific resource id so the grant is row-scoped (not class-wide).
    for (const action of grant.actions) {
      can(action as Actions, grant.resource_type as Subjects, {
        ...tenantCondition,
        id: grant.resource_id,
      } as any)
    }
  }

  // STEP 4 — KB→Category cascade (Option A: single lazy rule). Determining
  // accessible KBs is data-driven off steps 2 and 3, not from a CASL
  // introspection pass, so the cascade stays cheap and deterministic.
  const hasClassLevelKbRead = rolePerms.some(
    (p) =>
      p.subject === PermissionSubjects.KnowledgeBase &&
      (p.action === 'read' || p.action === 'manage'),
  )
  // Row-scoped KB grants — each becomes one entry in the `$in` list below.
  const grantedKbIds = resourceGrants
    .filter(
      (g) =>
        g.resource_type === PermissionSubjects.KnowledgeBase &&
        Array.isArray(g.actions) &&
        (g.actions.includes('read') || g.actions.includes('manage')),
    )
    .map((g) => g.resource_id)

  if (hasClassLevelKbRead) {
    // Class-level KB read ⇒ every category in this tenant is readable.
    // No $in restriction needed; the tenant condition is sufficient.
    can('read', 'DocumentCategory', tenantCondition)
  } else if (grantedKbIds.length > 0) {
    // Row-scoped KB reads ⇒ only categories belonging to those KBs are
    // readable. A single rule with `$in` keeps CASL's rule count bounded.
    can('read', 'DocumentCategory', {
      ...tenantCondition,
      knowledge_base_id: { $in: grantedKbIds },
    } as any)
  }
  // Else: no KB read access ⇒ no DocumentCategory rule emitted at all.

  // Pre-fetch overrides once; used in steps 5 and 7. The registry lookup is
  // by-key so we build a map for O(1) resolution inside the loops.
  const overrides = await ModelFactory.userPermissionOverride.findActiveForUser(
    user.id,
    user.current_org_id,
  )
  const registryByKey = new Map(
    getAllPermissions().map((p) => [p.key, p] as const),
  )

  // STEP 5 — Override ALLOW rules. Emitted BEFORE the ABAC overlay so that
  // admin-granted allows can still be masked by a later explicit deny (steps
  // 6 deny or 7) per CASL's "later wins" rule.
  for (const ov of overrides) {
    if (ov.effect !== 'allow') continue
    const p = registryByKey.get(ov.permission_key)
    if (!p) {
      log.warn('[V2] override references unknown permission key', {
        key: ov.permission_key,
        userId: user.id,
        effect: ov.effect,
      })
      continue
    }
    can(p.action as Actions, p.subject as Subjects, tenantCondition)
  }

  // STEP 6 — ABAC policy overlay. Preserves V1's per-policy loop so existing
  // policy rows keep working unchanged during the V1→V2 transition.
  for (const policy of policies) {
    if (policy.effect === 'deny') {
      cannot(
        policy.action as Actions,
        policy.subject as Subjects,
        policy.conditions as any,
      )
    } else {
      can(
        policy.action as Actions,
        policy.subject as Subjects,
        policy.conditions as any,
      )
    }
  }

  // STEP 7 — Override DENY rules, emitted LAST so CASL's "later wins"
  // precedence guarantees admin-issued denies beat every earlier allow. This
  // is the R-G lock from the plan — do not reorder.
  for (const ov of overrides) {
    if (ov.effect !== 'deny') continue
    const p = registryByKey.get(ov.permission_key)
    if (!p) {
      log.warn('[V2] override references unknown permission key', {
        key: ov.permission_key,
        userId: user.id,
        effect: ov.effect,
      })
      continue
    }
    cannot(p.action as Actions, p.subject as Subjects, tenantCondition)
  }

  return build()
}

/**
 * @description Public dispatcher for ability construction. Picks between the
 * legacy V1 builder and the new DB-backed V2 builder based on the
 * `config.permissions.useV2Engine` feature flag (default false). ALWAYS async
 * so callers have a single consistent call signature regardless of engine.
 *
 * @param {AbilityUserContext} user - User context including role and org
 * @param {AbacPolicyRule[]} policies - Optional ABAC policy rules to overlay
 * @returns {Promise<AppAbility>} Compiled CASL ability instance
 */
export async function buildAbilityFor(
  user: AbilityUserContext,
  policies: AbacPolicyRule[] = [],
): Promise<AppAbility> {
  if (config.permissions.useV2Engine) {
    return buildAbilityForV2(user, policies)
  }
  // V1 is synchronous; wrapping in async keeps the signature consistent.
  return buildAbilityForV1Sync(user, policies)
}

/**
 * @description Resolve a user's active resource grants to the flat list of
 * dataset IDs they may search via Phase 6 Strategy A. Reuses the SQL-side
 * `findActiveForUser` expiry and tenant filters, then batches KB and category
 * resolution through the DocumentCategoryModel.
 * @param {string} userId - User whose grants to walk.
 * @param {string} tenantId - Tenant scope for the grant query.
 * @param {{ teamIds?: readonly string[] }} [opts] - Optional team IDs for team grants.
 * @returns {Promise<string[]>} Flat deduped dataset ID list.
 */
export async function resolveGrantedDatasetsForUser(
  userId: string,
  tenantId: string,
  opts: { teamIds?: readonly string[] } = {},
): Promise<string[]> {
  // Read active grants with tenant isolation and SQL-side expires_at handling.
  const grants = await ModelFactory.resourceGrant.findActiveForUser(
    userId,
    tenantId,
    opts.teamIds ?? [],
  )
  if (grants.length === 0) return []

  const kbIds: string[] = []
  const categoryIds: string[] = []

  // Partition by resource kind so the downstream model methods stay batched.
  for (const grant of grants) {
    if (grant.resource_type === ResourceType.KNOWLEDGE_BASE) {
      kbIds.push(grant.resource_id)
      continue
    }
    if (grant.resource_type === ResourceType.DOCUMENT_CATEGORY) {
      categoryIds.push(grant.resource_id)
    }
  }

  const [kbDatasets, categoryDatasets] = await Promise.all([
    ModelFactory.documentCategory.findDatasetIdsByKnowledgeBaseIds(kbIds),
    ModelFactory.documentCategory.findDatasetIdsByCategoryIds(categoryIds),
  ])

  const union = new Set<string>([...kbDatasets, ...categoryDatasets])

  // Cap pathological fan-out so retrieval does not emit oversized dataset lists.
  if (union.size > GRANT_DATASET_SOFT_CAP) {
    log.warn('resolveGrantedDatasetsForUser truncated: grant fan-out exceeds soft cap', {
      userId,
      tenantId,
      total: union.size,
      cap: GRANT_DATASET_SOFT_CAP,
    })
    return Array.from(union).slice(0, GRANT_DATASET_SOFT_CAP)
  }

  return Array.from(union)
}

// ============================================================================
// CACHE OPERATIONS
// ============================================================================

/**
 * @description Serializes and caches a CASL ability in Valkey keyed by session ID.
 * TTL matches the session TTL so abilities expire with the session.
 * @param {string} sessionId - The session ID to use as cache key
 * @param {AppAbility} ability - The compiled CASL ability to cache
 * @returns {Promise<void>}
 */
export async function cacheAbility(sessionId: string, ability: AppAbility): Promise<void> {
  const client = getRedisClient()
  // Skip caching when Redis is not available (e.g., memory session store in dev)
  if (!client) {
    log.debug('Skipping ability cache — Redis not available')
    return
  }

  try {
    const key = `${ABILITY_CACHE_PREFIX}${sessionId}`
    const serialized = JSON.stringify(ability.rules)
    await client.set(key, serialized, { EX: ABILITY_CACHE_TTL_SECONDS })
    log.debug('Cached ability rules', { sessionId, ruleCount: ability.rules.length })
  } catch (error) {
    // Non-fatal: ability will be rebuilt on next request
    log.error('Failed to cache ability', {
      error: error instanceof Error ? error.message : String(error),
      sessionId,
    })
  }
}

/**
 * @description Loads a cached CASL ability from Valkey by session ID.
 * Returns null if no cached ability exists or Redis is unavailable.
 * @param {string} sessionId - The session ID to look up
 * @returns {Promise<AppAbility | null>} The deserialized ability or null
 */
export async function loadCachedAbility(sessionId: string): Promise<AppAbility | null> {
  const client = getRedisClient()
  // No Redis means no cache — caller should build ability fresh
  if (!client) return null

  try {
    const key = `${ABILITY_CACHE_PREFIX}${sessionId}`
    const serialized = await client.get(key)
    if (!serialized) return null

    // Deserialize rules and reconstruct a MongoAbility instance
    const rules = JSON.parse(serialized) as RawRuleOf<AppAbility>[]
    log.debug('Loaded cached ability', { sessionId, ruleCount: rules.length })
    return createMongoAbility<[Actions, Subjects]>(rules)
  } catch (error) {
    // Non-fatal: return null so caller rebuilds
    log.error('Failed to load cached ability', {
      error: error instanceof Error ? error.message : String(error),
      sessionId,
    })
    return null
  }
}

/**
 * @description Invalidates (deletes) a cached ability for a specific session.
 * Called when user's role or org changes mid-session.
 * @param {string} sessionId - The session ID whose cached ability should be removed
 * @returns {Promise<void>}
 */
export async function invalidateAbility(sessionId: string): Promise<void> {
  const client = getRedisClient()
  if (!client) return

  try {
    const key = `${ABILITY_CACHE_PREFIX}${sessionId}`
    await client.del(key)
    log.debug('Invalidated cached ability', { sessionId })
  } catch (error) {
    log.error('Failed to invalidate ability', {
      error: error instanceof Error ? error.message : String(error),
      sessionId,
    })
  }
}

/**
 * @description Invalidates all cached abilities across all sessions.
 * Used when platform-wide ABAC policies change and all users need fresh abilities.
 * Uses Redis SCAN to avoid blocking the server with KEYS command.
 * @returns {Promise<void>}
 */
export async function invalidateAllAbilities(): Promise<void> {
  const client = getRedisClient()
  if (!client) return

  try {
    let cursor = '0'
    let deletedCount = 0

    // Use SCAN to iterate through ability keys without blocking Redis
    do {
      const result = await client.scan(cursor as any, { MATCH: `${ABILITY_CACHE_PREFIX}*`, COUNT: 100 })
      cursor = String(result.cursor)
      if (result.keys.length > 0) {
        await client.del(result.keys as string[])
        deletedCount += result.keys.length
      }
    } while (cursor !== '0')

    log.info('Invalidated all cached abilities', { deletedCount })
  } catch (error) {
    log.error('Failed to invalidate all abilities', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * @description Builds the complete access filter array for OpenSearch queries.
 * Combines mandatory tenant isolation with optional additional filter clauses.
 * The tenant_id filter is ALWAYS present to ensure zero cross-tenant data leakage.
 *
 * @param {string} tenantId - The tenant ID for mandatory isolation
 * @param {Record<string, unknown>[]} abacFilters - Optional additional filter clauses.
 * @returns {Record<string, unknown>[]} Combined filter array for OpenSearch bool.filter
 */
export function buildAccessFilters(
  tenantId: string,
  abacFilters: Record<string, unknown>[] = []
): Record<string, unknown>[] {
  return [
    // Mandatory tenant isolation — never omit this filter
    { term: { tenant_id: tenantId } },
    ...abacFilters,
  ]
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * @description Singleton ability service providing CASL ability building and Valkey caching.
 * Use this as the primary entry point for authorization logic.
 */
export const abilityService = {
  buildAbilityFor,
  resolveGrantedDatasetsForUser,
  cacheAbility,
  loadCachedAbility,
  invalidateAbility,
  invalidateAllAbilities,
  buildAccessFilters,
}

/**
 * @description Test-only export of the raw V1 and V2 builders so parity
 * tests can call each directly without flipping the config flag. Do NOT
 * import this from production code or any non-test path — the public
 * entrypoint is the `buildAbilityFor` dispatcher.
 */
export const __forTesting = {
  buildAbilityForV1Sync,
  buildAbilityForV2,
} as const
