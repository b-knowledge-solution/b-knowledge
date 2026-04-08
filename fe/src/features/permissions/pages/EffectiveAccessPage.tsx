/**
 * @fileoverview P5.6 "Effective Access" admin page (D-11).
 *
 * Single-feature view: admin picks ONE permission key from a dropdown, page
 * fires exactly ONE `useWhoCanDo(action, subject)` call, and renders the
 * resulting users as a clickable table that drills into the P5.2 per-user
 * override editor via `/iam/users/:id?tab=permissions`.
 *
 * Design rationale (per 5-RESEARCH §6 + §12): fanning out `whoCanDo` across
 * the full ~100-key catalog is O(keys × principals) and too expensive for v1.
 * A single-feature dropdown view ships the admin-useful slice immediately.
 * Cartesian matrix + team drill-down are tracked as IOUs in 5.6-SUMMARY.md.
 *
 * Logic lives in the two exported pure helpers at the bottom
 * (`decodePermissionKey`, `buildUserDetailUrl`) so unit tests can run in node
 * env — this mirrors the pure-helper pattern used by 5.1/5.2/5.3 to dodge the
 * known shadcn/Radix + babel-plugin-react-compiler + jsdom collection hang.
 *
 * @module features/permissions/pages/EffectiveAccessPage
 */
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PERMISSION_KEYS } from '@/constants/permission-keys'
import { useWhoCanDo } from '@/features/permissions/api/permissionsQueries'
import { groupPermissionKeys } from '@/features/permissions/components/PermissionMatrix'

// ============================================================================
// Constants
// ============================================================================

/** @description Query-string key used to deep-link the selected permission. */
const SELECTED_KEY_PARAM = 'key'

/** @description Default selection when the page loads with no ?key= param. */
const DEFAULT_PERMISSION_KEY: string = PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW

/** @description Pre-grouped permission key list for the dropdown (computed once). */
const GROUPED_PERMISSION_KEYS = groupPermissionKeys(
  Object.values(PERMISSION_KEYS).slice().sort(),
)

// ============================================================================
// Page component
// ============================================================================

/**
 * @description Read-mostly "Who can do X?" admin view. Single-feature selector
 *   plus a user-list table powered by one `whoCanDo` call. Row click drills
 *   into the P5.2 per-user override editor.
 * @returns {JSX.Element} Effective Access page.
 */
