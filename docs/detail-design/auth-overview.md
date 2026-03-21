# Auth System Overview

## Overview

B-Knowledge supports two authentication methods: Azure AD SSO for enterprise users and Local Root login for initial setup/administration. Sessions are stored in Valkey (Redis-compatible) and accessed via secure cookies.

## Authentication Flow

```mermaid
flowchart TD
    A[User visits app] --> B{Login method?}
    B -->|Enterprise| C[Azure AD SSO]
    B -->|Root admin| D[Local Root Login]

    C --> E[OAuth2 Authorization Code Flow]
    D --> F[Validate against env vars]

    E --> G[Create/Update user in DB]
    F --> G

    G --> H[Create session in Valkey]
    H --> I[Set session cookie]
    I --> J[Redirect to frontend]

    J --> K[Subsequent requests]
    K --> L{Session cookie present?}
    L -->|Yes| M[Load session from Valkey]
    L -->|No| N[401 Unauthorized]
    M --> O{Session valid?}
    O -->|Yes| P[Process request]
    O -->|Expired| N
```

## Session Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: Login success
    Created --> Active: First request with cookie
    Active --> Active: Subsequent requests
    Active --> Refreshed: Session extended on activity
    Refreshed --> Active: Continue using
    Active --> Expired: TTL exceeded / inactivity
    Active --> Destroyed: Explicit logout
    Refreshed --> Expired: TTL exceeded
    Expired --> [*]
    Destroyed --> [*]
```

| Phase | Description |
|-------|-------------|
| **Created** | Session object stored in Valkey with TTL |
| **Active** | Cookie sent on each request, session loaded from Valkey |
| **Refreshed** | Rolling expiry extended on activity |
| **Expired** | TTL exceeded, Valkey auto-deletes key |
| **Destroyed** | `POST /api/auth/logout` deletes session from Valkey |

## Permission Resolution Chain

```mermaid
flowchart LR
    A[Incoming Request] --> B[requireAuth]
    B --> C{Authenticated?}
    C -->|No| D[401]
    C -->|Yes| E[requireRole]
    E --> F{Has min role?}
    F -->|No| G[403]
    F -->|Yes| H[requirePermission]
    H --> I{Has permission?}
    I -->|No| G
    I -->|Yes| J[requireAbility]
    J --> K{CASL ability check?}
    K -->|No| G
    K -->|Yes| L[Route Handler]
```

Each middleware layer adds progressively finer checks:

1. **requireAuth** - Validates session exists and is not expired
2. **requireRole** - Checks user role meets minimum level (e.g., admin+)
3. **requirePermission** - Checks explicit permission flags (e.g., `manage_users`)
4. **requireAbility** - CASL-based check for action + subject + conditions (ABAC)

## Multi-Organization Support

```mermaid
flowchart TD
    A[User] -->|belongs to| B[Org A]
    A -->|belongs to| C[Org B]
    A -->|belongs to| D[Org C]

    E[Session] -->|active_org| B

    F[PUT /api/auth/switch-org] --> G[Update session.active_org]
    G --> H[Reload permissions for new org]
    H --> I[Return updated user context]
```

- A user can belong to multiple organizations (tenants)
- The session stores the currently active organization
- `switch-org` endpoint changes `session.activeOrg` and reloads role/permissions
- All data queries are scoped to the active organization via tenant isolation

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/auth/` | Auth module (controller, service, routes) |
| `be/src/shared/middleware/auth.middleware.ts` | requireAuth, requireRole, requirePermission, requireAbility |
| `be/src/shared/config/rbac.js` | Role hierarchy and permission definitions |
| `be/src/modules/auth/auth.controller.ts` | Login, logout, callback, switch-org endpoints |
| `be/src/modules/auth/auth.service.ts` | Session creation, Azure AD token exchange |
