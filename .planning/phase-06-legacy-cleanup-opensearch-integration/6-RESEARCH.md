# Phase 6: Legacy Cleanup + OpenSearch Integration — Research

**Researched:** 2026-04-09
**Domain:** BE auth/RBAC cleanup + OpenSearch query-time grant filtering
**Confidence:** HIGH on file/grep findings; MEDIUM on test-harness recommendation (no existing OS integration test pattern in repo)

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01** P6.1 single atomic migration: pre-check unknown roles (abort) + UPDATE member→user + UPDATE superadmin→super-admin + ALTER default `'user'` + seed update.
- **D-02** Seed `00_sample_users.ts:295` is in scope (note: that line is `user_teams.role='member'` which is `TeamRole.MEMBER` and per CONTEXT D-04 stays — see Disagreements §A).
- **D-03** Down migration restores column default only (`'user'` → `'member'`). **See Disagreements §A — current default is already `'user'`, so this is a no-op or actively wrong.**
- **D-04** P6.2 exhaustive sweep; delete `UserRole.SUPERADMIN` + `UserRole.MEMBER`; leave `TeamRole.MEMBER` alone. Mechanical rewrite: `SUPERADMIN` → `SUPER_ADMIN`, `MEMBER` → `USER`.
- **D-05** CI grep script (not ESLint).
- **D-06** Zero-grant users get role-default behavior only (no clause emitted).
- **D-07** KB grants + DocumentCategory grants flatten to one `terms { dataset_id: [...] }` clause.
- **D-08** Composition: `tenant AND (role_base OR grants)`; tenant filter from `buildAccessFilters` first.
- **D-09** `expires_at` enforced in P6.3 SQL.
- **D-10** Three-case test: parity / positive grant / no-access.
- **D-11** P6.5 = R-9 ADMIN_ROLES documentation pass only.

### Claude's Discretion
- CI grep script naming
- P6.4 test harness choice
- Whether grant walk SQL lives in ability.service or new model method (research recommends: **new model method** — see §3)
- P6.5 manual vs codemod
- Commit granularity within P6.2

### Deferred Ideas (OUT OF SCOPE)
- Strategy B / chunk schema changes / R-3 cross-language constants
- `expires_at` UI (Phase 7 SH2/SH3)
- Catalog version hash (Phase 7 SH1)
- Full ADMIN_ROLES → useHasPermission migration (milestone 2)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TS9 | OpenSearch Strategy A grant filter — `buildOpenSearchAbacFilters` walks resource_grants and emits `terms { dataset_id: [...] }`; preserves `buildAccessFilters` tenant clause; zero-grant users see no behavior change | §1, §2, §3, §4, §5 |
| TS13 | Legacy alias cleanup — remove `superadmin`/`member` from `roles.ts`, BE references, DB data; migration UPDATE + default flip; grep returns zero | §7, §8, §9 |

---

## 1. `buildOpenSearchAbacFilters` — current signature & body

**File:** `be/src/shared/services/ability.service.ts:544-592`

```ts
export function buildOpenSearchAbacFilters(
  policies: AbacPolicyRule[],
  _userAttributes: Record<string, unknown> = {}
): Record<string, unknown>[] {
  const allowFilters: Record<string, unknown>[] = []
  const denyFilters: Record<string, unknown>[] = []

  for (const policy of policies) {
    // Only translate Document read rules to OpenSearch filters
    if (policy.subject !== 'Document' || (policy.action !== 'read' && policy.action !== 'manage')) {
      continue
    }
    const conditionFilters = translateConditions(policy.conditions)
    if (policy.effect === 'allow') {
      if (conditionFilters.length > 0) allowFilters.push(...conditionFilters)
    } else if (policy.effect === 'deny') {
      denyFilters.push(...conditionFilters)
    }
  }

  const result: Record<string, unknown>[] = []
  if (allowFilters.length > 0) {
    result.push({ bool: { should: allowFilters, minimum_should_match: 1 } })
  }
  if (denyFilters.length > 0) {
    result.push({ bool: { must_not: denyFilters } })
  }
  return result
}
```

