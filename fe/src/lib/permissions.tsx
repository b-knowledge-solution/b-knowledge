/**
 * @fileoverview Catalog-backed permission hook for the FE.
 *
 * Pairs the auto-generated `PERMISSION_KEYS` map with the CASL ability supplied
 * by `@/lib/ability`. Consumers call `useHasPermission(PERMISSION_KEYS.X)` to
 * imperatively check whether the current user holds a specific permission key,
 * which is resolved against the `(action, subject)` pair recorded in the
 * committed catalog snapshot at build time.
 *
 * Phase 4 is snapshot-only (per revised D-04 in 4-CONTEXT.md) — there is NO
 * runtime fetch of `/api/permissions/catalog`. Phase 7 will introduce that.
 *
 * @module lib/permissions
 */

import { useAppAbility } from './ability'
import { PERMISSION_KEYS, type PermissionKey } from '@/constants/permission-keys'
import catalogJson from '@/generated/permissions-catalog.json'

/**
 * @description Internal lookup shape: each catalog entry is reduced to the
 * (action, subject) pair that the CASL ability needs.
 */
interface CatalogEntry {
  action: string
  subject: string
}

// Build the lookup once at module init — NOT inside the hook. The catalog is
// static (imported JSON) so memoizing per-render with useMemo would just be
// redundant work; module scope is the simplest correct cache.
const CATALOG_MAP: Map<string, CatalogEntry> = (() => {
  const map = new Map<string, CatalogEntry>()
  // The JSON shape is { generatedAt, permissions: [...] } — see export-permissions-catalog.mjs.
  for (const entry of (catalogJson as { permissions: Array<{ key: string; action: string; subject: string }> }).permissions) {
    map.set(entry.key, { action: entry.action, subject: entry.subject })
  }
  return map
})()

/**
 * @description Imperative permission check backed by the BE catalog snapshot.
 *
 * Resolves the supplied catalog key to its `(action, subject)` pair via the
 * static lookup, then defers to the CASL ability for the actual rule check.
 * Unknown keys (e.g. a stale snapshot still references a removed key) log a
 * warning and return `false` — gating UI conservatively is safer than throwing
 * during render.
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

  const entry = CATALOG_MAP.get(key)

  // Defense in depth: an unknown key means the snapshot drifted from the BE
  // (or the caller bypassed the type with a cast). Warn loudly so devs notice
  // in console, but return false so gated UI is hidden — never thrown over.
  if (!entry) {
    console.warn('useHasPermission: unknown key', key)
    return false
  }

  return ability.can(entry.action as never, entry.subject as never)
}

// Re-export the const map so callers can do a single import:
//   import { useHasPermission, PERMISSION_KEYS } from '@/lib/permissions'
export { PERMISSION_KEYS }
export type { PermissionKey }
