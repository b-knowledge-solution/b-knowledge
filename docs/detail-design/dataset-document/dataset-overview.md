# Dataset Lifecycle Overview

## Overview

A Dataset (backed by the `knowledgebase` table) is the primary knowledge-base container in B-Knowledge. The current source supports dataset CRUD, access control, version uploads, per-document parser overrides, field-map generation for structured data, retrieval tests, enrichment tasks, metadata editing, graph tasks, logs, and bulk document operations.

## Dataset Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: POST /api/rag/datasets
    Created --> Configured: Set parser, embedding, chunk settings
    Configured --> Uploading: Upload documents
    Uploading --> Parsing: Auto-trigger parse tasks
    Parsing --> Chunking: Split into chunks
    Chunking --> Embedding: Generate vector embeddings
    Embedding --> Indexed: Store in OpenSearch
    Indexed --> Ready: Available for search/chat

    Ready --> Uploading: Upload more documents
    Ready --> Configured: Update settings
    Ready --> Deleted: Admin deletes dataset

    Parsing --> Failed: Parse error
    Failed --> Uploading: Re-upload / retry
    Deleted --> [*]
```

## Dataset = Knowledge Base

| Concept | Implementation | Description |
|---------|---------------|-------------|
| Dataset | `knowledgebase` table | Container for related documents |
| Document | `document` table | Individual uploaded file |
| Chunk | OpenSearch `knowledge_{tenant}` index | Parsed text segment with embedding |
| Task | `task` table | Background processing job |

## Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| **Embedding Model** | Model used for vector embeddings | Org default |
| **Parser Type** | Document parsing strategy | Auto-detect |
| **Chunk Size** | Max tokens per chunk | 512 |
| **Chunk Overlap** | Overlap between chunks | 64 |
| **Language** | Primary language for parsing | en |
| **Separator** | Custom chunk separators | Newline-based |
| **Field Map** | Structured-data column map for SQL fallback | none |
| **Tag KB IDs** | Tag datasets used for rank boosting | none |

## Document Processing Pipeline

```mermaid
flowchart TD
    A[Upload Document] --> B{File type?}
    B -->|PDF| C[PDF Parser]
    B -->|DOCX/PPTX/XLSX| D[Converter Service]
    B -->|TXT/MD| E[Text Parser]
    B -->|HTML| F[HTML Parser]

    D --> G[Convert to PDF via LibreOffice]
    G --> C

    C --> H[Extract text content]
    E --> H
    F --> H

    H --> I[Chunk text by configured method]
    I --> J[Generate embeddings via model]
    J --> K[Index chunks in OpenSearch]
    K --> L[Update document status: ready]
```

## Access Control Model

```mermaid
flowchart TD
    subgraph RBAC
        A[User/Team] -->|granted| B[Permission Level]
        B --> C[read: search/view]
        B --> D[write: upload documents]
        B --> E[manage: settings, delete]
    end

    subgraph ABAC
        F[Policy Rules] --> G{Field conditions}
        G --> H[department = X]
        G --> I[classification in Y,Z]
        G --> J[created_by = self]
    end

    K[Access Request] --> L{RBAC check}
    L -->|Denied| M[403]
    L -->|Allowed| N{ABAC policy exists?}
    N -->|No| O[Full access]
    N -->|Yes| P{Conditions met?}
    P -->|Yes| O
    P -->|No| M
```

### Permission Levels

| Level | Abilities |
|-------|-----------|
| `read` | Search, view documents, view chunks |
| `write` | Upload documents, trigger re-parse |
| `manage` | Change settings, delete dataset, manage access |

### Access Grant Sources

| Source | How | Example |
|--------|-----|---------|
| Role | Inherited from RBAC role | Admin gets manage on all datasets |
| User grant | Explicit per-user assignment | User X gets read on Dataset A |
| Team grant | Via team membership | Team Y gets write on Dataset B |
| ABAC policy | Conditional rules | Dept=eng gets read on tagged datasets |

## Versioning

```mermaid
flowchart LR
    A[Document v1] --> B[Upload v2]
    B --> C[Store new file in RustFS]
    C --> D[Re-parse new version]
    D --> E[Replace chunks in OpenSearch]
    E --> F[Update document record]
    F --> G[Keep version history]
```

- Upload a new file to an existing document entry to create a new version
- Previous versions are tracked in version history
- Chunks from old version are replaced with new version's chunks
- Version history includes: file reference, upload timestamp, uploader

## Search Flow (Once Ready)

```mermaid
flowchart TD
    A[User query] --> B{Search type}
    B -->|Hybrid| C[Vector search + keyword search]
    B -->|Vector only| D[Embedding similarity]
    B -->|Keyword only| E[BM25 text search]

    C --> F[Merge and re-rank results]
    D --> F
    E --> F

    F --> G[Apply access control filter]
    G --> H[Return top-K chunks with metadata]
```

## Current Route Surface

The dataset module currently exposes:

- Dataset CRUD and access control
- Version uploads and listing
- Dataset settings and parser config updates
- Manual chunk CRUD and bulk chunk switch
- Retrieval test
- Document CRUD, parse, status stream, download, parser change
- Bulk document parse/toggle/delete
- Web crawl ingestion
- Document enrichment for keywords, questions, tags, metadata
- GraphRAG / RAPTOR / mindmap task triggers and status
- Metadata read/write, logs, overview, graph data, image serving
- Auto-detect field map for structured datasets
- Bulk metadata updates and tag aggregations

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/rag/` | RAG module (datasets, documents, search) |
| `be/src/modules/rag/routes/rag.routes.ts` | Dataset/document/chunk route surface |
| `advance-rag/` | Python RAG worker (parsing, chunking, embedding) |
| `converter/` | Office-to-PDF conversion service |
