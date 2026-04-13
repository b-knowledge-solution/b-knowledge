# Database Design: Knowledge Base Tables

> Migration note: `projects*` tables were renamed to `knowledge_base*` in migration `20260402000000_rename_projects_to_knowledge_base.ts`. This page documents the current table names used by the backend.

## ER Diagram

```mermaid
erDiagram
    knowledge_base {
        uuid id PK
        varchar name
        text description
        varchar avatar
        uuid ragflow_server_id
        varchar default_embedding_model
        varchar default_chunk_method
        jsonb default_parser_config
        varchar status "default 'active'"
        boolean is_private
        varchar tenant_id "default 'default'"
        uuid created_by FK
        uuid updated_by FK
        timestamp created_at
        timestamp updated_at
    }

    knowledge_base_permissions {
        uuid id PK
        uuid knowledge_base_id FK
        varchar grantee_type "user | team"
        uuid grantee_id
        varchar tab_documents "none | view | manage"
        varchar tab_chat "none | view | manage"
        varchar tab_settings "none | view | manage"
        uuid created_by FK
        uuid updated_by FK
        timestamp created_at
        timestamp updated_at
    }

    knowledge_base_datasets {
        uuid id PK
        uuid knowledge_base_id FK
        uuid dataset_id FK "datasets reference"
        varchar role "primary | secondary"
        uuid created_by FK
        timestamp created_at
    }

    knowledge_base_sync_configs {
        uuid id PK
        uuid knowledge_base_id FK "unique"
        varchar schedule
        boolean auto_sync_enabled
        timestamp last_synced_at
        jsonb settings
        uuid created_by FK
        uuid updated_by FK
        timestamp created_at
        timestamp updated_at
    }

    document_categories {
        uuid id PK
        uuid knowledge_base_id FK
        varchar name
        text description
        int sort_order
        jsonb dataset_config
        text category_type "default 'documents'"
        uuid dataset_id FK "datasets SET NULL"
        uuid created_by FK
        uuid updated_by FK
        timestamp created_at
        timestamp updated_at
    }

    document_category_versions {
        uuid id PK
        uuid category_id FK
        varchar version_label
        varchar ragflow_dataset_id
        varchar ragflow_dataset_name
        varchar status "default 'active'"
        timestamp last_synced_at
        jsonb metadata
        uuid created_by FK
        uuid updated_by FK
        timestamp created_at
        timestamp updated_at
    }

    document_category_version_files {
        uuid id PK
        uuid version_id FK
        varchar file_name
        varchar ragflow_doc_id
        varchar status "pending | uploaded | parsing | completed | failed"
        text error
        timestamp created_at
        timestamp updated_at
    }

    knowledge_base_chats {
        uuid id PK
        uuid knowledge_base_id FK
        varchar name
        varchar ragflow_chat_id
        jsonb dataset_ids
        jsonb ragflow_dataset_ids
        jsonb llm_config
        jsonb prompt_config
        varchar status "default 'active'"
        timestamp last_synced_at
        uuid created_by FK
        uuid updated_by FK
        timestamp created_at
        timestamp updated_at
    }

    knowledge_base_searches {
        uuid id PK
        uuid knowledge_base_id FK
        varchar name
        text description
        varchar ragflow_search_id
        jsonb dataset_ids
        jsonb ragflow_dataset_ids
        jsonb search_config
        varchar status "default 'active'"
        timestamp last_synced_at
        uuid created_by FK
        uuid updated_by FK
        timestamp created_at
        timestamp updated_at
    }

    resource_grants {
        uuid id PK
        uuid knowledge_base_id "nullable after 20260408105510"
        varchar resource_type "KnowledgeBase | DocumentCategory"
        uuid resource_id
        varchar grantee_type "user | team"
        uuid grantee_id
        text permission_level "legacy compatibility"
        text[] actions "current grant actions"
        timestamp expires_at
    }

    knowledge_base ||--o{ knowledge_base_permissions : "tab-level access"
    knowledge_base ||--o{ knowledge_base_datasets : "contains datasets"
    knowledge_base ||--o| knowledge_base_sync_configs : "sync configuration"
    knowledge_base ||--o{ document_categories : "organizes into"
    document_categories ||--o{ document_category_versions : "has versions"
    document_category_versions ||--o{ document_category_version_files : "includes files"
    knowledge_base ||--o{ knowledge_base_chats : "links chat assistants"
    knowledge_base ||--o{ knowledge_base_searches : "links search apps"
```

## Table Descriptions

### knowledge_base

Top-level organizational container that groups datasets, chat assistants, search apps, sync configuration, and document categories.

### knowledge_base_permissions

Knowledge-base-level tab permissions for user/team principals.

### knowledge_base_datasets

Many-to-many link between knowledge bases and datasets with a `role` of `primary` or `secondary`.

### knowledge_base_sync_configs

Per-knowledge-base synchronization schedule and connector settings.

### document_categories / document_category_versions / document_category_version_files

Three-tier structure for content organization:
1. Category rows per knowledge base.
2. Version snapshots per category.
3. File rows per version with parser lifecycle status.

### knowledge_base_chats / knowledge_base_searches

Knowledge-base-scoped chat/search app configuration rows with local and external sync metadata.

### resource_grants

Row-scoped ABAC grants used by the current permission system. This table replaced `knowledge_base_entity_permissions` in migration `20260407052129_phase1_rename_entity_permissions_to_resource_grants.ts`.

## Current Access Model (RBAC + ABAC)

```mermaid
flowchart TD
    req["Access Request"] --> rbac{"RBAC Check<br/>knowledge_base_permissions"}
    rbac -->|"No KB tab access"| deny["403 Forbidden"]
    rbac -->|"Has KB tab access"| entity{"Resource-scoped action?"}
    entity -->|"No"| allow["Allow"]
    entity -->|"Yes"| abac{"ABAC Check<br/>resource_grants"}
    abac -->|"Granted action"| allow
    abac -->|"Not granted"| deny
```

## Unique Constraints

| Table | Columns | Purpose |
|-------|---------|---------|
| `knowledge_base_permissions` | `(knowledge_base_id, grantee_type, grantee_id)` | One tab-grant row per grantee in one KB |
| `knowledge_base_datasets` | `(knowledge_base_id, dataset_id)` | No duplicate dataset links |
| `knowledge_base_sync_configs` | `(knowledge_base_id)` | One sync config per knowledge base |
| `document_category_versions` | `(category_id, version_label)` | Unique version labels per category |
| `document_category_version_files` | `(version_id, file_name)` | No duplicate files per version |
| `resource_grants` | `(resource_type, resource_id, grantee_type, grantee_id)` | One row-scoped grant per resource/principal |
