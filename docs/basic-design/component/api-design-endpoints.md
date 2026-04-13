# API Endpoint Reference

> Endpoint groups most relevant to the current permission-system architecture and maintenance workflow.

## 1. Overview

This page highlights the authentication and authorization contracts that maintainers rely on when extending the current permission system. It does not repeat every application endpoint. Instead, it documents the endpoint surfaces that now define the live permission model:

- authentication/session endpoints
- ability and permission-catalog endpoints
- permission administration endpoints under `/api/permissions/*`
- representative protected feature endpoints that depend on `requirePermission` or `requireAbility`

## 2. Authentication and Ability Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/auth/config` | No | Returns public authentication configuration |
| `GET` | `/api/auth/me` | No | Returns the current session user when present |
| `POST` | `/api/auth/logout` | Yes | Destroys the current session |
| `POST` | `/api/auth/reauth` | Yes | Refreshes recent-auth timestamps for sensitive flows |
| `POST` | `/api/auth/refresh-token` | Yes | Refreshes provider token state for the current authenticated session |
| `GET` | `/api/auth/token-status` | Yes | Returns token freshness / expiry metadata for the current session |
| `GET` | `/api/auth/abilities` | Yes | Returns serialized CASL rules for the current session |
| `GET` | `/api/auth/orgs` | Yes | Lists the user’s available org memberships |
| `POST` | `/api/auth/switch-org` | Yes | Switches active org and recomputes session-scoped access |

`/api/auth/abilities` is the subject/action contract consumed by the frontend ability provider. It is complementary to, not a replacement for, the permission catalog API. `refresh-token` and `token-status` remain auth/session endpoints rather than permission-catalog endpoints.

## 3. Permission Module Endpoints

The permissions module is the canonical admin API for the current authorization system. Its routes are implemented in [`be/src/modules/permissions/routes/permissions.routes.ts`](/mnt/d/Project/b-solution/b-knowledge/be/src/modules/permissions/routes/permissions.routes.ts).

### 3.1 Read endpoints

| Method | Path | Guard | Description |
|--------|------|-------|-------------|
| `GET` | `/api/permissions/catalog` | `requirePermission('permissions.view')` | Returns the registry-backed catalog used by FE runtime permission checks |
| `GET` | `/api/permissions/who-can-do` | `requirePermission('permissions.view')` | Lists which users can perform an action/subject pair, optionally for a specific resource id |
| `GET` | `/api/permissions/roles/:role` | `requirePermission('permissions.view')` | Returns effective permission keys assigned to a role in the caller’s tenant |
| `GET` | `/api/permissions/users/:userId/overrides` | `requirePermission('permissions.view')` | Lists active user-level allow/deny overrides |
| `GET` | `/api/permissions/grants` | `requirePermission('permissions.view')` | Lists resource grants, optionally filtered by resource type and id |

### 3.2 Mutation endpoints

| Method | Path | Guard | Description |
|--------|------|-------|-------------|
| `PUT` | `/api/permissions/roles/:role` | `requirePermission('permissions.manage')` | Replaces the role’s permission key set |
| `POST` | `/api/permissions/users/:userId/overrides` | `requirePermission('permissions.manage')` | Creates a user-level allow or deny override |
| `DELETE` | `/api/permissions/overrides/:id` | `requirePermission('permissions.manage')` | Deletes a user override |
| `POST` | `/api/permissions/grants` | `requirePermission('permissions.manage')` | Creates a row-scoped resource grant |
| `DELETE` | `/api/permissions/grants/:id` | `requirePermission('permissions.manage')` | Deletes a resource grant |

### 3.3 Why these endpoints matter

These endpoints expose the live data model behind the authorization system:

- catalog definitions from `permissions`
- role defaults from `role_permissions`
- user exceptions from `user_permission_overrides`
- row-scoped access from `resource_grants`

They replace older documentation patterns that described direct role-specific route access or ad hoc per-user/team permission APIs as the primary control surface.

## 4. Representative Protected Feature Endpoints

The rest of the API consumes the same shared middleware pipeline. Common patterns are:

| Pattern | Example shape | Typical middleware |
|---------|---------------|--------------------|
| Tenant-wide feature gate | `POST /api/...` create routes | `requirePermission('feature.create')` |
| Tenant-wide admin module read | `GET /api/permissions/catalog` | `requirePermission('permissions.view')` |
| Specific record edit/delete | `PUT /api/.../:id` or `DELETE /api/.../:id` | `requireAbility('update', 'Subject', 'id')` or equivalent |
| Retrieval or search against scoped data | `POST /api/search/...` / `POST /api/chat/...` | Session auth plus ability/grant-aware service logic |

For maintainers, the key design rule is that routes should not introduce new role-string branching when a catalog key or subject/action check can express the requirement.

## 5. Current Endpoint Design Rules

### 5.1 Flat permission checks

Use `requirePermission` when the decision is about a feature capability and does not depend on a specific resource row.

Examples:

- permission administration
- viewing the permission catalog
- tenant-wide admin screens

### 5.2 Row-scoped ability checks

Use `requireAbility` when the route operates on a specific row or resource identity and access can be shaped by:

- role-derived CASL rules
- `user_permission_overrides`
- `resource_grants`
- tenant scoping and record ownership

This is the path that distinguishes “can edit any record of this type in this tenant” from “can edit this specific record because a grant applies.”

## 6. Frontend Contracts

| Endpoint | FE consumer | Purpose |
|----------|-------------|---------|
| `/api/auth/abilities` | `fe/src/lib/ability.tsx` | Loads serialized ability rules for `<Can>` and row-scoped checks |
| `/api/permissions/catalog` | `fe/src/lib/permissions.tsx` | Loads the key catalog for `useHasPermission()` |
| `/api/permissions/roles/:role` and related admin APIs | `fe/src/features/permissions/api/permissionsApi.ts` | Drives the permission matrix, override editor, grant editor, and effective-access views |

## 7. Obsolete Endpoint Narratives To Avoid

Do not describe the following as the primary live model:

- route access based solely on fixed role labels
- legacy team-scoped permission APIs as the main extension path
- `PUT /api/users/:id/permissions` as the main way to manage the new permission system
- `rbac.ts` edits as the step that makes a new permission available

The maintained extension path is registry definition plus the `/api/permissions/*` admin surface.

## 8. Related Docs

- [API Design Overview](/basic-design/component/api-design-overview)
- [Security Architecture](/basic-design/system-infra/security-architecture)
- [Database Design: Core Tables](/basic-design/database/database-design-core)
