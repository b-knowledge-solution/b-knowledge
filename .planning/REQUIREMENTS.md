# Requirements — Permission System Overhaul

> Scoped requirements for the B-Knowledge permission overhaul milestone.
> Source of truth for phase planning. Each requirement must be testable and have a clear "done" state.
> See `.planning/PROJECT.md` for context, `.planning/research/` for evidence, `.planning/codebase/` for codebase map.

## Decisions Locked (from /gsd:new-project questioning + research)

| Decision | Choice | Source |
|---|---|---|
| Authorization engine | Single CASL engine fed from DB-backed catalog (kill static `rbac.ts`) | Q (initial) |
| Permission model | RBAC + per-user **allow + deny** overrides | Q4 |
| Resource grant scope (this milestone) | KnowledgeBase + DocumentCategory; per-Document deferred | Q (initial) |
| Resource grant table | **Rename & extend existing `knowledge_base_entity_permissions`** → `resource_grants` (no greenfield table) | S1 / `KB_CATEGORY_MODEL.md` |
| `manage` action | Derived only — registry exposes `view`, `create`, `edit`, `delete` | Q1 |
| KB → Category cascade | **Cascade for `view`**, independent for write actions | Q2 |
| OpenSearch integration | Strategy A — translate category grants → `dataset_id IN(...)` filter at query time. No chunk schema changes this milestone. | Q3 |
| Super-admin tenant scope | Stays cross-tenant `manage all` (existing behavior preserved) | Q8 |
| Catalog delivery | Runtime fetch via `GET /api/permissions/catalog` | Q5 (initial) |
| FE rollout strategy | Codemod-assisted migration from `isAdmin` prop drilling → `<Can>`/`useHasPermission` | S2 |
| Tenant model | Permissions stay tenant-scoped via `tenant_id` denormalized onto `resource_grants` | Q7 (initial) |
| Legacy role aliases | `superadmin` (no hyphen) and `member` removed from code + DB default updated | Q (initial) |
| Schema changes | All via Knex migrations, even on Peewee-managed tables | Project rule |

## Table Stakes (must-have for milestone completion)

### TS1 — DB schema is in place
- Knex migrations create `permissions` and `role_permissions` tables.
- Migration creates `user_permission_overrides` (with `effect` column: `allow`|`deny`).
- Migration **renames `knowledge_base_entity_permissions` → `resource_grants`**, renames columns `entity_type → resource_type` and `entity_id → resource_id`, and adds columns: `actions` (text[], Postgres array — one row per grant carries multiple actions), `tenant_id` (uuid, denormalized at insert), `expires_at` (timestamptz, nullable).
- `UNIQUE(resource_type, resource_id, grantee_type, grantee_id)` constraint on `resource_grants` (one grant row per principal × resource).
- The legacy `permission_level` → `actions[]` *data* transform is deferred to Phase 2 (when the new ability engine consumes the column). Phase 1 only adds `actions` as a nullable column with a sensible default applied at the rename. This keeps the schema migration trivially reversible.
- The unrelated table `knowledge_base_permissions` (per-tab UI flags: `tab_documents/tab_chat/tab_settings`) is **not touched** in this milestone. If it needs to migrate later it gets its own dedicated phase.
- Backfill script populates `tenant_id` on existing rows by joining through `knowledge_bases`.
- All new tables have `tenant_id` indexed and FK constraints declared.
- **Done when:** `npm run db:migrate` runs cleanly on a fresh DB and on a DB with the existing `knowledge_base_entity_permissions` rows; rollback is reversible; existing rows survive.

### TS2 — Permission registry exists in code
- New file `be/src/shared/permissions/registry.ts` exports a `definePermissions(feature, spec)` helper.
- Each of the 22 BE modules contributes a registry file under its module: `be/src/modules/<feature>/<feature>.permissions.ts`.
- Registry is type-safe: adding a permission requires only one line; the type system enforces uniqueness of keys.
- **Done when:** all 22 modules have a registry file, the union type is exhaustive, and `be` builds clean.

### TS3 — Boot-time sync upserts registry into DB
- New service `be/src/shared/permissions/sync.ts` runs at boot (in the existing startup sequence after migrations).
- Upserts every registry entry into the `permissions` table (idempotent).
- Removes stale rows (permissions in DB but not in registry) only after a confirmation log line.
- **Done when:** restarting the server is a no-op against a synced DB, and a fresh DB is fully populated after first boot.

