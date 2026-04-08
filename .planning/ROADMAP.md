# ROADMAP — Permission System Overhaul

> Milestone-scoped roadmap. Input to `/gsd:plan-phase`.
> Granularity: standard (7 phases, 3–5 plans each).
> Source requirements: `.planning/REQUIREMENTS.md` (TS1–TS15, SH1–SH4).
> Risks: `.planning/research/RISKS.md` (R-1 to R-12).

## Phases

- [ ] **Phase 1: Schema, Registry, Boot Sync** — Foundation tables, registry scaffolding, no behavior change
- [ ] **Phase 2: Ability Engine + Regression Snapshots** — New DB-backed builder + parity tests against legacy
- [ ] **Phase 3: Middleware Cutover** — `rbac.ts` becomes shim; routes flip to new gates
- [ ] **Phase 4: FE Catalog + `<Can>` Codemod** — Frontend gating migration (largest scope)
- [ ] **Phase 5: Admin UI Rewrite** — Matrix, override editor, KB modal rewire
- [ ] **Phase 6: Legacy Cleanup + OpenSearch Integration** — Alias removal + Strategy A grant filtering
- [ ] **Phase 7: Should-Haves (Versioning + expires_at)** — SH1, SH2 if milestone is on track

---

## Phase Details

### Phase 1: Schema, Registry, Boot Sync
**Goal**: By end of this phase, the DB has all new permission tables, the code-side registry exists for all 22 modules, and boot sync upserts the catalog — with zero user-visible behavior change.
**Depends on**: Nothing
**Requirements**: TS1, TS2, TS3, TS4 (seed only, not enforcement)
**Plans**:
  1. **P1.1 Knex migrations** — Create `permissions`, `role_permissions`, `user_permission_overrides`; rename `knowledge_base_entity_permissions` → `resource_grants`; rename columns `entity_type→resource_type`, `entity_id→resource_id`; add `actions text[]`, `tenant_id` (denormalized, NOT NULL after backfill), `expires_at` columns + indexes + FKs + `UNIQUE(resource_type, resource_id, grantee_type, grantee_id)` constraint
  2. **P1.2 Backfill migration** — Populate `tenant_id` on existing `resource_grants` rows by joining `knowledge_bases`; populate `actions` with sensible default at rename; idempotent. **Out of scope:** the unrelated `knowledge_base_permissions` table (per-tab UI flags) is NOT migrated here.
  3. **P1.3 Registry scaffolding** — `be/src/shared/permissions/registry.ts` with `definePermissions()` helper + type-safe key uniqueness; one `<feature>.permissions.ts` per module (22 files) sourced from `PERMISSION_INVENTORY.md`
  4. **P1.4 Boot sync service** — `be/src/shared/permissions/sync.ts` upserts registry into `permissions` table at boot; logs stale-row removals; idempotent on warm DB
  5. **P1.5 Day-one role seed migration** — Knex migration seeds `role_permissions` from `LEGACY_TO_NEW` mapping in `MIGRATION_PLAN.md` step (b); expands `manage_users` lazy permission per `PERMISSION_INVENTORY.md`
**Parallelization**: P1.1 → (P1.2, P1.3 in parallel) → (P1.4, P1.5 in parallel after P1.1+P1.3)
**Verification**:
  - `npm run db:migrate` clean on fresh DB AND on snapshot with existing `knowledge_base_entity_permissions` rows
  - Migration is reversible (`down()` works)
  - All 22 modules have a registry file; `be` builds clean
  - Restart on synced DB is a no-op (sync logs zero changes)
  - Acceptance test: "Migrating production-snapshot data → all existing KB shares survive as `resource_grants` rows"
**Risks addressed**: R-5 (tenant_id denormalization), R-3 (Peewee non-impact verified)
**Out-of-band concerns**: Human checkpoint after P1.2 — verify backfill row counts match `knowledge_base_entity_permissions` source. NO ROUTE CHANGES in this phase.

---

