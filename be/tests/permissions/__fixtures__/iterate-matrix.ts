/**
 * @fileoverview Generator that walks the full Phase 2 parity matrix.
 *
 * Yields one tuple per `(fixture × permission × resourceId)` combination, where
 * permissions come from the live registry and resource ids come from the
 * `resourcesBySubject` map. Subjects with no representative ids yield exactly
 * one tuple with `resourceId === null` (CASL class-level check).
 *
 * This generator is the iteration source for the V1↔V2 parity test in P2.4.
 *
 * @module tests/permissions/__fixtures__/iterate-matrix
 */

import type { AbilityUserContext } from '@/shared/services/ability.service.js'
// IMPORTANT: import from the BARREL, not `./registry.js` directly. The barrel
// triggers the eager `<feature>.permissions.ts` side effects that populate
// `ALL_PERMISSIONS`. Phase 1 UAT proved a direct registry import returns an
// empty array because the module-level `definePermissions()` calls never run.
import { getAllPermissions } from '@/shared/permissions/index.js'

/**
 * @description One row of the parity matrix. Every regression test asserts that
 * V1 and V2 ability builders produce the same `can(action, subject, resource)`
 * verdict for every yielded tuple.
 */
export interface MatrixTuple {
  /** The user context being tested. */
  fixture: AbilityUserContext
  /** CASL action verb sourced from the registry entry. */
  action: string
  /** CASL subject sourced from the registry entry. */
  subject: string
  /** Representative resource id, or null for class-level checks. */
  resourceId: string | null
  /** Original registry key — used in test failure messages for traceability. */
  permissionKey: string
}

/**
 * @description Walks the cartesian product of fixtures × registry permissions ×
 * representative resource ids. Subjects without resource ids in the supplied map
 * still yield one tuple (with `resourceId === null`) so class-level CASL checks
 * are exercised exactly once per fixture/permission.
 *
 * @param {readonly AbilityUserContext[]} fixtures - User contexts to iterate (typically `ALL_FIXTURES`).
 * @param {Readonly<Record<string, readonly string[]>>} resourcesBySubject - Map of subject -> representative ids.
 * @returns {Generator<MatrixTuple>} Generator yielding every tuple in deterministic order.
 *
 * @example
 *   for (const tuple of iterateMatrix(ALL_FIXTURES, resourcesBySubject)) {
 *     const allowed = ability.can(tuple.action, tuple.subject)
 *     // ... assert against V1 baseline
 *   }
 */
export function* iterateMatrix(
  fixtures: readonly AbilityUserContext[],
  resourcesBySubject: Readonly<Record<string, readonly string[]>>,
): Generator<MatrixTuple> {
  // Snapshot the registry once so the cardinality is stable for the duration of the walk.
  const permissions = getAllPermissions()

  // Outer loop over fixtures so that snapshot files group by user context.
  for (const fixture of fixtures) {
    // Then over every registered permission — covers all 110 keys across 21 modules.
    for (const permission of permissions) {
      // Look up representative ids for this subject; default to empty array.
      const ids = resourcesBySubject[permission.subject] ?? []

      if (ids.length === 0) {
        // Class-level case: yield exactly one tuple with null resourceId so the
        // ability's subject-only check (e.g. `ability.can('read', 'AuditLog')`) is exercised.
        yield {
          fixture,
          action: permission.action,
          subject: permission.subject,
          resourceId: null,
          permissionKey: permission.key,
        }
        continue
      }

      // Instance-level case: one tuple per representative id so per-row conditions are tested.
      for (const resourceId of ids) {
        yield {
          fixture,
          action: permission.action,
          subject: permission.subject,
          resourceId,
          permissionKey: permission.key,
        }
      }
    }
  }
}
