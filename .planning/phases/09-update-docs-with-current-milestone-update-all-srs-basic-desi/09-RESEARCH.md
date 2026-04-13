# Phase 9: Update docs with current milestone. Update all SRS, basic design and detail design for new permission feature on fe and be, i need it detail for new developer who will add new permission and maintain it later - Research

**Researched:** 2026-04-12  
**Domain:** Permission-system documentation drift remediation for BE, FE, admin UI, and maintainer onboarding  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Update existing SRS, basic-design, and detail-design documents in place rather than replacing the documentation set wholesale.
- **D-02:** Add one new maintainer-focused permission guide in addition to the in-place updates, because the existing docs are architecture-oriented and do not provide a safe extension workflow for future developers.
- **D-03:** The documentation update must reflect the current milestone state, not the pre-overhaul or legacy authorization model.
- **D-04:** The new maintainer guide must cover the full "add a new permission" flow across backend, frontend, admin UI, tests, i18n, and documentation updates.
- **D-05:** The maintainer guide must be prescriptive and operational, not just conceptual. It should include step-by-step checklists, file maps, extension rules, and common mistakes.
- **D-06:** The maintainer guide should be written for a developer who did not build the milestone and needs to safely maintain it later.
- **D-07:** Code remains the source of truth for permission behavior. Documentation must explain the architecture and maintenance workflow, but it must not invent behavior that is not present in the codebase.
- **D-08:** The new maintainer guide must link directly to the exact backend and frontend files that future developers will edit when adding or maintaining permissions.
- **D-09:** Planning artifacts may inform scope and historical intent, but they are not the long-term canonical product documentation. The docs must stand on their own for future maintainers.
- **D-10:** The updated documentation must cover both FE and BE permission architecture, not just backend authorization internals.
- **D-11:** The updated documentation must explain the current role model and remove obsolete language such as legacy `member`/pre-overhaul `rbac.ts`-centric behavior where it is no longer true.
- **D-12:** The updated documentation must describe how a new permission propagates through the system: registry/catalog, enforcement, frontend gating, admin surfaces, tests, and operational verification.

### Claude's Discretion
- Exact document split and whether the new maintainer guide lives under `docs/detail-design/auth/` or a closely related docs category, as long as it is easy to discover from the current docs navigation.
- Exact file list to update across SRS/basic/detail design, provided the final set closes the documented drift between docs and current code.
- Exact amount of diagramming versus prose, as long as the resulting docs remain practical for maintainers and accurate to the implemented system.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- Root project rules require TypeScript strict mode, single quotes, and reuse of existing monorepo structure; documentation recommendations must not suggest patterns that violate these repo standards. [CITED: CLAUDE.md]
- Root project rules say BE/FE permission behavior must use shared constants instead of bare string literals for fixed domain values; maintainer docs should explicitly reinforce `PERMISSION_KEYS`, `UserRole`, and shared constants usage. [CITED: CLAUDE.md] [CITED: fe/CLAUDE.md]
- Docs changes must stay inside category subfolders, not flat `docs/` section roots, and any added/renamed page must be added to `docs/.vitepress/config.ts`. [CITED: docs/CLAUDE.md]
- Docs changes must be verified with `cd docs && npm run docs:build` or the root alias `npm run docs:build`. [CITED: docs/CLAUDE.md] [VERIFIED: package.json] [VERIFIED: docs/package.json]
- FE documentation must reflect the Phase 4+ gating rules: use `<Can>` for subject-aware CASL checks and `useHasPermission(PERMISSION_KEYS.X)` for flat capability checks; role-string comparisons outside auth/constants are banned. [CITED: fe/CLAUDE.md]
- BE documentation must reflect controller → service → model layering, REST route conventions, Zod validation on mutations, and the current `requirePermission` / `requireAbility` middleware surfaces. [CITED: be/CLAUDE.md]

## Summary

The permission system implementation now spans a DB-backed backend permission registry, boot-time catalog sync, CASL ability construction from `role_permissions` + `user_permission_overrides` + `resource_grants`, runtime FE catalog hydration, registry-driven admin UI, and targeted BE/FE test suites. The current documentation set does not describe that system accurately. It still contains pre-overhaul language such as `member`, static `rbac.ts` source-of-truth assumptions, `manage_users`-centric summaries, old dataset/project ABAC descriptions, and endpoint lists that do not include `/api/permissions/*`. [VERIFIED: be/src/shared/permissions/registry.ts] [VERIFIED: be/src/shared/permissions/sync.ts] [VERIFIED: be/src/shared/services/ability.service.ts] [VERIFIED: fe/src/lib/permissions.tsx] [VERIFIED: fe/src/features/permissions/api/permissionsApi.ts] [VERIFIED: codebase grep]

Phase 9 should therefore be planned as a documentation correction phase with two tracks: first, in-place correction of the existing SRS/basic/detail design pages that currently own auth, user/team, API, database, and security descriptions; second, one new maintainer-focused guide under `docs/detail-design/auth/` that explains the end-to-end "add a permission safely" workflow across BE, FE, admin UI, tests, i18n, generated catalog artifacts, and docs navigation/build verification. [VERIFIED: .planning/phases/09-update-docs-with-current-milestone-update-all-srs-basic-desi/09-CONTEXT.md] [CITED: docs/CLAUDE.md] [VERIFIED: docs/.vitepress/config.ts]