### Phase 2: Ability Engine + Regression Snapshots
**Goal**: By end of this phase, a new DB-backed `buildAbilityFor()` exists behind a feature flag, and a regression snapshot test suite proves it produces identical CASL rules to the legacy builder for fixed user fixtures — providing the safety net for Phase 3 cutover.
**Depends on**: Phase 1 (needs seeded `role_permissions` + `resource_grants`)
**Requirements**: TS5, TS15 (regression snapshot subset)
**Plans**:
  1. **P2.1 Snapshot legacy ability output** — Vitest fixture suite captures `buildAbilityFor()` output for admin/leader/user/super-admin against the CURRENT `ability.service.ts`; commits JSON snapshots
  2. **P2.2 New DB-backed builder** — `buildAbilityForV2()` reads from `role_permissions` + `user_permission_overrides` (allow + deny precedence) + `resource_grants` filtered by `tenant_id`; preserves super-admin shortcut at line 105
  3. **P2.3 KB → Category cascade synthesis** — V2 builder synthesizes `read` rule on `DocumentCategory` for every KB the user can `read`; write actions stay independent (TS8)
  4. **P2.4 Parity test suite** — Asserts V2 output matches V1 snapshots for every fixture; tests cascade rule, override allow/deny precedence, tenant cross-leak rejection
  5. **P2.5 Versioned cache prefix** — Bump `ABILITY_CACHE_PREFIX` to `ability:v2:<sessionId>` so old cached rules naturally expire; preserve `cacheAbility`/`loadCachedAbility` interface
**Parallelization**: P2.1 must precede P2.4. P2.2 + P2.3 + P2.5 can run in parallel after P2.1.
**Verification**:
  - Snapshot diff between V1 and V2 = empty for all 4 fixture roles
  - Cascade test: KB X view grant → reads all categories in KB X without explicit grants
  - Cascade test: KB X update grant → does NOT imply update on categories
  - Override test: per-user `deny` on `kb.delete` blocks an admin
  - Tenant test: T1 user cannot grant on T2 resource
**Risks addressed**: R-1 (safety net for shim cutover), R-2 (versioned cache prefix), R-6 (test coverage gap closed BEFORE replacement)
**Out-of-band concerns**: V2 builder is NOT yet wired into the request path. Phase 3 does that. Human review of snapshot diffs is mandatory before progressing.

---

### Phase 3: Middleware Cutover
**Goal**: By end of this phase, every mutating route across all 22 BE modules uses `requirePermission(newKey)` or `requireAbility(action, subject)`, `rbac.ts` is a thin generated shim reading from `role_permissions`, and the `permissions` REST API is live.
**Depends on**: Phase 2 (parity proven)
**Requirements**: TS6, TS7, TS14 (audit logs on mutations)
**Plans**:
  1. **P3.1 `rbac.ts` shim conversion** — Rewrite `rbac.ts` to load `role_permissions` at boot and expose the same `hasPermission`/`Permission`/`ADMIN_ROLES` signatures; boot assertion `role_permissions.count > 0`; loose `Permission = string` typing during cutover
  2. **P3.2 Middleware refactor** — `authorize.middleware.ts` exposes `requirePermission(key)` + `requireAbility(action, subject, idParam?)`; both tenant-scoped; unit-tested against in-memory Redis
  3. **P3.3 Route migration sweep** — Flip every mutating route in all 22 BE modules to one canonical gate (no bare `req.user.role` survives); normalize the mixed-mode `users.routes.ts` (R-7); replace `requireRole('admin','leader')` in `knowledge-base.routes.ts:146-153` with `requirePermission('knowledge_base.share')` (R-11)
  4. **P3.4 Permissions module + REST API** — New `be/src/modules/permissions/` (controller/service/model/schemas/routes per BE layering rules); endpoints from TS7 spec; mutations invalidate Redis ability cache + write audit log
  5. **P3.5 Cutover deploy hook** — Deploy script calls `invalidateAllAbilities()` (SCAN-based); document in runbook; add boot-time `assert role_permissions populated`
**Parallelization**: P3.1 + P3.2 in parallel. P3.3 + P3.4 in parallel after P3.1+P3.2. P3.5 last.
**Verification**:
  - Grep for `req.user.role ===` in `be/src/modules/` returns zero
  - Grep for `requireRole` in route files returns zero
  - All 22 modules build + Vitest passes
  - REST API: happy + denied + tenant-cross-leak paths covered
  - Acceptance test: "Day-one user with role admin does every action they could before — Allowed"
**Risks addressed**: R-1 (cutover via shim), R-2 (cache invalidation in deploy), R-7 (mixed-mode normalized), R-8 (manage_users overload split — seed preserves day-one), R-11 (KB share permission), R-12 (verify org-switch invalidates ability cache; add `<orgId>` to key if not)
**Out-of-band concerns**: Production deploy must run `invalidateAllAbilities()` immediately after migration. Spike in 403s within minutes = cache wasn't flushed. **Cutover deploy = highest-risk moment of milestone**.

---

