# Auth: Local Root Login

## Overview

Local root login provides a built-in admin account for initial setup and emergency access. Credentials are defined via environment variables (`KB_ROOT_USER`, `KB_ROOT_PASSWORD`). This feature is controlled by the `ENABLE_LOCAL_LOGIN` flag.

## Login Flow

```mermaid
sequenceDiagram
    participant Browser
    participant Frontend
    participant Backend
    participant Valkey

    Browser->>Frontend: Enter username + password
    Frontend->>Backend: POST /api/auth/login/root {username, password}

    Backend->>Backend: Check ENABLE_LOCAL_LOGIN === true
    alt Local login disabled
        Backend-->>Frontend: 403 Local login disabled
    end

    Backend->>Backend: Compare username with KB_ROOT_USER
    Backend->>Backend: Compare password with KB_ROOT_PASSWORD (bcrypt)

    alt Credentials invalid
        Backend-->>Frontend: 401 Invalid credentials
    end

    Backend->>Valkey: Create session {userId: ROOT, role: super-admin}
    Backend-->>Frontend: 200 {user: {id, name, role}, session info}
    Frontend->>Frontend: Store user context, navigate to dashboard
```

## Re-Authentication Flow

Sensitive operations require recent authentication proof. The re-auth flow verifies the user's password again and updates a timestamp in the session.

```mermaid
sequenceDiagram
    participant Frontend
    participant Backend
    participant Valkey

    Frontend->>Backend: PUT /api/users/:id/role (sensitive operation)
    Backend->>Backend: requireRecentAuth(15) middleware

    alt recentAuth within 15 minutes
        Backend->>Backend: Proceed to route handler
    else recentAuth expired or missing
        Backend-->>Frontend: 403 {code: "REAUTH_REQUIRED"}
    end

    Note over Frontend: Show re-auth dialog
    Frontend->>Backend: POST /api/auth/reauth {password}
    Backend->>Backend: Verify password against stored/env credentials
    Backend->>Valkey: Update session.recentAuth = now()
    Backend-->>Frontend: 200 Re-authenticated

    Frontend->>Backend: Retry PUT /api/users/:id/role
    Backend->>Backend: requireRecentAuth(15) passes
    Backend->>Backend: Process role change
```

## requireRecentAuth Middleware

```mermaid
flowchart TD
    A[Request arrives] --> B[requireRecentAuth called with minutes param]
    B --> C{session.recentAuth exists?}
    C -->|No| D[403 REAUTH_REQUIRED]
    C -->|Yes| E{now - recentAuth < N minutes?}
    E -->|Yes| F[Next middleware / handler]
    E -->|No| D
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `minutes` | 15 | Maximum age of re-auth timestamp |

### Operations Requiring Re-Auth

| Operation | Endpoint | Reason |
|-----------|----------|--------|
| Change user role | `PUT /api/users/:id/role` | Privilege escalation risk |
| Delete user | `DELETE /api/users/:id` | Irreversible action |
| Change permissions | `PUT /api/users/:id/permissions` | Access control modification |
| Manage system settings | `PUT /api/settings/system` | System-wide impact |

## ENABLE_LOCAL_LOGIN Feature Flag

```mermaid
stateDiagram-v2
    [*] --> Enabled: ENABLE_LOCAL_LOGIN=true (default)
    [*] --> Disabled: ENABLE_LOCAL_LOGIN=false

    state Enabled {
        [*] --> LoginAvailable
        LoginAvailable --> RootSessionCreated: Valid credentials
    }

    state Disabled {
        [*] --> LoginBlocked
        LoginBlocked --> Return403: Any login attempt
    }
```

| Flag Value | Behavior |
|------------|----------|
| `true` (default) | Local root login enabled, login form shown |
| `false` | Local login endpoint returns 403, login form hidden |

### Production Recommendation

- Set `ENABLE_LOCAL_LOGIN=false` in production after Azure AD is configured
- Root account should only be used for initial setup
- All regular users should authenticate via Azure AD SSO

## Session Structure (Root User)

```
{
  userId: "root",
  role: "super-admin",
  activeOrg: "<default-org-id>",
  recentAuth: "2026-03-21T10:30:00Z",
  loginMethod: "local",
  createdAt: "2026-03-21T10:00:00Z"
}
```

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/auth/auth.controller.ts` | `POST /login/root`, `POST /reauth` handlers |
| `be/src/modules/auth/auth.service.ts` | Credential validation, session management |
| `be/src/shared/middleware/auth.middleware.ts` | `requireRecentAuth(minutes)` middleware |
| `be/.env` | `KB_ROOT_USER`, `KB_ROOT_PASSWORD`, `ENABLE_LOCAL_LOGIN` |
