/**
 * @fileoverview Boot-time permission registry sync.
 *
 * Reconciles the in-code permission registry (`getAllPermissions()`) with
 * the `permissions` catalog table:
 *
 *   1. UPSERT every registered permission so new keys are inserted and
 *      payload-only changes (label, subject, etc.) are merged.
 *   2. DELETE catalog rows whose key is no longer in the registry — these
 *      are stale entries from a removed feature. Removal is automatic but
 *      LOUDLY logged so deploy reviewers see it.
 *
 * The function is idempotent: a warm restart with no registry change is a
 * `{ inserted: 0, updated: 0, removed: 0 }` no-op.
 *
 * Failure mode: this service MUST NOT crash the server. The legacy `rbac.ts`
 * shim is still the active auth path during Phase 1, so a sync failure is
 * logged + rethrown to the caller, which wraps it in try/catch and continues
 * startup. See `app/index.ts` for the call site.
 */

import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { SyncLogCode } from '@/shared/constants/permissions.js'
import { getAllPermissions, type Permission } from './registry.js'

/**
 * @description Result of a single sync run. All three counters are returned
 * so the caller can emit a structured log line and so tests can assert each
 * delta independently.
 */
export interface SyncResult {
  /** Number of new catalog rows created. */
  inserted: number
  /** Number of existing rows whose payload changed. */
  updated: number
  /** Number of stale rows removed. */
  removed: number
}

/**
 * @description Reconcile the `permissions` catalog table with the in-code
 * registry. Idempotent and safe to call on every backend boot.
 *
 * @returns {Promise<SyncResult>} Insert / update / remove counts.
 * @throws Re-throws any database error after logging — the caller in
 *   `app/index.ts` is responsible for swallowing the error so a sync failure
 *   does not crash the server during the Phase 1 transition.
 */
export async function syncPermissionsCatalog(): Promise<SyncResult> {
  // Pull the registry snapshot once. The eager imports in
  // `@/shared/permissions/index.ts` guarantee every module's permissions
  // file has fired its `definePermissions` side effect by the time we get here.
  const registered: readonly Permission[] = getAllPermissions()

  // Build the upsert payload — strip the optional `description` when absent
  // so `exactOptionalPropertyTypes` is satisfied.
  const upsertRows = registered.map((p) => {
    const base = {
      key: p.key,
      feature: p.feature,
      action: p.action,
      subject: p.subject,
      label: p.label,
    }
    return p.description !== undefined ? { ...base, description: p.description } : base
  })

  try {
    // Step 1 — upsert every registered permission. New keys are inserted,
    // existing keys have their payload merged.
    const { inserted, updated } = await ModelFactory.permission.upsertMany(upsertRows)

    // Step 2 — diff the DB against the registry to find stale keys that no
    // longer exist in code. We re-read keys AFTER the upsert so the diff
    // already accounts for newly-inserted rows.
    const dbKeys = await ModelFactory.permission.findAllKeys()
    const registeredKeySet = new Set(registered.map((p) => p.key))
    const stale = dbKeys.filter((k) => !registeredKeySet.has(k))

    // Step 3 — log + remove stale rows. Removal is automatic per the locked
    // decision; the WARN log makes it visible during deploy review.
    let removed = 0
    if (stale.length > 0) {
      // Loud structured log so dashboards can alert on stale removals.
      log.warn('Removing stale permission rows from catalog', {
        code: SyncLogCode.Removed,
        count: stale.length,
        keys: stale,
      })
      removed = await ModelFactory.permission.deleteByKeys(stale)
    }

    // Emit per-delta structured log codes so audit pipelines can filter.
    if (inserted > 0) {
      log.info('Permission catalog rows inserted', {
        code: SyncLogCode.Inserted,
        count: inserted,
      })
    }
    if (updated > 0) {
      log.info('Permission catalog rows updated', {
        code: SyncLogCode.Updated,
        count: updated,
      })
    }
    if (inserted === 0 && updated === 0 && removed === 0) {
      // No-op path — still log so operators can confirm the sync ran.
      log.info('Permission catalog already in sync', { code: SyncLogCode.NoOp })
    }

    return { inserted, updated, removed }
  } catch (err) {
    // Log with full context, then rethrow so the caller can decide whether
    // to crash. During Phase 1 the call site swallows this error to keep the
    // server up; later phases may choose fail-fast once `rbac.ts` is removed.
    log.error('Permission catalog sync failed', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    throw err
  }
}
