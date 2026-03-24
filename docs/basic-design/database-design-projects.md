# Database Design: Project Tables

## ER Diagram

```mermaid
erDiagram
    projects {
        uuid id PK
        uuid tenant_id FK
        varchar name
        text description
        varchar status "active | archived"
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
    }

    project_permissions {
        uuid id PK
        uuid project_id FK
        varchar grantee_type "user | team"
        uuid grantee_id
        varchar permission "view | edit | manage"
    }

    project_datasets {
        uuid project_id FK
        uuid dataset_id FK "knowledgebase reference"
    }

    project_sync_config {
        uuid id PK
        uuid project_id FK
        varchar source_type "sharepoint | confluence | gdrive"
        jsonb connection_config "credentials, URLs, schedules"
        varchar status "active | paused | error"
        timestamp last_synced_at
        timestamp created_at
        timestamp updated_at
    }

    document_category {
        uuid id PK
        uuid project_id FK
        varchar name
        uuid parent_id FK "self-referencing for tree"
        int sort_order
        timestamp created_at
        timestamp updated_at
    }

    document_category_version {
        uuid id PK
        uuid category_id FK
        varchar label
        varchar status "draft | review | approved | archived"
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
    }

    document_category_version_file {
        uuid id PK
        uuid version_id FK
        uuid file_id FK "file table reference"
        int sort_order
    }

    project_chat {
        uuid project_id FK
        uuid assistant_id FK "chat_assistants reference"
    }

    project_search {
        uuid project_id FK
        uuid search_app_id FK "search_apps reference"
    }

    project_entity_permission {
        uuid id PK
        uuid project_id FK
        varchar entity_type "chat | search | dataset | category"
        uuid entity_id
        varchar grantee_type "user | team"
        uuid grantee_id
        varchar permission "view | use | edit | manage"
    }

    projects ||--o{ project_permissions : "access controlled by"
    projects ||--o{ project_datasets : "contains datasets"
    projects ||--o{ project_sync_config : "syncs from"
    projects ||--o{ document_category : "organizes into"
    document_category ||--o{ document_category : "parent-child"
    document_category ||--o{ document_category_version : "has versions"
    document_category_version ||--o{ document_category_version_file : "includes files"
    projects ||--o{ project_chat : "links assistants"
    projects ||--o{ project_search : "links search apps"
    projects ||--o{ project_entity_permission : "fine-grained access"
```

## Hierarchical Category Structure

```mermaid
graph TD
    P["Project: Engineering Docs"]
    P --> C1["Category: API Reference"]
    P --> C2["Category: Architecture"]
    P --> C3["Category: Onboarding"]

    C1 --> C1a["Subcategory: REST APIs"]
    C1 --> C1b["Subcategory: WebSocket APIs"]

    C2 --> C2a["Subcategory: System Design"]
    C2 --> C2b["Subcategory: Database"]

    C1a --> V1["Version 1.0 (approved)"]
    C1a --> V2["Version 1.1 (draft)"]
    V1 --> F1["file: rest-api-v1.pdf"]
    V1 --> F2["file: auth-endpoints.pdf"]
    V2 --> F3["file: rest-api-v1.1.pdf"]
```

The `document_category` table uses a self-referencing `parent_id` to build an unlimited-depth tree. Categories are scoped to a project and ordered via `sort_order`. Each category can have multiple versions, enabling a review/approval workflow before content goes live.

### Category Version Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft: Create version
    Draft --> Review: Submit for review
    Review --> Approved: Reviewer approves
    Review --> Draft: Reviewer requests changes
    Approved --> Archived: New version approved
    Archived --> [*]
```

## Table Descriptions

### projects

Top-level organizational container that groups datasets, chat assistants, search apps, and document categories. Projects enable cross-functional teams to manage related knowledge resources as a unit.

### project_permissions

Project-level RBAC grants. Controls who can access the project itself. Users with `manage` permission can modify project settings and grant access to others.

### project_datasets

Many-to-many link between projects and knowledge bases. A single dataset can be shared across multiple projects. Documents within linked datasets are searchable through the project's chat and search apps.

### project_sync_config

External data source synchronization configuration. Supports pulling documents from SharePoint, Confluence, Google Drive, and other sources. The `connection_config` JSONB stores source-specific credentials, folder paths, file filters, and sync schedules.

### document_category / document_category_version / document_category_version_file

Three-tier structure for organizing documents within a project:
1. **Category** -- tree node with optional parent for hierarchy
2. **Version** -- snapshot of category content with approval workflow
3. **Version File** -- ordered list of files in a version

### project_chat / project_search

Join tables linking chat assistants and search apps to projects. Enables a project to aggregate multiple AI interfaces for different use cases (e.g., general Q&A assistant, technical search).

### project_entity_permission

Fine-grained ABAC permissions for individual entities within a project. While `project_permissions` controls project-level access, this table controls access to specific chat assistants, search apps, datasets, or categories within the project scope.

## RBAC + ABAC Dual Authorization Model

```mermaid
flowchart TD
    req["Access Request"] --> rbac{"RBAC Check<br/>project_permissions"}
    rbac -->|"No project access"| deny["403 Forbidden"]
    rbac -->|"Has project access"| entity{"Accessing specific<br/>entity?"}
    entity -->|"Project-level action"| allow["Allow (project permission sufficient)"]
    entity -->|"Entity-level action"| abac{"ABAC Check<br/>project_entity_permission"}
    abac -->|"Explicit grant exists"| check_level{"Permission level<br/>sufficient?"}
    abac -->|"No grant"| fallback{"Fallback to<br/>project permission?"}
    fallback -->|"manage permission"| allow
    fallback -->|"Other"| deny
    check_level -->|"Yes"| allow
    check_level -->|"No"| deny
```

Authorization resolves in two layers:

1. **Project-level (RBAC)**: Does the user/team have a `project_permissions` grant? This gates all access to the project.
2. **Entity-level (ABAC)**: For specific resources within the project, `project_entity_permission` provides fine-grained control. Users with project `manage` permission bypass entity-level checks.

## Indexing Strategy

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| `projects` | `tenant_id, status` | Composite | Tenant project listing |
| `project_permissions` | `grantee_type, grantee_id` | Composite | User/team access lookup |
| `project_datasets` | `project_id` | B-tree | Project dataset listing |
| `project_datasets` | `dataset_id` | B-tree | Dataset project membership |
| `document_category` | `project_id, parent_id` | Composite | Category tree traversal |
| `document_category_version` | `category_id, status` | Composite | Active version lookup |
| `project_entity_permission` | `project_id, entity_type, grantee_type, grantee_id` | Composite | Permission resolution |
