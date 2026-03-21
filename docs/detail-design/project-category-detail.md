# Project Categories & Versions - Detail Design

## Overview

Categories provide hierarchical organization within a project. Each category can contain versions, and each version links to a set of documents. Categories support nesting via `parent_id` to form a tree structure.

## Hierarchy

```mermaid
flowchart TD
    P[Project] --> C1[Category: Engineering]
    P --> C2[Category: Marketing]

    C1 --> C1A[Category: Backend<br/>parent_id = C1]
    C1 --> C1B[Category: Frontend<br/>parent_id = C1]

    C1A --> V1[Version: v1.0]
    C1A --> V2[Version: v2.0]

    V1 --> D1[Document: API Spec]
    V1 --> D2[Document: DB Schema]
    V2 --> D3[Document: API Spec v2]

    C2 --> V3[Version: Q1 2026]
    V3 --> D4[Document: Campaign Brief]
```

## Category CRUD

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/:id/categories` | Create a category |
| GET | `/api/projects/:id/categories` | List all categories (tree) |
| PUT | `/api/projects/:id/categories/:catId` | Update a category |
| DELETE | `/api/projects/:id/categories/:catId` | Delete a category and children |

### Create Category Sequence

```mermaid
sequenceDiagram
    participant Client
    participant Ctrl as Category Controller
    participant Svc as Category Service
    participant DB as PostgreSQL

    Client->>Ctrl: POST /api/projects/:id/categories<br/>{name, description, parent_id}
    Ctrl->>Ctrl: Verify project membership + write permission
    Ctrl->>Svc: createCategory(projectId, data)

    opt parent_id provided
        Svc->>DB: SELECT * FROM categories WHERE id = parent_id
        DB-->>Svc: Parent exists (or 404)
    end

    Svc->>DB: INSERT INTO categories<br/>(project_id, name, description, parent_id, sort_order)
    DB-->>Svc: category record
    Svc-->>Ctrl: category
    Ctrl-->>Client: 201 {category}
```

### Category Schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | Parent project |
| `name` | string | Category name |
| `description` | text | [OPTIONAL] Description |
| `parent_id` | uuid | [OPTIONAL] Parent category for nesting |
| `sort_order` | integer | Display order among siblings |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update time |

## Version CRUD

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `.../categories/:catId/versions` | Create a version |
| GET | `.../categories/:catId/versions` | List versions in category |
| PUT | `.../categories/:catId/versions/:verId` | Update a version |
| DELETE | `.../categories/:catId/versions/:verId` | Delete a version |

### Create Version Sequence

```mermaid
sequenceDiagram
    participant Client
    participant Ctrl as Version Controller
    participant Svc as Version Service
    participant DB as PostgreSQL

    Client->>Ctrl: POST .../categories/:catId/versions<br/>{name, description}
    Ctrl->>Ctrl: Verify project membership + write permission
    Ctrl->>Svc: createVersion(categoryId, data)
    Svc->>DB: Verify category exists
    DB-->>Svc: category record
    Svc->>DB: INSERT INTO versions<br/>(category_id, name, description, sort_order)
    DB-->>Svc: version record
    Svc-->>Ctrl: version
    Ctrl-->>Client: 201 {version}
```

### Version Schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `category_id` | uuid | Parent category |
| `name` | string | Version name (e.g., "v1.0", "Q1 2026") |
| `description` | text | [OPTIONAL] Description |
| `sort_order` | integer | Display order |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update time |

## Version Documents

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `.../versions/:verId/documents` | List documents in version |
| POST | `.../versions/:verId/documents` | Link documents to version |
| DELETE | `.../versions/:verId/documents/:docId` | Unlink a document |

### Link Documents Sequence

```mermaid
sequenceDiagram
    participant Client
    participant Ctrl as Version Controller
    participant Svc as Version Service
    participant DB as PostgreSQL

    Client->>Ctrl: POST .../versions/:verId/documents<br/>{document_ids: [id1, id2]}
    Ctrl->>Ctrl: Verify write permission
    Ctrl->>Svc: linkDocuments(versionId, documentIds)
    Svc->>DB: INSERT INTO version_documents<br/>(version_id, document_id) for each<br/>ON CONFLICT skip
    DB-->>Svc: OK
    Svc-->>Ctrl: linked
    Ctrl-->>Client: 200 {success: true}
```

## Full Workflow: Category to Documents

```mermaid
sequenceDiagram
    participant User
    participant BE as Backend API
    participant DB as PostgreSQL

    User->>BE: POST /api/projects/:id/categories<br/>{name: "Backend", parent_id: null}
    BE->>DB: INSERT category
    DB-->>BE: {id: cat1}
    BE-->>User: 201 {category}

    User->>BE: POST .../categories/cat1/versions<br/>{name: "v1.0"}
    BE->>DB: INSERT version
    DB-->>BE: {id: ver1}
    BE-->>User: 201 {version}

    User->>BE: POST .../versions/ver1/documents<br/>{document_ids: [doc1, doc2]}
    BE->>DB: INSERT version_documents (ver1, doc1), (ver1, doc2)
    DB-->>BE: OK
    BE-->>User: 200 {success: true}

    User->>BE: GET .../versions/ver1/documents
    BE->>DB: SELECT d.* FROM documents d<br/>JOIN version_documents vd ON vd.document_id = d.id<br/>WHERE vd.version_id = ver1
    DB-->>BE: [doc1, doc2]
    BE-->>User: 200 {documents: [...]}
```

## Delete Cascade

- **Delete category**: Removes all child categories (recursive), their versions, and version-document links.
- **Delete version**: Removes version-document links. Documents themselves are not deleted (they belong to datasets).

## Sync Configs

Projects support external sync configuration for automated content ingestion.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:id/sync-configs` | List sync configurations |
| POST | `/api/projects/:id/sync-configs` | Create sync config |
| PUT | `/api/projects/:id/sync-configs/:configId` | Update sync config |
| DELETE | `/api/projects/:id/sync-configs/:configId` | Delete sync config |

Sync configs define external sources (e.g., Git repositories, cloud storage) and schedules for automatic document synchronization into project categories.

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/projects/controllers/category.controller.ts` | Category endpoint handlers |
| `be/src/modules/projects/controllers/version.controller.ts` | Version endpoint handlers |
| `be/src/modules/projects/services/category.service.ts` | Category business logic |
| `be/src/modules/projects/services/version.service.ts` | Version business logic |
| `be/src/modules/projects/routes/` | Route definitions |
