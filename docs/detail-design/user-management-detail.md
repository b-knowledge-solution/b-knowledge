# User Management: Step-by-Step Detail

## Overview

Detailed sequence flows for user CRUD operations, role management, and security measures including IDOR prevention and IP tracking.

## Create User

```mermaid
sequenceDiagram
    participant Admin
    participant Frontend
    participant Backend
    participant DB as PostgreSQL

    Admin->>Frontend: Fill create user form
    Frontend->>Backend: POST /api/users {email, displayName, role}

    Backend->>Backend: requireAuth middleware
    Backend->>Backend: requirePermission('manage_users')

    Backend->>Backend: Validate request body (Zod schema)
    alt Validation fails
        Backend-->>Frontend: 400 {errors: [{field, message}]}
    end

    Backend->>DB: Check email uniqueness
    alt Email exists
        Backend-->>Frontend: 409 Email already in use
    end

    Backend->>DB: INSERT INTO users (email, display_name, role, org_id)
    Backend-->>Frontend: 201 {user: {id, email, displayName, role}}
    Frontend->>Admin: Show success, update user list
```

### Zod Validation Schema

| Field | Type | Rules |
|-------|------|-------|
| `email` | string | Required, valid email format |
| `displayName` | string | Required, 1-255 characters |
| `role` | enum | One of: member, leader, admin |
| `language` | enum | Optional, one of: en, vi, ja |

## Update User Role

```mermaid
sequenceDiagram
    participant Admin
    participant Frontend
    participant Backend
    participant Valkey
    participant DB as PostgreSQL

    Admin->>Frontend: Change user role dropdown
    Frontend->>Backend: PUT /api/users/:id/role {role: "leader"}

    Backend->>Backend: requireAuth middleware
    Backend->>Backend: requireRecentAuth(15)

    alt Re-auth expired
        Backend-->>Frontend: 403 {code: "REAUTH_REQUIRED"}
        Frontend->>Admin: Show password dialog
        Admin->>Frontend: Enter password
        Frontend->>Backend: POST /api/auth/reauth {password}
        Backend->>Valkey: Update session.recentAuth
        Backend-->>Frontend: 200
        Frontend->>Backend: Retry PUT /api/users/:id/role
    end

    Backend->>Backend: requirePermission('manage_users')
    Backend->>Backend: Check not self-demotion without confirmation
    Backend->>Backend: Validate assigner can assign target role

    Backend->>DB: UPDATE users SET role = 'leader' WHERE id = :id
    Backend->>Valkey: Invalidate target user's cached permissions
    Backend-->>Frontend: 200 {user: {id, role: "leader"}}
```

## Delete User

```mermaid
sequenceDiagram
    participant Admin
    participant Frontend
    participant Backend
    participant Valkey
    participant DB as PostgreSQL

    Admin->>Frontend: Click delete, confirm dialog
    Frontend->>Backend: DELETE /api/users/:id

    Backend->>Backend: requireAuth
    Backend->>Backend: requireRecentAuth(15)
    Backend->>Backend: requirePermission('manage_users')

    Backend->>Backend: Check not deleting self
    Backend->>Backend: Check not deleting last super-admin

    Backend->>Valkey: Delete all sessions for user
    Backend->>DB: DELETE FROM user_teams WHERE user_id = :id
    Backend->>DB: DELETE FROM user_permissions WHERE user_id = :id
    Backend->>DB: DELETE FROM user_ip_history WHERE user_id = :id
    Backend->>DB: DELETE FROM users WHERE id = :id

    Backend-->>Frontend: 200 {deleted: true}
    Frontend->>Admin: Remove user from list
```

### Cascade Deletion Order

| Step | Table | Action |
|------|-------|--------|
| 1 | Valkey sessions | Delete all active sessions |
| 2 | `user_teams` | Remove all team memberships |
| 3 | `user_permissions` | Remove all explicit permissions |
| 4 | `user_ip_history` | Remove IP audit trail |
| 5 | `users` | Delete user record |

## IDOR Prevention

```mermaid
flowchart TD
    A[Request: GET /api/users/:id] --> B[Extract user from session]
    B --> C{Is super-admin?}
    C -->|Yes| D[Allow: cross-org access]
    C -->|No| E{Same org as target?}
    E -->|Yes| F{Has manage_users?}
    E -->|No| G[403: Access denied]
    F -->|Yes| H[Allow: admin access]
    F -->|No| I{Requesting own data?}
    I -->|Yes| J[Allow: self access]
    I -->|No| G
```

All user endpoints enforce tenant isolation:

- **List users**: Filtered by `org_id = session.activeOrg`
- **Get user**: Verify target user belongs to same org
- **Update user**: Same-org check + permission check
- **Delete user**: Same-org check + re-auth + permission check

## IP History Tracking

```mermaid
flowchart TD
    A[Authenticated request] --> B[IP tracking middleware]
    B --> C[Extract IP from X-Forwarded-For or req.ip]
    C --> D[Extract User-Agent header]
    D --> E[Async: INSERT into user_ip_history]
    E --> F[Continue to route handler]

    G[Admin: GET /api/users/:id/ip-history] --> H[Return paginated IP records]
```

### IP History Record

| Field | Type | Description |
|-------|------|-------------|
| `user_id` | UUID | Reference to users table |
| `ip_address` | string | IPv4 or IPv6 address |
| `user_agent` | string | Browser/client identifier |
| `timestamp` | datetime | When the request was made |

## Update Profile

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant DB as PostgreSQL

    User->>Frontend: Edit profile form
    Frontend->>Backend: PUT /api/users/me {displayName, language}
    Backend->>Backend: requireAuth
    Backend->>Backend: Validate Zod schema
    Backend->>DB: UPDATE users SET display_name, language WHERE id = :sessionUserId
    Backend-->>Frontend: 200 {user: updated}
```

Users can only edit their own profile fields. Email changes require admin action.

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/users/users.controller.ts` | Route handlers for all user endpoints |
| `be/src/modules/users/users.service.ts` | Business logic: create, update, delete, list |
| `be/src/modules/users/users.routes.ts` | Route definitions with middleware chains |
| `be/src/shared/middleware/auth.middleware.ts` | requireAuth, requireRecentAuth, IP tracking |
