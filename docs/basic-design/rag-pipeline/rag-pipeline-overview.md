# RAG Pipeline Overview

## Overview

The B-Knowledge RAG pipeline transforms uploaded documents into searchable, embeddable knowledge. The pipeline is orchestrated by `task_executor.py` (80KB), which manages the full lifecycle: upload, parse, extract, enhance, chunk, embed, and index.

## Complete Pipeline Flowchart

```mermaid
flowchart TD
    Upload[Document Upload] -->|multipart POST| Backend[Backend API]
    Backend -->|store file| S3[(RustFS / S3)]
    Backend -->|create task record| PG[(PostgreSQL)]
    Backend -->|dispatch task| Redis[(Redis Queue)]

    Redis --> TE[Task Executor]

    TE --> PS{Parser Selection}
    PS -->|PDF| PDF_P[DeepDoc PDF Parser]
    PS -->|DOCX/PPTX/XLSX| LO[LibreOffice Converter]
    PS -->|HTML/MD| Text_P[Text Parser]
    PS -->|Image| OCR_P[OCR Parser]
    PS -->|CSV/JSON| Struct_P[Structured Parser]
    PS -->|Audio| STT[Speech-to-Text]

    PDF_P --> Extract[Content Extraction]
    LO --> Extract
    Text_P --> Extract
    OCR_P --> Extract
    Struct_P --> Extract
    STT --> Extract

    Extract -->|raw text + tables + images| Enhance{LLM Enhancement}
    Enhance -->|optional| Vision[Vision Model: image descriptions]
    Enhance -->|optional| KW[Keyword Extraction]
    Enhance -->|optional| QA[Q&A Generation]
    Enhance -->|optional| Tags[Auto-Tagging]
    Enhance -->|optional| Meta[Metadata Extraction]

    Enhance --> Chunk{Chunking Strategy}
    Chunk -->|fixed size| Fixed[Fixed-Size Chunks]
    Chunk -->|recursive| Recursive[Recursive Split]
    Chunk -->|semantic| Semantic[Semantic Chunking]
    Chunk -->|layout-aware| Layout[Layout-Based Chunks]

    Fixed --> Embed[Embedding Generation]
    Recursive --> Embed
    Semantic --> Embed
    Layout --> Embed

    Embed -->|batch vectors| Index[OpenSearch Indexing]
    Index -->|vector field| VS[Vector Index - HNSW]
    Index -->|text field| BM25[BM25 Text Index]

    VS --> Ready[Ready for Search / Chat]
    BM25 --> Ready
```

## Step Details

| Step | Input | Output | Technology | Configurable Options |
|------|-------|--------|-----------|---------------------|
| Upload | File (multipart) | S3 object + DB record | Express, RustFS | Max file size, allowed types |
| Parser Selection | File MIME type | Selected parser | Python mimetypes | Per-dataset parser override |
| Content Extraction | Raw file bytes | Text + tables + images | DeepDoc, Tesseract, LibreOffice | OCR language, layout model |
| LLM Enhancement | Extracted content | Enriched content | GPT-4o, Qwen-VL, etc. | Enable/disable each enhancement |
| Chunking | Full text | Chunk array | LangChain splitters | Method, size, overlap, separators |
| Embedding | Chunk text | Float vectors | BGE-M3, text-embedding-3 | Model selection, batch size |
| Indexing | Vectors + text | OpenSearch docs | OpenSearch 3.5 | Index settings, similarity metric |

## Supported Parsers (20)

The `FACTORY` mapping in `task_executor.py` registers all 20 parser types:

