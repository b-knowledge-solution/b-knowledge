# Database Design: Core Tables

## ER Diagram

```mermaid
erDiagram
    users {
        uuid id PK
        varchar email UK
        varchar display_name
        varchar password_hash
        varchar azure_ad_id UK
        varchar role "super-admin | admin | leader | member"
        varchar status "active | inactive | pending"
        uuid org_id FK
        varchar locale "en | vi | ja"
        timestamp created_at
        timestamp updated_at
    }

    teams {
        uuid id PK
        varchar name
        varchar description
        uuid tenant_id FK
        timestamp created_at
        timestamp updated_at
    }

    user_teams {
        uuid user_id FK
        uuid team_id FK
    }

    system_configs {
        varchar key PK
        jsonb value
        varchar description
        timestamp updated_at
    }

    audit_logs {
        uuid id PK
        uuid user_id FK
        varchar action "create | update | delete | login | logout"
        varchar resource_type
        uuid resource_id
        jsonb details
        varchar ip_address
        timestamp created_at
    }

    user_ip_history {
        uuid id PK
        uuid user_id FK
        varchar ip_address
        timestamp first_seen
        timestamp last_seen
    }

    broadcast_messages {
        uuid id PK
        varchar title
        text content
        varchar type "info | warning | maintenance"
        varchar priority "low | normal | high | urgent"
        uuid created_by FK
        timestamp starts_at
        timestamp ends_at
        timestamp created_at
    }

    user_dismissed_broadcasts {
        uuid user_id FK
        uuid broadcast_id FK
        timestamp dismissed_at
    }

    users ||--o{ user_teams : "belongs to"
    teams ||--o{ user_teams : "has members"
    users ||--o{ audit_logs : "generates"
    users ||--o{ user_ip_history : "tracked IPs"
    users ||--o{ user_dismissed_broadcasts : "dismisses"
    broadcast_messages ||--o{ user_dismissed_broadcasts : "dismissed by"
    users ||--o{ broadcast_messages : "created by"
```

## Table Descriptions

### users

Central user table supporting both local and Azure AD authentication. The `role` column determines RBAC permissions via the CASL ability hierarchy. The `org_id` field scopes users to tenants in multi-tenant deployments. Users with `azure_ad_id` are provisioned automatically on first SSO login.

### teams

Organizational grouping for users within a tenant. Teams are the primary grantee unit for ABAC permissions on datasets, chat assistants, and search apps. A user can belong to multiple teams.

### user_teams

Join table for the many-to-many relationship between users and teams. Composite primary key on `(user_id, team_id)`.

### system_configs

Key-value store for runtime system configuration. The `value` column uses JSONB for flexible typed storage (strings, numbers, arrays, objects). Used for feature flags, default settings, and system-wide parameters.

### audit_logs

Append-only log of all significant user actions. The `details` JSONB column captures action-specific context (old/new values for updates, metadata for creates). Used by the audit module for compliance and debugging.

### user_ip_history

Tracks IP addresses associated with each user session. Used for security monitoring, detecting account sharing, and geographic access patterns.

### broadcast_messages

System-wide announcements displayed to users. Supports scheduled visibility windows via `starts_at` / `ends_at` and priority-based rendering. Types control visual styling in the frontend.

### user_dismissed_broadcasts

Tracks which users have dismissed which broadcasts, preventing re-display after acknowledgment.

## Indexing Strategy

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| `users` | `email` | Unique | Login lookup |
| `users` | `azure_ad_id` | Unique (partial, non-null) | SSO lookup |
| `users` | `org_id, status` | Composite | Tenant user listing |
| `audit_logs` | `user_id, created_at` | Composite | User activity timeline |
| `audit_logs` | `resource_type, resource_id` | Composite | Resource audit trail |
| `audit_logs` | `created_at` | B-tree | Date range queries |
| `user_ip_history` | `user_id, ip_address` | Unique | Dedup IP tracking |
| `broadcast_messages` | `starts_at, ends_at` | Composite | Active broadcast queries |
| `user_dismissed_broadcasts` | `user_id, broadcast_id` | Unique (PK) | Dismiss lookup |

## Notes

- All `id` columns use UUID v4 generated at the application layer.
- Timestamps use `timestamptz` (UTC) throughout.
- Soft deletes are not used; `status` field controls visibility where needed.
- Migrations are managed exclusively through Knex (`npm run db:migrate`).
