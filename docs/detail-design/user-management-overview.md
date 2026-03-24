# User Management Overview

## Overview

User management covers the full lifecycle of user accounts in B-Knowledge, from creation through role assignment, profile updates, and deletion. Users can be created via Azure AD auto-provisioning or manual admin creation.

## User Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Invited: Admin creates user
    [*] --> AutoCreated: First Azure AD login

    Invited --> Active: User logs in
    AutoCreated --> Active: Session created

    Active --> ProfileUpdated: Update name/email/avatar
    Active --> RoleChanged: Admin changes role
    Active --> PermissionsUpdated: Permissions modified

    ProfileUpdated --> Active
    RoleChanged --> Active
    PermissionsUpdated --> Active

    Active --> Disabled: Admin disables account
    Disabled --> Active: Admin re-enables

    Active --> Deleted: Admin deletes user
    Disabled --> Deleted: Admin deletes user
    Deleted --> [*]
```

## User Creation Paths

```mermaid
flowchart TD
    subgraph Azure AD Auto-Create
        A1[User authenticates via Azure AD] --> A2{User exists in DB?}
        A2 -->|No| A3[Create user from AD claims]
        A3 --> A4[Assign default role: member]
        A4 --> A5[Assign to default organization]
        A2 -->|Yes| A6[Update profile from AD claims]
    end

    subgraph Manual Admin Create
        B1[Admin opens user management] --> B2[Fill user form]
        B2 --> B3[POST /api/users]
        B3 --> B4[Validate with Zod schema]
        B4 --> B5[Create user record]
        B5 --> B6[Assign specified role]
    end
```

## User Actions Overview

```mermaid
flowchart LR
    subgraph Profile
        P1[Update display name]
        P2[Update email]
        P3[Upload avatar]
        P4[Set language preference]
    end

    subgraph Access Control
        AC1[Assign role]
        AC2[Grant permissions]
        AC3[Add to team]
        AC4[Set dataset access]
    end

    subgraph Admin Actions
        AD1[Create user]
        AD2[Disable user]
        AD3[Delete user]
        AD4[View user activity]
    end

    User --> Profile
    User --> Access_Control
    Admin --> Admin_Actions
```

## Profile Management

| Field | Editable By | Sync Source | Notes |
|-------|-------------|------------|-------|
| `display_name` | Self, Admin | Azure AD (on login) | AD value takes precedence if SSO |
| `email` | Admin only | Azure AD (on login) | Used as fallback match key |
| `avatar` | Self | Manual upload | Stored in RustFS |
| `language` | Self | - | `en`, `vi`, `ja` |
| `azure_ad_id` | System | Azure AD | Immutable after link |

## Role Assignment Rules

```mermaid
flowchart TD
    A[Role change request] --> B{Who is requesting?}
    B -->|super-admin| C[Can assign any role]
    B -->|admin| D{Target role?}
    D -->|leader or member| E[Allowed]
    D -->|admin or super-admin| F[Denied: insufficient privilege]
    B -->|leader/member| G[Denied: no role assignment rights]

    C --> H{Self-demotion?}
    E --> H
    H -->|Yes| I[Warning: confirm action]
    H -->|No| J[Apply role change]
```

| Assigner Role | Can Assign |
|---------------|-----------|
| super-admin | super-admin, admin, leader, member |
| admin | leader, member |
| leader | - |
| member | - |

## Permission Grant Model

Permissions can be granted at three levels:

| Level | Mechanism | Example |
|-------|-----------|---------|
| **Role** | Inherited from assigned role | admin gets `manage_users` |
| **User** | Explicit per-user grant | User X gets `manage_datasets` |
| **Team** | Inherited from team membership | Team Y members get dataset access |

## IP History Tracking

```mermaid
sequenceDiagram
    participant Client
    participant AuthMiddleware
    participant IPService
    participant DB as PostgreSQL

    Client->>AuthMiddleware: Any authenticated request
    AuthMiddleware->>AuthMiddleware: Extract IP from request headers
    AuthMiddleware->>IPService: recordIP(userId, ip, userAgent)
    IPService->>DB: INSERT INTO user_ip_history (user_id, ip, user_agent, timestamp)
    Note over DB: Tracks every unique IP per user
    AuthMiddleware->>AuthMiddleware: Continue to route handler
```

- IP is extracted from `X-Forwarded-For` or `req.ip`
- Stored in `user_ip_history` table with timestamp and user agent
- Admins can view IP history for audit purposes
- Used for security monitoring and anomaly detection

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/users/` | User module (controller, service, routes) |
| `be/src/modules/auth/auth.service.ts` | User creation during Azure AD flow |
| `be/src/shared/middleware/auth.middleware.ts` | IP tracking middleware |
| `be/src/shared/config/rbac.js` | Role hierarchy and permission map |
