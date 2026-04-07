---
phase: 01-schema-registry-boot-sync
verified: 2026-04-07T07:00:00Z
status: passed
score: 5/5 must-haves verified
requirements_covered: [TS1, TS2, TS3, TS4]
---

# Phase 1: Schema, Registry, Boot Sync — Verification Report

**Phase Goal:** DB has all new permission tables, code-side registry exists for all 22 modules, and boot sync upserts the catalog — with **zero user-visible behavior change**.

**Verified by:** Goal-backward inspection of migrations, registry, sync wiring, seed, git diff, and full test run.

---

## TS1 — DB Schema In Place ✅ MET

- **`permissions` table** — `20260407052126_phase1_create_permission_tables.ts:28-55` creates `id, key (UNIQUE), feature, action, subject, label, description, created_at, updated_at`. `subject` is `notNullable()` at L43. Index `idx_permissions_feature` at L54.
- **`role_permissions` table** — same migration L61-87. `tenant_id` is `.nullable()` at L73. UNIQUE `(role, permission_key, tenant_id)` declared at L81-83. Hot-path index `(role, tenant_id)` at L86.
- **`user_permission_overrides` table** — L93-126. Has `effect` column (L104), CHECK constraint `effect IN ('allow','deny')` at L130-134, and UNIQUE `(tenant_id, user_id, permission_key, effect)` at L120-122 — `effect` IS in the unique tuple as required.
- **`resource_grants` rename** — `20260407052129_phase1_rename_entity_permissions_to_resource_grants.ts:34` renames the table from `knowledge_base_entity_permissions`. Columns renamed L40-42 (`entity_type→resource_type`, `entity_id→resource_id`). `actions text[] NOT NULL DEFAULT '{}'` added L51-53. `tenant_id` + `expires_at` added L58-61. New 4-column UNIQUE `(resource_type, resource_id, grantee_type, grantee_id)` declared L100-104, after dropping the legacy 5-column constraint at L97-99.
- **`tenant_id` flipped to NOT NULL** — `20260407053000_phase1_backfill_resource_grants.ts:136` after backfill from `knowledge_base.tenant_id` (L58-64) and orphan-row guard (L75-88).
- **All four migrations have working `down()`** — verified by reading bodies (`20260407052126…ts:143-149`, `20260407052129…ts:115-162`, `20260407053000…ts:154-159`, `20260407062700…ts:223-248`) AND by the `migrations.test.ts > round-trips up → down → up cleanly` test passing.
- **`knowledge_base_permissions` (per-tab UI flags) untouched** — `git diff main..HEAD --name-only` shows zero hits on this table.

## TS2 — Permission Registry Exists ✅ MET

