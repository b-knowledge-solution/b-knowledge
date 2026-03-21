# Dataset CRUD: Step-by-Step Detail

## Overview

Detailed sequence flows for dataset creation, configuration, access control, ABAC policies, versioning, and deletion.

## Create Dataset

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant DB as PostgreSQL
    participant OS as OpenSearch

    User->>Frontend: Fill dataset creation form
    Frontend->>Backend: POST /api/rag/datasets {name, description, language, embeddingModel}

    Backend->>Backend: requireAuth
    Backend->>Backend: requirePermission('manage_datasets')
    Backend->>Backend: Validate Zod schema

    Backend->>DB: Check dataset name uniqueness within org
    alt Name taken
        Backend-->>Frontend: 409 Dataset name already exists
    end

    Backend->>DB: INSERT INTO knowledgebase (name, description, language, embedding_model, org_id, created_by)
    Backend->>OS: PUT /kb_{dataset_id} (create index with mapping)
    Note over OS: Index includes vector field, text field, metadata fields

    Backend-->>Frontend: 201 {dataset: {id, name, status: "created"}}
    Frontend->>User: Navigate to dataset configuration page
```

### OpenSearch Index Mapping

| Field | Type | Purpose |
|-------|------|---------|
| `chunk_id` | keyword | Unique chunk identifier |
| `content` | text | Chunk text for keyword search |
| `embedding` | knn_vector | Vector for similarity search |
| `document_id` | keyword | Parent document reference |
| `metadata` | object | Custom metadata fields |
| `created_at` | date | Indexing timestamp |

## Update Settings

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant DB as PostgreSQL

    User->>Frontend: Modify dataset settings
    Frontend->>Backend: PUT /api/rag/datasets/:id/settings {parser, chunkSize, chunkOverlap, embeddingModel}

    Backend->>Backend: requireAuth
    Backend->>Backend: requireAbility('manage', 'Dataset', {id})
    Backend->>Backend: Validate Zod schema

    Backend->>DB: UPDATE knowledgebase SET parser_config = :config WHERE id = :id

    alt Embedding model changed
        Backend->>Backend: Flag: all documents need re-embedding
        Backend->>DB: UPDATE documents SET status = 'pending_reindex' WHERE kb_id = :id
    end

    Backend-->>Frontend: 200 {settings: updated}
```

### Settings Schema

| Field | Type | Validation |
|-------|------|-----------|
| `parser` | enum | naive, recursive, semantic |
| `chunkSize` | number | 64-2048 |
| `chunkOverlap` | number | 0 to chunkSize/2 |
| `embeddingModel` | string | Must exist in org's configured models |
| `language` | enum | en, vi, ja |
| `separators` | string[] | Optional custom separators |

## Access Control Management

```mermaid
sequenceDiagram
    participant Admin
    participant Frontend
    participant Backend
    participant DB as PostgreSQL
    participant Valkey

    Admin->>Frontend: Open dataset access settings
    Frontend->>Backend: GET /api/rag/datasets/:id/access
    Backend-->>Frontend: {grants: [{grantee, type, level}]}

    Admin->>Frontend: Add user/team access
    Frontend->>Backend: PUT /api/rag/datasets/:id/access {grants: [...]}

    Backend->>Backend: requireAuth
    Backend->>Backend: requireAbility('manage', 'Dataset', {id})

    loop Each grant
        Backend->>Backend: Validate grantee exists
        Backend->>DB: UPSERT dataset_access (dataset_id, grantee_id, grantee_type, level)
    end

    Backend->>Valkey: Invalidate permission cache for affected users
    Backend-->>Frontend: 200 {grants: updated}
```

### Access Grant Structure

| Field | Type | Values |
|-------|------|--------|
| `grantee_id` | UUID | User or Team ID |
| `grantee_type` | enum | `user`, `team` |
| `level` | enum | `read`, `write`, `manage` |

## ABAC Policy Management

```mermaid
sequenceDiagram
    participant Admin
    participant Frontend
    participant Backend
    participant DB as PostgreSQL

    Admin->>Frontend: Configure ABAC policy
    Frontend->>Backend: GET /api/rag/datasets/:id/policy
    Backend-->>Frontend: {rules: [...]}

    Admin->>Frontend: Add/edit policy rules
    Frontend->>Backend: PUT /api/rag/datasets/:id/policy {rules: [...]}

    Backend->>Backend: requireAuth
    Backend->>Backend: requireAbility('manage', 'Dataset', {id})
    Backend->>Backend: Validate policy rule schema

    Backend->>DB: UPDATE knowledgebase SET policy_rules = :rules WHERE id = :id
    Backend-->>Frontend: 200 {rules: updated}
```

