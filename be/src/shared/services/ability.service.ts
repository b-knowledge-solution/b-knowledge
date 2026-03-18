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

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** @description CASL action verbs used across the authorization system */
type Actions = 'manage' | 'create' | 'read' | 'update' | 'delete'

/** @description CASL subject types corresponding to application resources */
type Subjects = 'Dataset' | 'Document' | 'ChatAssistant' | 'SearchApp' | 'User' | 'AuditLog' | 'Policy' | 'Org' | 'Project' | 'all'

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

/** @description Redis key prefix for cached ability rules */
const ABILITY_CACHE_PREFIX = 'ability:'

/** @description Default TTL for cached abilities (matches session TTL: 7 days) */
const ABILITY_CACHE_TTL_SECONDS = config.session.ttlSeconds || 604800

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
export function buildAbilityFor(user: AbilityUserContext, policies: AbacPolicyRule[] = []): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

  // Super-admin gets unrestricted access across all orgs
  if (user.is_superuser === true || user.role === 'super-admin') {
    can('manage', 'all')
    return build()
  }

  const tenantCondition = { tenant_id: user.current_org_id }

  // Base permissions: all authenticated users can read datasets and documents within their org
  can('read', 'Dataset', tenantCondition)
  can('read', 'Document', tenantCondition)

  // Admin: full management within their org
  if (user.role === 'admin') {
    can('manage', 'User', tenantCondition)
    can('manage', 'Dataset', tenantCondition)
    can('manage', 'Document', tenantCondition)
    can('read', 'AuditLog', tenantCondition)
    can('manage', 'ChatAssistant', tenantCondition)
    can('manage', 'SearchApp', tenantCondition)
  }

  // Leader: create/update/delete datasets, manage documents and apps within their org
  if (user.role === 'leader') {
    can('create', 'Dataset', tenantCondition)
    can('update', 'Dataset', tenantCondition)
    can('delete', 'Dataset', tenantCondition)
    can('manage', 'Document', tenantCondition)
    can('manage', 'ChatAssistant', tenantCondition)
    can('manage', 'SearchApp', tenantCondition)
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

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * @description Singleton ability service providing CASL ability building and Valkey caching.
 * Use this as the primary entry point for authorization logic.
 */
export const abilityService = {
  buildAbilityFor,
  cacheAbility,
  loadCachedAbility,
  invalidateAbility,
  invalidateAllAbilities,
}
