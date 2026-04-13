/**
 * @fileoverview Runtime permission catalog provider and permission hook for the FE.
 *
 * Seeds from the committed snapshot so first render stays deterministic, then
 * hydrates from the live versioned `/api/permissions/catalog` contract so
 * `useHasPermission()` is not limited to build-time metadata.
 *
 * @module lib/permissions
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { PERMISSION_KEYS, type PermissionKey } from '@/constants/permission-keys'
import catalogJson from '@/generated/permissions-catalog.json'
import { usePermissionCatalog } from '@/features/permissions/api/permissionsQueries'
import { useAuth } from '@/features/auth'
import type { PermissionCatalogEntry } from '@/features/permissions/types/permissions.types'
import { useAppAbility, type AppAbility } from './ability'

/**
 * @description Internal lookup shape: each catalog entry is reduced to the
 * (action, subject) pair that the CASL ability needs.
 */
interface CatalogEntry {
  action: string
  subject: string
}

/**
 * @description Normalizes a CASL rule field into an array for wildcard-aware matching.
 * @param {string | string[] | undefined} value - CASL rule action/subject field.
 * @returns {string[]} Normalized array form for matching.
 */
function normalizeRuleField(value: string | string[] | undefined): string[] {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

/**
 * @description Checks whether a CASL rule action matches the requested action.
 * Treats `manage` as the action wildcard.
 * @param {string | string[] | undefined} action - Action field from a CASL rule.
 * @param {string} expectedAction - Requested permission action.
 * @returns {boolean} True when the rule covers the requested action.
 */
function matchesRuleAction(
  action: string | string[] | undefined,
  expectedAction: string,
): boolean {
  const actions = normalizeRuleField(action)
  return actions.includes('manage') || actions.includes(expectedAction)
}

/**
 * @description Checks whether a CASL rule subject matches the requested subject.
 * Treats `all` as the subject wildcard.
 * @param {string | string[] | undefined} subject - Subject field from a CASL rule.
 * @param {string} expectedSubject - Requested permission subject.
 * @returns {boolean} True when the rule covers the requested subject.
 */
function matchesRuleSubject(
  subject: string | string[] | undefined,
  expectedSubject: string,
): boolean {
  const subjects = normalizeRuleField(subject)
  return subjects.includes('all') || subjects.includes(expectedSubject)
}

/**
 * @description Performs a UI-level permission check against raw CASL rules.
 *
 * The backend emits tenant-scoped route abilities with `{ tenant_id }`
 * conditions. Route and nav checks only need to know whether the current org
 * exposes the capability at all, so they intentionally ignore rule conditions
 * and apply CASL's "later wins" ordering across matching rules.
 *
 * @param {AppAbility} ability - Current CASL ability from the backend.
 * @param {string} action - Requested action from the permission catalog.
 * @param {string} subject - Requested subject from the permission catalog.
 * @returns {boolean} True when the last matching rule is an allow rule.
 */
function hasCatalogAbilityPermission(
  ability: AppAbility,
  action: string,
  subject: string,
): boolean {
  const matchingRules = ability.rules.filter(
    (rule) =>
      matchesRuleAction(rule.action, action) &&
      matchesRuleSubject(rule.subject as string | string[] | undefined, subject),
  )

  if (matchingRules.length === 0) {
    return false
  }

  return matchingRules[matchingRules.length - 1]?.inverted !== true
}

/**
 * @description Runtime context value exposed by PermissionCatalogProvider.
 */
interface PermissionCatalogContextValue {
  catalogMap: Map<string, CatalogEntry>
  version: string
}

/**
 * @description Build a permission lookup map from catalog rows.
 * @param {PermissionCatalogEntry[]} permissions - Versioned catalog rows from snapshot or BE.
 * @returns {Map<string, CatalogEntry>} Map keyed by permission key for fast lookups.
 */
function buildCatalogMap(permissions: PermissionCatalogEntry[]): Map<string, CatalogEntry> {
  const map = new Map<string, CatalogEntry>()

  for (const entry of permissions) {
    map.set(entry.key, { action: entry.action, subject: entry.subject })
  }

  return map
}

const snapshotCatalog = catalogJson as {
  generatedAt: string
  permissions: PermissionCatalogEntry[]
}

// Seed from the committed snapshot so the first render stays synchronous and
// fail-closed even before the authenticated catalog query completes.
const SNAPSHOT_CATALOG_MAP = buildCatalogMap(snapshotCatalog.permissions)

const SNAPSHOT_VERSION = snapshotCatalog.generatedAt

const PermissionCatalogContext = createContext<PermissionCatalogContextValue>({
  catalogMap: SNAPSHOT_CATALOG_MAP,
  version: SNAPSHOT_VERSION,
})

/**
 * @description Provides the live permission catalog to runtime permission checks.
 * Seeds from the generated snapshot, then replaces the in-memory map when a
 * newer authenticated catalog payload arrives from the backend.
 * @param {{ children: ReactNode }} props - Provider children.
 * @returns {ReactNode} Provider tree with runtime catalog context.
 */
export function PermissionCatalogProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { data } = usePermissionCatalog(Boolean(user))
  const [catalogState, setCatalogState] = useState<PermissionCatalogContextValue>({
    catalogMap: SNAPSHOT_CATALOG_MAP,
    version: SNAPSHOT_VERSION,
  })

  useEffect(() => {
    // Reset to the committed snapshot when the session disappears.
    if (!user) {
      setCatalogState({
        catalogMap: SNAPSHOT_CATALOG_MAP,
        version: SNAPSHOT_VERSION,
      })
      return
    }

    // Ignore empty payloads so the last known-good catalog stays active.
    if (!data || data.permissions.length === 0) {
      return
    }

    setCatalogState(currentState => {
      // Skip no-op updates when the server version has not changed.
      if (currentState.version === data.version) {
        return currentState
      }

      return {
        catalogMap: buildCatalogMap(data.permissions),
        version: data.version,
      }
    })
  }, [data, user])

  return (
    <PermissionCatalogContext.Provider value={catalogState}>
      {children}
    </PermissionCatalogContext.Provider>
  )
}

/**
 * @description Imperative permission check backed by the runtime catalog map.
 *
 * Resolves the supplied catalog key to its `(action, subject)` pair via the
 * current in-memory catalog, then defers to the CASL ability for the actual
 * rule check. Unknown keys still fail closed so drift or partial refresh never
 * widens access accidentally.
 *
 * @param {PermissionKey} key - One of the auto-generated PERMISSION_KEYS values.
 * @returns {boolean} True iff the current user's CASL ability grants the catalog's (action, subject) pair for `key`.
 *
 * @example
 *   const canCreateKb = useHasPermission(PERMISSION_KEYS.KNOWLEDGE_BASE_CREATE)
 *   if (canCreateKb) return <CreateKnowledgeBaseButton />
 */
export function useHasPermission(key: PermissionKey): boolean {
  const ability = useAppAbility()
  const { catalogMap } = useContext(PermissionCatalogContext)

  const entry = catalogMap.get(key)

  // Defense in depth: an unknown key means the snapshot drifted from the BE
  // (or the caller bypassed the type with a cast). Warn loudly so devs notice
  // in console, but return false so gated UI is hidden — never thrown over.
  if (!entry) {
    console.warn('useHasPermission: unknown key', key)
    return false
  }

  return hasCatalogAbilityPermission(ability, entry.action, entry.subject)
}

// Re-export the const map so callers can do a single import:
//   import { useHasPermission, PERMISSION_KEYS } from '@/lib/permissions'
export { PERMISSION_KEYS }
export type { PermissionKey }