| Parser ID | File Types | Method |
|-----------|-----------|--------|
| `naive` / `general` | pdf, docx, txt, html, md, xml | General-purpose text extraction (DeepDoc, MinerU, Docling, PaddleOCR, or PlainText layout engines) |
| `paper` | pdf | Academic/research paper extraction |
| `book` | pdf, docx, epub | Long-form book content with chapter detection |
| `presentation` | pptx, ppt | Slide-by-slide extraction with speaker notes |
| `manual` | pdf, docx | Technical manual/guide parsing |
| `laws` | pdf, docx | Legal/regulatory document parsing |
| `qa` | txt, md, json | Question-answer pair detection |
| `table` | xlsx, xls, csv, tsv | Tabular data with sheet iteration |
| `resume` | pdf, docx | Resume/CV section detection |
| `picture` | png, jpg, jpeg, tiff, bmp | OCR text extraction + vision model description |
| `one` | any | Single-chunk mode (entire document as one chunk) |
| `audio` | mp3, wav, flac, ogg | Speech-to-text transcription |
| `email` | eml, msg | Email header parsing + attachment extraction |
| `knowledge_graph` | any (maps to naive) | GraphRAG entity/relation extraction |
| `tag` | txt, md | Tag-delimited content splitting |
| `code` | py, js, ts, java, go, rs, c, cpp, rb | Syntax-aware source code splitting |
| `openapi` | json, yaml | OpenAPI/Swagger spec extraction |
| `adr` | json, yaml, md | Architecture Decision Record parsing |
| `clinical` | pdf | Clinical/medical document parsing |
| `sdlc_checklist` | md, json | SDLC checklist extraction |

## Advanced RAG Features (Optional Steps)

Beyond the core 7-step pipeline, two optional advanced steps can be enabled per dataset:

```mermaid
graph TD
    subgraph "GraphRAG (Optional)"
        GR1[Entity Extraction] --> GR2[Relation Extraction]
        GR2 --> GR3[Community Detection - Leiden]
        GR3 --> GR4[Community Report Generation]
        GR4 --> GR5[Graph-Augmented Retrieval]
    end

    subgraph "RAPTOR (Optional)"
        RP1[Leaf Chunks] --> RP2[Cluster via GMM]
        RP2 --> RP3[Summarize Clusters via LLM]
        RP3 --> RP4[Recurse: re-cluster summaries]
        RP4 --> RP5[Hierarchical Tree Index]
    end
```

Both are configured via `parser_config.graphrag` and `parser_config.raptor` on the dataset record. The task executor dispatches them as separate pipeline task types (`PipelineTaskType.GRAPH_RAG` and `PipelineTaskType.RAPTOR`).

## Concurrency Model

```mermaid
graph LR
    RQ[Redis Queue] --> W1[Worker Thread 1]
    RQ --> W2[Worker Thread 2]
    RQ --> WN[Worker Thread N]

    SEM[Semaphore] -.->|limits| W1
    SEM -.->|limits| W2
    SEM -.->|limits| WN

    W1 --> BE[Batch Embedding Pool]
    W2 --> BE
    WN --> BE
```

- **Task-level concurrency:** Semaphore limits concurrent tasks (configurable, default 3)
- **Batch embedding:** Chunks are batched (default 32) for efficient GPU/API utilization
- **Queue priority:** Tasks are processed FIFO with priority support for re-parse operations

## Progress Tracking

```mermaid
sequenceDiagram
    participant TE as Task Executor
    participant Redis as Redis Pub/Sub
    participant BE as Backend bridge
    participant FE as Frontend

    TE->>Redis: Publish progress update
    Redis->>BE: Pub/Sub notification
    BE->>FE: Progress event
    FE->>FE: Update progress bar UI

    Note over TE,FE: Progress includes: step name, percentage, chunk count, error count
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Parser failure | Retry up to 3 times, then mark task as failed |
| Embedding API timeout | Exponential backoff retry (1s, 2s, 4s) |
| S3 unavailable | Task paused, retried on next queue poll |
| OOM during parsing | Graceful failure, task marked failed with error details |
| Partial success | Completed chunks indexed; failed chunks logged for retry |

Task status is updated in PostgreSQL and broadcast via Redis pub/sub at each stage, ensuring the frontend always reflects the current pipeline state.
