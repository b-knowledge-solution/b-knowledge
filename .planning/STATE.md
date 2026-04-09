---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-04-09T11:10:00.000Z"
---

# Project State

> Loaded by every GSD command. Keeps cross-session context lean and current.
> Updated by `/gsd:transition`, `/gsd:complete-milestone`, and other workflow commands.

## Project

**Name:** B-Knowledge — Permission System Overhaul
**Type:** Brownfield extension of an existing monorepo
**Primary directory:** `/mnt/d/Project/b-solution/b-knowledge`
**Initialized:** 2026-04-07

## Current Milestone

**M1 — Permission System Overhaul**
Consolidate the two coexisting authorization systems (static `rbac.ts` + CASL `ability.service.ts`) into a single CASL engine fed from a DB-backed permission registry, with feature-level coverage across all 22 BE modules and resource-grant scoping for KnowledgeBase + DocumentCategory.

**Status:** Phase 6 execution complete; verification debt remains before milestone close

## Active Phase

**None.** Phase 6 execution is complete. The remaining milestone blocker is earlier verification debt: Phase 3 still needs verification + UAT in a session with Docker/Postgres available. After that, decide whether optional Phase 7 should be planned or the milestone should be closed.

## Phase Pipeline

| # | Name | Status | Plans | Depends on |
|---|---|---|---|---|
| 1 | Schema, Registry, Boot Sync | ✓ DONE (verified PASS, 5/5; UAT 5/5) | 6 (P1.0–P1.5) | — |
| 2 | Ability Engine + Regression Snapshots | ✓ DONE (verified PASS, 5/5; UAT 5/5 zero bugs) | 7 (P2.0, P2.6, P2.1, P2.2.0, P2.2, P2.4, P2.5) + 1 patch | P1 |
| 3 | Middleware Cutover | ✓ EXECUTION DONE (28 commits) — verification + UAT pending | 21 (P3.0a-d, P3.1a-d, P3.2a-d, P3.3a-c, P3.4a-d, P3.5a-d) + dispatched as 5 waves | P2 |
| 4 | FE Catalog + `<Can>` Codemod | ✓ DONE | 5 plans completed + summaries committed | P3 |
| 5 | Admin UI Rewrite | ✓ DONE | 8 plans completed + summaries committed | P4 (partial) |
| 6 | Legacy Cleanup + OpenSearch Integration | ✓ EXECUTION DONE | 5 plans completed + summaries committed | P3 |
| 7 | Should-Haves (SH1, SH2) | Optional | — | P6 |

## Phase 6 Outcome

- **8 commits** across 3 waves after the planning handoff already in the repo
- **Legacy aliases removed** from code and data: `member -> user`, `superadmin -> super-admin`
- **Repo guardrail shipped**: `npm run check:legacy-roles`
- **Grant-aware retrieval path shipped**: `resolveGrantedDatasetsForUser()` now expands KB and category grants into dataset IDs used by chat retrieval
- **Validation closed** with:
  - unit coverage for grant resolution in `be/tests/shared/services/ability.service.test.ts`
  - scratch-DB integration coverage in `be/tests/permissions/grant-dataset-resolution.test.ts`
- **ADMIN_ROLES deferral documented** rather than silently preserved, via inline comments and `.planning/codebase/ADMIN_ROLES-preservation.md`

### Phase 6 carry-forward notes

1. **Broad `tests/chat/` suite still red** — failures observed while validating 6.3 were pre-existing mock-drift issues outside the Phase 6 diff. They remain a general backend test debt item, not a phase blocker.
2. **ROADMAP / STATE drift corrected manually** — the repo's `.planning` layout does not match the stock `gsd-tools` assumptions (`phase-*` vs `.planning/phases/`), so progress routing and plan counting must continue to be verified against the actual files.
3. **Phase 7 remains optional** — no planning has been done for SH1/SH2 after Phase 6 completion. Milestone close should decide whether to execute it or defer it cleanly.

## Phase 3 Outcome