### Phase 4: FE Catalog + `<Can>` Codemod
**Goal**: By end of this phase, the frontend fetches the permission catalog at boot, the Subjects type is aligned to the BE, and every `isAdmin` prop / role-string comparison in `fe/src/` has been mechanically replaced by `<Can>` or `useHasPermission(key)` — with zero visible behavior change.
**Depends on**: Phase 3 (catalog endpoint live)
**Requirements**: TS10, TS11
**Plans**:
  1. **P4.1 FE catalog provider** — `fe/src/lib/permissions.ts` typed map populated from `GET /api/permissions/catalog`; React context provider mounted at app root; `useHasPermission(key)` hook
  2. **P4.2 Subjects type alignment** — `fe/src/lib/ability.tsx` Subjects union: drop legacy `Project`, add `KnowledgeBase`, `Agent`, `Memory`, `DocumentCategory`; FE builds clean
  3. **P4.3 Codemod script** — `scripts/codemod-permissions.mjs` (jscodeshift/ts-morph) replaces `isAdmin` props, `user.role === 'admin'`, `user.role === 'leader'` with `<Can>` wrappers or `useHasPermission(key)` calls; produces a per-file diff for review
  4. **P4.4 Codemod sweep — pages + components** — Run codemod across `fe/src/features/*/pages/`, `fe/src/features/*/components/`, the 10 occurrences in `DocumentTable.tsx`, `StandardTabRedesigned.tsx:371`, etc.; manually fix any cases the codemod can't handle
  5. **P4.5 Codemod sweep — nav + route guards** — `fe/src/layouts/Sidebar.tsx`, `sidebarNav.ts`, `fe/src/app/App.tsx`, `routeConfig.ts`, `AdminRoute.tsx`; replace `teamQueries.ts:292` raw role strings; ESLint rule banning `user.role ===` outside `auth/`
**Parallelization**: P4.1 + P4.2 + P4.3 in parallel. P4.4 + P4.5 in parallel after P4.3.
**Verification**:
  - `grep -r "user.role === 'admin'\|'leader'\|'member'\|'superadmin'" fe/src/` returns zero
  - `grep -r "isAdmin" fe/src/features` returns zero
  - FE builds clean; every gated UI verified by test or screenshot
  - `useHasPermission` hook unit tested
  - Acceptance test: "FE component that previously checked `user.role === 'admin'` now uses `<Can>` and renders identically"
**Risks addressed**: R-4 (FE constants rule violation)
**Out-of-band concerns**: Per-file codemod diffs reviewed by user. ~50 sites across 12 files per research — budget accordingly. **No new role-string comparisons accepted in PRs during this phase.**

---

