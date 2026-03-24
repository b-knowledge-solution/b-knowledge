# Database Design: RAG Tables

## ER Diagram

```mermaid
erDiagram
    knowledgebase {
        uuid id PK
        uuid tenant_id FK
        varchar name
        varchar avatar
        text description
        varchar embedding_model
        varchar parser_id
        jsonb parser_config
        varchar permission "me | team | all"
        varchar language "en | vi | ja | multi"
        int status "0=inactive 1=active"
        timestamp created_at
        timestamp updated_at
    }

    document {
        uuid id PK
        uuid kb_id FK
        varchar name
        varchar location "S3 key"
        bigint size
        varchar type "pdf | docx | txt | md | html | xlsx"
        varchar parser_id
        jsonb parser_config
        float progress "0.0 to 1.0"
        int status "0=unprocessed 1=parsing 2=parsed 3=indexing 4=indexed"
        int run "0=stop 1=run"
        int token_num
        int chunk_num
        timestamp created_at
        timestamp updated_at
    }

    file {
        uuid id PK
        uuid tenant_id FK
        varchar name
        varchar location "S3 key"
        bigint size
        varchar type
        uuid created_by FK
        timestamp created_at
    }

    file2document {
        uuid file_id FK
        uuid document_id FK
    }

    task {
        uuid id PK
        uuid doc_id FK
        float progress "0.0 to 1.0"
        int status "0=pending 1=running 2=done 3=failed 4=cancelled"
        varchar type "parse | chunk | embed | index"
        int retry_count
        jsonb error_detail
        timestamp created_at
        timestamp updated_at
    }

    document_version {
        uuid id PK
        uuid document_id FK
        int version_number
        varchar status "draft | active | archived"
        uuid created_by FK
        timestamp created_at
    }

    document_version_file {
        uuid id PK
        uuid version_id FK
        uuid file_id FK
        int sort_order
    }

    converter_job {
        uuid id PK
        uuid file_id FK
        varchar source_type "docx | xlsx | pptx"
        varchar target_type "pdf"
        int status "0=pending 1=processing 2=done 3=failed"
        varchar output_location "S3 key"
        int retry_count
        jsonb error_detail
        timestamp created_at
        timestamp updated_at
    }

    tenant_llm {
        uuid id PK
        uuid tenant_id FK
        varchar provider "openai | azure | anthropic | ollama"
        varchar model_name
        varchar model_type "chat | embedding | rerank"
        jsonb config "API keys, endpoints, params"
        boolean is_default
        timestamp created_at
    }

    knowledgebase ||--o{ document : "contains"
    document ||--o{ task : "processed by"
    file ||--o{ file2document : "linked to"
    document ||--o{ file2document : "sourced from"
    document ||--o{ document_version : "has versions"
    document_version ||--o{ document_version_file : "includes files"
    file ||--o{ document_version_file : "attached to version"
    file ||--o{ converter_job : "converted by"
```

## Document Processing Pipeline

```mermaid
stateDiagram-v2
    [*] --> Unprocessed: Upload file
    Unprocessed --> Parsing: Task executor picks up
    Parsing --> Parsed: Text extraction complete
    Parsed --> Indexing: Chunk + embed + index
    Indexing --> Indexed: OpenSearch indexed
    Parsing --> Failed: Error
    Indexing --> Failed: Error
    Failed --> Unprocessed: Retry (reset status)
```

## Document Status Enum

| Value | Status | Description |
|-------|--------|-------------|
| 0 | Unprocessed | File uploaded but not yet processed |
| 1 | Parsing | Text extraction in progress (PDF/Office parsing) |
| 2 | Parsed | Text extracted, ready for chunking and embedding |
| 3 | Indexing | Chunking, embedding, and OpenSearch indexing in progress |
| 4 | Indexed | Fully processed and searchable |

## Task Status Enum

| Value | Status | Description |
|-------|--------|-------------|
| 0 | Pending | Queued for processing |
| 1 | Running | Actively being processed by worker |
| 2 | Done | Completed successfully |
| 3 | Failed | Failed after retries; see `error_detail` |
| 4 | Cancelled | Manually cancelled by user |

## Table Descriptions

### knowledgebase

A dataset (knowledge base) is a collection of documents with shared embedding and parser configuration. The `parser_config` JSONB stores chunking strategy, overlap size, separators, and other parsing parameters. Permission controls visibility: `me` (creator only), `team` (team members), `all` (tenant-wide).

### document

Represents a single file within a knowledge base. Tracks processing progress and status through the RAG pipeline. The `run` flag controls whether the document should be actively processed (allows pause/resume). `token_num` and `chunk_num` are populated after parsing.

### file

Tenant-scoped file registry pointing to S3 objects in RustFS. Files are decoupled from documents via `file2document` to support file reuse across knowledge bases.

### task

Granular processing tasks for the RAG pipeline. Each document may generate multiple tasks (parse, chunk, embed, index). Retry logic with `retry_count` and `error_detail` for debugging failed operations.

### document_version / document_version_file

Version control for documents. Each version can reference multiple files with ordering. Supports draft/active/archived lifecycle for content review workflows.

### converter_job

Tracks Office-to-PDF conversion jobs processed by the Converter service via Redis queue. Source files are fetched from RustFS, converted using LibreOffice, and output written back to RustFS.

### tenant_llm

Tenant-specific LLM provider configuration. Supports multiple providers and model types (chat, embedding, rerank). The `config` JSONB stores API keys, endpoints, and model parameters. One model per type can be marked `is_default`.

## ORM Management Note

These tables are managed by two ORMs with distinct responsibilities:

| Concern | Owner | Tool |
|---------|-------|------|
| Schema migrations | Backend (Node.js) | Knex |
| Data read/write (Python) | Task Executor / Converter | Peewee |
| Data read/write (Node.js) | Backend API | Knex |

All schema changes (CREATE TABLE, ALTER, indexes) go through Knex migrations. Peewee models mirror the schema for Python data access. Never use Peewee migrators.