**THIS IS THE ONLY PHASE IN THE MILESTONE WITH REAL PRODUCTION BEHAVIOR CHANGE.** The V2 ability engine became the production default at commit `1f6962d` (Wave 2 P3.2b). Every previous phase deferred behavior change behind a feature flag; this phase flipped it. Rollback is `USE_ABILITY_ENGINE_V2=false`.

- **28 commits** across 5 waves
- **Route sweep**: 62 missing-gate offenders → **0** in ENFORCING mode (permanent CI gate)
- **177 mutating routes** scanned across 34 route files; every one has `requirePermission` / `requireAbility` / `markPublicRoute`
- **2 latent bugs fixed** by Wave 1 + Wave 3:
  - **Row-scoped CASL over-allow** at `auth.middleware.ts:377` — silent privilege escalation: bare-string `ability.can('read', 'KnowledgeBase')` was returning `true` whenever ANY rule existed on the class, including row-scoped rules for OTHER ids. Fix: use CASL's `subject(name, instance)` helper to wrap the id into the conditions object. Regression test in `auth-middleware.test.ts`.
  - **Mixed-mode auth** in `users.routes.ts:49,58,93` — both `requirePermission('manage_users')` and `requireAbility('manage','User')` were on the same routes. Normalized to `requireAbility('edit','User','id')` per locked decision D1. P3.0d before-image snapshot proves no fixture's effective permissions changed.