**Key observations:**
- Synchronous, takes only `AbacPolicyRule[]` — no user/tenant/grants parameter. **P6.3 must add parameters** (user id, tenant id, optional teamIds) and make it `async` to walk resource_grants.
- Returns an **array** of clauses meant to be spread into `bool.filter`. The grant clause must be appended to that array.
- The current function is purely policy-driven; legacy ABAC policies live alongside the new grant model. P6.3 must keep the existing policy walk intact (D-08 "composition") and ADD the grant walk.

## 2. `buildAccessFilters` — tenant invariant

**File:** `be/src/shared/services/ability.service.ts:636-645`

```ts
export function buildAccessFilters(
  tenantId: string,
  abacFilters: Record<string, unknown>[] = []
): Record<string, unknown>[] {
  return [
    // Mandatory tenant isolation — never omit this filter
    { term: { tenant_id: tenantId } },
    ...abacFilters,
  ]
}
```

**Verbatim — do not modify in P6.3.** The tenant clause is always position 0; the grant clause is one of the elements inside `abacFilters`. D-08 composition is achieved by `[ tenant, ...buildOpenSearchAbacFilters(policies, userId, tenantId, teamIds) ]`.

## 3. ResourceGrantModel inventory

**File:** `be/src/shared/models/resource-grant.model.ts`

Public methods on `ResourceGrantModel` (extends `BaseModel<ResourceGrantRow>`):

| Method | Signature | Purpose | Reusable for P6.3? |
|--------|-----------|---------|---------------------|
| `findActiveForUser` | `(userId, tenantId, teamIds=[]) → Promise<ResourceGrantRow[]>` | Returns BOTH KB and DocumentCategory grants for a user, **already does SQL-side `expires_at IS NULL OR expires_at > NOW()`** and tenant filter | **YES — direct reuse.** Already honors D-09. |
| `findByResource` | `(resourceType, resourceId, tenantId)` | "Who has access to X" — admin UI | No |
| `bulkCreate` | `(grants[]) → {inserted}` | Upsert from admin UI | No |
| `countWithEmptyActions` | `() → number` | Boot guardrail | No |
| `deleteById` | `(id, tenantId) → number` | Admin UI delete | No |

**Key contract from header docstring:**
> Tenant isolation is the FIRST WHERE clause. The `expires_at` filter is ALWAYS applied in SQL — NEVER in JavaScript.

**Recommendation for P6.3 (planner discretion item):**
1. **Reuse `findActiveForUser` directly** in `buildOpenSearchAbacFilters`. It already returns both KB and DocumentCategory grants in one round-trip with all the locked invariants (tenant, expires_at, grantee disjunction).
2. **Add ONE new method** `DocumentCategoryModel.findDatasetIdsByCategoryIds(categoryIds[]): Promise<string[]>` (see §4) — this is the missing piece for resolving DocumentCategory grants → datasets.
3. **No new method on ResourceGrantModel needed.** Keeps the layering rule intact: SQL stays in models.

## 4. DocumentCategory → datasets resolution

**File:** `be/src/modules/knowledge-base/models/document-category.model.ts`

Current model has only `findByKnowledgeBaseId(kbId)` returning full rows. **No method maps category_id → dataset_id(s).**

**Schema reality** (from `20260312000000_initial_schema.ts:1106-1156`):
- `document_categories` table has its OWN nullable `dataset_id` column (line 1116) — used for `category_type='standard'|'code'` (single dataset, not versioned).
- `document_category_versions` table has `ragflow_dataset_id` (line 1140) — used for `category_type='documents'` (versioned, one dataset per version).

**Therefore the dataset resolution is a UNION of two queries** (or one query with OUTER JOIN):

```sql
-- Standard/code categories: direct dataset_id on document_categories
SELECT dc.dataset_id AS dataset_id
FROM document_categories dc
WHERE dc.id = ANY($1) AND dc.dataset_id IS NOT NULL

UNION

-- Versioned categories: ragflow_dataset_id on document_category_versions
SELECT dcv.ragflow_dataset_id AS dataset_id
FROM document_category_versions dcv
WHERE dcv.category_id = ANY($1)
  AND dcv.ragflow_dataset_id IS NOT NULL
  AND dcv.status = 'active'  -- planner: confirm whether to filter on status
```

