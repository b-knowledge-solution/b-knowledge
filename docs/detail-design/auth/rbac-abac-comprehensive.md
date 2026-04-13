# RBAC & ABAC: Comprehensive Authorization Reference

> Current technical reference for B-Knowledge authorization contracts, runtime flows, and known compatibility exceptions.

## 1. Overview

The implemented authorization stack is a CASL-based engine fed by a backend permission registry plus database-backed role defaults, overrides, and resource grants. This page documents the live architecture and its remaining compatibility debt. It should be read as a code-aligned reference, not as a replacement permission model written in prose.

For the shorter overview, see [RBAC & ABAC Permission Model](/detail-design/auth/rbac-abac). For maintainer onboarding, see [Permission Matrix System](/detail-design/auth/permission-matrix-system). For operational maintenance steps, use [Permission Maintenance Guide](/detail-design/auth/permission-maintenance-guide).

## 2. Architecture

```mermaid
flowchart TD
    A[Module permission specs] --> B[definePermissions in registry]
    B --> C[syncPermissionRegistry at boot]
    C --> D[permissions catalog table]
    D --> E[role_permissions]
    D --> F[user_permission_overrides]
    E --> G[buildAbilityFor]
    F --> G
    H[resource_grants] --> G
    I[legacy ABAC policies where present] --> G
    G --> J[CASL rules]
    J --> K[requirePermission]
    J --> L[requireAbility]
    J --> M[/api/auth/abilities]
    D --> N[/api/permissions/catalog]
    M --> O[AbilityProvider and <Can>]
    N --> P[PermissionCatalogProvider and useHasPermission]
```

## 3. Backend Source of Truth

### 3.1 Permission Registry and Sync

| Element | Contract |
|---------|----------|
| `be/src/shared/permissions/registry.ts` | Modules declare permissions with `definePermissions(feature, spec)` |
| `be/src/shared/permissions/sync.ts` | Boot reconciliation inserts, updates, and removes catalog rows to match the registry |
| `permissions` table | Catalog of known permission keys, actions, and subjects |

The registry is the canonical place to add a new permission. The boot sync then makes that permission discoverable to the admin APIs and frontend runtime catalog.

### 3.2 Runtime Ability Inputs

`be/src/shared/services/ability.service.ts` composes abilities in this order:

1. super-admin shortcut
2. `role_permissions`
3. `resource_grants`
4. Knowledge Base to `DocumentCategory` read cascade
5. allow rows from `user_permission_overrides`
6. existing ABAC policy overlays where still supported
7. deny rows from `user_permission_overrides` last

Important implemented behaviors:

- `super-admin` still short-circuits to unrestricted `manage all`.
- Every non-platform rule remains tenant-scoped with `tenant_id`.
- Resource grants emit row-scoped rules with `{ tenant_id, id }`.
- Knowledge Base read access can cascade into `DocumentCategory` read access.
- Override deny rules are emitted last so explicit denies win.

### 3.3 Role Cache and Shim Layer

| File | Current status |
|------|----------------|
| `be/src/shared/services/role-permission-cache.service.ts` | Boot-cached snapshot of global role defaults used by compatibility reads |
| `be/src/shared/config/rbac.ts` | Compatibility layer for hierarchy helpers and legacy permission lookups |

The role cache exists so older call sites can still resolve role defaults while the system uses the DB-backed catalog under the hood.

## 4. Middleware Contracts

### 4.1 `requirePermission`

`requirePermission(key)` is the canonical backend gate for flat feature permissions. It:

1. Confirms the key exists in the registry-backed catalog.
2. Resolves the key to its `(action, subject)` pair.
3. Asks the current CASL ability whether the action is allowed at class level.

Use this for feature toggles such as `permissions.view` or `knowledge_base.create`.

### 4.2 `requireAbility`

`requireAbility(action, subject, idParam?)` is the row-aware contract. It:

1. Builds or loads the user ability.
2. Wraps route params into the subject shape when an id parameter is supplied.
3. Checks CASL against row-scoped conditions such as resource grants.

Use this for operations where access depends on a concrete entity id rather than only a registry key.

## 5. Permissions Admin API

