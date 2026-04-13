---
phase: 03-middleware-cutover
type: execute
requirements: [TS6, TS7, TS14]
autonomous: false
must_haves:
  truths:
    - "Every mutating route in 22 BE modules is gated by requirePermission or requireAbility"
    - "V2 ability engine is the default (config.permissions.useV2Engine = true)"
    - "Row-scoped grants actually match instance checks (existing bug 1 fixed)"
    - "users.routes.ts mixed-mode normalized (existing bug 2 fixed)"
    - "Permissions module CRUD API exists with audit logs and cache invalidation"
    - "route-sweep-coverage.test.ts is green across all 22 modules"
    - "Org-switch invalidates ability cache"
    - "Boot guardrails fail-fast on bad permission data"
  artifacts:
    - path: be/src/modules/permissions/permissions.permissions.ts
      provides: "permissions.view + permissions.manage registry keys"
    - path: be/src/shared/db/migrations/*_seed_permissions_module_keys.ts
      provides: "Knex seed granting new keys to admin/super-admin"
    - path: be/src/shared/middleware/auth.middleware.ts
      provides: "New requirePermission + requireAbility (row-scoped fix)"
    - path: be/src/shared/middleware/__tests__/route-sweep-coverage.test.ts
      provides: "Programmatic gate for un-gated mutations"
    - path: be/src/modules/permissions/{controller,service,model,routes,schemas,index}.ts
      provides: "TS7 CRUD API"
    - path: be/src/shared/config/rbac.ts
      provides: "Sync shim over boot-cached role_permissions snapshot"
  key_links:
    - from: "auth.middleware.ts:requireAbility"
      to: "CASL ability.can"
      via: "subject(name, {type, id}) helper"
      pattern: "subject\\(.*req\\.params"
    - from: "permissions controller mutations"
      to: "auditLogService + invalidateAbility"
      via: "service layer"
      pattern: "invalidateAbility|invalidateAllAbilities"
    - from: "auth.controller.ts org-switch"
      to: "invalidateAbility(req.sessionID)"
      via: "post-update hook"
      pattern: "invalidateAbility"
---

<objective>
Phase 3: Middleware Cutover. Replace all mutating routes' auth gates with the new
requirePermission/requireAbility middleware, fix the 2 existing bugs, ship the
permissions module CRUD API (TS7), wire audit logging on mutations (TS14), and
flip the V2 ability engine to default.
</objective>

<context>
@.planning/REQUIREMENTS.md
@.planning/ROADMAP.md
@.planning/phase-03-middleware-cutover/3-RESEARCH.md
@.planning/research/EXISTING_AUTH_SURFACE.md
@.planning/research/PERMISSION_INVENTORY.md
@.planning/research/RISKS.md
@.planning/phase-02-ability-engine-regression-snapshots/PLAN.md
@.planning/phase-02-ability-engine-regression-snapshots/2-RESEARCH.md
@.planning/phase-02-ability-engine-regression-snapshots/2-UAT.md
@be/src/shared/services/ability.service.ts
@be/src/shared/middleware/auth.middleware.ts
@be/src/shared/config/rbac.ts
@be/src/shared/permissions/index.ts
@be/src/shared/permissions/registry.ts
@be/CLAUDE.md
</context>

# Plan P3.0a — Permissions Module Registry + Seed
**Wave:** 0 | **Depends on:** none
**Goal:** Add permissions.view/permissions.manage keys to a new registry file and seed them to admin roles.
**Inputs:** `be/src/shared/permissions/registry.ts`, existing `*.permissions.ts` files for shape reference, `be/src/shared/db/migrations/` for seed pattern.
**Outputs:**
- `be/src/modules/permissions/permissions.permissions.ts` (new)
- `be/src/shared/db/migrations/{ts}_seed_permissions_module_keys.ts` (new)
- `be/src/shared/permissions/registry.ts` (edit — register new module)

**Tasks:**
1. Create `permissions.permissions.ts` exporting two keys with subject `'PermissionCatalog'` (chosen for clarity vs. plural ambiguity). Document subject choice in JSDoc.
2. Wire registration in `registry.ts` barrel.
3. Create Knex migration that inserts `(role_id, permission_key)` rows into `role_permissions` for `admin` + `super-admin` roles, both keys. Idempotent via `ON CONFLICT DO NOTHING`.
4. Verify catalog total moves 110 → 112.

**Tests:** `be/src/modules/permissions/__tests__/registry.test.ts` — assert both keys present, subject is `'PermissionCatalog'`, catalog count = 112.
**Verification:** `npm run db:migrate -w be` clean; registry test green.
**Commit:** `feat(permissions): add permissions.view/manage registry keys + seed`

---

# Plan P3.0b — route-sweep-coverage.test.ts (D3)
**Wave:** 0 | **Depends on:** none
**Goal:** Programmatic walker asserting every POST/PUT/PATCH/DELETE route has a permission gate or explicit public marker.
**Inputs:** `be/src/modules/*/routes/*.routes.ts`, EXISTING_AUTH_SURFACE.md.
**Outputs:**
- `be/src/shared/middleware/__tests__/route-sweep-coverage.test.ts` (new)
- `be/src/shared/middleware/markPublicRoute.ts` (new — annotation helper)
- `be/src/shared/middleware/__tests__/public-route-allowlist.ts` (initial allowlist)

**Tasks:**
1. Implement `markPublicRoute()` no-op tagging middleware that the walker recognizes by function name.
2. Walker uses `ts-morph` (already in devDeps per research §3) to parse route files, extract POST/PUT/PATCH/DELETE registrations, scan their middleware chain for `requirePermission`, `requireAbility`, or `markPublicRoute`.
3. **Param-name correctness check** — when the walker finds a `requireAbility(action, subject, idParam)` call where `idParam` is the third arg (string literal), it must extract the route's path string and assert `idParam` is one of the actual `:param` tokens in the path. Example: `router.put('/users/:id', requireAbility('edit','User','id'))` is OK; `router.put('/users/:id', requireAbility('edit','User','userId'))` fails because `userId` is not a token in `/users/:id`. This catches the typo class of bug that would otherwise only surface as runtime "id is undefined" denials.
4. Initial allowlist hardcodes only login/health/oauth-callback routes.
5. Test starts in **report-only mode** initially (logs offenders, fails the test with the count). End of Phase 3 it must report 0.

**Tests:** the file IS the test.
**Verification:** Test exists, runs, currently red with the un-gated count (expected). End of Phase 3 must be green.
**Commit:** `test(permissions): add route-sweep-coverage gate + markPublicRoute helper`

---

# Plan P3.0c — Org-Switch Cache Invalidation Investigation (D2)
**Wave:** 0 | **Depends on:** none
**Goal:** Confirm or add `invalidateAbility(req.sessionID)` after `current_org_id` change in `auth.controller.ts`.
**Inputs:** `be/src/modules/auth/auth.controller.ts`, `be/src/shared/services/ability.service.ts` (find `invalidateAbility`).
**Outputs:** Either a fix commit OR a dated comment in the controller noting verification.
**Tasks:**
1. Locate the org-switch handler (likely `switchOrganization` or similar).
2. Trace whether ability cache is invalidated post-update.
3. If missing: add `invalidateAbility(req.sessionID)` immediately after the model update.
4. Write integration test: switch org, request permission-gated route, assert new org's grants apply.

**Tests:** `be/src/modules/auth/__tests__/org-switch-invalidation.test.ts`
**Verification:** Test green with switched org reflecting new permissions in same session.
**Commit:** `fix(auth): invalidate ability cache on org switch` (or `chore(auth): document org-switch cache invalidation already in place`)

---

# Plan P3.0d — Effective Permissions Snapshot (Before-Image for D1)
**Wave:** 0 | **Depends on:** none
**Goal:** Capture per-fixture-role effective permissions for `User` subject so Wave 3's `users.routes.ts:93` normalization can prove zero unintended deltas.
**Inputs:** Phase 2 parity matrix infrastructure, existing fixtures.
**Outputs:**
- `be/src/modules/permissions/__tests__/__snapshots__/users-route-effective-permissions.before.json` (committed snapshot)
- `be/src/modules/permissions/__tests__/users-route-effective-permissions.test.ts`

**Tasks:**
1. Reuse Phase 2's fixture loader.
2. For each fixture user, compute effective `can('edit', User, <other-user-id>)` against current code (pre-normalization).
3. Serialize as deterministic JSON snapshot, commit as `.before.json`.
4. Test stub that will be reused in P3.3a to compare `.after`.

**Tests:** Generates the snapshot; `.test.ts` will be activated in P3.3a.
**Verification:** Snapshot file exists and is deterministic across runs.
**Commit:** `test(permissions): capture users.routes effective-permissions before-image`

---

# Plan P3.1a — New requirePermission Middleware
**Wave:** 1 | **Depends on:** P3.0a
**Goal:** Async `requirePermission(key)` gating class-level permission via cached ability + audit log on mutation deny.
**Inputs:** Current `auth.middleware.ts`, `ability.service.ts`, research §3.
**Outputs:**
- `be/src/shared/middleware/auth.middleware.ts` (edit — replace function)
- `be/src/shared/constants/permission-errors.ts` (new — structured error codes)

**Tasks:**
1. Implement: await `buildAbilityFor(req.user)`, check `ability.can(deriveAction(key), deriveSubject(key))` OR direct catalog lookup — pick path documented in research §3 (catalog lookup is simpler, no derivation).
2. Tenant scope via `req.user.current_org_id`; reject if missing user/tenant with 401/403 + structured error code constants.
3. On deny + method ∈ {POST,PUT,PATCH,DELETE}: call `auditLogService.logPermissionDeny(...)` (helper from P3.1d). Reads NOT logged.
4. JSDoc per project conventions; inline comments above the mutation-method check.

**Tests:** P3.1c covers.
**Verification:** Unit tests in P3.1c pass.
**Commit:** `feat(auth): rewrite requirePermission middleware with audit logging`

---

# Plan P3.1b — New requireAbility Middleware (Bug Fix 1)
**Wave:** 1 | **Depends on:** P3.0a
**Goal:** Fix the row-scoped CASL bypass at `auth.middleware.ts:377` by passing `subject(name, {type, id})` to CASL.
**Inputs:** Current `auth.middleware.ts:366-380`, CASL `subject` helper docs, research §3.
**Outputs:** `be/src/shared/middleware/auth.middleware.ts` (edit — `requireAbility`).

**Tasks:**
1. Signature: `requireAbility(action: string, subjectName: string, idParam?: string)`.
2. Resolve ability via cached `buildAbilityFor`.
3. If `idParam` provided: `const instance = subject(subjectName, {type: subjectName, id: req.params[idParam]}); ability.can(action, instance)`.
4. If absent: class-level `ability.can(action, subjectName)`.
5. Same audit log + structured error codes as P3.1a.
6. Inline comment on the `subject()` call: "Row-scoped grants require an instance with id; passing bare string silently bypasses CASL conditions — see Phase 3 bug fix 1."

**Tests:** P3.1c covers.
**Verification:** Unit tests in P3.1c pass; specifically the row-scoped grant test.
**Commit:** `fix(auth): pass subject instance to CASL so row-scoped grants match`

---

# Plan P3.1c — Middleware Unit Tests
**Wave:** 1 | **Depends on:** P3.1a, P3.1b, P3.1d
**Goal:** Comprehensive unit tests for both middlewares.
**Outputs:** `be/src/shared/middleware/__tests__/auth.middleware.test.ts`

**Tasks:** Test cases:
1. `requirePermission` happy path (admin), deny path (member), missing user → 401, missing tenant → 403, audit log called on mutation deny, audit log NOT called on read deny.
2. `requireAbility` class-level happy/deny.
3. `requireAbility` instance-level: insert `resource_grant` for KB id `X`, build V2 ability, call with `req.params.id = X` → allows.
4. Same call without `idParam` → denies (proves the bug fix).
5. Cross-tenant: grant in tenant A, request in tenant B → denies.

**Verification:** All cases green; coverage on both middlewares > 90%.
**Commit:** `test(auth): unit tests for new auth middleware including row-scoped grant`

---

# Plan P3.1d — Audit Log Helper
**Wave:** 1 | **Depends on:** none (parallel with P3.1a/b)
**Goal:** Minimal `auditLogService.logPermissionDeny(...)` called by middleware on mutation denies.
**Inputs:** `be/src/modules/audit/`.
**Outputs:** `be/src/modules/audit/services/audit.service.ts` (edit — add method), `be/src/modules/audit/index.ts` (re-export).

**Tasks:**
1. Add `logPermissionDeny({userId, tenantId, method, path, key?, action?, subject?, resourceId?})` method.
2. Persists to existing audit_logs table with `event_type = 'permission_deny'`.
3. Constants for `event_type` in `be/src/shared/constants/audit-events.ts`.

**Tests:** `be/src/modules/audit/__tests__/permission-deny.test.ts` — assert row written with correct shape.
**Verification:** Test green.
**Commit:** `feat(audit): add logPermissionDeny helper for middleware`

---

# Plan P3.2a — rbac.ts Sync Shim Conversion (D4)
**Wave:** 2 | **Depends on:** P3.1a, P3.1b
**Goal:** Convert `rbac.ts::hasPermission` to a sync wrapper over a boot-cached snapshot of `role_permissions`.
**Inputs:** `be/src/shared/config/rbac.ts`, model `RolePermissionModel`, boot path.
**Outputs:** `be/src/shared/config/rbac.ts` (rewritten), `be/src/shared/services/role-permission-cache.service.ts` (new singleton).

**Tasks:**
1. New singleton `RolePermissionCacheService` with `loadAll()`, `has(roleName, key)`, `refresh()`. Loaded at boot. **`refresh()` MUST use an atomic-swap pattern**: build the new snapshot in a fresh `Map` off to the side, then assign it to the singleton's internal field in one operation. Concurrent `has()` reads must observe either the old snapshot or the new one — never a partially-loaded state. Inline JSDoc cites this race-condition guarantee.
2. `rbac.ts::hasPermission(role, key)` becomes a sync call to the cache.
3. Refresh hook exported for permissions module mutations to call.
4. Document lifecycle in JSDoc on the service class.
5. Verify `auth.middleware.ts:13` caller still type-checks unchanged.

**Tests:** `be/src/shared/services/__tests__/role-permission-cache.test.ts` — load, query, refresh, **plus a concurrency test**: spawn N (e.g., 100) `has()` reads in parallel via `Promise.all`, interleaved with a `refresh()` call that flips the snapshot midway. Every read must return either the pre-refresh or the post-refresh value, never `undefined` or a value from a half-loaded map. This proves the atomic-swap guarantee.
**Verification:** Tests green; existing call sites unchanged.
**Commit:** `refactor(rbac): convert hasPermission to sync shim over boot-cached snapshot`

---

# Plan P3.2b — Flip V2 Engine Default
**Wave:** 2 | **Depends on:** P3.1a, P3.1b, P3.1c
**Goal:** `config.permissions.useV2Engine` default `true`; env override still works.
**Outputs:** `be/src/shared/config/index.ts` (edit).

**Tasks:**
1. Change default to `true`.
2. Confirm `USE_ABILITY_ENGINE_V2=false` reverts to V1 path (manual + test).
3. Add config test asserting both default and override.

**Tests:** `be/src/shared/config/__tests__/permissions-config.test.ts`
**Verification:** Test green; `npm run build -w be` clean.
**Commit:** `feat(permissions): default V2 ability engine to enabled`

---

# Plan P3.2c — Boot Deploy Guardrails
**Wave:** 2 | **Depends on:** P3.2a
**Goal:** Per research §10 — fail-fast on bad permission data at boot.
**Outputs:** `be/src/shared/services/permission-boot-validator.service.ts` (new), wired in `be/src/server.ts` boot sequence.

**Tasks:**
1. Fail-fast: any `resource_grants` row with empty `actions[]` → throw at boot with row id list.
2. Warning: `role_permissions` keys missing from catalog → log warning with key list.
3. Warning: active `user_permission_overrides` referencing missing permissions → log warning.
4. Run after `RolePermissionCacheService.loadAll()`.

**Tests:** `be/src/shared/services/__tests__/permission-boot-validator.test.ts` — seeded bad data triggers fail/warn.
**Verification:** Tests green.
**Commit:** `feat(permissions): add boot deploy guardrails for permission data integrity`

---

# Plan P3.2d — Phase 2 Parity Re-Run with Flag Flipped
**Wave:** 2 | **Depends on:** P3.2b
**Goal:** Sanity check — Phase 2's 89/89 parity matrix still green with V2 default.
**Outputs:** No new files; CI run + result note in this PLAN's status.
**Tasks:** Run `npm run test:permissions -w be -- --grep parity-matrix`. If any red: STOP, escalate.
**Verification:** 89/89 green.
**Commit:** N/A (verification only)

---

# Plan P3.3a — Normalize users.routes.ts (Bug Fix 2 + D1)
**Wave:** 3 | **Depends on:** P3.0d, P3.1b, P3.2b
**Goal:** Apply locked decisions to lines 49, 58, 93 of `users.routes.ts` and prove zero unintended access deltas.
**Inputs:** `be/src/modules/users/routes/users.routes.ts`, P3.0d snapshot.
**Outputs:**
- `be/src/modules/users/routes/users.routes.ts` (edit)
- `be/src/modules/permissions/__tests__/__snapshots__/users-route-effective-permissions.after.json`

**Tasks:**
1. Line 49 → `requirePermission('users.view')`.
2. Line 58 → `requirePermission('users.create')`.
3. Line 93 → `requireAbility('edit', 'User', 'id')`.
4. Generate `.after.json` snapshot with same fixture set.
5. Diff against `.before.json` — if any user gains/loses access, **STOP** and escalate per locked decision.

**Tests:** `users-route-effective-permissions.test.ts` activated — diff before/after must be empty.
**Verification:** Snapshot diff is empty; test green.
**Commit:** `refactor(users): normalize routes to canonical permission gate forms`

---

# Plan P3.3b — Migrate All Other Modules
**Wave:** 3 | **Depends on:** P3.3a
**Goal:** Migrate every remaining mutating route across all 21 other modules per call-site inventory.
**Inputs:** EXISTING_AUTH_SURFACE.md, PERMISSION_INVENTORY.md, research §1.
**Outputs:** Edits to all `be/src/modules/*/routes/*.routes.ts` (excluding users — already done).

**Tasks:** Per module (atomic commit each):
1. Read module's existing routes.
2. Apply canonical form: `requirePermission` for class-level mutations; `requireAbility(action, Subject, 'id')` where `:id` exists in path.
3. Run `route-sweep-coverage.test.ts` after each module — expect that module's offender count → 0.
4. Run module-specific tests.

**Modules:** Confirm exact module list against `ls be/src/modules/` at execution time (not the speculative list above — this plan was drafted from research, but `feature/permission` may have new modules). The actual count is 22 (`auth` is in the dir but has no `.permissions.ts` per Phase 1 — it has 1 mutating `switch-org` route + `change-password` etc. that are NOT public. **`auth` must NOT be entirely `markPublicRoute`d** — only `login`, `logout`, `oauth-callback` are public; `switch-org`, `change-password`, `revoke-session`, etc. are mutations that need a gate (likely `requirePermission('users.view')` or a session-based check).

**Tests:** Each module's existing test suite must remain green.
**Verification:** `route-sweep-coverage.test.ts` reports 0 offenders.
**Commit:** Per module: `refactor({module}): migrate routes to new permission middleware`

---

# Plan P3.3c — Cross-Cutting Cleanup
**Wave:** 3 | **Depends on:** P3.3b
**Goal:** Remove any direct `req.user.role === 'admin'` in service files.
**Inputs:** Grep across `be/src/modules/*/services/`.
**Outputs:** Service file edits replacing role-string checks with permission keys.
**Tasks:**
1. Grep for role string comparisons in services.
2. For each occurrence: replace with a permission check at controller/middleware level (push the check up). Service should not know role names.
3. Confirm strict layering preserved.

**Tests:** Existing service tests still green.
**Verification:** Grep returns 0 hits in services.
**Commit:** `refactor(services): remove direct role-string checks from service layer`

---

# Plan P3.4a — Permissions Module Skeleton
**Wave:** 4 | **Depends on:** P3.0a, P3.2a
**Goal:** New `be/src/modules/permissions/` per `be/CLAUDE.md` sub-directory layout (≥5 files).
**Outputs:**
- `be/src/modules/permissions/controllers/permissions.controller.ts`
- `be/src/modules/permissions/services/permissions.service.ts`
- `be/src/modules/permissions/models/permission.model.ts`
- `be/src/modules/permissions/models/role-permission.model.ts`
- `be/src/modules/permissions/models/user-permission-override.model.ts`
- `be/src/modules/permissions/models/resource-grant.model.ts`
- `be/src/modules/permissions/schemas/permissions.schemas.ts`
- `be/src/modules/permissions/routes/permissions.routes.ts`
- `be/src/modules/permissions/index.ts`

**Tasks:** Skeleton files with class shells, JSDoc, barrel export. No endpoints implemented yet (P3.4b).
**Tests:** `be/src/modules/permissions/__tests__/skeleton.test.ts` — module imports cleanly.
**Verification:** `npm run build -w be` clean.
**Commit:** `feat(permissions): scaffold permissions module per layered architecture`

---

# Plan P3.4b — TS7 CRUD Endpoints
**Wave:** 4 | **Depends on:** P3.4a, P3.1d
**Goal:** Implement all TS7 endpoints per research §6 with validation, audit log, cache invalidation, gating.
**Outputs:** Filled controllers/services/models from P3.4a.

**Endpoints (per research §6):**
- `GET /api/permissions/catalog` — list all keys (`requirePermission('permissions.view')`)
- `GET /api/permissions/roles/:roleId` — list role's keys
- `PUT /api/permissions/roles/:roleId` — replace role's keys (`permissions.manage`); audit + `invalidateAllAbilities`
- `GET /api/permissions/users/:userId/overrides`
- `POST /api/permissions/users/:userId/overrides` — add override; audit + `invalidateAbility(userId)`
- `DELETE /api/permissions/users/:userId/overrides/:key` — same
- `GET /api/permissions/grants?subject=&resourceId=`
- `POST /api/permissions/grants` — create resource grant; audit + `invalidateAbility(granteeId)`
- `DELETE /api/permissions/grants/:id` — delete resource grant; audit + `invalidateAbility(granteeId)` (look up the grantee from the row before deleting)

**Tasks:** Per endpoint:
1. Zod schema in `permissions.schemas.ts`.
2. Route registration with appropriate gate.
3. Controller calls service.
4. Service calls model + audit + invalidation.
5. Model owns DB queries (Knex).

**Tests:** P3.4d covers.
**Verification:** All endpoints respond per contract; integration tests green.
**Commit:** `feat(permissions): implement TS7 CRUD endpoints with audit + cache invalidation`

---

# Plan P3.4c — whoCanDo Helper (TS14)
**Wave:** 4 | **Depends on:** P3.4a
**Goal:** `permissionService.whoCanDo(action, subject, resourceId?)` joining role_permissions + overrides + grants + users, tenant-scoped.
**Outputs:** `permissions.service.ts` (add method), `permission.model.ts` (add query).

**Tasks:**
1. Model method: SQL join across the 4 tables, tenant-scoped via `current_org_id`.
2. Service wraps with input validation + tenant injection.
3. Optionally exposed via `GET /api/permissions/who-can-do?action=&subject=&resourceId=` (gated by `permissions.view`).

**Tests:** `be/src/modules/permissions/__tests__/who-can-do.test.ts` — seeded scenarios.
**Verification:** Tests green; tenant cross-leak prevented.
**Commit:** `feat(permissions): add whoCanDo helper for TS14 audit support`

---

# Plan P3.4d — Permissions Module Integration Tests
**Wave:** 4 | **Depends on:** P3.4b, P3.4c
**Goal:** Per-endpoint tests: happy, denied, tenant cross-leak, audit log row written, cache invalidated.
**Outputs:** `be/src/modules/permissions/__tests__/{endpoint}.integration.test.ts` per endpoint.

**Tasks:** Per endpoint, 5 cases:
1. Happy path with `permissions.manage` user.
2. Denied with read-only user.
3. Tenant cross-leak (other tenant's data invisible).
4. Audit log row written on success.
5. Cache invalidation called (spy on `invalidateAbility`/`invalidateAllAbilities`).

**Verification:** All tests green; coverage on permissions module > 85%.
**Commit:** `test(permissions): integration tests for all CRUD endpoints`

---

# Plan P3.5a — Final Route Sweep
**Wave:** 5 | **Depends on:** P3.3b, P3.3c, P3.4b
**Goal:** Confirm `route-sweep-coverage.test.ts` reports 0 offenders across all 22 modules (21 + new permissions).
**Tasks:** Run the test. If any offender remains, fix in this plan.
**Verification:** Test green.
**Commit:** `test(permissions): close route-sweep-coverage gate (0 un-gated mutations)`

---

# Plan P3.5b — Full Test Suite
**Wave:** 5 | **Depends on:** P3.5a
**Goal:** Phase 1 + 2 + 3 specs all green.
**Tasks:** `npm run test:permissions -w be`. Investigate any red.
**Verification:** All green.
**Commit:** N/A

---

# Plan P3.5c — Remove Legacy requirePermission
**Wave:** 5 | **Depends on:** P3.5a, P3.5b
**Goal:** If a separate legacy `requirePermission` function survives alongside the new one, remove it. **MUST be the final code change** per research red flag #5.
**Tasks:**
1. Grep for orphaned old implementation.
2. Delete if dead.
3. Re-run `route-sweep-coverage.test.ts` + full suite.

**Verification:** Tests green; no dead code.
**Commit:** `chore(auth): remove legacy requirePermission implementation`

---

# Plan P3.5d — Phase Exit Checklist Verification
**Wave:** 5 | **Depends on:** P3.5c
**Goal:** Walk the checklist below; mark each item.
**Outputs:** `.planning/phase-03-middleware-cutover/PHASE-EXIT.md`

---

## Wave Plan (Parallelization)

| Wave | Plans (parallel within wave) | Notes |
|------|------------------------------|-------|
| 0 | P3.0a, P3.0b, P3.0c, P3.0d | All independent — fully parallel |
| 1 | P3.1a, P3.1b, P3.1d (parallel); then P3.1c | P3.1c depends on a/b/d |
| 2 | P3.2a → (P3.2b, P3.2c parallel) → P3.2d | P3.2c needs P3.2a; P3.2d needs P3.2b |
| 3 | P3.3a → P3.3b (per-module parallel possible) → P3.3c | Strict order |
| 4 | P3.4a → (P3.4b, P3.4c parallel) → P3.4d | |
| 5 | P3.5a → P3.5b → P3.5c → P3.5d | Strict order |

## Verification Matrix

| Requirement | Acceptance Criteria | Plans |
|---|---|---|
| **TS6** | Every mutating route gated by new middleware; row-scoped grants honored | P3.1a, P3.1b, P3.1c, P3.3a, P3.3b, P3.5a |
| **TS6** | V2 engine is default | P3.2b, P3.2d |
| **TS6** | Bug 1 fixed (CASL instance subject) | P3.1b, P3.1c |
| **TS6** | Bug 2 fixed (users.routes normalization) | P3.0d, P3.3a |
| **TS7** | Permissions module CRUD endpoints exist | P3.4a, P3.4b, P3.4d |
| **TS7** | Cache invalidation on mutations | P3.4b, P3.4d, P3.0c |
| **TS7** | Tenant-scoped | P3.4b, P3.4c, P3.4d |
| **TS14** | Audit log on mutation denies | P3.1a, P3.1d |
| **TS14** | Audit log on permissions module mutations | P3.4b, P3.4d |
| **TS14** | `whoCanDo` helper | P3.4c |

## Phase Exit Checklist

- [ ] `route-sweep-coverage.test.ts` reports 0 un-gated mutations across all 22 modules
- [ ] `config.permissions.useV2Engine` default = `true`; env override verified
- [ ] Phase 2 parity matrix 89/89 still green with flag flipped (P3.2d)
- [ ] Bug 1 fixed: `requireAbility` passes CASL `subject(name, {type, id})`; row-scoped grant test green
- [ ] Bug 2 fixed: `users.routes.ts` lines 49/58/93 normalized; before/after snapshot diff is empty
- [ ] Org-switch handler invalidates ability cache (verified or added in P3.0c)
- [ ] Boot deploy guardrails fire on bad data (P3.2c tests green)
- [ ] `permissionService.whoCanDo` exists, tenant-scoped, tested
- [ ] All new permissions module endpoints have integration tests (happy/denied/cross-leak/audit/cache)
- [ ] Audit log entries written for every permissions module mutation
- [ ] `npm run build -w be` clean
- [ ] `npm run test:permissions -w be` clean (Phase 1 + 2 + 3)
- [ ] `rbac.ts` shim functional (sync wrapper over boot cache); single caller at `auth.middleware.ts:13` unchanged
- [ ] `legacy.rbac.ts` deletion explicitly deferred to Phase 6
- [ ] No FE files touched (Phase 4 owns `fe/src/lib/ability.tsx`)
- [ ] No `superadmin`/`member` role aliases removed (Phase 6 owns)
- [ ] TypeScript strict mode passes
- [ ] All new exports have JSDoc
- [ ] No hardcoded string literals introduced (audit event types, error codes, subject names all in constants files)