### TS4 — Day-one role mapping is preserved
- Knex seed (or Knex migration) populates `role_permissions` from the current `ROLE_PERMISSIONS` map in `be/src/shared/config/rbac.ts:113` so behavior is unchanged on day one.
- The legacy `manage_users` lazy permission is **expanded** during seed to its constituent keys for chat-assistants, search-apps, search-embed, chat-embed, and teams (per `PERMISSION_INVENTORY.md`).
- **Done when:** every user that previously could do an action can still do it after the migration runs against a snapshot of production data.

### TS5 — Unified ability engine
- `be/src/shared/services/ability.service.ts::buildAbilityFor()` builds the CASL ability from:
  1. `role_permissions` for the user's role,
  2. `user_permission_overrides` (allow + deny) for the user,
  3. `resource_grants` matching the user (or their teams, or their role) within their `tenant_id`.
- Tenant scoping (`tenant_id` condition) is preserved on every rule.
- Super-admin shortcut at `ability.service.ts:105` is preserved.
- Existing Redis cache (`cacheAbility`/`loadCachedAbility`) continues to work.
- A regression-snapshot test compares the rule output of the new builder against the legacy builder for a fixed set of user fixtures (admin, leader, user, super-admin) and asserts identical behavior on day one.
- **Done when:** snapshot tests pass, all existing ability-related tests pass.

### TS6 — Authorization middleware
- `be/src/shared/middleware/authorize.middleware.ts` exports:
  - `requirePermission(permissionKey)` — feature-level gate
  - `requireAbility(action, subject, idParam?)` — instance-level gate using CASL
- Both middlewares respect tenant scoping and are unit-tested.
- The mixed-mode auth in `users.routes.ts` (lines 49/58/93 use *both* `requirePermission('manage_users')` and `requireAbility('manage','User')`) is normalized to a single canonical form.
- **Done when:** every mutating route across all 22 BE modules uses one of these middlewares (no bare `req.user.role` checks survive in route files).

### TS7 — Resource-grant CRUD API
- New module `be/src/modules/permissions/` with controller, service, model, schemas, routes (per BE layering rules).
- Endpoints:
  - `GET /api/permissions/catalog` — list of all known permission keys (FE bootstrap)
  - `GET /api/permissions/roles/:role` — current `role_permissions` for a role
  - `PUT /api/permissions/roles/:role` — admin updates role permissions (audited)
  - `GET /api/permissions/users/:userId/overrides`
  - `POST /api/permissions/users/:userId/overrides`
  - `DELETE /api/permissions/users/:userId/overrides/:id`
  - `GET /api/permissions/grants?subject_type=&subject_id=`
  - `POST /api/permissions/grants` — create a resource grant
  - `DELETE /api/permissions/grants/:id`
- All mutating endpoints invalidate the affected users' Redis ability cache.
- All mutating endpoints write an audit log entry.
- **Done when:** REST conventions match `be/CLAUDE.md` rules and Vitest covers happy + denied + tenant-cross-leak paths.

### TS8 — KB → Category cascade for view
- `buildAbilityFor()` synthesizes a CASL `read` rule on `DocumentCategory` for every KB the user can `read`.
- A test fixture demonstrates: granting `read` on KB X → user can read every category in KB X without explicit category grants. Granting `update` on KB X does **not** imply `update` on its categories.
- **Done when:** cascade test passes; explicit category grants still override (allow further; deny still applies).

### TS9 — OpenSearch filter integration (Strategy A)
- `buildOpenSearchAbacFilters` extended to walk a user's resource grants and produce a `terms { dataset_id: [...] }` filter clause for every accessible KB/category.
- For users with no grants beyond their role default, behavior is identical to today.
- The mandatory tenant filter from `buildAccessFilters()` is preserved as the first clause and never omitted.
- **Done when:** RAG search results returned to a user respect their resource grants; integration test confirms a "no-grants" user sees zero chunks from KBs they don't have access to.

### TS10 — FE permission catalog & gates
- `fe/src/lib/permissions.ts` — typed map of permission keys, populated at boot from `GET /api/permissions/catalog` and stored in a React context.
- `fe/src/lib/ability.tsx` — Subjects type aligned with BE (drop legacy `Project`, add `KnowledgeBase`, `Agent`, `Memory`, `DocumentCategory`).
- New hook `useHasPermission(key)` for feature-level checks; existing `useAppAbility()` and `<Can>` continue to work for instance-level checks.
- **Done when:** FE builds clean, the catalog hook returns expected keys in dev, and the type drift between BE/FE Subjects is gone.

