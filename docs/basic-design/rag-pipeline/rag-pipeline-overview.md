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

## Supported Parsers (18)

| Parser | File Types | Method |
|--------|-----------|--------|
| PDF (DeepDoc) | `.pdf` | Layout analysis + OCR |
| PDF (Basic) | `.pdf` | PyMuPDF text extraction |
| DOCX | `.docx` | python-docx |
| PPTX | `.pptx` | python-pptx |
| XLSX/CSV | `.xlsx`, `.csv` | openpyxl / pandas |
| HTML | `.html`, `.htm` | BeautifulSoup |
| Markdown | `.md` | markdown-it |
| Plain Text | `.txt`, `.log` | Direct read |
| Image | `.png`, `.jpg`, `.tiff` | Tesseract OCR |
| Audio | `.mp3`, `.wav` | Whisper STT |
| JSON | `.json` | Structured parse |
| XML | `.xml` | ElementTree |
| Email | `.eml` | email parser |
| Code | `.py`, `.js`, `.ts` | Syntax-aware split |
| LaTeX | `.tex` | LaTeX parser |
| EPUB | `.epub` | EPUB reader |
| RTF | `.rtf` | RTF parser |
| ODT | `.odt` | LibreOffice |

## Advanced RAG Features

```mermaid
graph TD
    subgraph "GraphRAG"
        GR1[Entity Extraction] --> GR2[Relation Extraction]
        GR2 --> GR3[Knowledge Graph Build]
        GR3 --> GR4[Graph-Augmented Retrieval]
    end

    subgraph "RAPTOR"
        RP1[Leaf Chunks] --> RP2[Cluster Chunks]
        RP2 --> RP3[Summarize Clusters]
        RP3 --> RP4[Hierarchical Tree Index]
    end
```

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
