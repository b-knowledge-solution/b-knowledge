/**
 * @fileoverview Jenkins-style principal × feature permission matrix.
 *
 * Renders a scrollable table where:
 *   - Rows = principals (users and teams) explicitly added to the matrix
 *   - Columns = grouped by feature, each feature has 3 sub-columns: View | Add/Edit | Delete
 *
 * Checked state is derived from the principal's current permission set vs the
 * catalog's action-to-column mapping:
 *   - view       = action === "read"
 *   - add_edit   = action in ["create", "update", "manage", "run", "export", "debug"]
 *   - delete     = action === "delete"
 *
 * A cell is checked if the principal has ALL keys in that group. Checking adds
 * all keys in the group; unchecking removes them all.
 *
 * A sticky footer appears when there are unsaved changes (dirty state). Save
 * fires one API call per dirty principal — users via updateUserPermissions,
 * teams via setTeamPermissions.
 *
 * @module features/permissions/components/PrincipalPermissionMatrix
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserPlus, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { globalMessage } from '@/lib/globalMessage'
import { queryKeys } from '@/lib/queryKeys'
import { userApi } from '@/features/users'
import { teamApi } from '@/features/teams'
import { AddPrincipalDialog } from './AddPrincipalDialog'
import catalog from '@/generated/permissions-catalog.json'

// ============================================================================
// Catalog-derived constants (computed once at module load)
// ============================================================================

/** Actions mapped to the "view" column */
const VIEW_ACTIONS = new Set(['read'])

/** Actions mapped to the "add_edit" column */
const ADD_EDIT_ACTIONS = new Set(['create', 'update', 'manage', 'run', 'export', 'debug'])

/** Actions mapped to the "delete" column */
const DELETE_ACTIONS = new Set(['delete'])

// ============================================================================
// Types
// ============================================================================

/**
 * @description Column slot identifier — maps to one of the three permission sub-columns
 */
type ColumnSlot = 'view' | 'add_edit' | 'delete'

/**
 * @description A feature group with its three key sets, derived from the catalog
 */
interface FeatureGroup {
  /** Feature identifier (e.g. "agents", "datasets") */
  feature: string
  /** Keys in the "view" (read) slot */
  viewKeys: string[]
  /** Keys in the "add/edit" slot */
  addEditKeys: string[]
  /** Keys in the "delete" slot */
  deleteKeys: string[]
}

/**
 * @description A principal entry held in the matrix state
 */
export interface PrincipalEntry {
  /** Whether this is a user or team */
  type: 'user' | 'team'
  /** Principal UUID */
  id: string
  /** Display name */
  name: string
  /** Current effective permission keys */
  permissions: string[]
}

// ============================================================================
// Catalog derivation helper
// ============================================================================

/**
 * @description Build the feature groups from the permissions catalog.
 *   Groups catalog entries by feature, then buckets each key into view /
 *   add_edit / delete slots based on the entry's action field.
 * @param {typeof catalog.permissions} entries - Raw catalog permission entries
 * @returns {FeatureGroup[]} Stable alphabetically sorted feature groups
 */
export function buildFeatureGroups(
  entries: typeof catalog.permissions,
): FeatureGroup[] {
  const map = new Map<string, FeatureGroup>()

  for (const entry of entries) {
    const group = map.get(entry.feature) ?? {
      feature: entry.feature,
      viewKeys: [],
      addEditKeys: [],
      deleteKeys: [],
    }
    // Bucket key into correct column slot
    if (VIEW_ACTIONS.has(entry.action)) {
      group.viewKeys.push(entry.key)
    } else if (DELETE_ACTIONS.has(entry.action)) {
      group.deleteKeys.push(entry.key)
    } else if (ADD_EDIT_ACTIONS.has(entry.action)) {
      group.addEditKeys.push(entry.key)
    }
    map.set(entry.feature, group)
  }

  // Stable alphabetical sort so column order is deterministic
  return Array.from(map.values()).sort((a, b) => a.feature.localeCompare(b.feature))
}

/** Pre-computed feature groups from the bundled catalog snapshot */
const FEATURE_GROUPS: FeatureGroup[] = buildFeatureGroups(catalog.permissions)