**Primary recommendation:** Update the existing auth/user-team/security/API/database pages in place, add `docs/detail-design/auth/permission-maintenance-guide.md`, link it from the auth sidebar, and explicitly document current canonical extension points plus the remaining legacy compatibility exceptions. [VERIFIED: docs/.vitepress/config.ts] [VERIFIED: codebase grep]

## Standard Stack

### Core

| Library / Surface | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Markdown docs in `docs/` | Repo-native markdown docs [VERIFIED: docs/CLAUDE.md] | Delivery format for SRS/basic/detail design | This phase is documentation-only and must extend the existing docs taxonomy rather than invent a parallel format. [CITED: docs/CLAUDE.md] |
| VitePress | `^1.6.4` at repo root, `^1.6.3` in `docs/` [VERIFIED: package.json] [VERIFIED: docs/package.json] | Static site generator and docs build gate | The docs workspace already builds with VitePress and sidebar routing depends on `docs/.vitepress/config.ts`. [CITED: docs/CLAUDE.md] [VERIFIED: docs/.vitepress/config.ts] |
| Mermaid via `vitepress-plugin-mermaid` | `^2.0.17` [VERIFIED: docs/package.json] | Architecture and flow diagrams inside docs | Existing docs already use Mermaid and docs rules explicitly support it. [CITED: docs/CLAUDE.md] |
| Node.js / npm | Node `v22.22.1`, npm `10.9.4` [VERIFIED: local environment] | Build the docs site and run repo validation commands | Present on the machine and matches the repo's Node-based toolchain. [VERIFIED: local environment] [VERIFIED: package.json] |

### Supporting

| Surface | Version / State | Purpose | When to Use |
|---------|---------|---------|-------------|
| BE permission registry | Current repo implementation [VERIFIED: be/src/shared/permissions/registry.ts] | Canonical source for permission keys, actions, subjects, labels | Use when documenting how new permissions are defined and synced. [VERIFIED: be/src/shared/permissions/registry.ts] |
| BE permissions admin module | Current repo implementation [VERIFIED: be/src/modules/permissions/routes/permissions.routes.ts] | Canonical API for catalog, role permissions, overrides, grants, and `who-can-do` | Use when documenting admin and operational flows. [VERIFIED: be/src/modules/permissions/routes/permissions.routes.ts] |
| FE runtime permission catalog | Current repo implementation [VERIFIED: fe/src/lib/permissions.tsx] | Canonical FE flat-permission gate and catalog hydration path | Use when documenting FE extension points and boot/runtime behavior. [VERIFIED: fe/src/lib/permissions.tsx] |
| FE admin permission UI | Current repo implementation [VERIFIED: fe/src/features/users/pages/PermissionManagementPage.tsx] [VERIFIED: fe/src/features/permissions/pages/EffectiveAccessPage.tsx] | Canonical maintainer/admin surfaces for role matrix, overrides, grants, and effective access | Use when documenting operator flows and file map. [VERIFIED: fe/src/features/users/pages/PermissionManagementPage.tsx] [VERIFIED: fe/src/features/permissions/pages/EffectiveAccessPage.tsx] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-place correction of current docs | Replace the auth/user-team docs set wholesale | Replacing the docs set would discard current navigation structure and violate locked decision D-01. [VERIFIED: 09-CONTEXT.md] |
| New guide under `docs/detail-design/auth/` | Put the guide in `docs/detail-design/supporting/` | `auth/` is the existing discoverable home for authorization design and already has a sidebar section in `config.ts`. [VERIFIED: docs/.vitepress/config.ts] |
| Code-linked maintainer guide | High-level conceptual guide only | The user explicitly asked for new-developer maintenance detail and D-04/D-05 require operational file maps and checklists. [VERIFIED: 09-CONTEXT.md] |

**Installation:** No new packages are required for this phase. Verification should use the existing docs build command. [VERIFIED: package.json] [VERIFIED: docs/package.json]

```bash
npm run docs:build
```

## Documentation Drift Matrix

### In-Place Corrections Required