- **New middleware**: `requirePermission(key)` and `requireAbility(action, subject, idParam?)` (Wave 1)
- **New service**: `RolePermissionCacheService` with atomic-swap concurrency pattern (Wave 2 — 5/5 race tests pass)
- **`rbac.ts::hasPermission` shim** — Wave 2 converted to read from boot-cached `role_permissions` snapshot. The legacy `ROLE_PERMISSIONS` map still exists but is unused; Phase 6 removes it.
- **Boot deploy guardrails**: fail-fast on empty `actions[]` in `resource_grants` (production only); drift warnings on role_permissions / user_permission_overrides vs catalog (Wave 2 P3.2c)
- **New module** `be/src/modules/permissions/`: 10 admin CRUD endpoints + `whoCanDo` introspection helper. Strict layering preserved (controller → service → model); the atomic role-replace transaction lives in `RolePermissionModel.replaceForRole` per the rule that services never use `db.transaction()` directly. (Wave 4)
- **`feedback.submit`** seed migration added for all 4 roles (Wave 5 closing the gap from the Wave 3 feedback executor's `markPublicRoute()` workaround)
- **Legacy `legacyRequirePermission` deleted** (Wave 5) — registry-missing keys now hard-error instead of falling through. The cutover is irreversible at the code level.

### Phase 3 cutover commit (the moment behavior changes)

`1f6962d` — `feat(permissions): flip V2 default and add boot deploy guardrails`

Rollback knob: `USE_ABILITY_ENGINE_V2=false` env var. Even after this commit lands, setting the env var reverts to V1. Wave 5's deletion of `legacyRequirePermission` does NOT remove the V1 ability builder itself — only the legacy middleware. So the rollback knob still works.

### Carry-forward IOUs from Phase 3

1. **`invalidateAllSessionsForUser(userId)` not implemented** — single-user override/grant mutations currently call `invalidateAllAbilities()` (correct but inefficient). Adding the per-user variant requires reverse-indexing the Redis session store by user id. Phase 5 perf optimization.
2. **`resource_grants.knowledge_base_id` is NOT NULL** — restricts grant creation to `resource_type === 'KnowledgeBase'`. Phase 5 schema migration to make it nullable so `DocumentCategory`-only grants work.
3. **`be/src/shared/models/` is gitignored** (latent project bug surfaced during Wave 4) — every Phase 1+2+3 commit had to use `git add -f` for files in this directory. Needs a one-line `.gitignore` cleanup.
4. **Permissions module HTTP-layer integration tests deferred** — Wave 4 shipped 5 model+service tests but skipped full Express harness with session store. Add in Phase 5 or as dedicated test plan.
5. **DB-bound test verification deferred** — Docker was unreachable from this session for most of Wave 3-5. Route-sweep + build pass; the DB-touching tests (parity matrix, cascade, override-precedence, tenant-isolation, models, middleware) need to be re-run with Postgres up before Phase 3 transitions.
6. **`chat-embed.controller.ts` doc-comment cleanup** — Wave 5 deviation #1 noted but did not address.
7. **Phase 1's `.gitignore` issue applies to all phases**, not just Phase 3 — every commit that added a file under `be/src/shared/models/` may need re-tracking after the `.gitignore` fix.

## Phase 2 Outcome

- **89 tests passing** across 16 test files (Phase 1: 5 files / 34 tests; Phase 2: 11 files / 55 tests)
- **buildAbilityForV2** behind feature flag `config.permissions.useV2Engine` (defaults `false` — V1 still active)
- **3 new models**: `UserPermissionOverrideModel`, `ResourceGrantModel`, extended `RolePermissionModel.findByRoleWithSubjects` — all SQL-side `expires_at` filtering
- **Per-fixture parity matrix**: 135 tuples (super-admin 1, admin 65, leader 55, user 14) — V1 and V2 produce identical CASL decisions across the V1-relevant subject set
- **Subject scoping locked decision C**: parity matrix scoped per-fixture to V1's actual rule emission (not the union); V2 emitting more rules for subjects V1 never touched is intentional
- **Cache prefix bumped** to `'ability:v2:'` so old V1-shaped Redis entries naturally rotate at cutover
- **5 callers updated** for the new async signature: `auth.controller.ts:65,474,566`, `auth.middleware.ts:366`, `chat-conversation.service.ts:1022`
- **Two Phase 1 over-grants caught and fixed** by the parity matrix:
  - Leader was missing `manage_knowledge_base` expansion + agents/memory keys (V1 grants these via hard-coded if blocks; the legacy ROLE_PERMISSIONS map didn't reflect that)
  - Leader was *over-granted* `datasets.share/reindex/advanced` (which the registry declares with `action: 'manage'`); patched out
- See `.planning/phase-02-ability-engine-regression-snapshots/VERIFICATION.md` for full evidence

### Carry-forward IOUs from Phase 2

1. **`AGENTS_MEMORY_ADMIN_ROLES` amendment** — locked decision changed from "admin + super-admin only" to include `leader`. Documented in `legacy-mapping.ts` with rationale (V1 already grants this via `ability.service.ts:173-174`; preserving zero behavior change). Worth revisiting in a future milestone.
2. **`as any` casts on V2 condition objects** at `ability.service.ts:286,318` — CASL's `MongoQuery<subject>` rejects arbitrary keys for string-literal subjects. V1 has the same casts. Phase 4 could introduce per-subject row interfaces.
3. **Subjects type drift** between BE (27 subjects in `ability.service.ts`) and FE (`fe/src/lib/ability.tsx` still has legacy `'Project'`). **Phase 4 must reconcile.**
4. **Chain-idempotency contract change** — after the P2.4 patch migration, the canonical idempotent unit is the full migration chain, not any single migration. The P1.5 seed in isolation is no longer idempotent because the chain re-applies its over-grants. This is documented in `role-seed.test.ts`.
5. **Team-membership deferred to Phase 5** — V2's `findActiveForUser` resource_grants call passes empty `teamIds: []`. Marked TODO at `ability.service.ts:263-267`.
6. **Per-fixture matrix tuple counts** are the human-review-gate evidence — Phase 3 reviewer should spot-check 2-3 of the snapshot files before flipping the flag.
7. **Legacy `permission_level` rows in `resource_grants`** are logged-and-skipped by V2 at `ability.service.ts:272-279`. Phase 3 deploy hook should fail-fast on any unbackfilled rows in production.
8. **Vitest test count "89" is runtime-expanded** via `it.each` from a smaller set of static `it()` declarations. Not a blocker but Phase 3 readiness script should verify the actual count.
9. **Snapshot normalizer `MANAGE_EXPANSION`** is now registry-derived instead of hardcoded — no maintenance burden for new custom actions.

## Phase 1 Outcome

- **34/34 permissions tests passing** (5 suites: migrations, backfill, registry, sync, role-seed)
- **81 permissions** registered across 21 BE modules
- **209 day-one role_permissions rows** seeded (super-admin 80, admin 80, leader 46, user 3)
- **Zero user-visible behavior change** — no routes, middleware, services, FE, or `rbac.ts` touched
- Boot sync wired at `be/src/app/index.ts:168` between migrations and root-user bootstrap, fail-safe via try/catch
- See `.planning/phase-01-schema-registry-boot-sync/VERIFICATION.md` for full evidence

### Carry-forward IOUs (from Phase 1 verification)

1. **129 pre-existing BE test failures** — unrelated to Phase 1, but worth a dedicated cleanup phase. Phase 1 added zero new failures.
2. **sync.test.ts typed-cast hack** — temporarily reassigns `ModelFactory.permission`'s `knex` field for scratch-DB isolation. The clean fix is a per-test ModelFactory instance; deferred.
3. **NULL-distinct workaround in P1.5 seed** — relies on app-layer pre-filter. Postgres 15+ `NULLS NOT DISTINCT` could simplify in a future migration.
4. **Snapshot baselining** — `role-seed.test.ts` uses `toMatchSnapshot()` which becomes a tripwire whenever the registry changes; intentional but worth documenting.
5. **Boot sync failure mode** — currently logs and continues. After Phase 3 cutover (when CASL becomes the active auth path), revisit and consider making sync failures fatal.
6. **`subject` field semantics** — every `.permissions.ts` file declares a subject string; Phase 2 must align these with CASL Subjects type and reconcile FE/BE drift (Subjects in `fe/src/lib/ability.tsx` still has legacy `Project`).

## Configuration

- **Mode:** YOLO (auto-approve)
- **Granularity:** standard (5–8 phases, 3–5 plans each)
- **Parallelization:** enabled
- **Commit docs:** yes
- **Model profile:** quality (Opus for research/roadmap, Sonnet for others)
- **Workflow agents:** research ✓ · plan-check ✓ · verifier ✓ · nyquist-validation ✓ · auto-advance ✓

## Recommended Next Action

1. Bring Docker/Postgres up and run Phase 3 verification/UAT that was deferred earlier.
2. If that passes, choose between:
   - planning/executing optional Phase 7, or
   - closing the milestone with Phase 7 explicitly deferred.

## Locked Decisions (from questioning + research)

| Topic | Decision |
|---|---|
| Engine | Single CASL engine fed from DB catalog (kill static `rbac.ts`) |
| Permission model | RBAC + per-user allow + deny overrides |
| Resource grants (this milestone) | KnowledgeBase + DocumentCategory; per-Document next milestone |
| Resource grant table | Rename + extend existing `knowledge_base_entity_permissions` → `resource_grants` |
| `manage` action | Derived only — registry has view/create/edit/delete |
| KB → Category cascade | Cascade for `read`; independent for write actions |
| OpenSearch integration | Strategy A — translate grants → `dataset_id` IN-list; no chunk schema changes |
| Super-admin tenant scope | Stays cross-tenant `manage all` |
| Catalog delivery | Runtime fetch via `GET /api/permissions/catalog` |
| FE rollout | Codemod-assisted migration from `isAdmin` prop drilling → `<Can>` |
| Legacy aliases | Remove `superadmin` (no hyphen) and `member` from code + DB default |
| Schema changes | All via Knex migrations |

## Key Artifacts

- `.planning/PROJECT.md` — context, core value, evolution rules
- `.planning/REQUIREMENTS.md` — TS1–TS15 + SH1–SH4 + acceptance test matrix
- `.planning/ROADMAP.md` — 7 phases, plans, dependency DAG, risk mapping
- `.planning/config.json` — workflow preferences
- `.planning/codebase/` — codebase map (7 docs)
- `.planning/research/` — investigation outputs (7 docs)

## Git State

### Initialization

| Commit | What |
|---|---|
| `8666102` | docs: initialize permission-system overhaul project (PROJECT.md) |
| `cc0b9e8` | chore: add project config (config.json) |
| `a9dc8a0` | docs: add permission overhaul research |
| `7a28e93` | docs: add permission overhaul requirements |
| `62be50a` | docs: add permission overhaul roadmap |
| `b749d35` | docs: initialize project state |

### Phase 1 (planning)

| Commit | What |
|---|---|
| `e614355` | docs(phase-1): add research |
| `17c98fe` | docs(phase-1): amend schema decisions from research |
| `ec741b6` | docs(phase-1): add plan |
| `f243c5d` | docs(phase-1): apply plan-checker fixes |
| `0c13666` | docs(phase-1): amend PLAN.md schema (subject col, tenant_id, effect in unique) |

### Phase 1 (execution)

| Commit | What |
|---|---|
| `f2f8cfb` | chore(tests): scaffold be/tests/permissions/ + scratch-DB helper for Phase 1 |
| `06faab0` | chore(test): register tsx ESM loader for vitest forks so Knex can load .ts migrations |
| `b4cdf6c` | feat(db): add permission tables and rename entity_permissions → resource_grants |
| `53c069a` | fix(test): repair P1.1 migration test fixtures and roundTrip helper |
| `cae200b` | feat(db): backfill tenant_id and actions on resource_grants |
| `6727911` | feat(permissions): scaffold per-module permission registry for all 21 BE modules |
| `9c71d24` | feat(permissions): add Permission/RolePermission models and boot-time catalog sync |
| `6be5e68` | feat(permissions): seed day-one role permissions from legacy ROLE_PERMISSIONS map |
| `1cd4806` | docs(phase-1): verification — PASS, 5/5 requirements met |
| `f8f7482` | fix(permissions): load registry side-effects via barrel + empty-registry sanity assertion (UAT bug) |
| `49f704b` | docs(phase-1): UAT report — 5/5 pass |

### Phase 2 (planning)

| Commit | What |
|---|---|
| `b4057ca` | docs(phase-2): research — 7 red flags |
| `c6ea719` | docs(phase-2): add executable plan |
| `2483b75` | docs(phase-2): apply plan-checker refinements |
| `4b06e4d` | docs(phase-2): lock decision C — subject-scope parity matrix |

### Phase 2 (execution)

| Commit | What |
|---|---|
| `5c6a21a` | test(permissions): scaffold Phase 2 fixtures, serializeRules, iterateMatrix helpers |
| `e53b3ec` | feat(permissions): seed dataset.view + documents.view for user/leader (R-A fix) |
| `d7815f9` | test(permissions): capture V1 ability rule snapshot per fixture (drift tripwire) |
| `64f2947` | feat(models): add UserPermissionOverride + ResourceGrant models, extend RolePermission |
| `d2e81ba` | feat(permissions): add buildAbilityForV2 behind feature flag |
| `566e5a4` | feat(permissions): bump ABILITY_CACHE_PREFIX to ability:v2: (R-2 mitigation) |
| `6cac9be` | test(permissions): Phase 2 parity matrix + 6 V1↔V2 reconciliation patches |
| `cd9b5f6` | docs(phase-2): verification — PASS, 5/5 requirements met |
| `aa49b1e` | docs(phase-2): UAT report — 5/5 pass, zero bugs |

### Phase 3 (planning)

| Commit | What |
|---|---|
| `53d0b6f` | docs(phase-3): research — 7 red flags, 2 existing bugs |
| `dfe3ff1` | docs(phase-3): add executable plan (21 plans, 85 tasks, 6 waves) |
| `0f7cba2` | docs(phase-3): apply plan-checker refinements |

### Phase 3 (execution)

| Wave | Commit | What |
|---|---|---|
| W0 | `877d1fd` | feat(permissions): add permissions.view/manage keys for new admin module gates |
| W0 | `b2d7ec6` | test(permissions): add route-sweep-coverage gate + markPublicRoute helper (62-offender baseline) |
| W0 | `bf713f5` | test(auth): add org-switch cache invalidation regression test (R-12 already mitigated) |
| W0 | `56881f6` | test(permissions): freeze V2 effective permissions on User subject (P3.0d before-image for D1) |
| W0 | `6b69a35` | chore(test): bump vitest testTimeout to 90s for growing migration chain |
| W1 | `b3aa880` | feat(auth): new requirePermission/requireAbility middleware with row-scoped CASL fix (LATENT BUG: over-allow) |
| W2 | `b76c0e7` | refactor(rbac): convert hasPermission to sync shim over boot-cached role_permissions snapshot |
| **W2** | **`1f6962d`** | **feat(permissions): flip V2 default and add boot deploy guardrails** ⭐ **CUTOVER** |
| W3 | `3c43c4c` | refactor(chat): migrate routes to new permission middleware (11 gates) |
| W3 | `31ada02` | refactor(search): migrate routes to new permission middleware (11 gates) |
| W3 | `802a7ca` | refactor(glossary): migrate routes to new permission middleware (9 gates) |
| W3 | `1a343e0` | refactor(code-graph): migrate routes to new permission middleware (2 gates) |
| W3 | `bb8d235` | refactor(rag): migrate routes to new permission middleware (25 gates — scope expansion) |
| W3 | `041da3f` | refactor(memory): migrate routes to new permission middleware (8 gates) |
| W3 | `d6c9828` | refactor(external): migrate routes to new permission middleware (6 gates) |
| W3 | `f9b1f45` | refactor(auth): gate session-mutation routes with requirePermission or markPublicRoute (5 gates) |
| W3 | `36eac29` | refactor(knowledge-base): migrate routes to new permission middleware (4 gates with row-scoped requireAbility) |
| W3 | `f1fcd0e` | refactor(agents): migrate routes to new permission middleware (2 gates) |
| W3 | `ba39c34` | refactor(broadcast): migrate routes to new permission middleware (1 gate) |
| W3 | `7c83373` | refactor(feedback): migrate routes to new permission middleware (1 gate) |
| W4 | `7f80229` | feat(permissions): admin CRUD module for roles, overrides, grants + whoCanDo helper |
| W5 | `17df109` | refactor(chat): migrate chat-assistant + chat-embed routes (8 more legacy strings) |
| W5 | `c3a4949` | feat(permissions): seed feedback.submit for all roles (Phase 3 P3.5 follow-up) |
| W5 | `390f75a` | refactor(feedback): replace markPublicRoute workaround with requirePermission('feedback.submit') |
| W5 | `bd30dd6` | chore(auth): remove legacyRequirePermission middleware after Phase 3 cutover |
| W5 | `ad6502b` | test(permissions): flip route-sweep gate to enforcing mode (Phase 3 exit) |

## Key Risks (top 5 — full list in research/RISKS.md)

| ID | Risk | Mitigated in |
|---|---|---|
| R-1 | Static `rbac.ts` shim cutover may cause 401s mid-deploy | Phase 3 (with Phase 2 regression snapshots as safety net) |
| R-2 | Redis ability cache must be invalidated globally on rollout | Phase 2 (cache prefix bump) + Phase 3 cutover |
| R-5 | `document_categories` has no `tenant_id` — naive grants force 3-table join | Phase 1 (denormalize at insert) |
| R-7 | FE has ~50 sites of `isAdmin` prop drilling, type drift between BE/FE Subjects | Phase 4 (codemod) |
| R-8 | Mixed-mode auth in `users.routes.ts` (uses both `requirePermission` and `requireAbility`) | Phase 3 (normalize to canonical form) |

## Next Action

Run `/gsd:plan-phase 1` to plan the foundation phase (schema, registry, boot sync).

---
*Last updated: 2026-04-07 after roadmap completion.*