### TS11 — FE coverage codemod
- A scripted refactor pass migrates the existing `isAdmin` prop drilling and `user.role === 'admin'` checks to `<Can>` or `useHasPermission(key)`.
- Coverage target: every page in `fe/src/features/*/pages/`, every action button in `fe/src/features/*/components/`, every nav item in `fe/src/layouts/Sidebar.tsx`/`sidebarNav.ts`, and every route guard in `fe/src/app/App.tsx`/`routeConfig.ts`.
- The refactor MUST NOT change any visible behavior on day one.
- **Done when:** zero hardcoded `'admin'`/`'leader'`/`'member'`/`'superadmin'` string comparisons remain in `fe/src/`, and every gated UI is verified by a test or screenshot.

### TS12 — Admin UI rewrite
- `fe/src/features/users/pages/PermissionManagementPage.tsx` is rewritten to be **registry-driven** — it discovers permissions from the catalog endpoint, not from a hardcoded enum.
- New page: a role × permission matrix view with checkbox toggles, grouped by feature.
- New flow: per-user override editor (allow + deny) accessible from the user detail page.
- `KnowledgeBasePermissionModal.tsx` and `EntityPermissionModal.tsx` are rewired to call the new resource-grant API.
- All new strings present in `en.json`, `vi.json`, `ja.json` (per FE rules).
- Dark-mode supported (per FE rules).
- **Done when:** an admin can grant a new feature-level permission to a role, override it for a user, and grant a category to a team — all from the UI.

### TS13 — Legacy alias cleanup
- Remove `superadmin` (no hyphen) and `member` from `be/src/shared/constants/roles.ts`.
- Migration: `UPDATE users SET role='user' WHERE role='member'`; alter `users.role` column default from `'member'` → `'user'`.
- Find every reference: `knowledge-base.service.ts:29`, `sync.controller.ts:71`, plus any others surfaced by research → replace with `UserRole.USER`.
- **Done when:** grep for `'member'` and `'superadmin'` (no-hyphen) returns zero matches in `be/src/` and `fe/src/`, and the migration runs cleanly.

### TS14 — Audit & observability
- Every mutation through the new permissions module writes an audit log entry (actor, action, subject, before/after).
- Add a structured log line whenever the registry sync upserts/removes rows on boot.
- New service helper `permissionService.whoCanDo(action, subject, resourceId?)` returns the list of users with access — usable from the admin UI and from CLI scripts.
- **Done when:** the "who can do X" question is answerable by one DB query (or one service call) for any permission and any resource.

### TS15 — Tests
- BE Vitest coverage:
  - Registry sync (idempotent, removes stale rows)
  - Ability builder regression snapshots (admin/leader/user/super-admin fixtures)
  - `requirePermission` and `requireAbility` middleware (allow + deny + tenant-cross-leak)
  - Resource grant CRUD with tenant isolation
  - Cascade rule (KB read → DocumentCategory read; KB update ≠ DocumentCategory update)
  - Override allow + deny precedence
  - OpenSearch filter translation for grants
- FE Vitest coverage:
  - `useHasPermission` hook
  - `<Can>` rendering with mocked ability rules
  - Admin matrix page CRUD flows
- **Done when:** new test files exist for each of the bullets above, full suites pass, and coverage on the new permissions module is ≥ 85%.

## Should-Have (in scope unless they slip the milestone)

### SH1 — Permission catalog versioning
- The `GET /api/permissions/catalog` response includes a `version` field (e.g., a hash of the registry contents).
- The FE re-fetches and refreshes its in-memory catalog when the server version changes (via Socket.IO event or polling).
- **Done when:** adding a permission server-side propagates to a connected client without requiring a hard reload.

### SH2 — Time-bounded grants (`expires_at`) — backend only
- The `expires_at` column on `resource_grants` is honored by the ability builder (expired grants are not loaded).
- A small cron sweeps expired rows on a schedule (or filters at query time — preferred).
- Admin UI exposure of `expires_at` is **out of scope** for this milestone (stretch goal SH3 below).