| File | Drift found | Action |
|------|-------------|--------|
| `docs/srs/core-platform/fr-user-team-management.md` | Still models the old actor set and role matrix with `Member`, static RBAC/ABAC summaries, and does not describe role catalog, overrides, resource grants, or FE/BE permission admin surfaces. [VERIFIED: docs/srs/core-platform/fr-user-team-management.md] | Rewrite the access-control section to describe current roles (`super-admin`, `admin`, `leader`, `user`), DB-backed catalog behavior, overrides, grants, admin UI responsibilities, and tenant-scoped enforcement. [VERIFIED: codebase grep] |
| `docs/srs/core-platform/fr-authentication.md` | Correct on session basics, but it does not explain that `/api/auth/abilities` and org switching feed the permission system, nor how auth/session state intersects with runtime permission reload. [VERIFIED: docs/srs/core-platform/fr-authentication.md] [VERIFIED: fe/src/lib/ability.tsx] [VERIFIED: be/tests/permissions/org-switch-cache.test.ts] | Add auth-to-permission integration notes and cross-link the detailed auth/permission design pages. |
| `docs/basic-design/system-infra/security-architecture.md` | Describes a dual RBAC/ABAC model with `member`, `requireRole`-heavy pipeline, and grantee fields that no longer match the current DB-backed permission engine. [VERIFIED: docs/basic-design/system-infra/security-architecture.md] | Replace with current architecture: registry → sync → catalog tables → ability builder → middleware → FE catalog/ability consumers, while noting compatibility shims that still exist. [VERIFIED: be/src/shared/permissions/sync.ts] [VERIFIED: be/src/shared/services/ability.service.ts] [VERIFIED: fe/src/lib/permissions.tsx] |
| `docs/basic-design/component/api-design-overview.md` | Shows a generic request pipeline ending at `requirePermission` only and omits the permissions admin module and FE runtime catalog contract. [VERIFIED: docs/basic-design/component/api-design-overview.md] | Update the request lifecycle to include `requireAbility`, `/api/auth/abilities`, `/api/permissions/catalog`, and the distinction between flat permission keys and row-scoped ability checks. [VERIFIED: be/src/shared/middleware/auth.middleware.ts] [VERIFIED: fe/src/lib/permissions.tsx] |
| `docs/basic-design/component/api-design-endpoints.md` | Does not list `/api/permissions/catalog`, `/api/permissions/who-can-do`, role permissions, overrides, or grants, and still shows legacy user/team permission endpoints as primary. [VERIFIED: docs/basic-design/component/api-design-endpoints.md] [VERIFIED: be/src/modules/permissions/routes/permissions.routes.ts] | Add the permissions module endpoints and annotate legacy/compatibility endpoints where they still exist. |
| `docs/basic-design/database/database-design-core.md` | Still describes `users.permissions` and `user_teams.role default 'member'` as active control surfaces, while omitting `permissions`, `role_permissions`, and `user_permission_overrides`. [VERIFIED: docs/basic-design/database/database-design-core.md] [VERIFIED: codebase grep] | Update the core permission-related schema narrative to show the current catalog/override tables and role names. |
| `docs/basic-design/database/database-design-rag.md` | Focuses on older dataset/project ABAC fields and omits `resource_grants`, even though KB/category grants are a current milestone feature. [VERIFIED: docs/basic-design/database/database-design-rag.md] [VERIFIED: be/tests/permissions/migrations.test.ts] | Add `resource_grants` and explain how KB/category grants integrate with RAG dataset resolution. [VERIFIED: be/tests/permissions/grant-dataset-resolution.test.ts] |
| `docs/detail-design/auth/overview.md` | Still presents `requireRole → requirePermission → requireAbility` as the generic resolution chain and cites `rbac.js` as a key file. [VERIFIED: docs/detail-design/auth/overview.md] | Update to current source-of-truth ordering: session/org context → `buildAbilityFor` → `requirePermission` or `requireAbility`, with `rbac.ts` documented only as a compatibility shim. [VERIFIED: be/src/shared/config/rbac.ts] [VERIFIED: be/src/shared/middleware/auth.middleware.ts] |
| `docs/detail-design/auth/azure-ad-flow.md` | Still says Azure AD users get default role `member`. [VERIFIED: codebase grep] | Update default role wording to `user` and align with current role constants. [VERIFIED: be/src/shared/config/rbac.ts] |
| `docs/detail-design/auth/rbac-abac.md` | Built around old role hierarchy (`member`), old permission matrix (`manage_users`, `manage_datasets`, etc.), `rbac.js` source-of-truth, team permission loading, and dataset-only ABAC emphasis. [VERIFIED: docs/detail-design/auth/rbac-abac.md] | Rewrite this page to be a concise current-state architecture summary and move extension workflow detail to the new guide. |
| `docs/detail-design/auth/rbac-abac-comprehensive.md` | Large, detailed, and materially stale: old subject list, old permission matrix, old route matrices, old `ability.service` behavior description, and missing `/api/permissions/*` admin flows. [VERIFIED: docs/detail-design/auth/rbac-abac-comprehensive.md] | Retain the page but re-scope it as the authoritative current-state reference for subjects, actions, permission sources, admin endpoints, and known compatibility exceptions. |
| `docs/detail-design/user-team/user-management-overview.md` | Still shows default role `member`, assignment matrix with `member`, and generic permission levels that do not match the new role-permission + override model. [VERIFIED: docs/detail-design/user-team/user-management-overview.md] | Update user lifecycle and role/permission sections to match the current permission system and link to the new maintainer guide. |
| `docs/detail-design/user-team/user-management-detail.md` | Still documents `PUT /api/users/:id/permissions`, `user_permissions`, and `member` role values as canonical. [VERIFIED: docs/detail-design/user-team/user-management-detail.md] | Replace that with current role assignment plus per-user override flow under `/api/permissions/users/:userId/overrides` and the FE user detail permissions tab. [VERIFIED: be/src/modules/permissions/routes/permissions.routes.ts] [VERIFIED: fe/src/features/users/pages/UserDetailPage.tsx] |
| `docs/detail-design/user-team/team-management-detail.md` | Still documents `team_permissions`, `requireRole('admin')` on team CRUD, and team permission posting as the primary team permission model. [VERIFIED: docs/detail-design/user-team/team-management-detail.md] | Update to the current mixture: team membership is still real, but KB/category sharing is now handled through `resource_grants`, and the docs must distinguish canonical path vs remaining legacy endpoints. [VERIFIED: fe/src/features/knowledge-base/components/ResourceGrantEditor.tsx] [VERIFIED: be/src/modules/permissions/routes/permissions.routes.ts] |
| `docs/.vitepress/config.ts` | Auth sidebar currently exposes only `overview`, `azure-ad-flow`, `local-login`, `rbac-abac`, and `rbac-abac-comprehensive`; there is no maintainer guide entry. [VERIFIED: docs/.vitepress/config.ts] | Add the new maintainer guide to the `/detail-design/auth/` sidebar. |

