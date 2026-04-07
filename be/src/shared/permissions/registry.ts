/**
 * @description Code-side permission registry helper.
 *
 * Each backend module declares its permission keys via `definePermissions(feature, spec)`.
 * The helper:
 *   1. Composes the canonical key as `<feature>.<actionSlug>`.
 *   2. Registers every entry in a process-wide `ALL_PERMISSIONS` array as a side
 *      effect of importing the module file.
 *   3. Returns a strongly-typed map so callers can reference
 *      `KB_PERMISSIONS.view.key` with full IntelliSense and compile-time safety.
 *   4. Throws synchronously if a duplicate key is registered, so collisions are
 *      caught at boot rather than silently shadowing existing entries.
 *
 * The boot sync service (Plan P1.4) calls `getAllPermissions()` to upsert the
 * catalog into the `permissions` table. Phase 2's CASL ability builder reads
 * `(action, subject)` pairs from the same registry.
 *
 * @example
 *   import { definePermissions } from '@/shared/permissions/registry.js'
 *   import { PermissionSubjects } from '@/shared/constants/permissions.js'
 *
 *   export const KB_PERMISSIONS = definePermissions('knowledge-base', {
 *     view:   { action: 'read',   subject: PermissionSubjects.KnowledgeBase, label: 'View knowledge base' },
 *     create: { action: 'create', subject: PermissionSubjects.KnowledgeBase, label: 'Create knowledge base' },
 *   })
 *   // KB_PERMISSIONS.view.key === 'knowledge_base.view'
 */

import {
  PERMISSION_KEY_PATTERN,
  PERMISSION_KEY_SEPARATOR,
} from '@/shared/constants/permissions.js'

// ── Public types ───────────────────────────────────────────────────

/**
 * @description Shape of a single registered permission. `subject` is required
 * because Phase 2's CASL ability builder reads `(action, subject)` pairs.
 */
export interface Permission {
  /** Canonical `<feature>.<action>` identifier (e.g. `knowledge_base.view`). */
  key: string
  /** Normalized feature slug (hyphens converted to underscores). */
  feature: string
  /** CASL action verb (e.g. `read`, `create`, `update`, `delete`, `manage`). */
  action: string
  /** CASL subject the ability builder will check against. */
  subject: string
  /** Short human-readable name shown in the admin UI. */
  label: string
  /** Optional one-liner explaining the business meaning of the permission. */
  description?: string
}

/**
 * Spec entry passed by callers — the helper injects `feature` and `key` so
 * authors only describe the action-specific fields.
 */
export type PermissionSpec = Omit<Permission, 'feature' | 'key'>

/**
 * @description Strongly-typed return shape of `definePermissions`. The keys of
 * the spec object are preserved as the keys of the returned map so callers can
 * write `KB_PERMISSIONS.view.key` with full type inference.
 */
export type PermissionMap<M extends Record<string, PermissionSpec>> = {
  readonly [K in keyof M]: Readonly<Permission>
}

// ── Module-level state ─────────────────────────────────────────────

/**
 * Process-wide list of every permission registered via `definePermissions`.
 * Populated as a side effect when each `<feature>.permissions.ts` file is
 * imported (the eager imports in `@/shared/permissions/index.ts` trigger this).
 */
const ALL_PERMISSIONS: Permission[] = []

/**
 * Index of registered keys for O(1) duplicate detection. Mirrors the contents
 * of `ALL_PERMISSIONS` — kept in sync inside `definePermissions`.
 */
const REGISTERED_KEYS = new Set<string>()

// ── Helpers ────────────────────────────────────────────────────────

/**
 * @description Normalizes a feature slug to the canonical SQL-friendly form by
 * replacing hyphens with underscores. We keep this on a single line so it is
 * trivially auditable.
 *
 * @param {string} feature - Raw feature name as passed by the caller (may contain hyphens).
 * @returns {string} Lowercased, underscore-only feature slug.
 */
function normalizeFeatureSlug(feature: string): string {
  // Hyphens → underscores so keys remain valid SQL identifiers and grep-friendly.
  return feature.toLowerCase().replace(/-/g, '_')
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * @description Registers a set of permissions for a single feature/module and
 * returns a strongly-typed map keyed by the action slug.
 *
 * Side effects:
 *   - Appends each composed `Permission` to the module-level `ALL_PERMISSIONS` array.
 *   - Throws synchronously if any composed key has already been registered.
 *
 * @param {F} feature - Feature slug (typically the module directory name; hyphens are normalized to underscores).
 * @param {M} spec - Object whose keys are action slugs and whose values describe the action.
 * @returns {PermissionMap<M>} Frozen, strongly-typed map of registered permissions.
 * @throws {Error} If a composed key duplicates an already-registered entry, or if a key violates the canonical shape.
 *
 * @example
 *   export const USERS_PERMISSIONS = definePermissions('users', {
 *     view:   { action: 'read',   subject: 'User', label: 'View users' },
 *     delete: { action: 'delete', subject: 'User', label: 'Delete users' },
 *   })
 */
export function definePermissions<
  F extends string,
  M extends Record<string, PermissionSpec>,
>(feature: F, spec: M): PermissionMap<M> {
  // Normalize once so every composed key uses the canonical slug form.
  const normalizedFeature = normalizeFeatureSlug(feature)

  const out: Record<string, Permission> = {}

  // Walk each action entry, compose its key, validate, and register.
  for (const actionSlug of Object.keys(spec)) {
    const entry = spec[actionSlug]!
    const key = `${normalizedFeature}${PERMISSION_KEY_SEPARATOR}${actionSlug}`

    // Enforce <feature>.<action> shape so the boot sync and CASL builder can
    // rely on a single canonical pattern across the codebase.
    if (!PERMISSION_KEY_PATTERN.test(key)) {
      throw new Error(
        `Invalid permission key shape: "${key}" — expected <snake_feature>.<snake_action>`,
      )
    }

    // Hard-fail on duplicates so two modules can't accidentally collide on a key.
    if (REGISTERED_KEYS.has(key)) {
      throw new Error(
        `Duplicate permission key registration: "${key}" — already registered by an earlier definePermissions call`,
      )
    }

    // Build the composed entry, omitting `description` when undefined so that
    // `exactOptionalPropertyTypes` is satisfied.
    const base = {
      key,
      feature: normalizedFeature,
      action: entry.action,
      subject: entry.subject,
      label: entry.label,
    }
    const composed: Permission = Object.freeze(
      entry.description !== undefined
        ? { ...base, description: entry.description }
        : base,
    )

    REGISTERED_KEYS.add(key)
    ALL_PERMISSIONS.push(composed)
    out[actionSlug] = composed
  }

  // Freeze the returned map so consumers can't mutate it after registration.
  return Object.freeze(out) as PermissionMap<M>
}

/**
 * @description Returns a frozen snapshot of every permission currently
 * registered. Used by the boot sync service to upsert the catalog and by tests
 * to assert registry contents.
 *
 * @returns {readonly Permission[]} Frozen array of all registered permissions.
 */
export function getAllPermissions(): readonly Permission[] {
  // Freezing the returned reference itself prevents accidental in-place edits.
  return Object.freeze(ALL_PERMISSIONS.slice())
}
