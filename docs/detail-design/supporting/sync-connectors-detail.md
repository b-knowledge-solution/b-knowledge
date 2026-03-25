# Sync Connectors Detail Design

## Overview

The Sync module enables B-Knowledge to pull documents from external sources into datasets. Connectors follow an adapter pattern and are exposed through the `/api/sync/connectors*` route family.

## Architecture

```mermaid
flowchart TD
    A[Admin] -->|Create| B[Connector]
    B -->|Configure| C[Type + Config JSONB]
    C -->|Link to| D[Dataset]

    E{Trigger} -->|Manual| F[POST /api/sync/connectors/:id/sync]
    E -->|Scheduled| F
    F --> G[ConnectorAdapter.fetch]
    G --> H[Fetch External Data]
    H --> I[Create Documents in Dataset]
    I --> J[Enqueue Parsing Tasks]
    J --> K[Index in OpenSearch]
```

## Adapter Pattern

```mermaid
flowchart LR
    I[ConnectorAdapter Interface] --> N[NotionAdapter]
    I --> S3[S3Adapter]
    I --> WC[WebCrawlAdapter]
```

### ConnectorAdapter Interface

Each adapter implements:

| Method | Description |
|--------|-------------|
| `testConnection(config)` | Validate credentials and connectivity |
| `fetch(config, lastSyncAt)` | Retrieve documents since last sync |
| `getMetadata(config)` | List available resources when supported |

### Type-Specific Configuration

| Connector Type | Config Fields |
|----------------|--------------|
| Notion | `api_token`, `database_id` or source identifiers |
| S3 | `endpoint`, `bucket`, `access_key`, `secret_key`, object filters |
| Web Crawl | `start_url`, `max_depth`, `url_patterns`, `exclude_patterns` |

## API Endpoints

### Connector CRUD

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sync/connectors` | Create connector |
| GET | `/api/sync/connectors` | List connectors for tenant |
| GET | `/api/sync/connectors/:id` | Get connector details |
| PUT | `/api/sync/connectors/:id` | Update connector config |
| DELETE | `/api/sync/connectors/:id` | Delete connector |

### Operations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sync/connectors/:id/sync` | Trigger manual sync |
| GET | `/api/sync/connectors/:id/logs` | Paginated sync execution history |

## Sync Execution Flow

```mermaid
sequenceDiagram
    actor Admin
    participant API as Sync API
    participant Adapter as ConnectorAdapter
    participant Ext as External Source
    participant DB as PostgreSQL
    participant Queue as Redis Queue

    Admin->>API: POST /api/sync/connectors/:id/sync
    API->>DB: Get connector config
    DB-->>API: Connector record
    API->>DB: INSERT sync_log (status=running)

    API->>Adapter: fetch(config, lastSyncAt)
    Adapter->>Ext: API calls to fetch documents
    Ext-->>Adapter: Document list + content

    loop Each document
        Adapter->>DB: INSERT INTO documents (dataset_id)
        Adapter->>Queue: Enqueue parsing task
    end

    API->>DB: UPDATE sync_log (status=completed, doc_count)
    API-->>Admin: 200 { sync_log_id, status }
```

## Sync Log

Each sync execution produces a log record:

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| connector_id | UUID | Parent connector |
| status | enum | `running`, `completed`, `failed` |
| documents_created | number | New documents added |
| documents_updated | number | Existing documents refreshed |
| documents_skipped | number | Unchanged documents |
| error_message | text | Failure details (if any) |
| started_at | timestamp | Execution start |
| completed_at | timestamp | Execution end |

## Incremental Sync

Connectors track `last_sync_at` on the connector record. When `fetch()` is called, the adapter only retrieves documents modified after `last_sync_at`. This minimizes API calls and processing time for recurring syncs.

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/sync/` | Module root |
| `be/src/modules/sync/controllers/sync.controller.ts` | Route handlers |
| `be/src/modules/sync/services/sync.service.ts` | Orchestration logic |
| `be/src/modules/sync/adapters/` | Adapter implementations |
| `be/src/modules/sync/models/` | Knex models |
