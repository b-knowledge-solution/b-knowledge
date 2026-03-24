# Project CRUD - Detail Design

## Overview

This document details the CRUD operations for projects, members, dataset bindings, permissions, entity permissions, and activity logs. All operations enforce tenant scoping and CASL-based authorization.

## Create Project

```mermaid
sequenceDiagram
    participant Client
    participant Ctrl as Project Controller
    participant CASL as CASL Authorization
    participant Svc as Project Service
    participant DB as PostgreSQL

    Client->>Ctrl: POST /api/projects<br/>{name, description, avatar}
    Ctrl->>CASL: Check ability("manage", "Project")
    CASL-->>Ctrl: Allowed
    Ctrl->>Svc: createProject(tenantId, userId, data)
    Svc->>DB: INSERT INTO projects (name, description, avatar, tenant_id, created_by)
    DB-->>Svc: project record
    Svc->>DB: INSERT INTO project_permissions (project_id, user_id, role: "admin")
    DB-->>Svc: permission record
    Svc-->>Ctrl: project
    Ctrl-->>Client: 201 {project}
```

The creator is automatically assigned the `admin` role.

## Manage Members

```mermaid
sequenceDiagram
    participant Client
    participant Ctrl as Project Controller
    participant Svc as Project Service
    participant DB as PostgreSQL

    Client->>Ctrl: POST /api/projects/:id/members<br/>{user_id, role}
    Ctrl->>Ctrl: Verify caller is admin or leader
    Ctrl->>Svc: addMember(projectId, userId, role)
    Svc->>DB: INSERT INTO project_permissions<br/>(project_id, user_id, role)
    DB-->>Svc: OK
    Svc-->>Ctrl: member added
    Ctrl-->>Client: 200 {success: true}
```

| Operation | Endpoint | Required Role |
|-----------|----------|---------------|
| Add member | `POST /api/projects/:id/members` | admin, leader |
| Update role | `PUT /api/projects/:id/members/:userId` | admin |
| Remove member | `DELETE /api/projects/:id/members/:userId` | admin |
| List members | `GET /api/projects/:id/members` | any member |

## Dataset Binding

```mermaid
sequenceDiagram
    participant Client
    participant Ctrl as Project Controller
    participant Svc as Project Service
    participant DB as PostgreSQL

    Client->>Ctrl: POST /api/projects/:id/datasets/bind<br/>{dataset_ids: [id1, id2, ...]}
    Ctrl->>Ctrl: Verify caller is admin or leader
    Ctrl->>Svc: bindDatasets(projectId, datasetIds)
    Svc->>DB: BEGIN TRANSACTION
    Svc->>DB: INSERT INTO project_datasets (project_id, dataset_id)<br/>for each dataset_id (ON CONFLICT skip)
    DB-->>Svc: OK
    Svc->>DB: COMMIT
    Svc-->>Ctrl: bound
    Ctrl-->>Client: 200 {success: true}
```

| Operation | Endpoint | Description |
|-----------|----------|-------------|
| Bind datasets | `POST /api/projects/:id/datasets/bind` | Batch bind multiple datasets |
| Unbind dataset | `DELETE /api/projects/:id/datasets/:datasetId` | Remove single binding |
| List bound datasets | `GET /api/projects/:id/datasets` | List all linked datasets |

## RBAC Permissions

```mermaid
sequenceDiagram
    participant Client
    participant Ctrl as Project Controller
    participant Svc as Project Service
    participant DB as PostgreSQL

    Client->>Ctrl: POST /api/projects/:id/permissions<br/>{subject_type, subject_id, role}
    Ctrl->>Ctrl: Verify caller is admin
    Ctrl->>Svc: setPermission(projectId, data)
    Svc->>DB: UPSERT INTO project_permissions<br/>(project_id, subject_type, subject_id, role)
    DB-->>Svc: OK
    Svc-->>Ctrl: permission set
    Ctrl-->>Client: 200 {success: true}
```

| Operation | Endpoint |
|-----------|----------|
| Set permission | `POST /api/projects/:id/permissions` |
| List permissions | `GET /api/projects/:id/permissions` |
| Update permission | `PUT /api/projects/:id/permissions/:permId` |
| Delete permission | `DELETE /api/projects/:id/permissions/:permId` |

## Entity Permissions (ABAC)

```mermaid
sequenceDiagram
    participant Client
    participant Ctrl as Project Controller
    participant Svc as Project Service
    participant DB as PostgreSQL

    Client->>Ctrl: POST /api/projects/:id/entity-permissions<br/>{entity_type, entity_id, subject_type, subject_id, actions}
    Ctrl->>Ctrl: Verify caller is admin
    Ctrl->>Svc: setEntityPermission(projectId, data)
    Svc->>DB: UPSERT INTO project_entity_permission<br/>(project_id, entity_type, entity_id, subject_type, subject_id, actions)
    DB-->>Svc: OK
    Svc-->>Ctrl: entity permission set
    Ctrl-->>Client: 200 {success: true}
```

| Operation | Endpoint |
|-----------|----------|
| Set entity permission | `POST /api/projects/:id/entity-permissions` |
| List entity permissions | `GET /api/projects/:id/entity-permissions` |
| Update entity permission | `PUT /api/projects/:id/entity-permissions/:id` |
| Delete entity permission | `DELETE /api/projects/:id/entity-permissions/:id` |

## Activity Log

```mermaid
sequenceDiagram
    participant Client
    participant Ctrl as Project Controller
    participant Svc as Project Service
    participant DB as PostgreSQL

    Client->>Ctrl: GET /api/projects/:id/activity<br/>?page=1&page_size=20
    Ctrl->>Svc: getActivity(projectId, pagination)
    Svc->>DB: SELECT * FROM project_activity<br/>WHERE project_id = :id<br/>ORDER BY created_at DESC<br/>LIMIT :page_size OFFSET :offset
    DB-->>Svc: Activity records
    Svc-->>Ctrl: Paginated results
    Ctrl-->>Client: 200 {data: [...], total, page, page_size}
```

Activity records are automatically created by service methods during mutations.

## Delete Cascade

When a project is deleted, all dependent resources are removed in order:

```mermaid
flowchart TD
    DEL[DELETE /api/projects/:id] --> PERM[project_permissions]
    DEL --> EPERM[project_entity_permission]
    DEL --> PDS[project_datasets links]
    DEL --> CAT[categories]
    CAT --> VER[versions]
    VER --> VDOC[version_documents links]
    DEL --> CHAT[project chats]
    DEL --> SEARCH[project searches]
    DEL --> ACT[project_activity]
    DEL --> PROJ[project record]
```

Deletion is performed within a database transaction to ensure atomicity.

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/projects/controllers/project.controller.ts` | CRUD endpoint handlers |
| `be/src/modules/projects/services/project.service.ts` | Business logic and authorization |
| `be/src/modules/projects/routes/project.routes.ts` | Route definitions |
