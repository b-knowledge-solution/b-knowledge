# Database Design: Project Tables

## ER Diagram

```mermaid
erDiagram
    projects {
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

    project_permissions {
        uuid id PK
        uuid project_id FK
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

    project_datasets {
        uuid id PK
        uuid project_id FK
        uuid dataset_id FK "datasets reference"
        varchar role "primary | secondary"
        uuid created_by FK
        timestamp created_at
    }

    project_sync_configs {
        uuid id PK
        uuid project_id FK "unique"
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
        uuid project_id FK
        varchar name
        text description
        int sort_order
        jsonb dataset_config
        text category_type "default 'documents' (migration 20260324)"
        uuid dataset_id FK "datasets SET NULL (migration 20260324)"
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

    project_chats {
        uuid id PK
        uuid project_id FK
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

    project_searches {
        uuid id PK
        uuid project_id FK
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

    project_entity_permissions {
        uuid id PK
        uuid project_id FK
        varchar entity_type "category | chat | search"
        uuid entity_id
        varchar grantee_type "user | team"
        uuid grantee_id
        varchar permission_level "none | view | create | edit | delete"
        uuid created_by FK
        uuid updated_by FK
        timestamp created_at
        timestamp updated_at
    }

    projects ||--o{ project_permissions : "access controlled by"
    projects ||--o{ project_datasets : "contains datasets"
    projects ||--o| project_sync_configs : "syncs with"
    projects ||--o{ document_categories : "organizes into"
    document_categories ||--o{ document_category_versions : "has versions"
    document_category_versions ||--o{ document_category_version_files : "includes files"
    projects ||--o{ project_chats : "links chat assistants"
    projects ||--o{ project_searches : "links search apps"
    projects ||--o{ project_entity_permissions : "fine-grained access"
```

## Hierarchical Category Structure

```mermaid
graph TD
    P["Project: Engineering Docs"]
    P --> C1["Category: API Reference"]
    P --> C2["Category: Architecture"]
    P --> C3["Category: Onboarding"]

    C1 --> V1["Version 1.0 (active)"]
    C1 --> V2["Version 1.1 (active)"]
    V1 --> F1["file: rest-api-v1.pdf"]
    V1 --> F2["file: auth-endpoints.pdf"]
    V2 --> F3["file: rest-api-v1.1.pdf"]
```

The `document_categories` table organizes documents within a project. Categories are scoped to a project and ordered via `sort_order`. Each category can have multiple versions via `document_category_versions`, enabling content snapshots tied to RAGFlow datasets. The `category_type` column (added by migration 20260324) distinguishes between different kinds of categories (default `'documents'`), and the `dataset_id` foreign key (also added by migration 20260324) allows linking a category directly to a dataset.

### Category Version File Lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending: File added
    pending --> uploaded: Upload complete
    uploaded --> parsing: RAGFlow parsing
    parsing --> completed: Parse success
    parsing --> failed: Parse error
    failed --> pending: Retry
    completed --> [*]
```

## Table Descriptions

### projects

Top-level organizational container that groups datasets, chat assistants, search apps, and document categories. Projects enable cross-functional teams to manage related knowledge resources as a unit. Each project can have a default embedding model, chunk method, and parser config applied to its categories. The `is_private` flag controls visibility, and `tenant_id` scopes the project to a tenant (default `'default'`).

### project_permissions

Project-level access control with tab-granular permissions. Instead of a single permission level, access is controlled per tab: `tab_documents`, `tab_chat`, and `tab_settings`, each accepting `none`, `view`, or `manage`. Unique constraint on `(project_id, grantee_type, grantee_id)`.

### project_datasets

Many-to-many link between projects and datasets. Each association has a `role` of either `primary` or `secondary`. Unique constraint on `(project_id, dataset_id)`. Cascades on project deletion; cascades on dataset deletion.

### project_sync_configs

Per-project synchronization configuration. Each project has at most one sync config (unique on `project_id`). Stores a `schedule`, `auto_sync_enabled` toggle, and a `settings` JSONB column for sync-specific parameters.

### document_categories / document_category_versions / document_category_version_files

Three-tier structure for organizing documents within a project:
1. **Category** — flat list per project (no parent hierarchy), with `dataset_config` JSONB for category-level dataset settings. The `category_type` column (migration 20260324) classifies the category, and the optional `dataset_id` FK (migration 20260324) links to a dataset directly.
2. **Version** — content snapshot tied to a RAGFlow dataset (`ragflow_dataset_id`, `ragflow_dataset_name`). Unique constraint on `(category_id, version_label)`.
3. **Version File** — individual files within a version, tracked through RAGFlow with `ragflow_doc_id` and a status lifecycle (`pending` → `uploaded` → `parsing` → `completed` / `failed`). Unique constraint on `(version_id, file_name)`.

### project_chats

Chat assistant configurations within a project. Each chat has its own `ragflow_chat_id`, `dataset_ids` and `ragflow_dataset_ids` (JSONB arrays), plus `llm_config` and `prompt_config` (JSONB) for model and prompt settings. Cascades on project deletion.

### project_searches

Search app configurations within a project. Each search has its own `ragflow_search_id`, `dataset_ids` and `ragflow_dataset_ids` (JSONB arrays), plus `search_config` (JSONB) for search parameters. Cascades on project deletion.

### project_entity_permissions

Fine-grained permissions for individual entities within a project. While `project_permissions` controls project-level tab access, this table controls access to specific categories, chats, or searches. The `permission_level` supports `none`, `view`, `create`, `edit`, and `delete`. Unique constraint on `(project_id, entity_type, entity_id, grantee_type, grantee_id)`.

## RBAC + ABAC Dual Authorization Model

```mermaid
flowchart TD
    req["Access Request"] --> rbac{"RBAC Check<br/>project_permissions"}
    rbac -->|"No project access"| deny["403 Forbidden"]
    rbac -->|"Has project access"| entity{"Accessing specific<br/>entity?"}
    entity -->|"Project-level action"| allow["Allow (tab permission sufficient)"]
    entity -->|"Entity-level action"| abac{"ABAC Check<br/>project_entity_permissions"}
    abac -->|"Explicit grant exists"| check_level{"Permission level<br/>sufficient?"}
    abac -->|"No grant"| fallback{"Fallback to<br/>tab permission?"}
    fallback -->|"manage permission"| allow
    fallback -->|"Other"| deny
    check_level -->|"Yes"| allow
    check_level -->|"No"| deny
```

Authorization resolves in two layers:

1. **Project-level (RBAC)**: Does the user/team have a `project_permissions` grant? Tab-level permissions (`tab_documents`, `tab_chat`, `tab_settings`) gate access to each section of the project.
2. **Entity-level (ABAC)**: For specific resources within the project, `project_entity_permissions` provides fine-grained control. Users with tab `manage` permission bypass entity-level checks for that tab's entities.

## Unique Constraints

| Table | Columns | Purpose |
|-------|---------|---------|
| `project_permissions` | `(project_id, grantee_type, grantee_id)` | One grant per grantee per project |
| `project_datasets` | `(project_id, dataset_id)` | No duplicate dataset links |
| `project_sync_configs` | `(project_id)` | One sync config per project |
| `document_category_versions` | `(category_id, version_label)` | Unique version labels per category |
| `document_category_version_files` | `(version_id, file_name)` | No duplicate files per version |
| `project_entity_permissions` | `(project_id, entity_type, entity_id, grantee_type, grantee_id)` | One permission per entity-grantee pair |
