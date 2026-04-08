/**
 * @fileoverview Role × permission matrix admin component (Phase 5 P5.1).
 *
 * Renders all catalog permission keys as rows, all roles as columns, and
 * tracks per-cell edits in a dirty-state map. Save fires one
 * `useUpdateRolePermissions` mutation per dirty role (D-02 batch model) and
 * shows the R-10 session-refresh toast (D-09).
 *
 * Testable logic lives in exported pure helpers at the bottom of this file
 * (groupPermissionKeys, toggleInDirtyMap, isCellChecked, buildUpdatePayloads)
 * and is unit-tested in `fe/tests/features/permissions/PermissionMatrix.test.tsx`
 * in node env. The component itself is a thin wrapper over those helpers.
 *
 * @module features/permissions/components/PermissionMatrix
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { PERMISSION_KEYS } from '@/constants/permission-keys'
import { UserRole } from '@/constants/roles'
import {
  useRolePermissions,
  useUpdateRolePermissions,
} from '@/features/permissions'
import { globalMessage } from '@/lib/globalMessage'

// ============================================================================
// Static derivations (module-scope, computed once at import)
// ============================================================================

/**
 * Ordered list of role columns rendered in the matrix.
 *
 * Phase 6 removes legacy `member`/`superadmin` so they are intentionally
 * excluded here. Roles are pulled from the canonical constants file — never
 * inline string literals (root CLAUDE.md no-hardcoded-strings rule).
 */
export const ROLE_COLUMNS: readonly string[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.LEADER,
  UserRole.USER,
] as const

/** Sorted, de-duplicated list of every catalog permission key. */
export const ALL_PERMISSION_KEYS: readonly string[] = Object.values(PERMISSION_KEYS)
  .slice()
  .sort()

/**
 * @description Groups permission keys by their dotted-prefix feature section.
 *   Exported so unit tests can exercise the grouping logic without rendering
 *   the component.
 * @param {readonly string[]} keys - Flat list of permission keys.
 * @returns {ReadonlyArray<{section: string; keys: string[]}>} Stable-ordered
 *   sections with their member keys.
 */
export function groupPermissionKeys(
  keys: readonly string[],
): ReadonlyArray<{ section: string; keys: string[] }> {
  const buckets = new Map<string, string[]>()
  for (const key of keys) {
    // Section name = the dotted prefix before the first '.' (e.g. 'datasets')
    const dotIndex = key.indexOf('.')
    const section = dotIndex === -1 ? key : key.slice(0, dotIndex)
    const list = buckets.get(section) ?? []
    list.push(key)
    buckets.set(section, list)
  }
  // Stable alphabetical section order so the matrix layout is deterministic
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([section, keys]) => ({ section, keys }))
}

/**
 * Pre-computed grouping of permission keys by their dotted-prefix feature.
 * Computed at module load — not in render — because the catalog is static.
 */
const GROUPED_KEYS = groupPermissionKeys(ALL_PERMISSION_KEYS)

// ============================================================================
// Internal types
// ============================================================================

/** Map from role name to the *target* (post-edit) permission key set. */
export type DirtyMap = Map<string, Set<string>>

// ============================================================================
// Pure logic helpers (exported for unit testing)
// ============================================================================

/**
 * @description Resolves the effective checked state of a (role, key) cell:
 *   dirty target if the role has been edited, else the server snapshot.
 * @param {DirtyMap} dirty - Current dirty-state map.
 * @param {Record<string, readonly string[]>} serverByRole - Server snapshot of
 *   each role's current permission keys.
 * @param {string} role - Role name.
 * @param {string} key - Permission key.
 * @returns {boolean} True if the cell should render as checked.
 */
export function isCellChecked(
  dirty: DirtyMap,
  serverByRole: Record<string, readonly string[]>,
  role: string,
  key: string,
): boolean {
  // Dirty edits take precedence over the server snapshot
  const dirtySet = dirty.get(role)
  if (dirtySet) return dirtySet.has(key)
  return (serverByRole[role] ?? []).includes(key)
}

/**
 * @description Produces a new dirty map with a single cell toggled. Pure —
 *   does not mutate the input map or sets.
 * @param {DirtyMap} prev - Prior dirty state.
 * @param {Record<string, readonly string[]>} serverByRole - Server snapshot
 *   used as the toggle baseline when the role has no prior dirty entry.
 * @param {string} role - Target role.
 * @param {string} key - Permission key being toggled.
 * @returns {DirtyMap} New map with the toggled state applied.
 */
export function toggleInDirtyMap(
  prev: DirtyMap,
  serverByRole: Record<string, readonly string[]>,
  role: string,
  key: string,
): DirtyMap {
  // Clone outer map to keep React state immutable
  const next: DirtyMap = new Map(prev)
  // Source of truth: dirty target if present, else server snapshot
  const baseline = next.get(role) ?? new Set<string>(serverByRole[role] ?? [])
  const updated = new Set(baseline)
  // Flip the bit
  if (updated.has(key)) {
    updated.delete(key)
  } else {
    updated.add(key)
  }
  next.set(role, updated)
  return next
}

/**
 * @description Serializes a dirty map into the exact payloads that will be
 *   sent to `useUpdateRolePermissions.mutateAsync`. One payload per dirty
 *   role (D-02 batch save model). Body shape per 5.0b decision.
 * @param {DirtyMap} dirty - Current dirty state.
 * @returns {Array<{role: string; body: {permission_keys: string[]}}>} One
 *   mutation payload per dirty role.
 */