export default function EffectiveAccessPage(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Current selection is URL-driven so the view is bookmarkable / shareable
  const selectedKey = searchParams.get(SELECTED_KEY_PARAM) ?? DEFAULT_PERMISSION_KEY

  // Decode the dotted key into (action, subject) once per render — pure helper
  const { action, subject } = decodePermissionKey(selectedKey)

  // ONE whoCanDo call per selection. Guarded internally by the hook's enabled:.
  const { data, isLoading, isError } = useWhoCanDo(action, subject)

  /**
   * @description Handles dropdown selection by writing the new key to the URL.
   * @param {React.ChangeEvent<HTMLSelectElement>} e - Change event.
   */
  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // Mutate the URL so navigation state drives the whoCanDo query
    setSearchParams({ [SELECTED_KEY_PARAM]: e.target.value })
  }

  /**
   * @description Row click handler — navigates to the P5.2 override editor.
   * @param {number} userId - Target user's numeric id.
   */
  const handleRowClick = (userId: number) => {
    navigate(buildUserDetailUrl(userId))
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2 dark:text-white">
        {t('permissions.admin.effectiveAccess.title')}
      </h1>
      <p className="text-sm text-muted-foreground mb-4 dark:text-slate-400">
        {t('permissions.admin.effectiveAccess.subtitle')}
      </p>

      <label
        htmlFor="effective-access-key-select"
        className="block mb-2 text-sm font-medium dark:text-white"
      >
        {t('permissions.admin.effectiveAccess.selectFeature')}
      </label>
      <select
        id="effective-access-key-select"
        value={selectedKey}
        onChange={handleSelectChange}
        className="border rounded p-2 mb-6 w-full max-w-md bg-white text-slate-900 dark:bg-slate-800 dark:text-white dark:border-slate-700"
      >
        {GROUPED_PERMISSION_KEYS.map(group => (
          <optgroup key={group.section} label={group.section}>
            {group.keys.map(key => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Loading: simple skeleton-ish placeholder until the hook resolves */}
      {isLoading && (
        <div className="text-sm text-muted-foreground dark:text-slate-400">
          {t('common.loading')}
        </div>
      )}

      {/* Error: render an inline warning instead of a broken table */}
      {isError && (
        <div className="text-sm text-red-600 dark:text-red-400">
          {t('permissions.admin.effectiveAccess.error')}
        </div>
      )}

      {/* Empty state — zero users in tenant have this permission */}
      {data && data.users.length === 0 && (
        <div className="text-sm text-muted-foreground dark:text-slate-400">
          {t('permissions.admin.effectiveAccess.empty')}
        </div>
      )}

      {/* Results table */}
      {data && data.users.length > 0 && (
        <div className="overflow-x-auto border rounded dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800">
              <tr>
                <th className="p-2 text-left dark:text-white">
                  {t('permissions.admin.effectiveAccess.user')}
                </th>
                <th className="p-2 text-left dark:text-white">
                  {t('permissions.admin.effectiveAccess.email')}
                </th>
                <th className="p-2 text-left dark:text-white">
                  {t('permissions.admin.effectiveAccess.role')}
                </th>
                <th className="p-2 text-left dark:text-white">
                  {t('permissions.admin.effectiveAccess.has')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.users.map(u => (
                <tr
                  key={u.id}
                  onClick={() => handleRowClick(u.id)}
                  className="cursor-pointer border-t hover:bg-gray-50 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800"
                >
                  <td className="p-2">{u.display_name}</td>
                  <td className="p-2">{u.email}</td>
                  <td className="p-2">{u.role}</td>
                  <td className="p-2" aria-label={t('permissions.admin.effectiveAccess.has')}>
                    ✓
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Pure helpers (exported for unit tests — node env, no jsdom)
// ============================================================================

/**
 * @description Decodes a dotted PERMISSION_KEYS value (e.g. `knowledge_base.view`)
 *   into the CASL `(action, subject)` pair expected by the BE `whoCanDo`
 *   endpoint — snake_case prefix becomes PascalCase subject; the suffix is
 *   passed through as the action.
 *
 *   Examples:
 *     `knowledge_base.view`     → `{ action: 'view', subject: 'KnowledgeBase' }`
 *     `api_keys.create`         → `{ action: 'create', subject: 'ApiKeys' }`
 *     `users.view_sessions`     → `{ action: 'view_sessions', subject: 'Users' }`
 *     `system.parsing_config`   → `{ action: 'parsing_config', subject: 'System' }`
 *
 * @param {string} key - Flat permission key from PERMISSION_KEYS.
 * @returns {{ action: string; subject: string }} Decoded action/subject pair.
 */
export function decodePermissionKey(key: string): { action: string; subject: string } {
  // Split on the FIRST dot only — some suffixes contain underscores but never dots
  const firstDot = key.indexOf('.')
  // Guard: malformed key (no dot) falls back to subject-only view/all
  if (firstDot === -1) {
    return { action: 'view', subject: pascalCase(key) }
  }
  const prefix = key.slice(0, firstDot)
  const action = key.slice(firstDot + 1)
  return { action, subject: pascalCase(prefix) }
}

/**
 * @description Builds the deep-link URL to the P5.2 UserDetailPage permissions tab.
 * @param {number} userId - Target user numeric id.
 * @returns {string} `/iam/users/:id?tab=permissions` path string.
 */
export function buildUserDetailUrl(userId: number): string {
  return `/iam/users/${userId}?tab=permissions`
}

/**
 * @description Converts a snake_case token to PascalCase. Private helper.
 * @param {string} input - snake_case or plain token.
 * @returns {string} PascalCase output (empty input → empty string).
 */
function pascalCase(input: string): string {
  if (!input) return ''
  // Split on underscore, capitalize every segment, re-join
  return input
    .split('_')
    .filter(Boolean)
    .map(seg => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('')
}
