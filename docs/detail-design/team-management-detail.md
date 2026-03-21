# Team Management: Step-by-Step Detail

## Overview

Teams group users together for shared permission management. Permissions granted to a team cascade to all team members, simplifying access control for datasets and other resources.

## Team Operations Flow

```mermaid
flowchart TD
    A[Create Team] --> B[Add Members]
    B --> C[Grant Permissions to Team]
    C --> D[Members inherit team permissions]
    D --> E[Use in RBAC/ABAC checks]

    F[Update Team] --> G[Modify name/description]
    H[Remove Member] --> I[Revoke inherited permissions]
    J[Delete Team] --> K[Cascade: remove memberships + permissions]
```

## Create Team

```mermaid
sequenceDiagram
    participant Admin
    participant Frontend
    participant Backend
    participant DB as PostgreSQL

    Admin->>Frontend: Fill team creation form
    Frontend->>Backend: POST /api/teams {name, description}

    Backend->>Backend: requireAuth
    Backend->>Backend: requireRole('admin')
    Backend->>Backend: Validate Zod schema

    Backend->>DB: Check team name uniqueness within org
    alt Name taken
        Backend-->>Frontend: 409 Team name already exists
    end

    Backend->>DB: INSERT INTO teams (name, description, org_id, created_by)
    Backend-->>Frontend: 201 {team: {id, name, description}}
    Frontend->>Admin: Show team created, navigate to team page
```

## Add Members

```mermaid
sequenceDiagram
    participant Admin
    participant Frontend
    participant Backend
    participant Valkey
    participant DB as PostgreSQL

    Admin->>Frontend: Select users to add
    Frontend->>Backend: POST /api/teams/:id/members {userIds: [...]}

    Backend->>Backend: requireAuth
    Backend->>Backend: requirePermission('manage_users')

    Backend->>DB: Verify team exists and belongs to org
    Backend->>DB: Verify all userIds belong to same org
    Backend->>DB: INSERT INTO user_teams (user_id, team_id) for each user

    Backend->>Valkey: Invalidate permission cache for affected users
    Backend-->>Frontend: 200 {added: count}
    Frontend->>Admin: Update member list
```

## Grant Team Permissions

```mermaid
sequenceDiagram
    participant Admin
    participant Frontend
    participant Backend
    participant Valkey
    participant DB as PostgreSQL

    Admin->>Frontend: Configure team permissions
    Frontend->>Backend: POST /api/teams/:id/permissions {permissions: [...]}

    Backend->>Backend: requireAuth
    Backend->>Backend: requireRole('admin')

    loop Each permission
        Backend->>Backend: Validate permission structure
        Backend->>DB: INSERT INTO team_permissions (team_id, resource_type, resource_id, action)
    end

    Backend->>Valkey: Invalidate permission cache for all team members
    Backend-->>Frontend: 200 {permissions: [...]}
```

### Permission Structure

| Field | Type | Description |
|-------|------|-------------|
| `resource_type` | string | `dataset`, `project`, `model_provider` |
| `resource_id` | UUID | Specific resource or `*` for all |
| `action` | string | `read`, `write`, `manage` |

## Permission Cascade to Members

```mermaid
flowchart TD
    A[Team: Engineering] --> B[Permission: read Dataset X]
    A --> C[Permission: write Dataset Y]

    D[User Alice] -->|member of| A
    E[User Bob] -->|member of| A

    D --> F[Alice can read Dataset X]
    D --> G[Alice can write Dataset Y]
    E --> H[Bob can read Dataset X]
    E --> I[Bob can write Dataset Y]

    J[CASL Ability Builder] --> K[Load user permissions]
    K --> L[Load team memberships]
    L --> M[Load team permissions]
    M --> N[Merge into ability]
```

## Entity Relationship

```mermaid
erDiagram
    teams {
        uuid id PK
        string name
        string description
        uuid org_id FK
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
    }

    users {
        uuid id PK
        string email
        string display_name
        string role
        uuid org_id FK
    }

    user_teams {
        uuid id PK
        uuid user_id FK
        uuid team_id FK
        timestamp joined_at
    }

    team_permissions {
        uuid id PK
        uuid team_id FK
        string resource_type
        uuid resource_id
        string action
        timestamp created_at
    }

    teams ||--o{ user_teams : "has members"
    users ||--o{ user_teams : "belongs to"
    teams ||--o{ team_permissions : "has permissions"
```

## Remove Member

```mermaid
sequenceDiagram
    participant Admin
    participant Frontend
    participant Backend
    participant Valkey
    participant DB as PostgreSQL

    Admin->>Frontend: Click remove on member
    Frontend->>Backend: DELETE /api/teams/:teamId/members/:userId

    Backend->>Backend: requireAuth
    Backend->>Backend: requirePermission('manage_users')

    Backend->>DB: DELETE FROM user_teams WHERE team_id = :teamId AND user_id = :userId
    Backend->>Valkey: Invalidate permission cache for removed user
    Backend-->>Frontend: 200 {removed: true}
```

## Delete Team (Cascade)

```mermaid
sequenceDiagram
    participant Admin
    participant Frontend
    participant Backend
    participant Valkey
    participant DB as PostgreSQL

    Admin->>Frontend: Click delete team, confirm
    Frontend->>Backend: DELETE /api/teams/:id

    Backend->>Backend: requireAuth
    Backend->>Backend: requireRole('admin')

    Backend->>DB: SELECT user_ids FROM user_teams WHERE team_id = :id
    Backend->>DB: DELETE FROM team_permissions WHERE team_id = :id
    Backend->>DB: DELETE FROM user_teams WHERE team_id = :id
    Backend->>DB: DELETE FROM teams WHERE id = :id

    Backend->>Valkey: Invalidate permission cache for all former members
    Backend-->>Frontend: 200 {deleted: true}
```

### Cascade Deletion Order

| Step | Table | Action |
|------|-------|--------|
| 1 | `team_permissions` | Remove all team permission grants |
| 2 | `user_teams` | Remove all membership records |
| 3 | `teams` | Delete team record |
| 4 | Valkey | Invalidate cached permissions for former members |

## Team CRUD Summary

| Operation | Method | Endpoint | Auth |
|-----------|--------|----------|------|
| List teams | GET | `/api/teams` | requireAuth |
| Create team | POST | `/api/teams` | requireRole('admin') |
| Get team | GET | `/api/teams/:id` | requireAuth |
| Update team | PUT | `/api/teams/:id` | requireRole('admin') |
| Delete team | DELETE | `/api/teams/:id` | requireRole('admin') |
| List members | GET | `/api/teams/:id/members` | requireAuth |
| Add members | POST | `/api/teams/:id/members` | requirePermission('manage_users') |
| Remove member | DELETE | `/api/teams/:id/members/:userId` | requirePermission('manage_users') |
| Set permissions | POST | `/api/teams/:id/permissions` | requireRole('admin') |

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/teams/teams.controller.ts` | Route handlers for team endpoints |
| `be/src/modules/teams/teams.service.ts` | Business logic: CRUD, membership, permissions |
| `be/src/modules/teams/teams.routes.ts` | Route definitions with middleware chains |
| `be/src/modules/auth/auth.service.ts` | CASL ability builder (loads team permissions) |