### One New Maintainer-Focused Guide

| New file | Why it is needed | Required contents |
|---------|-------------|--------|
| `docs/detail-design/auth/permission-maintenance-guide.md` | The current docs explain architecture loosely but do not give a safe operational workflow for adding or maintaining permissions across BE, FE, admin UI, tests, generated artifacts, and docs navigation. [VERIFIED: codebase grep] [VERIFIED: 09-CONTEXT.md] | 1. Permission lifecycle overview. 2. Backend file map. 3. Frontend file map. 4. Admin UI touchpoints. 5. Generated catalog flow. 6. Test checklist. 7. Docs update checklist. 8. Known compatibility exceptions. 9. Verification commands. [VERIFIED: be/src/shared/permissions/registry.ts] [VERIFIED: fe/src/lib/permissions.tsx] [VERIFIED: be/tests/permissions] [VERIFIED: fe/tests/features/permissions] |

### Secondary Drift To Triage During Planning

| File | Why it matters |
|------|----------------|
| `docs/detail-design/auth/overview.md` and `docs/detail-design/auth/azure-ad-flow.md` both still reference older role/default-role wording. [VERIFIED: docs/detail-design/auth/overview.md] [VERIFIED: codebase grep] |
| `docs/srs/core-platform/fr-dataset-management.md` still uses `member` in its dataset access section, so the planner should decide whether to patch it in the same phase or explicitly defer it as adjacent drift. [VERIFIED: codebase grep] |

## Architecture Patterns

### Recommended Documentation Structure

```text
docs/
├── srs/core-platform/                     # Update auth + user/team requirements pages
├── basic-design/system-infra/            # Update security architecture
├── basic-design/component/               # Update API overview + endpoint reference
├── basic-design/database/                # Update core + RAG database docs
├── detail-design/auth/                   # Update current auth/permission design docs
│   └── permission-maintenance-guide.md   # New maintainer guide
├── detail-design/user-team/              # Update user/team flows affected by permissions
└── .vitepress/config.ts                  # Add the new guide to sidebar navigation
```

### Pattern 1: Document The Canonical Flow From Code, Not From Historical Intent

**What:** The canonical permission flow is now `definePermissions()` registry → boot sync into `permissions` → runtime joins with `role_permissions`, `user_permission_overrides`, and `resource_grants` → `buildAbilityFor()` → `requirePermission` / `requireAbility` → FE `AbilityProvider` + `PermissionCatalogProvider` + admin UI. [VERIFIED: be/src/shared/permissions/registry.ts] [VERIFIED: be/src/shared/permissions/sync.ts] [VERIFIED: be/src/shared/services/ability.service.ts] [VERIFIED: be/src/shared/middleware/auth.middleware.ts] [VERIFIED: fe/src/lib/ability.tsx] [VERIFIED: fe/src/lib/permissions.tsx]

**When to use:** Every auth/permission doc page that currently explains how permissions are defined, enforced, or consumed. [VERIFIED: codebase grep]

**Example:**

```typescript
// Source: be/src/shared/permissions/registry.ts
export const PERMISSIONS_PERMISSIONS = definePermissions('permissions', {
  view: { action: 'read', subject: PermissionSubjects.PermissionCatalog, label: 'View permissions catalog' },
  manage: { action: 'manage', subject: PermissionSubjects.PermissionCatalog, label: 'Manage permissions catalog' },
})
```

### Pattern 2: Separate Canonical Extension Path From Compatibility Exceptions

**What:** The codebase still has some legacy gate surfaces such as `requirePermission('manage_users')`, `requirePermission('manage_knowledge_base')`, and `requireRole(...)` in specific modules, but the canonical new-permission extension path is registry-driven and centered on `requirePermission('feature.action')` / `requireAbility(action, subject, idParam?)`. [VERIFIED: be/src/modules/permissions/routes/permissions.routes.ts] [VERIFIED: be/src/shared/middleware/auth.middleware.ts] [VERIFIED: codebase grep]

**When to use:** The comprehensive auth design page and the maintainer guide should both include a "compatibility exceptions" subsection so the docs do not falsely claim full cleanup where it has not happened yet. [VERIFIED: codebase grep]

