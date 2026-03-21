# SRS — Dataset (Knowledge Base) Management

| Field   | Value      |
|---------|------------|
| Parent  | [SRS Index](./index.md) |
| Version | 1.0        |
| Date    | 2026-03-21 |

## 1. Overview

A **Dataset** in B-Knowledge is a Knowledge Base — a collection of documents sharing parser configuration, embedding settings, and access control policies. Datasets are tenant-scoped and support versioning, RBAC/ABAC access control, and multiple ingestion methods.

## 2. Use Case Diagram

```mermaid
flowchart TD
    subgraph Actors
        A[Admin]
        L[Leader]
        M[Member]
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

    A --> UC1 & UC2 & UC3 & UC7 & UC8 & UC9 & UC11
    L --> UC1 & UC2 & UC5 & UC6 & UC10
    M --> UC4 & UC5 & UC10
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
| DS-010   | Dataset versioning         | Track configuration changes as versions; allow rollback to a previous version                     | Should   |
| DS-011   | RBAC access control        | Assign dataset access by role (admin full, leader team-scoped, member read-only)                  | Must     |
| DS-012   | ABAC access policies       | Define attribute-based rules (team membership, IP range) for dataset access                       | Should   |
| DS-013   | Dataset statistics         | Display document count, chunk count, total size, last updated, indexing status                    | Must     |
| DS-014   | Re-index dataset           | Admin triggers full re-indexing of all documents (re-parse, re-chunk, re-embed)                   | Must     |
| DS-015   | Duplicate dataset          | Clone dataset config (without documents) into a new dataset                                      | Could    |
| DS-016   | Export dataset metadata    | Export dataset configuration and document list as JSON                                            | Could    |

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
| `language`           | string   | `en`             | Primary language for parser hints            |
| `retrieval_top_k`    | integer  | `20`             | Number of candidates from retrieval          |
| `rerank_top_n`       | integer  | `5`              | Number of results after reranking            |
| `bm25_weight`        | float    | `0.3`            | BM25 weight in hybrid fusion (0.0-1.0)      |

## 6. Access Control Model

```mermaid
flowchart TD
    REQ[API Request] --> RBAC{RBAC Check}
    RBAC -->|Role allows| ABAC{ABAC Check}
    RBAC -->|Role denies| DENY[403 Forbidden]
    ABAC -->|Policy allows| GRANT[Access Granted]
    ABAC -->|Policy denies| DENY
    ABAC -->|No policy defined| GRANT

    subgraph RBAC Rules
        R1[Super-admin: all datasets]
        R2[Admin: all org datasets]
        R3[Leader: team datasets]
        R4[Member: assigned datasets]
    end

    subgraph ABAC Policies
        P1[Team membership match]
        P2[IP range whitelist]
        P3[Time-of-day restriction]
    end
```

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
| BR-DS-10 | Version history retains the last 20 configuration snapshots per dataset |
