/**
 * @fileoverview Allow/Deny override editor for a single user.
 *
 * Implements D-04: two-list UX with a searchable catalog picker for adding
 * rows and a [×] button for removing them. Wraps the Wave 0 query hooks.
 *
 * @module features/permissions/components/OverrideEditor
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { globalMessage } from '@/lib/globalMessage'
import {
  useUserOverrides,
  useCreateOverride,
  useDeleteOverride,
} from '../api/permissionsQueries'
import {
  OVERRIDE_EFFECT_ALLOW,
  OVERRIDE_EFFECT_DENY,
  type OverrideEffect,
  type UserPermissionOverride,
} from '../types/permissions.types'
import { PermissionKeyPicker } from './PermissionKeyPicker'
import { EffectivePermissionsPanel } from './EffectivePermissionsPanel'

/**
 * @description Partition an override list into separate allow and deny buckets.
 * Pure helper so it can be tested without mounting the component tree
 * (cmdk + React Compiler in jsdom is unreliable — see PrincipalPicker.test.tsx).
 *
 * @param {UserPermissionOverride[]} overrides - Override rows as returned by the API.
 * @returns {{ allows: UserPermissionOverride[], denies: UserPermissionOverride[] }}
 *   The partitioned buckets in their original order.
 */
export function partitionOverrides(overrides: UserPermissionOverride[]): {
  allows: UserPermissionOverride[]
  denies: UserPermissionOverride[]
} {
  const allows: UserPermissionOverride[] = []
  const denies: UserPermissionOverride[] = []
  for (const override of overrides) {
    // Use the typed constants — no bare string literal comparisons.
    if (override.effect === OVERRIDE_EFFECT_ALLOW) allows.push(override)
    else if (override.effect === OVERRIDE_EFFECT_DENY) denies.push(override)
  }
  return { allows, denies }
}

/**
 * @description Props for {@link OverrideEditor}.
 */
export interface OverrideEditorProps {
  /** Numeric user id (matches the BE Zod schemas). */
  userId: number
  /** The user's role — passed through to the effective panel. */
  userRole: string
}

/**
 * @description Renders the per-user allow/deny override editor. Shows two
 * lists (allow + deny) with add/remove controls and a collapsed effective
 * permissions panel underneath.
 *
 * @param {OverrideEditorProps} props - Target user context.
 * @returns {JSX.Element} The editor surface.
 */
export function OverrideEditor({ userId, userRole }: OverrideEditorProps) {
  const { t } = useTranslation()

  // Fetch overrides + bind the per-user mutation hooks (cache scope is captured here).
  const { data: overrides = [] } = useUserOverrides(userId)
  const createMut = useCreateOverride(userId)
  const deleteMut = useDeleteOverride(userId)

  // Track which picker (allow vs deny) is open. null = both closed.
  const [openPicker, setOpenPicker] = useState<OverrideEffect | null>(null)

  // Split overrides by effect using the pure partition helper.
  const { allows, denies } = partitionOverrides(overrides)

  /**
   * @description Add a new override row. Closes the picker after the request
   * resolves. Errors surface via the global message bridge.
   * @param {string} permission_key - The catalog key the admin selected.
   * @param {OverrideEffect} effect - Whether this row is an allow or a deny.
   */
  const handleAdd = async (permission_key: string, effect: OverrideEffect) => {
    try {
      await createMut.mutateAsync({ permission_key, effect })
      // R-10: warn admins that affected sessions only see the change on next request.
      globalMessage.success(t('permissions.admin.sessionRefreshNotice'))
    } catch {
      globalMessage.error(t('permissions.admin.overrides.addError'))
    }
  }

  /**
   * @description Remove an override row by id. Toasts on success/failure.
   * @param {UserPermissionOverride} row - The override row to delete.
   */
  const handleRemove = async (row: UserPermissionOverride) => {
    try {
      await deleteMut.mutateAsync(row.id)
      globalMessage.success(t('permissions.admin.sessionRefreshNotice'))
    } catch {
      globalMessage.error(t('permissions.admin.overrides.removeError'))
    }
  }

  /**
   * @description Render a single override row with a remove button.
   * @param {UserPermissionOverride} row - The override entity.
   */
  const renderRow = (row: UserPermissionOverride) => (
    <li
      key={row.id}
      className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <span className="font-mono text-slate-800 dark:text-slate-200">
        {row.permission_key}
      </span>
      <button
        type="button"
        aria-label={t('permissions.admin.overrides.remove')}
        className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"
        onClick={() => handleRemove(row)}
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Allow overrides column */}
        <Card className="dark:border-slate-700 dark:bg-slate-900">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold">
              {t('permissions.admin.overrides.allowSection')}
            </CardTitle>
            <PermissionKeyPicker
              open={openPicker === OVERRIDE_EFFECT_ALLOW}
              onOpenChange={(o) => setOpenPicker(o ? OVERRIDE_EFFECT_ALLOW : null)}
              excludeKeys={allows.map(a => a.permission_key)}
              onSelect={(key) => handleAdd(key, OVERRIDE_EFFECT_ALLOW)}
            >
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                {t('permissions.admin.overrides.addAllow')}
              </Button>
            </PermissionKeyPicker>
          </CardHeader>
          <CardContent>
            {allows.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('permissions.admin.overrides.empty')}
              </p>
            ) : (
              <ul className="space-y-2">{allows.map(renderRow)}</ul>
            )}
          </CardContent>
        </Card>

        {/* Deny overrides column */}
        <Card className="dark:border-slate-700 dark:bg-slate-900">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold">
              {t('permissions.admin.overrides.denySection')}
            </CardTitle>
            <PermissionKeyPicker
              open={openPicker === OVERRIDE_EFFECT_DENY}
              onOpenChange={(o) => setOpenPicker(o ? OVERRIDE_EFFECT_DENY : null)}
              excludeKeys={denies.map(d => d.permission_key)}
              onSelect={(key) => handleAdd(key, OVERRIDE_EFFECT_DENY)}
            >
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                {t('permissions.admin.overrides.addDeny')}
              </Button>
            </PermissionKeyPicker>
          </CardHeader>
          <CardContent>
            {denies.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('permissions.admin.overrides.empty')}
              </p>
            ) : (
              <ul className="space-y-2">{denies.map(renderRow)}</ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Collapsed merged-permissions verification panel */}
      {userRole ? <EffectivePermissionsPanel userRole={userRole} overrides={overrides} /> : null}
    </div>
  )
}

export default OverrideEditor
