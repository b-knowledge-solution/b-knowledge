# SRS — Dataset (Knowledge Base) Management

| Field   | Value      |
|---------|------------|
| Parent  | [SRS Index](./index.md) |
| Version | 1.2        |
| Date    | 2026-04-14 |

## 1. Overview

A **Dataset** in B-Knowledge is organized in a **Knowledge Base -> Category -> Version -> Document** hierarchy. The Knowledge Base (KB) module exposes 38+ endpoints covering this full hierarchy.

A KB contains categories, each category can have versioned document sets, and each document belongs to a dataset that carries parser configuration, embedding settings, enrichment options, and access control policies. Datasets are auto-created when a KB or category is created. Datasets are tenant-scoped and support version uploads, parser overrides, web crawl ingestion, retrieval testing, graph tasks, and structured-data field maps.

## 2. Use Case Diagram

```mermaid
flowchart TD
    subgraph Actors
        SA[Super-admin]
        A[Admin]
        L[Leader]
        U[User]
        S[System]
    end

    subgraph Dataset Use Cases
        UC1[Create dataset]
        UC2[Update dataset config]
        UC3[Delete dataset]
        UC4[View dataset list]
        UC5[Upload documents]
        UC6[Web crawl ingestion]
        UC7[Configure parser & embedding]
        UC8[Set access control]
        UC9[Version dataset]
        UC10[View dataset statistics]
        UC11[Re-index dataset]
    end

    SA --> UC1 & UC2 & UC3 & UC7 & UC8 & UC9 & UC11
    A --> UC1 & UC2 & UC3 & UC7 & UC8 & UC9 & UC11
    L --> UC1 & UC2 & UC5 & UC6 & UC10
    U --> UC4 & UC5 & UC10
    S --> UC11
```

## 3. Functional Requirements