**Compatibility exceptions to document explicitly:**

- `users.routes.ts` and `teams.routes.ts` still gate many operations with `manage_users`. [VERIFIED: codebase grep]
- `search.routes.ts` and `search-embed.routes.ts` still contain `manage_users` gates for admin operations. [VERIFIED: codebase grep]
- `sync.routes.ts` still uses `manage_knowledge_base`. [VERIFIED: codebase grep]
- `system-tools`, `broadcast`, `dashboard`, `feedback`, `audit`, and `system-history` still use older `manage_system`, `view_system_tools`, or `requireRole(...)` patterns. [VERIFIED: codebase grep]

### Pattern 3: The Maintainer Guide Should Be A File-Map Checklist

**What:** The new guide should be task-oriented, not narrative-only. The minimum flow for "add a new permission" is:

1. Add the key in a BE module `*.permissions.ts` file via `definePermissions()`. [VERIFIED: be/src/shared/permissions/registry.ts]
2. Verify the boot-time catalog sync exposes it in `/api/permissions/catalog`. [VERIFIED: be/src/modules/permissions/routes/permissions.routes.ts]
3. Regenerate FE permission keys from `fe/src/generated/permissions-catalog.json` into `fe/src/constants/permission-keys.ts`. [VERIFIED: fe/scripts/generate-permission-keys.mjs]
4. Use `useHasPermission(PERMISSION_KEYS.X)` or `<Can>` in FE surfaces. [CITED: fe/CLAUDE.md] [VERIFIED: fe/src/lib/permissions.tsx] [VERIFIED: fe/src/lib/ability.tsx]
5. Ensure the admin matrix and effective-access surfaces can discover the key. [VERIFIED: fe/src/features/permissions/components/PermissionMatrix.tsx] [VERIFIED: fe/src/features/permissions/pages/EffectiveAccessPage.tsx]
6. Add or update BE/FE permission tests. [VERIFIED: be/tests/permissions] [VERIFIED: fe/tests/features/permissions]
7. Update docs and docs sidebar/build verification. [CITED: docs/CLAUDE.md] [VERIFIED: docs/.vitepress/config.ts]

### Anti-Patterns to Avoid

- **Do not document `rbac.ts` as the source of truth:** it is now a compatibility shim over cached `role_permissions`. [VERIFIED: be/src/shared/config/rbac.ts] [VERIFIED: be/src/shared/services/role-permission-cache.service.ts]
- **Do not document `member` as a current tenant role:** the active role set is `super-admin`, `admin`, `leader`, `user`. [VERIFIED: be/src/shared/config/rbac.ts] [VERIFIED: codebase grep]
- **Do not describe `PUT /api/users/:id/permissions` or `team_permissions` as the primary extension path:** the maintained path is now `/api/permissions/*` plus FE admin pages and grant editors. [VERIFIED: be/src/modules/permissions/routes/permissions.routes.ts] [VERIFIED: fe/src/features/users/pages/UserDetailPage.tsx] [VERIFIED: fe/src/features/permissions/components/ResourceGrantEditor.tsx]
- **Do not claim every entity-permission surface has migrated:** KB and DocumentCategory grant management is on the shared `ResourceGrantEditor`, but chat/search entity branches still have legacy IOUs. [VERIFIED: fe/src/features/knowledge-base/components/KnowledgeBasePermissionModal.tsx] [VERIFIED: fe/src/features/knowledge-base/components/EntityPermissionModal.tsx]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Maintainer onboarding | A brand-new ad hoc docs section outside existing taxonomy | One guide under `docs/detail-design/auth/` plus links from existing auth/user-team pages | Existing navigation already exposes auth docs there, and docs rules require category-based placement. [CITED: docs/CLAUDE.md] [VERIFIED: docs/.vitepress/config.ts] |
| Permission key reference | A manually maintained static permission table in docs | Explain the registry, generated FE snapshot, and admin matrix as the living source | Static manual tables will drift immediately as the registry evolves. [VERIFIED: be/src/shared/permissions/registry.ts] [VERIFIED: fe/scripts/generate-permission-keys.mjs] |
| FE gating guidance | "Check role strings" examples | `useHasPermission(PERMISSION_KEYS.X)` and `<Can>` examples | FE rules explicitly ban role-string comparisons as the normal pattern. [CITED: fe/CLAUDE.md] |
| BE extension guidance | "Edit `rbac.ts` and route role checks" | Registry file + middleware + tests workflow | `rbac.ts` is no longer canonical and route guards now depend on the registry-backed ability system. [VERIFIED: be/src/shared/config/rbac.ts] [VERIFIED: be/src/shared/middleware/auth.middleware.ts] |

**Key insight:** The documentation should explain the implemented system as a set of stable extension points, not reproduce a second permission model in prose. The registry, generated FE catalog artifacts, admin UI, and test suites are the reliable anchors. [VERIFIED: be/src/shared/permissions/registry.ts] [VERIFIED: fe/scripts/generate-permission-keys.mjs] [VERIFIED: be/tests/permissions] [VERIFIED: fe/tests/features/permissions]

## Common Pitfalls

### Pitfall 1: Describing The Old Role Model As Current

