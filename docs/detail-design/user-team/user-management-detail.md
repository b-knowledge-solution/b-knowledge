# User Management: Step-by-Step Detail

> Detailed flow for user role changes, per-user overrides, effective-access inspection, and cache visibility in the current permission architecture.

## 1. Overview

This page documents the live user-permission workflow. The maintained path is no longer a legacy per-user permission table or endpoint. Instead, user access changes are made through:

- role assignment on the user record
- `/api/permissions/users/:userId/overrides` for explicit allow or deny exceptions
- `/api/permissions/who-can-do` for inspection
- `resource_grants` updates when the change is really a resource-sharing problem

## 2. Create User

```mermaid
sequenceDiagram
    participant Admin
    participant FE as Frontend
    participant BE as Backend
    participant DB as PostgreSQL

    Admin->>FE: Submit create-user form
    FE->>BE: POST /api/users
    BE->>BE: requireAuth
    BE->>BE: Compatibility gate for user-management route
    BE->>BE: Validate request payload
    BE->>DB: Insert user record with role
    BE-->>FE: 201 Created
    FE->>Admin: Offer follow-up access configuration
```

The follow-up access configuration happens in separate admin surfaces:

- update role-wide defaults in `PermissionManagementPage` only when the change should affect everyone with that role
- open the user's permissions tab when the change is specific to one user
- use `ResourceGrantEditor` when the real requirement is scoped access to a knowledge base or document category

## 3. Update User Role

```mermaid
sequenceDiagram
    participant Admin
    participant FE as Frontend
    participant BE as Backend
    participant Cache as Ability Cache
    participant DB as PostgreSQL

    Admin->>FE: Change role to super-admin/admin/leader/user
    FE->>BE: PUT /api/users/:id/role
    BE->>BE: requireAuth + route-specific auth guard
    BE->>BE: Validate target role
    BE->>BE: Enforce assigner policy and self-demotion safeguards
    BE->>DB: Update users.role
    BE->>Cache: Invalidate ability state
    BE-->>FE: 200 Updated user
    FE->>Admin: Show refresh notice for affected sessions
```

Role changes update the user's baseline permission set from `role_permissions`. They do not remove or rewrite per-user overrides automatically.

## 4. Manage Per-User Overrides

```mermaid
sequenceDiagram
    participant Admin
    participant FE as OverrideEditor
    participant BE as Permissions API
    participant DB as PostgreSQL

    Admin->>FE: Open UserDetailPage permissions tab
    FE->>BE: GET /api/permissions/users/:userId/overrides
    BE-->>FE: Existing allow/deny rows

    alt Add allow or deny
        Admin->>FE: Pick permission key in OverrideEditor
        FE->>BE: POST /api/permissions/users/:userId/overrides
        BE->>DB: INSERT user_permission_overrides
        BE-->>FE: 201 Created
    else Remove override
        Admin->>FE: Delete override chip
        FE->>BE: DELETE /api/permissions/overrides/:id
        BE->>DB: DELETE user_permission_overrides row
        BE-->>FE: 200 Removed
    end
```

Override semantics:

| Effect | Meaning |
|--------|---------|
| allow | Add a permission even if the role baseline does not grant it |
| deny | Remove a permission even if the role baseline grants it |

`OverrideEditor` also renders an effective-permissions panel so an admin can see the merged result against the current user role.

## 5. Inspect Effective Access

```mermaid
sequenceDiagram
    participant Admin
    participant FE as EffectiveAccessPage
    participant BE as Permissions API
    participant Ability as Ability Service

    Admin->>FE: Select permission key
    FE->>BE: GET /api/permissions/who-can-do?action=...&subject=...
    BE->>Ability: Evaluate tenant users against current rules
    Ability-->>BE: Matching users
    BE-->>FE: users[]
    FE->>Admin: Render clickable results
    Admin->>FE: Open one user row
    FE->>FE: Navigate to /admin/iam/users/:id?tab=permissions
```

Use this flow when debugging the merged result of role defaults, overrides, and grants. It is more reliable than reasoning from role labels alone.

## 6. When to Use Resource Grants Instead of Overrides

Do not use a user override when the requirement is "user X should access knowledge base Y" or "team Z should access category Q". That is a resource-sharing concern, not a flat permission-key concern.

Use `resource_grants` through `ResourceGrantEditor` when:

- access must be limited to one knowledge base or one document category
- the grantee is a team rather than one user
- the permission should follow team membership changes automatically

Use overrides when:

- the exception is about a flat capability such as entering an admin feature
- the permission is not tied to one resource instance
- the exception is intentionally user-specific

## 7. Session Invalidation and Cache Behavior

The backend rebuilds abilities from the latest `role_permissions`, `user_permission_overrides`, and `resource_grants`, but active sessions may not all observe the change at the exact same instant. The current operational behavior is:

- permission admin mutations trigger ability invalidation logic
- frontend admin surfaces display a refresh notice after successful edits
- affected users see the new result on the next guarded request or after refresh

Document this as cache invalidation plus next-request visibility, not as guaranteed real-time propagation.

## 8. Compatibility Notes

Some surrounding user CRUD routes still use legacy compatibility keys for authorization. That does not change the maintained permission-authoring path:

- new permission definitions still start in the backend registry
- per-user exceptions still belong in the permissions module
- this page should not teach legacy per-user permission storage as an active maintenance surface

## 9. Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/users/users.routes.ts` | User CRUD and role-update routes |
| `be/src/modules/permissions/routes/permissions.routes.ts` | Override and effective-access endpoints |
| `be/src/shared/services/ability.service.ts` | Ability merge logic for role defaults, overrides, and grants |
| `fe/src/features/users/pages/UserDetailPage.tsx` | User detail page with permissions tab |
| `fe/src/features/permissions/components/OverrideEditor.tsx` | Per-user allow/deny editor |
| `fe/src/features/permissions/pages/EffectiveAccessPage.tsx` | Effective-access inspection page |
| `fe/src/features/permissions/components/ResourceGrantEditor.tsx` | Resource-sharing editor used when access is resource-scoped |