**For KB grants → datasets:** A KB owns N categories which own N datasets. The query is the same JOIN starting from `knowledge_base_id` instead of `category_id`. **Recommend a sibling method** `findDatasetIdsByKnowledgeBaseIds(kbIds[])` — same shape.

**New methods to add (planner decision):**
- `DocumentCategoryModel.findDatasetIdsByCategoryIds(categoryIds: string[]): Promise<string[]>`
- `DocumentCategoryModel.findDatasetIdsByKnowledgeBaseIds(kbIds: string[]): Promise<string[]>`

Both return a flat dedup'd `string[]` so the ability service just unions and emits `terms { dataset_id: [...] }`.

**Note on `category_type='standard'` filter:** The dataset_id column on document_categories is nullable for `category_type='documents'` (versioned), so the `WHERE dc.dataset_id IS NOT NULL` filter naturally handles type discrimination.

## 5. OpenSearch query assembly — **CRITICAL FINDING**

`buildOpenSearchAbacFilters` and `buildAccessFilters` have **ZERO production callers** as of HEAD. The grep audit:

```
src/shared/services/ability.service.ts          (declaration only)
src/modules/chat/services/chat-conversation.service.ts:42  (UNUSED IMPORT — no call site)
tests/chat/* + tests/search/* + tests/shared/services/  (6 mock decls + 1 todo skeleton)
```

