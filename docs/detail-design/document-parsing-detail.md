# Document Parsing — Detail Design

## Overview

The Task Executor (Python worker) polls Redis for parse tasks, extracts text from documents, applies chunking strategies, generates embeddings, and indexes chunks to OpenSearch. Progress is broadcast via Redis pub/sub.

## Parsing Sequence

```mermaid
sequenceDiagram
    participant Redis as Redis Queue
    participant TE as Task Executor
    participant S3 as RustFS (S3)
    participant Parser as Document Parser
    participant Chunker as Chunking Engine
    participant Embed as Embedding Model
    participant OS as OpenSearch
    participant DB as PostgreSQL
    participant PubSub as Redis Pub/Sub

    TE->>Redis: BLPOP rag:task:queue (blocking)
    Redis-->>TE: taskId
    TE->>DB: UPDATE task SET status=running
    TE->>DB: SELECT document metadata
    TE->>S3: GetObject {tenantId}/{datasetId}/{filename}
    S3-->>TE: File content
    TE->>PubSub: PUBLISH task:progress:{taskId} {pct: 0}
    TE->>Parser: Parse by file type
    Parser-->>TE: Extracted text + tables + images
    TE->>PubSub: PUBLISH task:progress:{taskId} {pct: 10}
    TE->>DB: UPDATE document SET status=1 (parsing)
    TE->>Chunker: Apply chunking strategy
    Chunker-->>TE: Chunk[] with metadata
    TE->>PubSub: PUBLISH task:progress:{taskId} {pct: 50}
    TE->>Embed: Batch embed all chunks
    Embed-->>TE: Vector[] embeddings
    TE->>PubSub: PUBLISH task:progress:{taskId} {pct: 80}
    TE->>DB: UPDATE document SET status=3 (indexing)
    TE->>OS: Bulk index chunks + vectors
    OS-->>TE: Index confirmed
    TE->>DB: UPDATE document SET status=4 (indexed)
    TE->>DB: UPDATE task SET status=completed
    TE->>PubSub: PUBLISH task:progress:{taskId} {pct: 100}
```

## Task Executor Concurrency

The executor uses a **semaphore** to limit parallel task processing:

- **`MAX_CONCURRENT_TASKS=5`** — configurable via environment variable
- Each dequeued task acquires a semaphore slot before processing
- Slot is released on completion, failure, or timeout
- Prevents memory exhaustion from large document processing

## Document Status State Diagram

```mermaid
stateDiagram-v2
    [*] --> Unprocessed: Document created (status=0)
    Unprocessed --> Parsing: Task dequeued (status=1)
    Parsing --> Parsed: Text extracted (status=2)
    Parsed --> Indexing: Chunks embedded (status=3)
    Indexing --> Indexed: OpenSearch indexed (status=4)
    Parsing --> Failed: Parse error
    Parsed --> Failed: Chunking/embed error
    Indexing --> Failed: Index error
    Failed --> Unprocessed: Retry / re-parse
```

| Status Code | Name | Description |
|------------|------|-------------|
| 0 | Unprocessed | Uploaded but not yet parsed |
| 1 | Parsing | Text extraction in progress |
| 2 | Parsed | Text extracted, ready for embedding |
| 3 | Indexing | Embeddings generated, writing to OpenSearch |
| 4 | Indexed | Fully processed and searchable |
| -1 | Failed | Error occurred; check task error message |

## Progress Tracking

Progress is published to Redis pub/sub channels for real-time frontend updates:

| Channel Pattern | Example |
|----------------|---------|
| `task:progress:{taskId}` | `task:progress:abc-123` |

**Progress milestones:**

| Percentage | Stage | Description |
|-----------|-------|-------------|
| 0% | Started | Task dequeued, loading document |
| 10% | Parsed | Text/tables/images extracted from file |
| 50% | Chunked | Document split into chunks with metadata |
| 80% | Embedded | Vector embeddings generated for all chunks |
| 100% | Indexed | Chunks written to OpenSearch, task complete |

The frontend subscribes via SSE or polling to display a progress bar per document.

## Parser Selection by File Type

| File Type | Parser | Notes |
|----------|--------|-------|
| PDF | PyMuPDF / pdfplumber | Table detection, image extraction |
| DOCX | python-docx | Preserves headings and structure |
| XLSX/CSV | pandas | Each sheet/row becomes content |
| PPTX | python-pptx | Slide-by-slide extraction |
| HTML | BeautifulSoup | Strips tags, preserves structure |
| TXT/MD | Direct read | Minimal processing |
| Images | Vision model (OCR) | Sends to LLM for text extraction |
| Audio | Whisper / STT | Transcription to text |
| Code | Direct read | Language-aware splitting |

## Error Recovery

```mermaid
flowchart TD
    A[Task Dequeued] --> B{Parse Attempt}
    B -->|Success| C[Continue Pipeline]
    B -->|Error| D{Retry Count < MAX_RETRIES?}
    D -->|Yes| E[Increment retry_count]
    E --> F[Exponential backoff wait]
    F --> G[Re-enqueue to Redis]
    G --> B
    D -->|No| H[Mark task FAILED]
    H --> I[Store error message in task record]
    I --> J[Update document status = failed]
    J --> K[Publish failure event]
```

- **Max retries:** 3 (configurable via `MAX_TASK_RETRIES`)
- **Backoff:** Exponential — 5s, 25s, 125s
- **Error storage:** Full error message + stack trace stored in `task.error_message`
- **Manual retry:** User can trigger re-parse from the UI, which resets status to 0 and creates a new task

## Chunking Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| Recursive | Split by separators (`\n\n`, `\n`, `. `, ` `) with overlap | General documents |
| Fixed size | Split by character count with overlap | Uniform chunk sizes |
| Semantic | Split by meaning using embeddings | High-quality retrieval |
| Markdown | Split by heading hierarchy | Structured markdown docs |
| Table | Keep table rows together | Spreadsheets, CSVs |

Configuration per dataset: `chunk_method`, `chunk_size` (default 512), `chunk_overlap` (default 50).

## Key Files

| File | Purpose |
|------|---------|
| `advance-rag/rag/svr/task_executor.py` | Main task executor loop and concurrency |
| `advance-rag/rag/svr/parser/` | File-type-specific parsers |
| `advance-rag/rag/svr/chunk/` | Chunking strategy implementations |
| `advance-rag/rag/svr/embedding/` | Embedding model integration |