The admin module under `be/src/modules/permissions/routes/permissions.routes.ts` is the maintained API surface for permissions:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/permissions/catalog` | Return the registered permission catalog |
| `GET /api/permissions/who-can-do` | Resolve which users can perform an action/subject pair |
| `GET /api/permissions/roles/:role` | Read a role’s granted permission keys |
| `PUT /api/permissions/roles/:role` | Replace a role’s permission-key set |
| `GET /api/permissions/users/:userId/overrides` | Read active per-user overrides |
| `POST /api/permissions/users/:userId/overrides` | Create an allow or deny override |
| `DELETE /api/permissions/overrides/:id` | Remove an override |
| `GET /api/permissions/grants` | List row-scoped resource grants |
| `POST /api/permissions/grants` | Create a resource grant |
| `DELETE /api/permissions/grants/:id` | Remove a resource grant |

Read operations require `permissions.view`. Mutations require `permissions.manage`.

## 6. Frontend Runtime Contracts

### 6.1 Catalog-Driven Checks

`fe/src/lib/permissions.tsx` provides the catalog-backed frontend path:

- `PermissionCatalogProvider`
  Seeds from the generated snapshot, then hydrates from `GET /api/permissions/catalog`.
- `useHasPermission(key)`
  Resolves a permission key through the runtime catalog and checks the current ability.

This is the maintained FE path for named feature gates.

### 6.2 CASL Runtime Checks

`fe/src/lib/ability.tsx` provides the ability-backed path:

- `AbilityProvider`
  Loads current rules from `GET /api/auth/abilities`.
- `<Can>`
  Declarative subject/action gate.
- `useAppAbility()`
  Imperative CASL access.

Use `<Can>` for subject-level rendering decisions and `useHasPermission` for registry-key gates. The two are complementary, not competing systems.

## 7. Admin UI Surfaces

| Surface | Current responsibility |
|---------|------------------------|
| `fe/src/features/users/pages/PermissionManagementPage.tsx` | Entry page for permission administration |
| `fe/src/features/permissions/components/PermissionMatrix.tsx` | Role x permission matrix sourced from the live catalog |
| `fe/src/features/permissions/components/OverrideEditor.tsx` | User-level allow/deny overrides |
| `fe/src/features/permissions/components/ResourceGrantEditor.tsx` | Shared editor for KB/category-style row grants |

These UI surfaces are intentionally registry-driven so new permission keys appear without a hand-maintained static table.

## 8. Current Role Model

| Role | Meaning |
|------|---------|
| `super-admin` | Platform-wide unrestricted operator |
| `admin` | Tenant admin |
| `leader` | Tenant operator with elevated management rights |
| `user` | Baseline authenticated tenant user |

This is the active role vocabulary for auth docs and admin APIs.

## 9. Compatibility Exceptions

The new registry-driven model is canonical, but the cleanup is not total yet. The docs must keep these exceptions visible:

| Exception | Current state |
|-----------|---------------|
| `users.routes.ts` and `teams.routes.ts` | Many operations still use `manage_users` gates |
| `search.routes.ts` and `search-embed.routes.ts` | Some admin operations still rely on `manage_users` |
| Knowledge-base compatibility surfaces | Some routes still use `manage_knowledge_base` rather than newer feature keys |
| `system-tools`, `broadcast`, `dashboard`, `feedback`, `audit`, `system-history` | Older `manage_system`, `view_system_tools`, or `requireRole(...)` patterns still remain |
| Shared entity UI | KB and `DocumentCategory` grants use the shared grant editor, but chat/search entity branches still have deferred legacy IOUs |

These are compatibility boundaries, not the preferred extension points for new work.

## 10. Extension Guidance

When adding or changing a permission, maintainers should follow this sequence:

1. Add or update the backend registry definition.
2. Let boot sync publish it into the catalog.
3. Gate backend routes with `requirePermission` or `requireAbility`.
4. Gate frontend UI with `useHasPermission`, `<Can>`, or `useAppAbility()`.
5. Confirm the key appears in the admin matrix and related override/grant surfaces.
6. Update targeted backend and frontend permission tests.
7. Update `/detail-design/auth/permission-maintenance-guide` and related docs if the extension surface changed.

## 11. Related Docs

- [Auth System Overview](/detail-design/auth/overview)
- [Auth: Azure AD OAuth2 Flow](/detail-design/auth/azure-ad-flow)
- [Permission Matrix System](/detail-design/auth/permission-matrix-system)
- [RBAC & ABAC Permission Model](/detail-design/auth/rbac-abac)
- [Permission Maintenance Guide](/detail-design/auth/permission-maintenance-guide)