**Implications for P6.3 planning:**
1. Extending the function alone is **insufficient**. Without a caller, the new clause is dead code.
2. The unused import in `chat-conversation.service.ts:42` is a vestige — likely the function was prototyped pre-Phase-1 but never wired into the search path.
3. **The planner must locate the actual OpenSearch query body assembly** (probably in `advance-rag/` Python worker, OR in BE search/RAG service that doesn't currently call the ability filter functions). Candidates to check:
   - `be/src/modules/search/services/search.service.ts`
   - `be/src/modules/rag/services/rag.service.ts`
   - `be/src/modules/chat/services/chat-conversation.service.ts` (despite the unused import, this is the most likely consumer)
   - `be/src/modules/knowledge-base/services/knowledge-base.service.ts`
4. **P6.3 must add a Wave-0 task: "Locate the OpenSearch search call site, wire `buildAccessFilters(tenantId, buildOpenSearchAbacFilters(...))` into its `bool.filter` array."** Without this, the integration test in P6.4 has nothing to assert against.

**Risk:** if the OpenSearch query is built in `advance-rag/` Python and the BE never touches it, Strategy A as designed cannot work without an additional API contract. Recommend planner spend 20 minutes confirming the query lives in BE before committing to the plan shape.

## 6. Test harness for OS integration tests

**Existing patterns surveyed:**

| Directory | Pattern | Useful for P6.4? |
|-----------|---------|------------------|
| `be/tests/permissions/` | Scratch-DB via `_helpers.ts` (`withScratchDb`, `roundTripMigration`); per-test isolated Postgres schema; full migrate.latest then rollback | **Yes — DB side.** Use `withScratchDb` to seed users + KBs + grants. |
| `be/tests/search/` | Service-level unit tests with **mocked OS client** (`search-app-rbac.service.test.ts:165` mocks `buildOpenSearchAbacFilters: () => []`) | Pattern reference only — these mock the OS layer, they don't run real OS. |
| `be/tests/chat/` | Same — 5 tests mock `buildOpenSearchAbacFilters: () => []` | Same. |
| `be/tests/shared/services/ability.service.test.ts` | Vitest `it.todo()` placeholders for `buildOpenSearchAbacFilters` and `buildAccessFilters` (no implementations yet) | **Direct extension point** — replace todos with the three P6.4 cases as pure-function unit tests. |

**No real-OS integration test exists in the repo.** Docker-compose has OpenSearch, but no test currently spins it up.

**Recommendation for P6.4 (planner discretion):**

Use a **two-tier strategy** matching existing patterns:

1. **Tier A — Pure-function unit tests** in `be/tests/shared/services/ability.service.test.ts` (replace the existing `it.todo()` skeletons). Assert the SHAPE of the returned filter array for the three D-10 cases, with a stubbed `findActiveForUser` and stubbed `findDatasetIdsByCategoryIds`. **Fast, deterministic, no Docker.** This is the primary acceptance gate.
2. **Tier B — Integration test** in `be/tests/permissions/` using `withScratchDb` to insert users/KBs/categories/grants, then call the ability function with REAL model methods (real Postgres, mocked OS client). Asserts the grant walk + dataset resolution end-to-end without needing a live OpenSearch. **Catches SQL bugs in `findDatasetIdsByCategoryIds`.**

**Do NOT attempt a real-OpenSearch integration test in this phase** — no precedent in the repo, would require new docker-compose.test scaffolding, and the locked decisions don't require it. The Tier A + Tier B combo proves the contract.

## 7. Exhaustive legacy alias grep

`grep -rn "UserRole\.SUPERADMIN\|UserRole\.MEMBER\|'superadmin'\|'member'" be/src be/tests --include="*.ts"`:

**`be/src/` — production code (must rewrite):**
```
be/src/shared/constants/roles.ts:9         SUPERADMIN: 'superadmin',          [DELETE key]
be/src/shared/constants/roles.ts:12        MEMBER: 'member',                  [DELETE key]
be/src/shared/constants/roles.ts:21        MEMBER: 'member',                  [TeamRole — KEEP per D-04]
be/src/shared/db/migrations/20260312000000_initial_schema.ts:93   user_teams default 'member'   [TeamRole — KEEP]
be/src/shared/db/seeds/00_sample_users.ts:295   role: 'member'                 [user_teams.role — TeamRole — KEEP, see Disagreements §A]
be/src/modules/knowledge-base/services/knowledge-base.service.ts:29  UserRole.SUPERADMIN  → SUPER_ADMIN
be/src/modules/search/services/search.service.ts:191  UserRole.SUPERADMIN  → SUPER_ADMIN
be/src/modules/search/services/search.service.ts:316  UserRole.SUPERADMIN  → SUPER_ADMIN
be/src/modules/chat/services/chat-assistant.service.ts:127  UserRole.SUPERADMIN  → SUPER_ADMIN
be/src/modules/chat/services/chat-assistant.service.ts:257  UserRole.SUPERADMIN  → SUPER_ADMIN
be/src/modules/rag/services/rag.service.ts:318  UserRole.SUPERADMIN  → SUPER_ADMIN
be/src/modules/sync/controllers/sync.controller.ts:71  UserRole.SUPERADMIN  → SUPER_ADMIN
be/src/modules/teams/services/team.service.ts:215,223   role: 'member'|'leader'   [TeamRole — KEEP, but planner should verify]
```

**`be/tests/` — test fixtures (must rewrite or audit):**
```
be/tests/search/search.service.comprehensive.test.ts:310    'admin-1', 'superadmin'    → 'super-admin'
be/tests/chat/chat-dialog.service.test.ts:143               'sa-1', 'superadmin'        → 'super-admin'
be/tests/chat/chat-dialog.service.test.ts:346               'sa-1', 'superadmin'        → 'super-admin'
be/tests/projects/projects.service.test.ts:209              role: 'superadmin'          → 'super-admin'
be/tests/teams/team.service.test.ts:136,169,170,193         'member' (TeamRole context — KEEP)
```

**Production UserRole.SUPERADMIN sites: 7** (matches CONTEXT.md D-04 estimate). **No `UserRole.MEMBER` references found in production code** — the constant is unused but still exported. Deletion is safe.

**`advance-rag/` Python:** `grep "'superadmin'\|'member'"` returned **no matches**. Python worker is clean.

**`fe/src/`:** Per Phase 4 CONTEXT, FE is already clean. Spot-check during P6.2 grep script authoring is recommended but no rewrites expected.

## 8. UserRole canonical keys (post-cleanup)

**File:** `be/src/shared/constants/roles.ts`

After P6.2 deletes `SUPERADMIN` and `MEMBER`, the remaining `UserRole` enum is:

```ts
export const UserRole = {
  SUPER_ADMIN: 'super-admin',
  ADMIN: 'admin',
  LEADER: 'leader',
  USER: 'user',
} as const
```

**Mechanical rewrite mapping for P6.2:**
- `UserRole.SUPERADMIN` → `UserRole.SUPER_ADMIN`
- `UserRole.MEMBER` → `UserRole.USER` (no current usages found, so this is purely theoretical/defensive)

**Helper functions** `isAdminRole` and `isElevatedRole` (lines 31-42) already use `SUPER_ADMIN` (the canonical value). No changes needed there.

**`TeamRole.MEMBER`** at line 21 stays exactly as-is per D-04.

## 9. Knex migration conventions (recent examples)

**Surveyed migrations:**

| File | Pattern observed |
|------|------------------|
| `20260408105510_make_resource_grants_kb_id_nullable.ts` | Uses `knex.schema.alterTable().alter()` for column changes; `down()` includes a **pre-check guard** that throws with descriptive error if rollback would lose data — **directly the pattern P6.1 pre-check should mirror** |
| `20260407052129_phase1_rename_entity_permissions_to_resource_grants.ts` | Uses `knex.raw()` for `ALTER TABLE … RENAME` (Knex bug #933 workaround); uses `IF EXISTS`/`IF NOT EXISTS` for idempotency on indexes/constraints |
| `20260407053000_phase1_backfill_resource_grants.ts` | Uses raw SQL for cross-table backfill UPDATEs |

**Recommended P6.1 file name (timestamp convention):**
`be/src/shared/db/migrations/20260409XXXXXX_phase06_legacy_role_cleanup.ts`
(replace XXXXXX with HHMMSS at create time via `npm run db:migrate:make phase06_legacy_role_cleanup`)

**Recommended P6.1 structure:**
```ts
export async function up(knex: Knex): Promise<void> {
  // Step 1: Pre-check unknown role values, abort if any exist
  const unknown = await knex('users')
    .whereNotIn('role', ['user', 'member', 'admin', 'super-admin', 'superadmin', 'leader'])
    .select('role')
    .distinct()
  if (unknown.length > 0) {
    throw new Error(
      `Cannot run phase06_legacy_role_cleanup: unknown role values present: ${unknown.map(r => r.role).join(', ')}. ` +
      `Reconcile these rows manually before re-running.`
    )
  }

  // Step 2: UPDATE legacy → canonical (idempotent: 0 rows on re-run)
  await knex('users').where({ role: 'member' }).update({ role: 'user' })
  await knex('users').where({ role: 'superadmin' }).update({ role: 'super-admin' })

  // Step 3: ALTER DEFAULT — see §10 RISK: this is a NO-OP on current schema
  // The default is already 'user' per initial_schema.ts:33. Migration kept
  // for documentation and as a safety net if a future migration changes it.
  await knex.raw(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user'`)
}