// ============================================================================
// Pure cell logic helpers
// ============================================================================

/**
 * @description Determine whether a principal × feature × slot cell should render checked.
 *   A cell is checked when the principal has ALL keys in the slot's key list.
 *   An empty key list always returns false (no keys means no permission concept).
 * @param {string[]} principalPerms - Current permission keys held by the principal
 * @param {string[]} slotKeys - Permission keys that constitute this cell
 * @returns {boolean} True when the principal holds every key in the slot
 */
export function isCellChecked(principalPerms: string[], slotKeys: string[]): boolean {
  // Empty slot has no concept of checked
  if (slotKeys.length === 0) return false
  return slotKeys.every((k) => principalPerms.includes(k))
}

/**
 * @description Toggle a cell: add all slot keys when currently unchecked,
 *   remove all slot keys when currently checked. Returns a new permissions array.
 * @param {string[]} current - Current permission keys for the principal
 * @param {string[]} slotKeys - Keys in the cell being toggled
 * @returns {string[]} New permissions array after the toggle
 */
export function toggleCellPermissions(current: string[], slotKeys: string[]): string[] {
  const checked = isCellChecked(current, slotKeys)
  const currentSet = new Set(current)
  if (checked) {
    // Uncheck — remove all keys in this slot
    for (const k of slotKeys) currentSet.delete(k)
  } else {
    // Check — add all keys in this slot
    for (const k of slotKeys) currentSet.add(k)
  }
  return Array.from(currentSet)
}

// ============================================================================
// Principal key helper
// ============================================================================

/**
 * @description Build a unique stable key for a principal entry for use in Maps and Sets.
 * @param {PrincipalEntry} p - Principal entry
 * @returns {string} Unique key string
 */