export function buildUpdatePayloads(
  dirty: DirtyMap,
): Array<{ role: string; body: { permission_keys: string[] } }> {
  const payloads: Array<{ role: string; body: { permission_keys: string[] } }> = []
  for (const [role, keys] of dirty.entries()) {
    payloads.push({ role, body: { permission_keys: Array.from(keys) } })
  }
  return payloads
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Registry-driven role × permission matrix admin component.
 *   Loads each role's current permissions via `useRolePermissions`, lets the
 *   admin toggle cells, and on Save fires one atomic
 *   `PUT /api/permissions/roles/:role` per dirty role.
 * @returns {JSX.Element} Rendered matrix with sticky save footer.
 */
export default function PermissionMatrix() {
  const { t } = useTranslation()
  const updateMutation = useUpdateRolePermissions()

  // Hooks are called in a stable, unconditional order — once per role column.
  // ROLE_COLUMNS is a module-scope constant so the call order can never change
  // between renders. The loop form was flagged by react-hooks/rules-of-hooks
  // (static checker cannot prove constness), so we unroll explicitly.
  const superAdminQ = useRolePermissions(UserRole.SUPER_ADMIN)
  const adminQ = useRolePermissions(UserRole.ADMIN)
  const leaderQ = useRolePermissions(UserRole.LEADER)
  const userQ = useRolePermissions(UserRole.USER)

  // Dirty-state map: role → target Set of permission keys (full replacement)
  const [dirty, setDirty] = useState<DirtyMap>(new Map())

  // Server snapshot aggregated into a single record for helper consumption
  const serverByRole: Record<string, readonly string[]> = {
    [UserRole.SUPER_ADMIN]: (superAdminQ.data ?? []) as readonly string[],
    [UserRole.ADMIN]: (adminQ.data ?? []) as readonly string[],
    [UserRole.LEADER]: (leaderQ.data ?? []) as readonly string[],
    [UserRole.USER]: (userQ.data ?? []) as readonly string[],
  }

  /**
   * @description Toggles a single cell by delegating to the pure helper.
   * @param {string} role - Target role.
   * @param {string} key - Permission key being toggled.
   */
  function toggleCell(role: string, key: string) {
    setDirty((prev) => toggleInDirtyMap(prev, serverByRole, role, key))
  }

  /**
   * @description Discards all unsaved edits without firing any mutation.
   *   No confirmation dialog per research §2.
   */
  function handleCancel() {
    setDirty(new Map())
  }

  /**
   * @description Persists every dirty role with one PUT per role. Shows the
   *   R-10 session-refresh toast on success and clears the dirty map. On any
   *   failure, surfaces an error toast and leaves the dirty state intact so
   *   the admin can retry.
   */
  async function handleSave() {
    const payloads = buildUpdatePayloads(dirty)
    try {
      // Fire one mutation per dirty role; await all so the toast reflects truth
      for (const payload of payloads) {
        await updateMutation.mutateAsync(payload)
      }
      // All saves succeeded — clear dirty state and show R-10 notice
      setDirty(new Map())
      globalMessage.success(t('permissions.admin.sessionRefreshNotice'))
    } catch {
      // Surface a failure toast; keep dirty state so the admin can retry
      globalMessage.error(t('permissions.admin.matrix.saveError'))
    }
  }

  const dirtyCount = dirty.size

  return (
    <Card className="dark:bg-slate-800 dark:border-slate-700">
      <CardHeader>
        <CardTitle className="dark:text-white">
          {t('permissions.admin.matrix.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Render each section as its own sub-table for clear visual grouping */}
        {GROUPED_KEYS.map(({ section, keys }) => (
          <div
            key={section}
            data-testid={`section-${section}`}
            className="border-b border-slate-200 dark:border-slate-700"
          >
            <h3 className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-50 dark:bg-slate-900 dark:text-slate-200">
              {t(`permissions.admin.matrix.sections.${section}`, section)}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600 dark:text-slate-300">
                  <th className="px-4 py-2 font-medium">
                    {t('permissions.admin.matrix.permissionColumn', 'Permission')}
                  </th>
                  {ROLE_COLUMNS.map((role) => (
                    <th key={role} className="px-4 py-2 text-center font-medium">
                      {t(`permissions.admin.matrix.roles.${role}`, role)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr
                    key={key}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="px-4 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                      {key}
                    </td>
                    {ROLE_COLUMNS.map((role) => (
                      <td key={role} className="px-4 py-2 text-center">
                        <Checkbox
                          data-testid={`cell-${role}-${key}`}
                          checked={isCellChecked(dirty, serverByRole, role, key)}
                          onCheckedChange={() => toggleCell(role, key)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </CardContent>

      {/* Sticky footer renders only when at least one role has unsaved edits */}
      {dirtyCount > 0 && (
        <div
          data-testid="dirty-footer"
          className="sticky bottom-0 left-0 right-0 flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
        >
          <Button
            data-testid="cancel-button"
            variant="outline"
            onClick={handleCancel}
            disabled={updateMutation.isPending}
          >
            {t('permissions.admin.matrix.cancelButton')}
          </Button>
          <Button
            data-testid="save-button"
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            {t('permissions.admin.matrix.saveButton', { count: dirtyCount })}
          </Button>
        </div>
      )}
    </Card>
  )
}