export async function down(knex: Knex): Promise<void> {
  // Down restores ONLY the column default (per D-03). Does NOT reverse UPDATEs.
  // NOTE: D-03 says revert default to 'member', but current default is already
  // 'user'. Restoring 'member' here would CREATE a regression rather than fix
  // one. Recommend planner override D-03 and make down() a no-op, or restore
  // to 'user' explicitly. See Disagreements §A.
  await knex.raw(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user'`)
}
```

## 10. ADMIN_ROLES audit targets (P6.5 — R-9 documentation pass)

`grep -rn "ADMIN_ROLES" be/src`:

| Site | Classification | P6.5 action |
|------|----------------|-------------|
| `be/src/shared/config/rbac.ts:94` | **Definition** — `['super-admin', 'admin', 'leader']`. Legitimate role-tier constant. | Document at definition site: "Tenant-level metadata gate; preserved per R-9 until milestone 2." |
| `be/src/shared/config/rbac.ts:102` | `isAdmin(role)` helper that delegates to ADMIN_ROLES | Document inline. |
| `be/src/shared/middleware/auth.middleware.ts:14` | Import | n/a |
| `be/src/shared/middleware/auth.middleware.ts:327` | `allowAdminBypass` branch — used by ownership middleware. **Probably should-be a permission check** but R-9 keeps it for now. | Document: "ADMIN_ROLES preserved per R-9 — admin bypass for ownership; replace with `requirePermission('<key>')` in milestone 2." |
| `be/src/shared/middleware/auth.middleware.ts:381` | Same — second `allowAdminBypass` site | Same comment. |
| `be/src/shared/permissions/legacy-mapping.ts:228` | `AGENTS_MEMORY_ADMIN_ROLES` — different constant (admin+leader+super-admin); unrelated semantic | Out of P6.5 scope; just note it exists. |
| `be/src/shared/db/migrations/20260407062700_phase1_seed_role_permissions.ts:43,92` | Import + use in seed migration | Historical; no doc needed. |
| `be/src/shared/db/migrations/20260407090000_phase02_patch_role_permissions_for_v2_parity.ts:38` | Comment reference | Historical; no doc needed. |

**P6.5 file to create:** `.planning/codebase/ADMIN_ROLES-preservation.md` (one-page ADR-style note explaining why ADMIN_ROLES stays through milestone 1; lists the 3 active sites; references R-9).

**Total inline comment edits: 3** (at rbac.ts:94, auth.middleware.ts:327, auth.middleware.ts:381). Manual is faster than codemod.

## 11. Risks and pitfalls specific to this phase

| # | Risk | Mitigation |
|---|------|------------|
| R-A | **`buildOpenSearchAbacFilters` has no production caller** (§5). Extending it without wiring the caller produces dead code. | P6.3 Wave 0: locate OS query assembly site and add a `read_first` task to confirm it lives in BE. If it lives in `advance-rag/`, escalate before planning further. |
| R-B | **`users.role` default is already `'user'`** (initial_schema.ts:33), not `'member'` as ROADMAP and CONTEXT.md D-01/D-03 claim. The `ALTER DEFAULT` is a no-op; the down migration as specified would CREATE a regression. | See Disagreements §A. Planner: keep migration step for documentation but make down() a no-op (or restore to `'user'`). |
| R-C | **Filter composition risks breaking `bool.filter` semantics.** If P6.3 wraps the grant clause incorrectly (e.g., adds it to `must` instead of `filter`, or accidentally creates `must AND grant` instead of `must OR grant`), zero-grant users could see EMPTY results instead of role-default results. | P6.4 parity test (Case 1) is the gate. Insist that the test uses a real `findActiveForUser` returning `[]` and asserts the OS filter array is **identical** to a baseline captured before the change. |
| R-D | **Grant walk performance at scale.** `findActiveForUser` does an OR across (user-direct, team-membership) with tenant scope. At 10k+ grant rows the dedup'd dataset_id list could blow up the OS `terms` query (default OS limit is 65,536 terms). | Document a soft cap in P6.3 (e.g., warn-and-truncate at 10k unique dataset_ids). Existing indexes (`idx_resource_grants_tenant_id`, `idx_resource_grants_grantee_type_grantee_id`, partial `idx_resource_grants_expires_at`) already cover the walk — no new index needed. |
| R-E | **Test flakiness from OS eventual consistency** — only relevant if P6.4 uses a real OS instance. **Mitigated by recommendation in §6**: pure-function + scratch-DB tests, no real OS. | Use Tier A + Tier B from §6. |
| R-F | **CI grep script false positives on `TeamRole.MEMBER`, test fixtures, and `'member'` substrings in unrelated comments/strings.** | Script must use anchored regex with explicit allowlist. Recommend: `grep -rn "UserRole\.SUPERADMIN\|UserRole\.MEMBER\|: ['\"](superadmin)['\"]" be/src fe/src` plus an exclude file listing TeamRole references. The bare-string grep in CONTEXT.md (`'superadmin'\|'member'`) WILL false-positive on `user_teams.role='member'` literals — needs refinement. |
| R-G | **Duplicate dataset_ids when user has both KB grant and overlapping DocumentCategory grant on same KB.** Behavior: OS `terms` query is set-semantics, so duplicates are harmless but waste bandwidth. | Dedupe in JS via `new Set()` before emitting the clause. Trivial. |
| R-H | **Migration running against a live prod DB with custom role values** (e.g., a tenant added a `'guest'` role through SQL backdoor). The pre-check abort (D-01) handles this — verify the error message lists the offending values so an operator can act. | Pre-check is in §9 example. Confirm error message includes distinct values. |
| R-I | **The unused import `buildOpenSearchAbacFilters` in `chat-conversation.service.ts:42`** could be (a) leftover from prototyping, or (b) a planted hint that the developer intended to wire it. P6.3 should investigate before deleting or wiring. | Wave 0 task: `git log -p` the line to see when/why the import was added. |
| R-J | **`document_category_versions.status` filtering.** §4 SQL example filters on `status='active'` — but the ability semantic might need `status IN ('active','syncing')` or similar. **Planner must confirm the semantic** before locking the SQL. | Read the dataset lifecycle docs in `be/src/modules/knowledge-base/` to confirm which statuses constitute "user-visible". |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| PostgreSQL | P6.1 migration, P6.4 Tier B | Per Docker compose | 17-alpine | Required |
| Knex CLI | P6.1 migration creation | npm script `db:migrate:make` | — | Required |
| OpenSearch | NOT required for tests (per §6 recommendation) | 3.5.0 in compose | — | Mocked OS client in tests |
| Vitest | P6.4 tests | be workspace | — | Required |

No external blocking dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (be workspace) |
| Config file | `be/vitest.config.ts` |
| Quick run command | `npm test -w be -- <pattern>` |
| Full suite command | `npm run test -w be` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TS13 | Zero `'superadmin'` / `UserRole.SUPERADMIN` in `be/src` | grep | `bash scripts/check-legacy-roles.sh` | ❌ Wave 0 (P6.2) |
| TS13 | Migration runs cleanly + idempotent | integration | `npm test -w be -- migrations.test.ts` | ✅ extend existing |
| TS13 | Migration aborts on unknown role values | integration | `npm test -w be -- legacy-role-cleanup.test.ts` | ❌ Wave 0 (P6.1) |
| TS13 | Build clean after enum deletion | type-check | `npm run build -w be` | ✅ |
| TS9 | Zero-grant user → identical filter array (parity) | unit | `npm test -w be -- ability.service.test.ts -t "no grants"` | ⚠️ Replace `it.todo` |
| TS9 | KB grant → dataset_id terms clause emitted | unit | `npm test -w be -- ability.service.test.ts -t "kb grant"` | ⚠️ Replace `it.todo` |
| TS9 | Category grant → dataset_id terms clause via dataset resolution | unit + integration | `npm test -w be -- ability.service.test.ts` + scratch-DB test | ❌ Wave 0 |
| TS9 | `expires_at` past → grant excluded from clause (D-09) | integration | scratch-DB test in `be/tests/permissions/grant-os-filter.test.ts` | ❌ Wave 0 |
| TS9 | Tenant filter remains position 0 in `buildAccessFilters` | unit | existing pattern in `ability.service.test.ts` | ⚠️ Replace `it.todo` |

### Sampling Rate
- **Per task commit:** `npm test -w be -- ability.service.test.ts grant-os-filter.test.ts legacy-role-cleanup.test.ts`
- **Per wave merge:** `npm test -w be -- be/tests/permissions be/tests/shared/services`
- **Phase gate:** `npm run test -w be` + `bash scripts/check-legacy-roles.sh` (must exit 0) + `npm run build -w be`

### Wave 0 Gaps
- [ ] `scripts/check-legacy-roles.sh` — CI grep script (P6.2 D-05)
- [ ] `be/tests/permissions/legacy-role-cleanup.test.ts` — migration up/down + abort-on-unknown
- [ ] `be/tests/permissions/grant-os-filter.test.ts` — scratch-DB tier B test for §6
- [ ] Replace `it.todo()` skeletons in `be/tests/shared/services/ability.service.test.ts:48-58` with real Tier A unit tests
- [ ] Wave 0 investigation task: confirm OS query assembly site (R-A) — no file to create, just a `read_first` directive in P6.3 plan

## 12. Sources

### Primary (HIGH confidence — direct file reads)
- `be/src/shared/services/ability.service.ts` — full file
- `be/src/shared/models/resource-grant.model.ts` — full file
- `be/src/shared/constants/roles.ts` — full file
- `be/src/modules/knowledge-base/models/document-category.model.ts` — full file
- `be/src/shared/db/migrations/20260312000000_initial_schema.ts:33,93,1106-1156` — schema verified
- `be/src/shared/db/migrations/20260408105510_make_resource_grants_kb_id_nullable.ts` — migration pattern
- `be/src/shared/db/seeds/00_sample_users.ts` — full file
- All CONTEXT.md files for phases 1, 2, 4, 6
- Repo-wide grep audits (BE production + BE tests + advance-rag Python)
- `be/CLAUDE.md` + root `CLAUDE.md` — layering rules, no-hardcoded-strings rule

### Tertiary (LOW confidence — needs planner verification)
- `document_category_versions.status` semantic (R-J) — assumed `'active'` but unverified
- Whether `chat-conversation.service.ts:42` import is leftover or hint (R-I)
- Whether OS query body is assembled in BE or in `advance-rag/` (R-A) — **highest-priority unknown**

## Metadata

**Confidence breakdown:**
- File/code findings: HIGH — direct reads, line numbers verified
- Test harness recommendation: MEDIUM — no existing OS integration test precedent; recommendation extrapolates from scratch-DB pattern
- ADMIN_ROLES classification: HIGH — grep results unambiguous
- Migration default discrepancy (Disagreements §A): HIGH — line 33 of initial_schema.ts is unambiguous

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable codebase, no major refactors expected)

---

## Research Notes / Disagreements (Appendix — DO NOT BLOCK PLANNING)

### §A — `users.role` default is already `'user'`, not `'member'`

CONTEXT.md D-01 step 4, D-03, ROADMAP P6.1, and REQUIREMENTS TS13 all assert that `users.role` currently defaults to `'member'` and needs to be flipped to `'user'`. **This is incorrect.**

**Evidence:** `be/src/shared/db/migrations/20260312000000_initial_schema.ts:33`:
```ts
table.text('role').notNullable().defaultTo('user')
```

The line at `:93` (`.defaultTo('member')`) is for **`user_teams.role`**, a different table and a `TeamRole` value that D-04 explicitly preserves.

**Implications:**
1. The `ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user'` step in P6.1 is a **no-op** on current production. Keep it for documentation and as a safety net if a future migration accidentally changes the default.
2. The down migration as specified in D-03 (`SET DEFAULT 'member'`) would **introduce a regression** — it would change the default from `'user'` (correct) to `'member'` (a soon-to-be-invalid value). Planner should override D-03: make `down()` either a no-op or explicitly `SET DEFAULT 'user'`.
3. The `00_sample_users.ts:295` reference flagged in CONTEXT.md D-02 is **`role: 'member'` inside the `user_teams` insert** (line 295 sits inside the `for teamUsers` loop, not the `generateUsers` payload). It is a `TeamRole.MEMBER` value and **must NOT be changed** per D-04. CONTEXT.md D-02 conflates two different `role` columns.
4. The `generateUsers('user', 100, ...)` call at line 182 already produces `role: 'user'` — no seed update needed.

**Recommendation:** Planner should fold this into the P6.1 plan as a clarifying note and proceed without the seed edit. The plan should explicitly call out that "the migration's default flip and the seed update are both no-ops on current code; they exist as documentation and forward-compat guards."

This does not block P6.1 — the UPDATEs (steps 2 + 3) are still necessary to clean any existing prod data with `role='member'` or `role='superadmin'`. Only the default-flip and seed-edit aspects need re-scoping.

### §B — `buildOpenSearchAbacFilters` is currently dead code (R-A)

This is documented in §5 and §11 R-A. Restating here so it is impossible to miss: **the function has no production caller**. P6.3 cannot ship as a pure extension; it must include a wiring step. The planner should treat the OS-call-site investigation as P6.3 Wave 0 Task 1 with explicit `read_first` files.

---

## RESEARCH COMPLETE
