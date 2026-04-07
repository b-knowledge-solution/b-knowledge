# Phase 1 UAT — Schema, Registry, Boot Sync

> Conversational user-acceptance test run after Phase 1 implementation.
> Purpose: verify the built scaffolding actually works from the user's
> perspective in the live dev environment, not just in scratch-DB unit tests.
> Date: 2026-04-07.

## Context

Phase 1 was explicitly designed to produce **zero user-visible behavior change** —
it adds new DB tables, a code-side permission registry, a boot-sync service, and
a day-one role seed, all while leaving the legacy `be/src/shared/config/rbac.ts`
as the active auth path. UAT for an infrastructure phase like this is not
"click the new button"; it's "prove the silent scaffolding actually exists and
nothing in the existing system broke".

All 5 tests were run against the user's live dev database at
`localhost:5432/knowledge_base` with the dev backend started via
`npm run dev:be`.

## Tests

### Test 1 — Server still starts

**What was checked:** server boots cleanly, boot-sync log line appears, no
errors or stack traces during startup.

**Result:** ✓ PASS

**Caveat:** this test was initially a false positive. The user confirmed server
startup without specifically verifying the numeric `inserted` count on the sync
line. Test 2 surfaced the real issue: sync was running and logging
`inserted: 0, updated: 0, removed: 0` — the classic "successful no-op against
an empty registry" bug. See Test 2 + the bug fix commit for root cause.

### Test 2 — Day-one DB counts

**What was checked:** query `permissions`, `role_permissions`,
`user_permission_overrides`, `resource_grants` counts and confirm tenant_id is
populated on all `resource_grants` rows.

**First run (before fix):** ✗ FAIL
```
 permission_count | role_permission_count | overrides_count | resource_grant_count | grants_without_tenant
------------------+-----------------------+-----------------+----------------------+-----------------------
                0 |                   209 |               0 |                    0 |                     0
```

`permission_count = 0` exposed the bug: sync ran, compared an **empty**
in-memory registry against an empty DB, found no diff, reported "already in
sync" with all zeros, and silently succeeded. Root cause: `sync.ts` imported
`getAllPermissions` from `./registry.js` (the raw registry module), which
bypassed the `./index.js` barrel containing the 21 eager module imports that
are the side-effect mechanism by which `ALL_PERMISSIONS` gets populated. The
barrel was never loaded, the 21 `.permissions.ts` files never executed, and
the registry stayed empty at runtime — even though unit tests passed, because
the unit tests imported the barrel directly.

**Fix (commit `f8f7482`):**
1. Change `sync.ts` import source from `./registry.js` → `./index.js`. This
   forces the barrel's module body to execute, which triggers the 21 eager
   module imports, which populate `ALL_PERMISSIONS`.
2. Add a runtime sanity assertion inside `syncPermissionsCatalog()`: if
   `registered.length === 0`, throw with an actionable error message. An
   empty registry is always a developer bug (we ship with 21 module files),
   never a legitimate runtime state. The assertion turns the silent "no-op
   with zero rows" failure mode into a loud, trackable error that the
   existing `try/catch` at the call site catches and logs.
3. New `SyncLogCode.EMPTY_REGISTRY` code in the constants enum for
   structured-log filtering.

**Second run (after fix):** ✓ PASS
```
 permission_count | role_permission_count | overrides_count | resource_grant_count | grants_without_tenant
------------------+-----------------------+-----------------+----------------------+-----------------------
              110 |                   209 |               0 |                    0 |                     0
```

**Count correction:** the user's first report of 81 permissions (from the P1.3
executor summary) was a stale snapshot. The current registry truth is **110
keys across 21 modules**, verified by counting `label:` entries in each
`<feature>.permissions.ts` source file. The growth from 81 → 110 happened
during P1.4/P1.5 execution as the day-one seed migration's
`assertAllKeysRegistered()` runtime check forced the registry to grow to
cover every key referenced by `LEGACY_TO_NEW`. This is the intended drift-
detection mechanism working exactly as designed. `1-RESEARCH.md`'s 81 number
should be read as "initial P1.3 snapshot, grew during P1.5".

### Test 3 — Login + KB nav still work

**What was checked:** the user logged into the FE with their normal admin
credentials, opened the Knowledge Base list page, and browsed into a KB.

**Result:** ✓ PASS