| ID       | Requirement                | Description                                                                                      | Priority |
|----------|----------------------------|--------------------------------------------------------------------------------------------------|----------|
| DS-001   | Create dataset             | User creates a dataset with name, description, language, and initial parser/embedding config       | Must     |
| DS-002   | Update dataset config      | Admin updates parser type, chunk strategy, embedding model, and retrieval settings                 | Must     |
| DS-003   | Delete dataset             | Admin deletes a dataset, removing all documents, chunks, and vectors from OpenSearch               | Must     |
| DS-004   | List datasets              | Paginated, searchable list of datasets the user has access to                                     | Must     |
| DS-005   | Upload documents           | Users upload files (single or batch) to a dataset; max 100 files per batch                        | Must     |
| DS-006   | Web crawl ingestion        | Admin configures a URL + depth; system crawls and ingests pages as documents                      | Should   |
| DS-007   | Parser configuration       | Select from 18 parser types per document or set a dataset-wide default                            | Must     |
| DS-008   | Embedding configuration    | Select embedding model and dimension; applies to all new documents in the dataset                 | Must     |
| DS-009   | Chunk strategy config      | Configure chunking method (fixed, recursive, semantic, layout-aware), size, and overlap            | Must     |
| DS-010   | Dataset version uploads    | Upload new document versions and list dataset version groups                                       | Should   |
| DS-011   | Permission-based access control | Resolve dataset access from the registry-backed permission catalog, user overrides, and resource grants | Must     |
| DS-012   | Row-scoped access policies | Enforce tenant-scoped CASL checks and resource grants for dataset-related access paths            | Should   |
| DS-013   | Dataset statistics         | Display document count, chunk count, total size, last updated, indexing status                    | Must     |
| DS-014   | Re-index dataset           | Admin triggers full re-indexing of all documents (re-parse, re-chunk, re-embed)                   | Must     |
| DS-015   | Duplicate dataset          | Clone dataset config (without documents) into a new dataset                                      | Could    |
| DS-016   | Export dataset metadata    | Export dataset configuration and document list as JSON                                            | Could    |
| DS-017   | Structured data field map  | Generate and edit `field_map` for table-like datasets                                             | Should   |
| DS-018   | Bulk document operations   | Bulk parse, toggle, and delete documents                                                          | Must     |
| DS-019   | Enrichment tasks           | Generate keywords, questions, tags, and metadata for documents                                    | Should   |
| DS-020   | Graph tasks                | Trigger GraphRAG, RAPTOR, and mindmap jobs                                                        | Could    |
| DS-021   | Cross-KB datasets          | Retrieve datasets across multiple knowledge bases. Endpoint: `GET /api/knowledge-base/cross-knowledge-base-datasets` | Must     |
| DS-022   | KB members management      | Manage knowledge base member access. Endpoints: `GET /POST /DELETE /api/knowledge-base/:id/members` | Must     |
| DS-023   | KB activity log            | View activity history for a knowledge base. Endpoint: `GET /api/knowledge-base/:id/activity`      | Should   |
| DS-024   | Dataset bind/unbind        | Bind or unbind datasets to a knowledge base. Endpoints: `POST /api/knowledge-base/:id/datasets/bind`, `DELETE /api/knowledge-base/:id/datasets/:datasetId/unbind` | Must     |
| DS-025   | KB entity permissions      | Manage entity-level permissions on a knowledge base. Endpoints: `GET /POST /DELETE /api/knowledge-base/:id/entity-permissions` | Must     |
| DS-026   | Bulk metadata update       | Update metadata across multiple datasets in a single operation. Endpoint: `POST /api/rag/datasets/bulk-metadata` | Should   |
| DS-027   | Tag aggregations           | Retrieve aggregated tag statistics across datasets. Endpoint: `GET /api/rag/tags/aggregations`    | Should   |
| DS-028   | Dataset re-embed           | Re-embed all chunks in a dataset without re-parsing or re-chunking. Endpoint: `POST /api/rag/datasets/:id/re-embed` | Must     |
| DS-029   | Dataset settings           | Read and update dataset-level settings independently of full config. Endpoints: `GET /PUT /api/rag/datasets/:id/settings` | Must     |
| DS-030   | Dataset overview and logs  | View dataset overview statistics and processing logs. Endpoints: `GET /api/rag/datasets/:id/overview`, `GET /api/rag/datasets/:id/logs` | Must     |
| DS-031   | GraphRAG graph data        | Retrieve graph visualization data and metrics for a dataset. Endpoints: `GET /api/rag/datasets/:id/graph`, `GET /api/rag/datasets/:datasetId/graph/metrics` | Should   |
| DS-032   | Chunk images               | Serve chunk-associated images. Endpoint: `GET /api/rag/images/:imageId`                           | Must     |
| DS-033   | Converter job status       | Check status of a converter job for a dataset. Endpoint: `GET /api/rag/datasets/:id/converter-jobs/:jobId/status` | Must     |
| DS-034   | Parsing scheduler config   | Read and update global parsing scheduler configuration. Endpoints: `GET /PUT /api/rag/system/config/parsing_scheduler` | Should   |
| DS-035   | Dataset auto-creation      | System automatically creates a dataset when a knowledge base or category is created                | Must     |

## 3.1 Knowledge Base Hierarchy

```mermaid
flowchart TD
    KB[Knowledge Base] --> CAT[Category]
    CAT --> VER[Version]
    VER --> DOC[Document]
    KB --> DS[Dataset - auto-created]
    CAT --> DS2[Dataset - auto-created]
    DS --> CHUNKS[Chunks / Vectors]
    DS2 --> CHUNKS
    KB --> MEM[Members]
    KB --> ACT[Activity Log]
    KB --> EP[Entity Permissions]
```

The KB module manages the full hierarchy with endpoints under `/api/knowledge-base/` for KB-level operations (members, activity, entity permissions, dataset bind/unbind) and `/api/rag/` for dataset-level operations (settings, overview, logs, re-embed, graph, images, converter jobs).

## 4. Document Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Uploaded: File received

    Uploaded --> Parsing: Parser job queued
    Parsing --> Parsed: Text extracted successfully
    Parsing --> Failed: Parser error

    Parsed --> Chunking: Chunk job started
    Chunking --> Chunked: Chunks created
    Chunking --> Failed: Chunking error

    Chunked --> Embedding: Embedding job started
    Embedding --> Embedded: Vectors generated
    Embedding --> Failed: Embedding error

    Embedded --> Indexing: Index job started
    Indexing --> Indexed: Stored in OpenSearch
    Indexing --> Failed: Index error

    Indexed --> [*]

    Failed --> Uploaded: Retry triggered
    Failed --> [*]: Max retries exceeded

    note right of Indexed
        Document is now
        searchable via RAG
    end note

    note right of Failed
        Error details stored
        in task record
    end note