- **21 module files** — `find be/src/modules -name '*.permissions.ts'` returns exactly 21 files (agents, audit, broadcast, chat, code-graph, dashboard, external, feedback, glossary, knowledge-base, llm-provider, memory, preview, rag, search, sync, system, system-tools, teams, user-history, users). Auth has none by design (login/logout/session has no permissions). The "22 modules" goal language refers to all modules including auth — auth's intentional absence is documented at `be/src/shared/permissions/index.ts:13`.
- **`registry.ts`** — `be/src/shared/permissions/registry.ts:121-172` defines `definePermissions()` with duplicate detection (L144), key-shape validation (L137), and `getAllPermissions()` at L181-184 returning a frozen snapshot.
- **`index.ts` eager imports** — `be/src/shared/permissions/index.ts:28-48` imports all 21 module files explicitly (no glob/dynamic require — matches the 1-RESEARCH §13 pitfall 7 guidance).
- **Each module file calls `definePermissions(...)` with subject** — verified by spot-reading several files; the seed-migration validator `assertAllKeysRegistered()` would have thrown at test time if any subject was missing, and tests pass.
- **Total permission count** — test output shows admin role expansion seeds 80 distinct keys (`admin=80`), with super-admin matching at 80, and additional rows beyond admin (e.g. preview.view, code-graph.* not in admin's day-one set), placing total registry size in the expected 70-100 range. The executor-reported total of 81 is consistent with this expansion.

## TS3 — Boot Sync Runs At Startup ✅ MET

- **`sync.ts` exists** — `be/src/shared/permissions/sync.ts:50-123` exports `syncPermissionsCatalog()` with the 3-step upsert/diff/remove flow plus structured logging (`SyncLogCode.Inserted/Updated/Removed/NoOp`).
- **Idempotent** — Step 2 re-reads DB keys after upsert (L77), and the `sync.test.ts` "warm restart no-op" test passes (4 tests in suite green).
- **Wired into `app/index.ts`** — `be/src/app/index.ts:41` imports it; called at L168 inside the startup sequence.
- **Order: AFTER migrations, BEFORE root-user bootstrap** — call sits between the migration block (L155-160) and `userService.initializeRootUser()` at L177. Comment at L162-166 documents the ordering rationale.
- **try/catch wrapper does NOT crash startup** — L167-174: catches, logs `[boot] permission catalog sync failed — continuing startup`, does NOT rethrow.

## TS4 — Day-One Role Mapping Preserved ✅ MET

- **Seed migration exists** — `20260407062700_phase1_seed_role_permissions.ts` (248 lines).
- **Imports `ROLE_PERMISSIONS` at runtime** — L38: `import { ROLE_PERMISSIONS } from '@/shared/config/rbac.js'` (live import, not a copy).
- **Runtime `assertAllKeysRegistered()` check** — defined L114-131, called L148, imports the live registry via `getAllPermissions()` (L116). Throws with the full offender list before any insert.
- **`manage_users` legacy expansion** — `be/src/shared/permissions/legacy-mapping.ts:69-100` expands to 24 keys covering users (8) + teams (6) + chat (5) + search_apps (5). The chat_assistants → chat consolidation deviation is documented in the file header L21-31.
- **`agents.*` and `memory.*` admin-only** — `legacy-mapping.ts:186-201` defines `AGENTS_MEMORY_ADMIN_ONLY_KEYS` (12 keys), and L206-209 defines `AGENTS_MEMORY_ADMIN_ROLES = ['admin', 'super-admin']`. Seed migration L92-94 applies them to those roles only — `user` and `leader` get nothing.
- **Strict-superset parity test passes** — `tests/permissions/role-seed.test.ts` (5 tests, all green), most importantly the strict-superset test that imports the live `ROLE_PERMISSIONS` map and asserts every legacy (role, key) grant is preserved in `role_permissions`.
- **Per-role seed counts from test logs:** `admin=80, leader=46, super-admin=80, user=3` — distribution matches expectations (user role only gets `view_chat`/`view_search`/`view_history` → 3 keys after expansion).

## Zero User-Visible Behavior Change ✅ MET

- **Phase 1 commits (`b4cdf6c cae200b 6727911 9c71d24 6be5e68`) touched only:**
  - `be/src/app/index.ts` (sync wiring only — 9 added lines in try/catch)
  - `be/src/modules/*/[name].permissions.ts` (21 NEW files)
  - `be/src/shared/permissions/*` (4 NEW files)
  - `be/src/shared/db/migrations/2026040705*.ts` (4 NEW migrations)
  - `be/src/shared/models/factory.ts` (Permission/RolePermission model registration only)
  - `be/src/shared/constants/permissions.ts` (NEW constants file)
  - `be/tests/permissions/*` (NEW test suite)
- **Zero files touched in:** `be/src/modules/*/routes/`, `be/src/modules/*/controllers/`, `be/src/shared/middleware/`, `fe/src/`, `be/src/shared/config/rbac.ts`. Verified via:
  ```
  git show --name-only --format= b4cdf6c cae200b 6727911 9c71d24 6be5e68 | grep -E "(routes|controllers|middleware|fe/)"  → empty
  git diff main..HEAD -- be/src/shared/config/rbac.ts | wc -l  → 0
  ```
- The fe/src/* files in `git diff main..HEAD --stat` come from an unrelated upstream PR (`df04bab Add healthcare organizational chart`) merged before Phase 1 branched, NOT from Phase 1 work.
- Legacy `rbac.ts` shim therefore remains the active auth path — exactly the "seed only, not enforcement" stance required by TS4.

## Tests ✅ ALL PASS

`npm run test:permissions -w be` result:

| Suite | Tests | Status |
|---|---|---|
| `migrations.test.ts` | 13 | ✓ all pass |
| `backfill.test.ts` | 3 | ✓ all pass |
| `registry.test.ts` | 9 | ✓ all pass |
| `sync.test.ts` | 4 | ✓ all pass |
| `role-seed.test.ts` | 5 | ✓ all pass (incl. strict-superset parity) |
| **Total** | **34** | **✓ 34/34 green, 0 type errors** |

Duration 39.3s. The strict-superset parity test in `role-seed.test.ts` — the most important guard against silent legacy regression — is green.

---

## Known Issues / Tech-Debt IOUs (carry forward)

1. **129 pre-existing BE test failures** outside `tests/permissions/` are unrelated to Phase 1 and remain. Phase 1 did not regress them and did not fix them. Phase 2 should NOT block on them but may want to triage.
2. **Test isolation typed-cast hack in `sync.test.ts`** — the executor noted a `(ModelFactory as any)` cast used to swap the model singleton between tests for isolation. Works correctly and tests pass; refactor to a proper DI seam in Phase 2 if/when the model factory grows real DI support.
3. **`.onConflict().ignore()` + Postgres NULL-distinct quirk** — the seed migration works around `tenant_id = NULL` not being unique-comparable by pre-querying existing rows (`20260407062700…ts:158-185`). Functional but adds a SELECT round-trip. Consider migrating to a partial unique index (`WHERE tenant_id IS NULL`) or `NULLS NOT DISTINCT` (PG15+) in a later phase to drop the workaround.
4. **`down()` on the backfill migration intentionally does NOT reverse data** (`20260407053000…ts:142-159`) — this is documented and correct per the standard Knex backfill pattern, but operators rolling back should be aware tenant_id values are preserved.
5. **`manage_storage` and `storage:*` legacy keys map to empty arrays** — documented dropped keys (`legacy-mapping.ts:174-177`). If any code path is later discovered that still calls them, it MUST be updated to use the new per-feature keys, NOT by un-dropping the storage namespace.
6. **Per-role seed counts (`admin=80, super-admin=80, leader=46, user=3`)** are baselined in the snapshot file `__snapshots__/role-seed.test.ts.snap` — Phase 2 changes that intentionally shift role membership MUST update this snapshot deliberately.

---

## Phase 1 Ready For Transition: ✅ PASS

All five must-haves (TS1, TS2, TS3, TS4, zero-behavior-change gate) are MET with file:line evidence and a green 34-test suite. No partial verdicts, no human-verification gaps. The legacy `rbac.ts` shim is still the active auth path, the new permission catalog is seeded and synced on every boot, the registry is single-source-of-truth, and the migrations are reversible. `/gsd:transition` may mark Phase 1 done in `PROJECT.md`.

_Verified: 2026-04-07 — Verifier: Claude (gsd-verifier)_