### SH3 — `expires_at` in admin UI (stretch)
- Date picker on grant creation in `KnowledgeBasePermissionModal`.
- "Expires in" indicator on existing grants.
- **Defer if** the milestone is at risk.

### SH4 — Self-service: "What can I do?" page
- A logged-in user can view their own effective permissions (role defaults + overrides + grants) on a profile sub-page.
- Useful for support and for users debugging access denials themselves.

## Documentation Extension (Phase 9)

### DOC9-01 — Permission-system docs match the implemented milestone
- The SRS, basic-design, and detail-design permission pages describe the registry-backed catalog, role permissions, per-user overrides, resource grants, and CASL ability enforcement that now exist in BE and FE.
- Legacy `member`/static-RBAC wording is removed or clearly demoted to historical compatibility context only.
- **Done when:** the targeted docs surfaces no longer direct maintainers toward deprecated role names, stale tables, or obsolete route-guard concepts.

### DOC9-02 — Maintainer guide is operational and discoverable
- A dedicated permission maintainer guide explains how to add a new permission across backend registry files, sync expectations, frontend catalog generation, admin UI surfaces, tests, i18n, and docs.
- The guide is reachable from the docs navigation without relying on tribal knowledge or file-path guessing.
- **Done when:** a new developer can follow the guide end-to-end and find it from the auth section of the docs site.

### DOC9-03 — Documentation verification is part of the phase contract
- Phase 9 ends with a cross-doc stale-wording sweep plus a docs-site build so content drift and navigation breakage are caught before sign-off.
- Requirement traceability for the documentation phase is recorded in the same `.planning/REQUIREMENTS.md` source of truth used by the roadmap and plan files.
- **Done when:** the docs verification sweep passes, `npm run docs:build` succeeds in the project workspace, and the roadmap/plan IDs resolve back to explicit requirements.

## Out of Scope (Explicit)

| Item | Why |
|---|---|
| Per-Document resource grants | Deferred to next milestone — schema is designed to allow them with no migration |
| Adding `category_id` to OpenSearch chunks | Strategy B; deferred. Strategy A ships in this milestone. |
| Cross-tenant grants | Tenant isolation is sacrosanct |
| External IdPs beyond Azure AD | Untouched |
| Permission templates / "permission groups" | Postponed; revisit if Phase 5 surfaces a need |
| Full replacement of team-membership | Teams stay; resource_grants reference teams as one principal type |
| Permission changes propagating without session refresh | Existing per-session invalidation is sufficient |
| Replacing the legacy `rbac.ts` shim immediately | Shim stays during cutover to avoid 401s mid-deploy; removed only at end of milestone |
| Permission auditing UI (timeline view) | Audit log entries are written but no dedicated browsing UI |
| OAuth scope mapping for the public API | Out of scope; the public API still uses session auth |

## Acceptance Test Matrix

| Scenario | Expected | Covers |
|---|---|---|
| Day-one user with role `admin` does every action they could before | Allowed | TS4, TS5 |
| Day-one user with role `user` does `view_chat` | Allowed | TS4 |
| Adding a new permission to a feature's registry file → restart server → it appears in catalog | Yes | TS2, TS3, SH1 |
| Granting `view` on KB X to user Y → Y can read every category in KB X without explicit category grants | Yes | TS8 |
| Granting `update` on KB X to user Y → Y cannot update categories in KB X (no cascade for write) | Correctly denied | TS8 |
| Per-user `deny` override on `kb.delete` → user with role `admin` cannot delete KBs but can still view/create/edit | Correctly denied | Q4, TS5 |
| User Y in tenant T1 attempts to grant access on a KB in tenant T2 | Rejected by tenant scope | TS6 |
| User Y has a category grant in KB X → RAG search results filter to that KB's chunks | Yes | TS9 |
| Admin assigns a permission to a role via the matrix UI → page reloads, permission is reflected | Yes | TS12 |
| FE component that previously checked `user.role === 'admin'` now uses `<Can>` and renders identically | Yes | TS11 |
| Removing legacy `superadmin`/`member` from `roles.ts` does not break any code path | Confirmed by grep + tests | TS13 |
| Migrating production-snapshot data → all existing KB shares survive as `resource_grants` rows | Yes | TS1, TS4 |
| Vitest BE + FE coverage on new permissions module ≥ 85% | Yes | TS15 |

---

*Last updated: 2026-04-07 after research synthesis.*
