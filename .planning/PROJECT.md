# B-Knowledge — Permission System Overhaul

## What This Is

A milestone-scoped initiative on the existing **B-Knowledge** monorepo (BE/Express, FE/React, advance-rag/Python, converter/Python) to consolidate, extend, and operationalize the application's authorization system so that every feature is uniformly permission-gated and the Knowledge Base feature gains fine-grained per-resource access control.

The codebase already contains two parallel authorization systems that don't fully cooperate:

1. **Static RBAC** in `be/src/shared/config/rbac.ts` — a hardcoded `Role → Permission[]` map. Adding a permission requires editing a TypeScript union, redeploying, and updating frontend checks.
2. **CASL ABAC** in `be/src/shared/services/ability.service.ts` — a real ability engine with Redis-cached rules, ABAC policy overlays, and OpenSearch filter translation. The frontend (`fe/src/lib/ability.tsx`) consumes its rules via `GET /api/auth/abilities` with `<Can>` and `useAppAbility()`.

This initiative collapses the two into a single CASL-driven engine fed by a **DB-backed permission registry** plus a **resource-grant table**, so that:

- Every feature in the system has uniform `view / create+edit / delete` permissions.
- Inside the Knowledge Base, access can be granted per-KB and per-DocumentCategory (with per-document grants planned for the next milestone).
- Adding a new permission is a one-line registry change that propagates to BE checks, FE gates, and admin UI automatically.
- Per-user overrides allow exceptions to role defaults without inventing new roles.

## Core Value

> Make authorization in B-Knowledge **declarative, extensible, and auditable** — so that teams can grow features and access policies without paying compounding maintenance cost.

If we have to choose, we optimize for:
1. **Maintainability** of the permission catalog (one place to add a permission)
2. **Auditability** (any admin can answer "who can do X on Y" via the database)
3. **Extensibility** to per-document grants in a follow-up milestone
4. *Then* developer ergonomics, performance, and UI polish

## Context

- **Project type:** Brownfield extension of an existing monorepo (BE: Node 22 + Express 4.21 + Knex + Postgres; FE: React 19 + Vite + TanStack Query + CASL; Python workers via Redis).
- **Codebase map:** Generated `.planning/codebase/` (7 docs, 1574 lines) — see `STACK.md`, `ARCHITECTURE.md`, `CONVENTIONS.md`, `CONCERNS.md`.
- **Existing scaffolding to extend:**
  - `be/src/shared/config/rbac.ts` — static role/permission map (becomes a thin shim)
  - `be/src/shared/services/ability.service.ts` — CASL engine (extended, not replaced)
  - `be/src/shared/constants/roles.ts` — 4 roles (super-admin, admin, leader, user) + legacy aliases (`superadmin`, `member`) to be removed
  - `be/src/modules/knowledge-base/services/knowledge-base-category.service.ts` — DocumentCategory entity already exists with versions
  - `fe/src/lib/ability.tsx` — CASL ability provider (Subjects type aligned to BE)
  - `fe/src/features/knowledge-base/components/KnowledgeBasePermissionModal.tsx` + `EntityPermissionModal.tsx` — KB share UI (rewired to new API)
  - `fe/src/features/users/pages/PermissionManagementPage.tsx` — admin UI (driven by registry, not enum)

- **Tenant model:** All permissions stay tenant-scoped via `tenant_id` conditions in CASL. No cross-tenant grants in this milestone or any planned follow-up.
- **Migration constraint:** All schema changes via Knex (per project rule), even though some adjacent tables are written by Peewee in `advance-rag/`.

## Requirements

### Validated (existing capabilities — derived from codebase map)

- ✓ CASL-based ability engine with Redis caching (`ability.service.ts`) — existing
- ✓ Per-session ability invalidation and platform-wide invalidation — existing
- ✓ OpenSearch ABAC filter translation for Document subject — existing
- ✓ Role hierarchy: super-admin / admin / leader / user — existing
- ✓ Tenant-scoped CASL rules via `tenant_id` condition — existing
- ✓ FE `<Can>` component + `useAppAbility()` hook backed by `/api/auth/abilities` — existing
- ✓ KnowledgeBase, ChatAssistant, SearchApp, Agent, Memory, Dataset, Document, AuditLog, Policy, Org subject types in BE — existing
- ✓ DocumentCategory entity with category sidebar UI in DocumentsTab — existing

### Active (this milestone)