### Phase 5: Admin UI Rewrite
**Goal**: By end of this phase, an admin can manage roles, per-user overrides, and resource grants entirely from the UI — discovering permissions automatically from the catalog endpoint with no hardcoded enums.
**Depends on**: Phase 4 (catalog + `<Can>` plumbing)
**Requirements**: TS12, TS14 (`whoCanDo` helper used by UI), TS15 (FE matrix tests)
**Plans:** 8 plans
Plans:
- [ ] 5.0a-PLAN.md — BE: make resource_grants.knowledge_base_id nullable (Phase 3 IOU #2; blocks P5.3)
- [ ] 5.0b-PLAN.md — FE: scaffold features/permissions API+Queries layer + install shadcn Command/Popover
- [ ] 5.1-PLAN.md — Role × permission matrix page + route + sidebar nav entry
- [ ] 5.2-PLAN.md — New UserDetailPage with Profile+Permissions tabs, OverrideEditor, EffectivePermissionsPanel
- [ ] 5.3-PLAN.md — Shared ResourceGrantEditor + PrincipalPicker; rewire KB + Entity modals (category branch)
- [ ] 5.4-PLAN.md — i18n parity audit + dark-mode sweep + manual UAT checkpoint
- [ ] 5.5-PLAN.md — Vitest coverage thresholds ≥85% + useHasPermission/<Can> tests
- [ ] 5.6-PLAN.md — Effective Access page (D-11 scope addition — single-feature view via whoCanDo)
**Parallelization**: Wave 0 (5.0a ║ 5.0b) → Wave 1 (5.1 ║ 5.2 ║ 5.3) → Wave 2 (5.4 ║ 5.5) ║ Wave 3 (5.6). Plans in the same wave have non-overlapping files_modified.
**Verification**:
  - Acceptance test: "Admin assigns a permission to a role via the matrix UI → page reloads, permission is reflected"
  - Acceptance test: "Admin can grant a feature-level permission to a role, override it for a user, and grant a category to a team — all from the UI"
  - All admin UI strings present in 3 locales
  - FE coverage on permission UI ≥ 85%
**Risks addressed**: R-10 (admin UI surfaces "changes take effect on next request" notice)
**Out-of-band concerns**: Watch for "permission templates" need emerging during this phase — currently out of scope, revisit only if surfaced.

---

### Phase 6: Legacy Cleanup + OpenSearch Integration
**Goal**: By end of this phase, all legacy role aliases are removed from code and DB, and RAG search results respect resource grants via Strategy A (`dataset_id IN(...)` filter clause).
**Depends on**: Phases 3, 4, 5 (all new code paths must be wired before legacy is removed)
**Requirements**: TS9, TS13
**Plans**:
  1. **P6.1 Legacy alias DB migration** — `UPDATE users SET role='user' WHERE role='member'`; `UPDATE users SET role='super-admin' WHERE role='superadmin'`; alter `users.role` column default `'member'` → `'user'`
  2. **P6.2 Code alias removal** — Delete `UserRole.SUPERADMIN` + `UserRole.MEMBER` from `roles.ts`; replace references in `knowledge-base.service.ts:29`, `sync.controller.ts:71`, `be/tests/{projects,chat,search}/`; leave `TeamRole.MEMBER` alone; grep verification
  3. **P6.3 OpenSearch grant filter (Strategy A)** — Extend `buildOpenSearchAbacFilters` to walk user's `resource_grants` and emit `terms { dataset_id: [...] }` clause; preserve mandatory tenant filter from `buildAccessFilters()` as first clause
  4. **P6.4 OpenSearch integration test** — User with no grants beyond role default → identical results to today; user with category grant → RAG results filter to that KB's chunks; no-grants user → zero chunks from KBs they can't access
  5. **P6.5 Backward-compat shim drop decision** — Decide whether to drop dual-write to old `knowledge_base_entity_permissions` (keep until next milestone per `MIGRATION_PLAN.md` rationale)
**Parallelization**: P6.1 + P6.2 sequential. P6.3 + P6.4 in parallel with P6.1+P6.2.
**Verification**:
  - `grep -r "'member'\|'superadmin'" be/src/ fe/src/` returns zero (excluding `TeamRole`)
  - Migration runs cleanly on snapshot
  - Acceptance test: "User Y has a category grant in KB X → RAG search results filter to that KB's chunks"
  - Acceptance test: "Removing legacy `superadmin`/`member` does not break any code path"
**Risks addressed**: R-9 (deferred to follow-up — `ADMIN_ROLES` stays in shim, documented), legacy cleanup risk
**Out-of-band concerns**: Strategy A only — chunk schema changes are explicitly out of scope. If the next milestone needs Strategy B, R-3 cross-language constants apply.

---

### Phase 7: Should-Haves (Versioning + expires_at)
**Goal**: By end of this phase, the catalog endpoint exposes a version hash that triggers FE refresh, and `expires_at` on `resource_grants` is honored by the ability builder — IF the milestone is on track.
**Depends on**: Phase 6
**Requirements**: SH1, SH2
**Plans**:
  1. **P7.1 Catalog version hash** — `GET /api/permissions/catalog` response includes `version` field (hash of registry contents); FE compares on poll/Socket.IO event and re-fetches on mismatch
  2. **P7.2 `expires_at` enforcement** — Ability builder filters out grants where `expires_at < now()` at query time (preferred over cron sweep); add Vitest case
  3. **P7.3 Optional cron sweeper** — Lightweight scheduled task removes long-expired rows; only if query-time filtering proves insufficient
**Parallelization**: All three independent.
**Verification**:
  - SH1: Adding a permission server-side propagates to a connected client without hard reload
  - SH2: Expired grant is not in CASL rules within one ability rebuild
**Risks addressed**: None new
**Out-of-band concerns**: SH3 (`expires_at` in admin UI) and SH4 (self-service "what can I do" page) remain DEFERRED. Drop this entire phase if Phase 6 slips.

---

## Coverage Table — Requirements to Phases

| Req | Phase | Notes |
|---|---|---|
| TS1 (DB schema + rename + tenant_id denorm) | Phase 1 | P1.1, P1.2 |
| TS2 (registry in code) | Phase 1 | P1.3 |
| TS3 (boot-time sync) | Phase 1 | P1.4 |
| TS4 (day-one role mapping seed) | Phase 1 | P1.5 |
| TS5 (unified ability engine + regression snapshot) | Phase 2 | P2.1–P2.5 |
| TS6 (authorize middleware) | Phase 3 | P3.2, P3.3 |
| TS7 (resource-grant CRUD API) | Phase 3 | P3.4 |
| TS8 (KB → Category cascade for view) | Phase 2 | P2.3 (built into V2 builder) |
| TS9 (OpenSearch Strategy A filter) | Phase 6 | P6.3, P6.4 |
| TS10 (FE catalog + gates) | Phase 4 | P4.1, P4.2 |
| TS11 (FE codemod sweep) | Phase 4 | P4.3, P4.4, P4.5 |
| TS12 (admin UI rewrite) | Phase 5 | P5.1, P5.2, P5.3, P5.4 |
| TS13 (legacy alias cleanup) | Phase 6 | P6.1, P6.2 |
| TS14 (audit & observability + whoCanDo) | Phase 3 | P3.4 (audit) + helper used in Phase 5 |
| TS15 (tests — BE + FE) | Phases 2, 3, 5 | P2.4 (regression), P3.2 (middleware), P3.4 (CRUD), P5.5 (FE) |
| SH1 (catalog versioning) | Phase 7 | P7.1 |
| SH2 (expires_at backend) | Phase 7 | P7.2, P7.3 |
| SH3 (expires_at in admin UI) | DEFERRED | Stretch — out of scope unless surplus |
| SH4 (self-service "what can I do") | DEFERRED | Stretch — out of scope unless surplus |

**Coverage:** 15/15 TS + 2/4 SH mapped. SH3, SH4 explicitly deferred per REQUIREMENTS.md.

## Risk Coverage Table

| Risk | Mitigated In | How |
|---|---|---|
| R-1 `rbac.ts` shim during cutover | Phases 2, 3 | P2.1–P2.4 snapshot proves parity BEFORE P3.1 ships shim |
| R-2 Redis cache stale post-deploy | Phases 2, 3 | P2.5 versioned prefix `ability:v2:`; P3.5 deploy-time `invalidateAllAbilities()` |
| R-3 Peewee parallel role columns | Phase 1 | Verified non-issue; documented; P1 makes no Python changes |
| R-4 FE hardcoded role strings | Phase 4 | P4.3 codemod + P4.5 ESLint rule |
| R-5 `tenant_id` consistency on grants | Phase 1 | P1.1 NOT NULL + CHECK constraint; P1.2 backfill |
| R-6 Test coverage gap on `ability.service` | Phase 2 | P2.1 snapshots + P2.4 parity suite BEFORE replacement |
| R-7 Mixed-mode middleware in `users.routes.ts` | Phase 3 | P3.3 normalization sweep |
| R-8 `manage_users` overloaded as writer gate | Phases 1, 3 | P1.5 day-one seed preserves behavior; P3.3 splits to per-feature keys |
| R-9 `requireOwnership` admin bypass | Phase 6 | Documented as follow-up; `ADMIN_ROLES` stays in shim |
| R-10 Permission changes need session refresh | Phases 3, 5 | P3.4 cache invalidation on mutation; P5 admin UI surfaces notice |
| R-11 KB member CRUD uses `requireRole` | Phase 3 | P3.3 replaces with `requirePermission('knowledge_base.share')` |
| R-12 Cache key missing `tenant_id` | Phase 3 | P3.5 verify org-switch path; add `<orgId>` to key if needed |

**Coverage:** 12/12 risks mapped.

## Dependency DAG

```
                    Phase 1 (Schema + Registry + Boot Sync)
                         |
                         | (seeded role_permissions, tables exist)
                         v
                    Phase 2 (V2 Builder + Regression Snapshots)
                         |
                         | (parity proven, V2 ready behind flag)
                         v
                    Phase 3 (Middleware Cutover + REST API)
                         |
                         | (catalog endpoint live, BE fully migrated)
                         v
                    Phase 4 (FE Catalog + Codemod)
                         |
                         | (Subjects aligned, <Can> rolled out)
                         v
                    Phase 5 (Admin UI Rewrite)
                         |
                         | (UI manages all permission state)
                         v
                    Phase 6 (Legacy Cleanup + OpenSearch Strategy A)
                         |
                         | (no legacy aliases, RAG respects grants)
                         v
                    Phase 7 (SH1 versioning + SH2 expires_at)  [optional]
```

**Critical path:** Phase 1 → 2 → 3 → 4 → 5 → 6. Phase 7 only if budget remains.
**No phase may be skipped.** Phases 4 + 5 are sequential due to admin UI depending on `<Can>` plumbing.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema, Registry, Boot Sync | 0/5 | Not started | - |
| 2. Ability Engine + Snapshots | 0/5 | Not started | - |
| 3. Middleware Cutover | 0/5 | Not started | - |
| 4. FE Catalog + Codemod | 0/5 | Not started | - |
| 5. Admin UI Rewrite | 0/5 | Not started | - |
| 6. Legacy Cleanup + OpenSearch | 0/5 | Not started | - |
| 7. Should-Haves | 0/3 | Not started | - |

---

*Generated 2026-04-07. Input to `/gsd:plan-phase`.*