### Policy Rule Schema

```
{
  "rules": [
    {
      "action": "read",
      "subject": "Document",
      "conditions": {
        "department": {"$eq": "engineering"},
        "classification": {"$in": ["public", "internal"]}
      },
      "description": "Engineering team can read public and internal docs"
    }
  ]
}
```

## Document Versioning

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant S3 as RustFS
    participant DB as PostgreSQL
    participant Worker as RAG Worker

    User->>Frontend: Upload new version of document
    Frontend->>Backend: POST /api/rag/datasets/:id/documents/:docId/versions (multipart)

    Backend->>Backend: requireAuth
    Backend->>Backend: requireAbility('write', 'Dataset', {id})

    Backend->>S3: Upload file to storage
    S3-->>Backend: {fileKey, size, contentType}

    Backend->>DB: INSERT INTO document_versions (document_id, file_key, version, uploaded_by)
    Backend->>DB: UPDATE documents SET current_version = :newVersion, status = 'pending'

    Backend->>Worker: Publish parse task to Redis queue
    Backend-->>Frontend: 200 {version: {id, number, uploadedAt}}

    Worker->>Worker: Parse, chunk, embed new version
    Worker->>DB: UPDATE documents SET status = 'ready'
```

## Delete Dataset

```mermaid
sequenceDiagram
    participant Admin
    participant Frontend
    participant Backend
    participant OS as OpenSearch
    participant S3 as RustFS
    participant DB as PostgreSQL

    Admin->>Frontend: Click delete, confirm dialog
    Frontend->>Backend: DELETE /api/rag/datasets/:id

    Backend->>Backend: requireAuth
    Backend->>Backend: requireAbility('manage', 'Dataset', {id})

    Backend->>OS: DELETE /kb_{dataset_id} (delete entire index)
    Backend->>S3: Delete all files for dataset documents

    Backend->>DB: DELETE FROM tasks WHERE kb_id = :id
    Backend->>DB: DELETE FROM document_versions WHERE document_id IN (dataset docs)
    Backend->>DB: DELETE FROM documents WHERE kb_id = :id
    Backend->>DB: DELETE FROM dataset_access WHERE dataset_id = :id
    Backend->>DB: DELETE FROM knowledgebase WHERE id = :id

    Backend-->>Frontend: 200 {deleted: true}
    Frontend->>Admin: Navigate to dataset list
```

### Cascade Deletion Order

| Step | Resource | Action |
|------|----------|--------|
| 1 | OpenSearch index | Delete `kb_{id}` index with all chunks |
| 2 | RustFS files | Delete all stored document files |
| 3 | `tasks` | Delete all processing tasks |
| 4 | `document_versions` | Delete version history |
| 5 | `documents` | Delete document records |
| 6 | `dataset_access` | Delete access grants |
| 7 | `knowledgebase` | Delete dataset record |

## API Summary

| Operation | Method | Endpoint | Auth |
|-----------|--------|----------|------|
| Create dataset | POST | `/api/rag/datasets` | requirePermission('manage_datasets') |
| List datasets | GET | `/api/rag/datasets` | requireAuth |
| Get dataset | GET | `/api/rag/datasets/:id` | requireAbility('read') |
| Update settings | PUT | `/api/rag/datasets/:id/settings` | requireAbility('manage') |
| Get access | GET | `/api/rag/datasets/:id/access` | requireAbility('manage') |
| Set access | PUT | `/api/rag/datasets/:id/access` | requireAbility('manage') |
| Get policy | GET | `/api/rag/datasets/:id/policy` | requireAbility('manage') |
| Set policy | PUT | `/api/rag/datasets/:id/policy` | requireAbility('manage') |
| Upload version | POST | `/api/rag/datasets/:id/documents/:docId/versions` | requireAbility('write') |
| Delete dataset | DELETE | `/api/rag/datasets/:id` | requireAbility('manage') |

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/rag/services/rag-core.service.ts` | Core dataset CRUD and lifecycle |
| `be/src/modules/rag/controllers/` | Route handlers for dataset endpoints |
| `be/src/modules/rag/routes/` | Route definitions with middleware |
| `advance-rag/` | Python worker for parse/chunk/embed pipeline |
