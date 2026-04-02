# FR: Sync Connectors

## 1. Overview

This document specifies the functional requirements for B-Knowledge sync connectors. Sync connectors let administrators configure external data source adapters that synchronize content into datasets for normal document processing and retrieval.

## 2. Actors & Use Cases

```mermaid
graph LR
    Admin((Admin))
    System((System / Scheduler))

    Admin -->|Create connector| UC1[UC-SYN-01: Create Connector]
    Admin -->|Update connector| UC2[UC-SYN-02: Update Connector Config]
    Admin -->|Delete connector| UC3[UC-SYN-03: Delete Connector]
    Admin -->|Trigger manual sync| UC4[UC-SYN-04: Manual Sync Trigger]
    Admin -->|View sync logs| UC5[UC-SYN-05: View Sync Logs]
    Admin -->|List connectors| UC6[UC-SYN-06: List Connectors]
    System -->|Scheduled sync| UC7[UC-SYN-07: Scheduled Sync Execution]
    System -->|Process fetched data| UC8[UC-SYN-08: Document Ingestion]
```

## 3. Functional Requirements

### 3.1 Connector CRUD

| ID | Requirement | Priority | Status | Notes |
|----|-------------|----------|--------|-------|
| SYN-FR-01 | Admin SHALL be able to create a connector specifying: adapter type, credentials, source config, target dataset, sync schedule | Must | Implemented | Adapter type from registry |
| SYN-FR-02 | Admin SHALL be able to list connectors, optionally filtered by dataset / knowledge base | Must | Implemented | Paginated, shows last sync status |
| SYN-FR-03 | Admin SHALL be able to update connector configuration (credentials, schedule, source paths) | Must | Implemented | Does not trigger immediate sync |
| SYN-FR-04 | Admin SHALL be able to delete a connector and optionally remove synced documents | Must | Implemented | Soft delete connector, optional cascade |
| SYN-FR-05 | Connector credentials SHALL be stored encrypted at rest | Must | Implemented | AES-256 or equivalent |
| SYN-FR-06 | Admin SHALL be able to pause and resume connectors to temporarily disable scheduled syncing | Must | Implemented | Toggle status between 'active' and 'paused' |

### 3.2 Sync Execution

| ID | Requirement | Priority | Status | Notes |
|----|-------------|----------|--------|-------|
| SYN-FR-10 | Admin SHALL be able to trigger a manual sync for any connector | Must | Implemented | Queued via Redis |
| SYN-FR-11 | System SHALL execute scheduled syncs based on connector cron configuration | Should | Implemented | Cron-based scheduling |
| SYN-FR-12 | Sync process SHALL fetch only new or modified content since last sync (incremental) | Must | Implemented | Use ETags, modified timestamps, or cursors |
| SYN-FR-13 | Fetched content SHALL be created as documents in the target dataset | Must | Implemented | Standard document creation flow |
| SYN-FR-14 | After document creation, the system SHALL trigger parsing and indexing | Must | Implemented | Same pipeline as manual uploads |
| SYN-FR-15 | System SHALL prevent concurrent syncs for the same connector via Redis distributed lock | Must | Implemented | SYN-BR-06 implementation |

### 3.3 Sync Logs

| ID | Requirement | Priority | Status | Notes |
|----|-------------|----------|--------|-------|
| SYN-FR-20 | System SHALL record a sync log entry for each sync execution | Must | Implemented | Start time, end time, status, counts |
| SYN-FR-21 | Sync log SHALL include: documents added, updated, deleted, errors encountered | Must | Implemented | Summary counts and error details |
| SYN-FR-22 | Admin SHALL be able to view paginated sync logs per connector | Must | Implemented | Sorted by most recent first |

### 3.4 Adapter Registry

| ID | Requirement | Priority | Status | Notes |
|----|-------------|----------|--------|-------|
| SYN-FR-30 | System SHALL support a pluggable adapter registry for connector types | Must | Implemented | New adapters without core changes |
| SYN-FR-31 | Each adapter SHALL implement a standard interface: `connect()`, `fetchChanges()`, `testConnection()` | Must | Implemented | Adapter pattern |
| SYN-FR-32 | System SHALL support built-in adapters exposed by the current sync module registry | Must | Implemented | Exact set is implementation-defined |
| SYN-FR-33 | Each adapter SHALL expose its required configuration schema for UI rendering | Should | Implemented | JSON Schema for dynamic forms |