**What goes wrong:** Docs keep saying `member` or imply `member` is the default/current tenant role. [VERIFIED: codebase grep]  
**Why it happens:** Several existing docs pages were written before the legacy-role cleanup and were not updated. [VERIFIED: codebase grep]  
**How to avoid:** Standardize every role table and flow on `super-admin`, `admin`, `leader`, `user`, and note any historical alias only as migration history. [VERIFIED: be/src/shared/config/rbac.ts]  
**Warning signs:** Any doc page containing `member` in a role matrix or default-role statement. [VERIFIED: codebase grep]

### Pitfall 2: Explaining `rbac.ts` As Canonical

**What goes wrong:** New developers will edit the wrong file and miss registry/catalog/test propagation. [VERIFIED: be/src/shared/config/rbac.ts]  
**Why it happens:** Old docs still point to `rbac.js` / `rbac.ts` as the central permission definition. [VERIFIED: docs/detail-design/auth/overview.md] [VERIFIED: docs/detail-design/auth/rbac-abac.md]  
**How to avoid:** Document `rbac.ts` as a compatibility shim only, and make the maintainer guide start from module `*.permissions.ts` files plus sync/build/test steps. [VERIFIED: be/src/shared/config/rbac.ts] [VERIFIED: be/src/shared/permissions/registry.ts]  
**Warning signs:** Any guide that says "add a permission in `rbac.ts`". [VERIFIED: codebase grep]

### Pitfall 3: Omitting The FE Runtime Catalog And Generated Keys

**What goes wrong:** Docs become backend-only and new FE work bypasses `PERMISSION_KEYS` or forgets the generated snapshot/runtime refresh path. [VERIFIED: fe/src/lib/permissions.tsx] [VERIFIED: fe/scripts/generate-permission-keys.mjs]  
**Why it happens:** No current docs page explains `PermissionCatalogProvider`, generated keys, or registry-driven matrix behavior. [VERIFIED: codebase grep]  
**How to avoid:** The maintainer guide must include the FE file map, generation flow, and the `<Can>` vs `useHasPermission` decision rule. [CITED: fe/CLAUDE.md] [VERIFIED: fe/src/lib/permissions.tsx]  
**Warning signs:** Docs mention `/api/auth/abilities` but never mention `/api/permissions/catalog` or `PERMISSION_KEYS`. [VERIFIED: codebase grep]

### Pitfall 4: Claiming Full Migration Where Compatibility Debt Still Exists

**What goes wrong:** Docs mislead maintainers into believing every route and UI surface has already migrated to the same permission vocabulary. [VERIFIED: codebase grep]  
**Why it happens:** The milestone delivered the new canonical system, but some compatibility route gates and UI branches remain. [VERIFIED: codebase grep]  
**How to avoid:** Keep a short "Current compatibility exceptions" section in the comprehensive auth page and maintainer guide. [VERIFIED: codebase grep]  
**Warning signs:** Blanket statements like "all permissions now use only `permissions.*`" or "all entity permissions use `resource_grants`". [VERIFIED: codebase grep]

### Pitfall 5: Forgetting Docs Navigation And Build Verification

**What goes wrong:** The new maintainer guide exists on disk but is undiscoverable or breaks the docs build. [CITED: docs/CLAUDE.md]  
**Why it happens:** The docs workspace requires explicit sidebar updates in `docs/.vitepress/config.ts`. [CITED: docs/CLAUDE.md] [VERIFIED: docs/.vitepress/config.ts]  
**How to avoid:** Make sidebar update and `npm run docs:build` explicit plan tasks, not implicit cleanup. [CITED: docs/CLAUDE.md]  
**Warning signs:** New file added under `docs/detail-design/auth/` without a matching sidebar item. [VERIFIED: docs/.vitepress/config.ts]

## Code Examples

Verified patterns from current code:

### Backend: Register A Permission In The Code-Side Registry

```typescript
// Source: be/src/modules/permissions/permissions.permissions.ts
export const PERMISSIONS_PERMISSIONS = definePermissions('permissions', {
  view: {
    action: 'read',
    subject: PermissionSubjects.PermissionCatalog,
    label: 'View permissions catalog',
  },
  manage: {
    action: 'manage',
    subject: PermissionSubjects.PermissionCatalog,
    label: 'Manage permissions catalog',
  },
})
```

### Backend: Gate Admin Permission Endpoints

```typescript
// Source: be/src/modules/permissions/routes/permissions.routes.ts
router.get(
  '/catalog',
  requireAuth,
  requirePermission('permissions.view'),
  controller.getCatalog.bind(controller),
)
```

### Frontend: Flat Feature Gate

```tsx
// Source: fe/src/lib/permissions.tsx
const canCreateKb = useHasPermission(PERMISSION_KEYS.KNOWLEDGE_BASE_CREATE)
```

### Frontend: Registry-Driven Admin Matrix

