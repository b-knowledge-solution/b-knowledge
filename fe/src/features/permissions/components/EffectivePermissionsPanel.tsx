/**
 * @fileoverview Collapsible panel that shows a user's *effective* permission
 * set: the merge of their role defaults plus any allow/deny overrides.
 *
 * Per RESEARCH §6, the merge is computed entirely on the client to avoid an
 * O(N) `whoCanDo` fan-out per catalog key.
 *
 * @module features/permissions/components/EffectivePermissionsPanel
 */
import { useTranslation } from 'react-i18next'
import { useRolePermissions } from '../api/permissionsQueries'
import {
  OVERRIDE_EFFECT_ALLOW,
  OVERRIDE_EFFECT_DENY,
  type UserPermissionOverride,
} from '../types/permissions.types'

/**
 * @description Props for {@link EffectivePermissionsPanel}.
 */
export interface EffectivePermissionsPanelProps {
  /** The user's role — drives the role-defaults fetch. */
  userRole: string
  /** The user's current allow/deny overrides. */
  overrides: UserPermissionOverride[]
}

/**
 * @description Compute the effective permission key set on the client.
 *
 * Algorithm:
 *   1. Start from the role's default permission keys.
 *   2. Add every allow override.
 *   3. Remove every deny override.
 *   4. Sort the result for stable rendering.
 *
 * @param {string[]} roleKeys - Permission keys granted by the user's role.
 * @param {UserPermissionOverride[]} overrides - The user's override rows.
 * @returns {string[]} Sorted, de-duplicated effective permission keys.
 */
export function mergeEffective(
  roleKeys: string[],
  overrides: UserPermissionOverride[],
): string[] {
  const allowSet = new Set(roleKeys)
  for (const override of overrides) {
    // Allow rows ADD to the set, deny rows REMOVE from it.
    if (override.effect === OVERRIDE_EFFECT_ALLOW) {
      allowSet.add(override.permission_key)
    } else if (override.effect === OVERRIDE_EFFECT_DENY) {
      allowSet.delete(override.permission_key)
    }
  }
  return Array.from(allowSet).sort()
}

/**
 * @description Renders a `<details>` element (collapsed by default) that lists
 * the user's effective permission keys, derived client-side from role defaults
 * + overrides. The header shows the count for at-a-glance verification.
 *
 * @param {EffectivePermissionsPanelProps} props - Role + override inputs.
 * @returns {JSX.Element} The collapsible effective-permissions panel.
 */
export function EffectivePermissionsPanel({
  userRole,
  overrides,
}: EffectivePermissionsPanelProps) {
  const { t } = useTranslation()

  // Fetch the role's default permission keys. The hook is a no-op for empty roles.
  const { data: rolePerms } = useRolePermissions(userRole)

  // Merge role defaults with overrides on every render — pure compute, no memoization.
  const effective = mergeEffective(rolePerms?.permission_keys ?? [], overrides)

  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-white">
        {t('permissions.admin.effective.title', { count: effective.length })}
      </summary>
      <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {effective.map(key => (
          <li
            key={key}
            className="rounded bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            {key}
          </li>
        ))}
      </ul>
    </details>
  )
}

export default EffectivePermissionsPanel