- [ ] **R1 — Permission Registry**: Single declarative source of truth (`be/src/shared/permissions/registry.ts`) where each feature module registers its permissions (`view`, `create+edit`, `delete` at minimum). Adding a permission is a one-line change.
- [ ] **R2 — DB-backed permission catalog**: Knex migrations create `permissions`, `role_permissions`, `user_permission_overrides`, and `resource_grants` tables. Boot-time sync upserts the registry into `permissions`.
- [ ] **R3 — Unified ability engine**: `ability.service.ts` builds `AppAbility` from `role_permissions` + `user_permission_overrides` + `resource_grants` instead of hardcoded role branches. Static `rbac.ts` becomes a generated shim.
- [ ] **R4 — Authorization middleware**: `requirePermission(key)` and `requireAbility(action, subject, idParam?)` middleware applied to every mutating route across all 22 BE modules.
- [ ] **R5 — User-level overrides**: Admin can grant or deny individual permissions to a specific user, layered on top of their role default.
- [ ] **R6 — Resource grants for KB and DocumentCategory**: Users/teams/roles can be granted `view` (and other actions) on a specific KnowledgeBase or DocumentCategory via `resource_grants`. Designed so per-Document grants can be added in the next milestone with no schema change.
- [ ] **R7 — FE permission catalog endpoint**: `GET /api/permissions/catalog` returns all known permission keys; FE fetches at boot. Existing `/api/auth/abilities` continues to return CASL rules.
- [ ] **R8 — FE coverage**: Every feature's pages, action buttons, and sidebar nav items gated via `<Can>` or `useHasPermission(key)`. No more role-string comparisons in UI code.
- [ ] **R9 — Admin UI**: `PermissionManagementPage` rewritten to be registry-driven (auto-shows new permissions). Add a role × permission matrix view. KnowledgeBasePermissionModal/EntityPermissionModal rewired to the new resource-grant API.
- [ ] **R10 — Migration & legacy cleanup**: Seed `role_permissions` from current `ROLE_PERMISSIONS` so day-one behavior is unchanged. Remove legacy `superadmin` (no hyphen) and `member` role aliases from `roles.ts` and any branches that test them.
- [ ] **R11 — OpenSearch filter integration**: Resource grants on DocumentCategory translate into OpenSearch filters in `buildAccessFilters()` so search results respect category-level access.
- [ ] **R12 — Audit & observability**: Every permission/grant change writes an audit log entry. `who-can-do-X` query is answerable from the DB.
- [ ] **R13 — Tests**: Vitest (BE + FE) covering registry sync, ability building, middleware enforcement, resource grants, and FE `<Can>` gating. i18n keys present in `en/vi/ja` for all new admin UI strings.

### Out of Scope (this milestone)

- **Per-document resource grants** — explicitly deferred to the next milestone. The schema is designed to allow it without changes.
- **Cross-tenant sharing** — never in scope; tenant isolation is sacrosanct.
- **External identity providers beyond Azure AD** — not touched in this milestone.
- **Permission templates / "permission groups" abstraction** — postponed; if it emerges as needed during phase 5, we'll evaluate.
- **Time-bounded grants UI** — schema supports `expires_at` but admin UI for it is a stretch goal.
- **Replacement of the team-membership concept** — teams remain a separate concept; resource grants reference teams as one possible principal type.
- **Permission changes propagating without a session refresh** — relies on the existing per-session invalidation mechanism.

## Key Decisions

| Decision | Rationale | Outcome |
|---|---|---|
| Collapse two systems into CASL-only | Two parallel systems already drift; the static `rbac.ts` is the part that fights extensibility | — Pending |
| DB-backed permission catalog with code-side registry | Type safety in code, runtime extensibility in DB; both worlds | — Pending |
| Resource grants on KB + Category now, Document next | Avoids over-scoping v1 while keeping schema future-proof | — Pending |
| RBAC + per-user overrides (not pure RBAC) | Real orgs need exceptions without inventing new roles | — Pending |
| Runtime catalog fetch (not codegen) | Avoids cross-workspace build coupling; aligns with existing `/api/auth/abilities` pattern | — Pending |
| Kill legacy `superadmin` / `member` role aliases | They cause branching bugs and there's no migration cost | — Pending |
| Tenant scoping non-negotiable | Existing security guarantee | — Pending |
| All schema changes via Knex (even on Peewee tables) | Project rule; backend owns migration lifecycle | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-07 after initialization*