```

## 5. Dataset Configuration Schema

| Setting              | Type     | Default          | Description                                  |
|----------------------|----------|------------------|----------------------------------------------|
| `parser_type`        | enum     | `naive`          | Default parser for new documents             |
| `chunk_method`       | enum     | `recursive`      | Chunking strategy                            |
| `chunk_size`         | integer  | `512`            | Target tokens per chunk                      |
| `chunk_overlap`      | integer  | `64`             | Overlap tokens between chunks                |
| `embedding_model`    | string   | (tenant default) | Embedding model identifier                   |
| `embedding_dim`      | integer  | `1536`           | Vector dimension                             |
| `graphrag_enabled`   | boolean  | `false`          | Enable entity extraction and graph indexing  |
| `raptor_enabled`     | boolean  | `false`          | Enable hierarchical summarisation            |
| `field_map`          | object   | none             | Structured-data schema for SQL fallback      |
| `tag_kb_ids`         | string[] | none             | Tag datasets used for tag-based ranking      |
| `language`           | string   | `en`             | Primary language for parser hints            |
| `retrieval_top_k`    | integer  | `20`             | Number of candidates from retrieval          |
| `rerank_top_n`       | integer  | `5`              | Number of results after reranking            |
| `bm25_weight`        | float    | `0.3`            | BM25 weight in hybrid fusion (0.0-1.0)      |

## 6. Access Control Model

```mermaid
flowchart TD
    REQ[API request] --> AUTH[requireAuth]
    AUTH --> ORG[Resolve active org]
    ORG --> ABILITY[Build CASL ability]
    ABILITY --> ROLE[role_permissions]
    ABILITY --> OVERRIDE[user_permission_overrides]
    ABILITY --> GRANTS[resource_grants]
    ROLE --> CHECK{Permission or ability check}
    OVERRIDE --> CHECK
    GRANTS --> CHECK
    CHECK -->|Allow| OK[Access granted]
    CHECK -->|Deny| DENY[403 Forbidden]

    subgraph Role Baseline
        R1[super-admin: unrestricted platform access]
        R2[admin: tenant-wide management baseline]
        R3[leader: broader tenant operator baseline]
        R4[user: baseline authenticated access]
    end

    subgraph Resource Scope
        P1[Knowledge-base grants]
        P2[Document-category grants]
        P3[Tenant isolation conditions]
    end
```

Dataset access is no longer documented through legacy role labels or standalone team-permission tables. The maintained model combines:

- tenant role defaults from `role_permissions`
- per-user allow or deny exceptions from `user_permission_overrides`
- row-scoped resource access from `resource_grants`
- middleware enforcement through `requirePermission(...)` and `requireAbility(...)`

## 7. Business Rules

| Rule | Description |
|------|-------------|
| BR-DS-01 | Maximum file size per upload: 100 MB (configurable via `MAX_UPLOAD_SIZE_MB`) |
| BR-DS-02 | Supported upload formats: PDF, DOCX, DOC, XLSX, XLS, PPTX, PPT, TXT, MD, HTML, CSV, JSON, XML, YAML, images (PNG, JPG, TIFF), audio (MP3, WAV), and code files |
| BR-DS-03 | All datasets are tenant-isolated — cross-tenant access is impossible at the database query level |
| BR-DS-04 | Deleting a dataset queues async cleanup: OpenSearch index deletion, S3 file removal, database cascade |
| BR-DS-05 | Re-indexing creates new vectors alongside existing ones; old vectors are swapped out atomically |
| BR-DS-06 | Web crawl depth is limited to 3 levels and 500 pages per crawl job |
| BR-DS-07 | Batch upload limit: 100 files per request; total batch size must not exceed 500 MB |
| BR-DS-08 | Dataset names must be unique within a tenant (case-insensitive) |
| BR-DS-09 | Changing embedding model requires full re-indexing; system warns user before proceeding |
| BR-DS-10 | Per-document parser changes are supported without recreating the dataset |
| BR-DS-11 | Structured datasets can auto-generate a field map for SQL fallback flows |
| BR-DS-12 | Re-embed (DS-028) only regenerates vectors; it does NOT re-parse or re-chunk existing documents |
| BR-DS-13 | Datasets are auto-created when a knowledge base or category is created; manual dataset creation outside KB context is also supported |
| BR-DS-14 | KB members and entity permissions are managed independently from tenant-wide role permissions |