### 3.5 Security

| ID | Requirement | Priority | Status | Notes |
|----|-------------|----------|--------|-------|
| SYN-FR-40 | Connector credentials SHALL be encrypted at rest using AES-256-CBC | Must | Implemented | Uses cryptoService with RAGF wire format |
| SYN-FR-41 | API responses SHALL mask sensitive credential values | Must | Implemented | Replaces tokens/passwords with ******** |

## 4. Sync Flow

```mermaid
flowchart TD
    A[Admin configures connector] --> B{Trigger type?}
    B -->|Manual| C[Admin clicks Sync Now]
    B -->|Scheduled| D[Cron scheduler fires]
    C --> E[Enqueue sync job via Redis]
    D --> E
    E --> F[Worker picks up sync job]
    F --> G[Load adapter by connector type]
    G --> H[Adapter: authenticate with external service]
    H --> I[Adapter: fetch changes since last sync cursor]
    I --> J{New or modified content?}
    J -->|Yes| K[Create / update documents in target dataset]
    J -->|No| L[Log: no changes detected]
    K --> M[Trigger document parsing and chunking]
    M --> N[Index chunks in OpenSearch]
    N --> O[Update sync cursor and log results]
    L --> O
    O --> P[Mark sync complete]

    style A fill:#e1f5fe
    style P fill:#c8e6c9
```

## 5. Adapter Interface

```mermaid
classDiagram
    class SyncAdapter {
        <<interface>>
        +connect(credentials) Promise~void~
        +testConnection() Promise~boolean~
        +fetchChanges(cursor) Promise~SyncResult~
        +getConfigSchema() JSONSchema
    }
    class GitHubAdapter {
        +connect(credentials)
        +testConnection()
        +fetchChanges(cursor)
        +getConfigSchema()
    }
    class GoogleDriveAdapter {
        +connect(credentials)
        +testConnection()
        +fetchChanges(cursor)
        +getConfigSchema()
    }
    class ConfluenceAdapter {
        +connect(credentials)
        +testConnection()
        +fetchChanges(cursor)
        +getConfigSchema()
    }
    SyncAdapter <|.. GitHubAdapter
    SyncAdapter <|.. GoogleDriveAdapter
    SyncAdapter <|.. ConfluenceAdapter
```

## 6. Business Rules

| Rule ID | Rule | Rationale |
|---------|------|-----------|
| SYN-BR-01 | Only users with `manage_knowledge_base` permission may create or manage connectors | Authorization control |
| SYN-BR-02 | Sync logs are paginated (default 20, max 100 per page) | Performance on large histories |
| SYN-BR-03 | Connector adapters are registered in a central registry and resolved by type string | Extensibility without code changes to core |
| SYN-BR-04 | A connector is associated with one dataset/knowledge-base target context | Clear data ownership |
| SYN-BR-05 | If a sync job fails, the cursor is NOT advanced; next sync retries from the same point | Data consistency |
| SYN-BR-06 | Concurrent syncs for the same connector are prevented via Redis lock | Avoid duplicate documents |
| SYN-BR-07 | Connector credentials are tenant-scoped and never exposed in API responses | Multi-tenant security |

## 7. API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/sync/connectors` | Create connector | manage_knowledge_base |
| GET | `/api/sync/connectors` | List connectors | authenticated |
| GET | `/api/sync/connectors/:id` | Get connector | authenticated |
| PUT | `/api/sync/connectors/:id` | Update connector config | manage_knowledge_base |
| DELETE | `/api/sync/connectors/:id` | Delete connector | manage_knowledge_base |
| POST | `/api/sync/connectors/:id/sync` | Trigger manual sync | manage_knowledge_base |
| GET | `/api/sync/connectors/:id/logs` | Get sync logs (paginated) | authenticated |
| POST | `/api/sync/connectors/test-connection` | Test connection credentials | manage_knowledge_base |