**Significance:** this is the most important "zero behavior change" gate. The
legacy `rbac.ts` shim is still the active auth path; Phase 1 did not touch any
route, controller, middleware, or service file. Login, nav, and KB browsing
are unchanged from pre-Phase-1 behavior. No 401/403/500 regressions, no
missing nav items, no broken pages.

### Test 4 — Day-one role parity in live DB

**What was checked:**
1. Per-role row counts in `role_permissions` (global scope, `tenant_id IS NULL`).
2. Spot-check that admin received the full `manage_users` expansion —
   `users.*`, `teams.*`, `chat.*`, `search_apps.*` keys.

**Result:** ✓ PASS

**Significance:** this is the strict-superset parity test from the unit suite,
verified against the live DB instead of a scratch schema. Every existing role
can do on day one everything it could do via the legacy `ROLE_PERMISSIONS`
map — which is the contract Phase 3's cutover depends on. Had the
`manage_users` expansion missed any key (e.g., `chat.embed`,
`search_apps.embed`), admin workflows would have silently broken after the
Phase 3 cutover. None missed.

### Test 5 — Reversibility on live DB

**What was checked:** run `npm run db:migrate:rollback` on the live dev DB,
confirm Phase 1 tables are gone and the legacy `knowledge_base_entity_permissions`
table is back, then run `npm run db:migrate` to re-apply and confirm clean
re-application.

**Result:** ✓ PASS

**Significance:** the scratch-DB round-trip test in `migrations.test.ts`
already proved each migration's `down()` is structurally correct, but live-DB
reversibility is a stronger guarantee — it proves the actual data shape in
the user's environment doesn't contain any edge case that blocks rollback
(orphaned rows, FK cascade surprises, failing `SET NOT NULL` on unexpected
NULLs). Zero orphan rows were reported during the P1.2 backfill, so this
result is consistent with the expected clean state.

## Summary

| # | Test                                         | Result  |
|---|----------------------------------------------|---------|
| 1 | Server boots + sync log line appears         | ✓ PASS  |
| 2 | Day-one DB counts match expectations         | ✓ PASS* |
| 3 | Login + KB nav still work                    | ✓ PASS  |
| 4 | Day-one role parity in live DB               | ✓ PASS  |
| 5 | Migration rollback + re-apply is clean       | ✓ PASS  |

\* Test 2 initially failed and was the trigger for the `f8f7482` fix. Re-run
   after the fix passed cleanly.

## Issues found and fixed during UAT

### Issue 1 — `sync.ts` imported from `./registry.js` instead of the barrel

**Severity:** Critical — sync silently no-op'd on every production startup.

**File:** `be/src/shared/permissions/sync.ts:25`

**Root cause:** the registry is populated via ESM side-effect imports in
`be/src/shared/permissions/index.ts` (the barrel), which `import`s each of the
21 `<feature>.permissions.ts` files. `sync.ts` imported `getAllPermissions`
directly from `./registry.js`, so the barrel was never loaded, no side effects
fired, and `ALL_PERMISSIONS` stayed empty at runtime. Unit tests did not catch
this because they imported from the barrel (or transitively loaded it via
test helpers), which caused the side effects to fire under vitest.

**Fix:** commit `f8f7482`
1. Changed the import source to `./index.js`.
2. Added an `if (registered.length === 0) throw` sanity assertion.
3. Added `SyncLogCode.EMPTY_REGISTRY` for structured log filtering.

**Prevention:** the new assertion turns this failure mode into a loud,
actionable error. Future regressions (e.g., a refactor that accidentally
drops the barrel import again) will fail loudly at startup instead of
silently producing an empty catalog.

**Tests affected:** none — `sync.test.ts` continues to pass (34/34 total
Phase 1 tests green) because vitest's module loading already triggers the
side effects. This is a production-runtime-only divergence; UAT was the only
way to catch it.

## No carry-forward UAT items

No further work is needed before Phase 1 can be considered fully shipped.
All 5 tests pass, the single bug found was fixed and committed during UAT,
and the fix is covered by a permanent runtime assertion.

The broader Phase 1 carry-forward IOUs (129 pre-existing BE test failures,
sync.test.ts typed-cast hack, NULL-distinct workaround in P1.5, subject-field
reconciliation for Phase 2) remain documented in `.planning/STATE.md` and
`.planning/phase-01-schema-registry-boot-sync/VERIFICATION.md`.

## Recommendation

**Phase 1 is done and verified.** Ready to proceed to `/gsd:plan-phase 2`
(Ability Engine + Regression Snapshots).

---
*Generated during /gsd:verify-work on 2026-04-07.*