```tsx
// Source: fe/src/features/permissions/components/PermissionMatrix.tsx
export const ROLE_COLUMNS = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.LEADER,
  UserRole.USER,
] as const
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static role/permission definitions described around `rbac.ts` | Code-side permission registry + boot sync + DB-backed `role_permissions` and FE runtime catalog [VERIFIED: be/src/shared/permissions/registry.ts] [VERIFIED: be/src/shared/permissions/sync.ts] [VERIFIED: fe/src/lib/permissions.tsx] | Phase 1 through Phase 4 of this milestone [VERIFIED: .planning/ROADMAP.md] | Docs must teach a lifecycle, not a hardcoded map. |
| Per-user permission docs centered on `PUT /api/users/:id/permissions` and `user_permissions` | Per-user overrides under `/api/permissions/users/:userId/overrides` plus user detail permissions tab [VERIFIED: be/src/modules/permissions/routes/permissions.routes.ts] [VERIFIED: fe/src/features/users/pages/UserDetailPage.tsx] | Phase 3 and Phase 5 [VERIFIED: .planning/ROADMAP.md] | User-management docs need operational rewrite. |
| KB/category sharing described as older team/entity permission tables only | KB and DocumentCategory sharing now uses `resource_grants` in shared FE editor flows, with some legacy chat/search entity branches still deferred [VERIFIED: fe/src/features/knowledge-base/components/KnowledgeBasePermissionModal.tsx] [VERIFIED: fe/src/features/knowledge-base/components/EntityPermissionModal.tsx] | Phase 5 and Phase 6 [VERIFIED: .planning/ROADMAP.md] | Docs must distinguish migrated surfaces from deferred ones. |

**Deprecated/outdated:**

- Treating `member` as a current permission role is outdated. [VERIFIED: be/src/shared/config/rbac.ts] [VERIFIED: codebase grep]
- Treating `rbac.ts` as the canonical permission-edit surface is outdated. [VERIFIED: be/src/shared/config/rbac.ts]
- Treating the docs as backend-only for permissions is outdated because FE now has runtime catalog, generated keys, and admin pages for matrix/effective access. [VERIFIED: fe/src/lib/permissions.tsx] [VERIFIED: fe/src/features/users/pages/PermissionManagementPage.tsx] [VERIFIED: fe/src/features/permissions/pages/EffectiveAccessPage.tsx]

## Assumptions Log

All material claims in this research were verified against the current repo state or cited from project docs. No unverified assumptions remain.

## Open Questions (RESOLVED)

1. **Should adjacent dataset-management SRS drift be included in the same phase?**
   - Resolution: Yes, but only as a targeted drift-sweep for direct permission-model inaccuracies. Phase 9 should not expand into a broad dataset-doc rewrite; it should patch adjacent pages such as `docs/srs/core-platform/fr-dataset-management.md` only where they still describe stale role or permission behavior.
   - Planning impact: Add a final drift-sweep task so adjacent permission-language fixes are intentional rather than incidental.

2. **How explicitly should compatibility exceptions be documented?**
   - Resolution: Keep architecture pages concise and put the exact compatibility-exception list in the new maintainer guide, with shorter summary references from the detailed auth pages.
   - Planning impact: The comprehensive auth page should summarize compatibility debt, while `permission-maintenance-guide.md` should carry the operational exception list future maintainers need.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Docs build and root scripts | ✓ [VERIFIED: local environment] | `v22.22.1` [VERIFIED: local environment] | — |
| npm | Docs build and workspace scripts | ✓ [VERIFIED: local environment] | `10.9.4` [VERIFIED: local environment] | — |
| VitePress scripts | Docs verification | ✓ [VERIFIED: package.json] [VERIFIED: docs/package.json] | Repo-pinned `^1.6.x` [VERIFIED: package.json] [VERIFIED: docs/package.json] | Root `npm run docs:build` aliases the docs workspace command. [VERIFIED: package.json] |

**Missing dependencies with no fallback:** None found. [VERIFIED: local environment]

**Missing dependencies with fallback:** None found. [VERIFIED: local environment]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | VitePress build verification plus targeted code/reference audit [VERIFIED: docs/CLAUDE.md] |
| Config file | `docs/.vitepress/config.ts` [VERIFIED: docs/.vitepress/config.ts] |
| Quick run command | `npm run docs:build` [VERIFIED: package.json] |
| Full suite command | `npm run docs:build` [VERIFIED: package.json] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOC-09-01 | New or changed docs pages are linked in VitePress navigation and have no broken build-time structure | build | `npm run docs:build` | ✅ [VERIFIED: package.json] |
| DOC-09-02 | Auth/user-team/security/API/database docs reflect current permission architecture and file names | manual code audit | `rg -n "member|rbac\\.ts|/api/permissions|resource_grants|user_permission_overrides|role_permissions" docs/srs docs/basic-design docs/detail-design` | ✅ [VERIFIED: codebase grep] |
| DOC-09-03 | Maintainer guide points to current BE/FE/admin/test extension files | manual code audit | `rg --files be/src/shared/permissions be/src/modules/permissions fe/src/lib fe/src/features/permissions be/tests/permissions fe/tests/features/permissions` | ✅ [VERIFIED: codebase grep] |
| DOC-09-04 | Docs do not claim full migration where compatibility exceptions still exist | manual code audit | `rg -n "requirePermission\\('manage_users'\\)|requirePermission\\('manage_knowledge_base'\\)|requireRole\\(" be/src` | ✅ [VERIFIED: codebase grep] |

### Sampling Rate

- **Per task commit:** `npm run docs:build` [VERIFIED: package.json]
- **Per wave merge:** `npm run docs:build` plus the targeted `rg` drift audit commands above. [VERIFIED: package.json] [VERIFIED: codebase grep]
- **Phase gate:** Docs build green and manual code-vs-doc spot check completed for all files in the drift matrix. [CITED: docs/CLAUDE.md]

### Wave 0 Gaps

- None for infrastructure. Existing docs build tooling is already present. [VERIFIED: package.json] [VERIFIED: docs/package.json]
- No automated semantic-doc drift test exists; plan should include manual code-audit verification steps for canonical files. [VERIFIED: codebase grep]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes [VERIFIED: docs/detail-design/auth/overview.md] | Auth docs must describe the real `/api/auth/*` and session/org-switch behavior, not stale role/default-role flows. [VERIFIED: be/src/modules/auth/auth.controller.ts] |
| V3 Session Management | yes [VERIFIED: docs/srs/core-platform/fr-authentication.md] | Docs must preserve current session + ability reload semantics for org switch and ability fetch. [VERIFIED: fe/src/lib/ability.tsx] [VERIFIED: be/tests/permissions/org-switch-cache.test.ts] |
| V4 Access Control | yes [VERIFIED: entire phase scope] | Canonical docs must describe registry, overrides, grants, `requirePermission`, and `requireAbility` accurately. [VERIFIED: be/src/shared/middleware/auth.middleware.ts] |
| V5 Input Validation | yes [CITED: be/CLAUDE.md] | Maintainer docs should remind readers that permission mutation endpoints are Zod-validated in the backend. [VERIFIED: be/src/modules/permissions/routes/permissions.routes.ts] |
| V6 Cryptography | no direct implementation change [VERIFIED: phase scope] | Not a primary phase concern because this phase updates docs rather than crypto code. |

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stale authorization docs cause maintainers to edit the wrong files | Tampering / Elevation of Privilege | Link docs directly to canonical registry, middleware, admin UI, and tests. [VERIFIED: be/src/shared/permissions/registry.ts] [VERIFIED: fe/src/lib/permissions.tsx] |
| Docs claim broader migration than the code actually implements | Spoofing / Elevation of Privilege | Add a compatibility-exceptions section sourced from current route grep results. [VERIFIED: codebase grep] |
| Missing FE permission propagation steps | Elevation of Privilege | Include generated catalog, `PERMISSION_KEYS`, runtime provider, and admin matrix/effective-access surfaces in the maintainer guide. [VERIFIED: fe/scripts/generate-permission-keys.mjs] [VERIFIED: fe/src/lib/permissions.tsx] [VERIFIED: fe/src/features/permissions/components/PermissionMatrix.tsx] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/09-update-docs-with-current-milestone-update-all-srs-basic-desi/09-CONTEXT.md` - locked decisions and canonical file set for Phase 9.
- `CLAUDE.md` - repo-level engineering constraints relevant to docs recommendations.
- `docs/CLAUDE.md` - docs placement, sidebar, and build rules.
- `docs/.vitepress/config.ts` - current docs navigation and auth sidebar state.
- `be/src/shared/permissions/registry.ts` - canonical permission definition entry point.
- `be/src/shared/permissions/sync.ts` - boot catalog sync behavior.
- `be/src/shared/config/rbac.ts` - current compatibility-shim status and role set.
- `be/src/shared/services/ability.service.ts` - canonical ability-source composition.
- `be/src/shared/middleware/auth.middleware.ts` - current enforcement APIs.
- `be/src/modules/permissions/routes/permissions.routes.ts` and `services/permissions.service.ts` - current permissions admin API contract.
- `fe/src/lib/permissions.tsx` and `fe/src/lib/ability.tsx` - FE runtime permission consumption.
- `fe/src/features/users/pages/PermissionManagementPage.tsx` and `fe/src/features/permissions/pages/EffectiveAccessPage.tsx` - admin UI entry points.
- `fe/src/features/permissions/components/PermissionMatrix.tsx`, `OverrideEditor.tsx`, `ResourceGrantEditor.tsx` - current maintenance surfaces.
- `fe/scripts/generate-permission-keys.mjs` - generated key workflow.
- `be/tests/permissions/` and `fe/tests/features/permissions/` - current regression coverage surfaces.
- Target docs pages under `docs/srs/`, `docs/basic-design/`, and `docs/detail-design/` listed in the drift matrix.

### Secondary (MEDIUM confidence)

- `package.json` and `docs/package.json` - repo-pinned docs tooling versions and commands.
- `fe/CLAUDE.md` and `be/CLAUDE.md` - workspace-specific extension rules.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all stack/tooling claims were verified from repo manifests and local environment.
- Architecture: HIGH - canonical permission flow, admin APIs, and FE surfaces were verified directly from current code.
- Pitfalls: HIGH - drift patterns were confirmed by direct grep hits in current docs and code.

**Research date:** 2026-04-12  
**Valid until:** 2026-05-12

## RESEARCH COMPLETE