function principalKey(p: PrincipalEntry): string {
  return `${p.type}:${p.id}`
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Jenkins-style principal × feature permission matrix.
 *   Renders a principal-first table where admins can grant or revoke
 *   view/add-edit/delete access per feature for individual users and teams.
 *   Changes are tracked in a dirty state map and saved all-at-once via the
 *   sticky footer Save button.
 * @returns {JSX.Element} Rendered principal permission matrix with sticky footer
 */
export default function PrincipalPermissionMatrix() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // ── Data loading ────────────────────────────────────────────────────────────

  const usersQuery = useQuery({
    queryKey: queryKeys.users.list(['leader', 'user']),
    queryFn: () => userApi.getUsers(['leader', 'user']),
  })

  const teamsQuery = useQuery({
    queryKey: queryKeys.teams.list(),
    queryFn: () => teamApi.getTeams(),
  })

  // ── Principal state ─────────────────────────────────────────────────────────

  // `principals` holds the list of principals shown in the matrix rows
  const [principals, setPrincipals] = useState<PrincipalEntry[]>([])

  // `dirty` maps principalKey → new permissions array (only for edited rows)
  const [dirty, setDirty] = useState<Map<string, string[]>>(new Map())

  // ── Dialog state ────────────────────────────────────────────────────────────

  const [dialogOpen, setDialogOpen] = useState(false)

  // ── Mutations ───────────────────────────────────────────────────────────────

  const updateUserPermsMutation = useMutation({
    mutationFn: ({ userId, permissions }: { userId: string; permissions: string[] }) =>
      userApi.updateUserPermissions(userId, permissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.list() })
    },
  })

  const setTeamPermsMutation = useMutation({
    mutationFn: ({ teamId, permissions }: { teamId: string; permissions: string[] }) =>
      teamApi.setTeamPermissions(teamId, permissions),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.permissions(variables.teamId) })
    },
  })

  const isSaving = updateUserPermsMutation.isPending || setTeamPermsMutation.isPending

  // ── Derived values ──────────────────────────────────────────────────────────

  /** Set of already-added principal keys for the dialog filter */
  const alreadyAdded = new Set(principals.map(principalKey))

  /** Number of principals with unsaved changes */
  const dirtyCount = dirty.size

  // ── Handlers ────────────────────────────────────────────────────────────────

  /**
   * @description Add a principal to the matrix rows. Initialises with empty permissions.
   * @param {PrincipalEntry} entry - The principal to add
   */
  function handleAddPrincipal(entry: PrincipalEntry) {
    setPrincipals((prev) => [...prev, entry])
  }

  /**
   * @description Remove a principal row from the matrix and clear any dirty state for it.
   * @param {PrincipalEntry} principal - The principal to remove
   */
  function handleRemovePrincipal(principal: PrincipalEntry) {
    const key = principalKey(principal)
    setPrincipals((prev) => prev.filter((p) => principalKey(p) !== key))
    setDirty((prev) => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }

  /**
   * @description Get the effective current permissions for a principal:
   *   dirty target if edited, otherwise the snapshot stored in the principal entry.
   * @param {PrincipalEntry} principal - Target principal
   * @returns {string[]} Effective permissions array
   */
  function effectivePerms(principal: PrincipalEntry): string[] {
    const key = principalKey(principal)
    return dirty.get(key) ?? principal.permissions
  }

  /**
   * @description Toggle a single (principal, feature, slot) cell.
   *   Updates the dirty map with the new permissions for the principal.
   * @param {PrincipalEntry} principal - Target principal
   * @param {string[]} slotKeys - Keys in the cell being toggled
   */
  function handleToggleCell(principal: PrincipalEntry, slotKeys: string[]) {
    // Skip cells with no keys (column is empty for this feature)
    if (slotKeys.length === 0) return
    const key = principalKey(principal)
    const current = effectivePerms(principal)
    const next = toggleCellPermissions(current, slotKeys)
    setDirty((prev) => {
      const updated = new Map(prev)
      updated.set(key, next)
      return updated
    })
  }

  /**
   * @description Discard all unsaved changes and revert to the last-saved permissions.
   */
  function handleCancel() {
    setDirty(new Map())
  }

  /**
   * @description Save all dirty principal permissions concurrently.
   *   On success, merges dirty state back into the principal entries and clears dirty.
   *   On failure, surfaces an error toast and leaves dirty state intact for retry.
   */
  async function handleSave() {
    try {
      const savePromises: Promise<unknown>[] = []

      for (const [key, permissions] of dirty.entries()) {
        const principal = principals.find((p) => principalKey(p) === key)
        if (!principal) continue

        if (principal.type === 'user') {
          // Save user-level permissions
          savePromises.push(
            updateUserPermsMutation.mutateAsync({ userId: principal.id, permissions }),
          )
        } else {
          // Save team-level permissions
          savePromises.push(
            setTeamPermsMutation.mutateAsync({ teamId: principal.id, permissions }),
          )
        }
      }

      await Promise.all(savePromises)

      // Merge dirty permissions into the principal entries so rows show the new state
      setPrincipals((prev) =>
        prev.map((p) => {
          const key = principalKey(p)
          const saved = dirty.get(key)
          return saved !== undefined ? { ...p, permissions: saved } : p
        }),
      )

      // Clear dirty state after successful save
      setDirty(new Map())
      globalMessage.success(t('permissions.admin.principalMatrix.saveSuccess'))
    } catch {
      // Leave dirty state intact so admin can retry
      globalMessage.error(t('permissions.admin.principalMatrix.saveError'))
    }
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  const users = usersQuery.data ?? []
  const teams = teamsQuery.data ?? []
  const isLoading = usersQuery.isLoading || teamsQuery.isLoading

  return (
    <>
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        {/* ── Header ── */}
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="dark:text-white">
            {t('permissions.admin.principalMatrix.title')}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="gap-2 dark:border-slate-600 dark:text-slate-200"
          >
            <UserPlus className="h-4 w-4" />
            {t('permissions.admin.principalMatrix.addPrincipal')}
          </Button>
        </CardHeader>

        <CardContent className="p-0 overflow-hidden">
          {isLoading ? (
            // Loading skeleton
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : principals.length === 0 ? (
            // Empty state
            <div className="flex items-center justify-center py-16 px-6 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                {t('permissions.admin.principalMatrix.noPrincipals')}
              </p>
            </div>
          ) : (
            // Matrix table — horizontally scrollable
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  {/* ── Row 1: Feature names spanning 3 cols each ── */}
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {/* First column header — Principal */}
                    <th
                      className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-900 px-4 py-2 text-left font-medium text-slate-600 dark:text-slate-300 min-w-[200px]"
                      rowSpan={2}
                    />
                    {FEATURE_GROUPS.map((group) => (
                      <th
                        key={group.feature}
                        colSpan={3}
                        className="px-2 py-2 text-center font-semibold text-slate-700 dark:text-slate-200 border-l border-slate-200 dark:border-slate-700 whitespace-nowrap"
                      >
                        {t(
                          `permissions.admin.principalMatrix.features.${group.feature}`,
                          group.feature,
                        )}
                      </th>
                    ))}
                  </tr>
                  {/* ── Row 2: View / Add/Edit / Delete sub-columns ── */}
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                    {FEATURE_GROUPS.map((group) => (
                      <>
                        <th
                          key={`${group.feature}-view`}
                          className="px-2 py-1 text-center text-xs font-medium text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700 whitespace-nowrap"
                        >
                          {t('permissions.admin.principalMatrix.featureHeader.view')}
                        </th>
                        <th
                          key={`${group.feature}-addedit`}
                          className="px-2 py-1 text-center text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
                        >
                          {t('permissions.admin.principalMatrix.featureHeader.addEdit')}
                        </th>
                        <th
                          key={`${group.feature}-delete`}
                          className="px-2 py-1 text-center text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
                        >
                          {t('permissions.admin.principalMatrix.featureHeader.delete')}
                        </th>
                      </>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {principals.map((principal) => {
                    const perms = effectivePerms(principal)
                    const key = principalKey(principal)
                    const isDirty = dirty.has(key)

                    return (
                      <tr
                        key={key}
                        className={`border-b border-slate-100 dark:border-slate-800 transition-colors ${isDirty ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}
                      >
                        {/* ── Principal name column ── */}
                        <td className="sticky left-0 z-10 bg-white dark:bg-slate-800 px-4 py-2 min-w-[200px] border-r border-slate-100 dark:border-slate-700">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {/* Principal type badge */}
                              <Badge
                                variant="outline"
                                className="text-xs shrink-0"
                              >
                                {t(
                                  `permissions.admin.principalMatrix.principalType.${principal.type}`,
                                )}
                              </Badge>
                              <span className="text-sm text-slate-800 dark:text-slate-100 truncate">
                                {principal.name}
                              </span>
                            </div>
                            {/* Remove button */}
                            <button
                              type="button"
                              aria-label={t('permissions.admin.principalMatrix.removePrincipal')}
                              onClick={() => handleRemovePrincipal(principal)}
                              className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </td>

                        {/* ── Permission cells ── */}
                        {FEATURE_GROUPS.map((group) => {
                          const slots: Array<{
                            slot: ColumnSlot
                            keys: string[]
                          }> = [
                            { slot: 'view', keys: group.viewKeys },
                            { slot: 'add_edit', keys: group.addEditKeys },
                            { slot: 'delete', keys: group.deleteKeys },
                          ]

                          return slots.map(({ slot, keys }) => (
                            <td
                              key={`${key}-${group.feature}-${slot}`}
                              className="px-2 py-2 text-center border-l border-slate-100 dark:border-slate-800"
                            >
                              {keys.length > 0 ? (
                                <Checkbox
                                  checked={isCellChecked(perms, keys)}
                                  onCheckedChange={() => handleToggleCell(principal, keys)}
                                  aria-label={`${principal.name} ${group.feature} ${slot}`}
                                />
                              ) : (
                                // Empty cell — no keys for this slot
                                <span className="text-slate-200 dark:text-slate-700">—</span>
                              )}
                            </td>
                          ))
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>

        {/* ── Sticky save footer — appears only when dirty ── */}
        {dirtyCount > 0 && (
          <div className="sticky bottom-0 left-0 right-0 flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
              className="dark:border-slate-600 dark:text-slate-200"
            >
              {t('permissions.admin.principalMatrix.cancelButton')}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {t('permissions.admin.principalMatrix.saveButton', { count: dirtyCount })}
            </Button>
          </div>
        )}
      </Card>

      {/* ── Add Principal Dialog ── */}
      <AddPrincipalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        users={users}
        teams={teams}
        alreadyAdded={alreadyAdded}
        onAdd={handleAddPrincipal}
      />
    </>
  )
}
