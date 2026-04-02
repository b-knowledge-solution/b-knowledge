# RAG Ingestion Pipeline — Overview & Architecture

## 1. Introduction

The **advance-rag** ingestion pipeline is the core document processing engine of B-Knowledge. It transforms raw documents (PDF, DOCX, Excel, images, audio, code, etc.) into searchable, embeddable **chunks** stored in OpenSearch for AI-powered retrieval.

This document provides a high-level overview of the pipeline architecture, execution flow, and all 20 built-in parsers. For detailed design of each parser, see the feature-specific subdirectories.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Node.js Backend (Express)                        │
│  User uploads document → Creates Task → Publishes to Redis Queue        │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ Redis Task Queue
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      executor_wrapper.py (Entry Point)                  │
│  1. Wait for DB ready                                                   │
│  2. Init Peewee ORM tables                                              │
│  3. Ensure system tenant + default LLM models                           │
│  4. Install Redis progress hook (monkey-patches set_progress)           │
│  5. Start task_executor main loop                                       │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     task_executor.py (Orchestrator)                      │
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │ Consume Task  │───▶│ Select Parser│───▶│ Parse + Chunk│               │
│  │ from Redis    │    │ from FACTORY │    │ via chunk()  │               │
│  └──────────────┘    └──────────────┘    └──────┬───────┘               │
│                                                  │                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────▼───────┐               │
│  │ Index into   │◀───│ Generate     │◀───│ Tokenize &   │               │
│  │ OpenSearch   │    │ Embeddings   │    │ Normalize    │               │
│  └──────────────┘    └──────────────┘    └──────────────┘               │
│                                                                         │
│  Concurrency: semaphores for tasks, chunks, embeddings, MinIO           │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ Redis pub/sub
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│            Node.js Backend → SSE → Frontend (real-time progress)        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Execution Flow (Step by Step)

1. **User uploads** a document via the frontend UI
2. **Node.js backend** creates a `Task` record in PostgreSQL, uploads the file to S3/RustFS, and pushes a `parse_init` message to Redis
3. **executor_wrapper.py** starts the task executor loop (runs as a long-lived worker process)
4. **task_executor.py** consumes the task message from Redis
5. The executor looks up the appropriate **parser** from the `FACTORY` mapping based on `ParserType`
6. The parser's **`chunk()`** function is called with `(filename, binary, from_page, to_page, lang, callback, **kwargs)`
7. The parser produces a list of **chunk dictionaries** with tokenized text, metadata, images, and positions
8. The executor **embeds** each chunk using the tenant's configured embedding model (via `LLMBundle`)
9. Embedded chunks are **indexed** into OpenSearch under `knowledge_{kb_id}`
10. **Progress** is reported at each step via `set_progress()` → Redis pub/sub → SSE to frontend

---

## 4. Parser Factory — Complete Mapping

The task executor selects parsers using the `FACTORY` dictionary:

| Parser Type          | Module               | Primary Use Case                    | Category            |
|----------------------|----------------------|-------------------------------------|---------------------|
| `NAIVE` / `general`  | `naive.py`           | Default multi-format parser         | Document Parsing    |
| `BOOK`               | `book.py`            | Long-form books and documents       | Document Parsing    |
| `PAPER`              | `paper.py`           | Academic/research papers            | Document Parsing    |
| `MANUAL`             | `manual.py`          | Technical manuals & documentation   | Document Parsing    |
| `LAWS`               | `laws.py`            | Legal documents & regulations       | Document Parsing    |
| `ONE`                | `one.py`             | Whole-document (no splitting)       | Document Parsing    |
| `PRESENTATION`       | `presentation.py`    | Slides (PPT/PPTX/PDF)              | Document Parsing    |
| `TABLE`              | `table.py`           | Structured data (Excel/CSV)         | Structured Data     |
| `QA`                 | `qa.py`              | Question-answer pairs               | Structured Data     |
| `TAG`                | `tag.py`             | Content-tag pairs                   | Structured Data     |
| `PICTURE`            | `picture.py`         | Images (OCR + CV LLM)              | Media Processing    |
| `AUDIO`              | `audio.py`           | Audio transcription                 | Media Processing    |
| `EMAIL`              | `email.py`           | Email files (.eml)                  | Communication       |
| `CODE`               | `code.py`            | Source code (AST-based)             | Developer Tools     |
| `OPENAPI`            | `openapi.py`         | API specifications                  | Developer Tools     |
| `ADR`                | `adr.py`             | Architecture Decision Records       | Developer Tools     |
| `SDLC_CHECKLIST`     | `sdlc_checklist.py`  | SDLC compliance checklists          | Developer Tools     |
| `RESUME`             | `resume.py`          | Resumes (SmartResume pipeline)      | Specialized         |
| `CLINICAL`           | `clinical.py`        | Clinical/medical documents          | Specialized         |
| `KG`                 | `naive.py` (reuse)   | Knowledge graph mode                | Specialized         |

---

## 5. Common Chunk Output Schema

Every parser produces chunks following this standard schema:

```python
chunk = {
    # Required fields
    "content_with_weight": str,      # Display text for the chunk
    "content_ltks": list[str],       # Tokenized words for keyword search
    "content_sm_ltks": list[str],    # Fine-grained character tokens for fuzzy search
    "docnm_kwd": str,               # Source filename (keyword field)

    # Optional fields
    "title_tks": list[str],         # Section title tokens
    "title_sm_tks": list[str],      # Section title character tokens
    "image": PIL.Image | None,      # Embedded image (stored to S3)
    "position_int": list[tuple],    # [(page, left, right, top, bottom), ...]
    "page_num_int": list[int],      # Page numbers this chunk spans
    "top_int": list[int],           # Row/position index (for tables)

    # Parser-specific fields
    "tag_kwd": list[str],           # Tags (tag/clinical parsers)
    "adr_title": str,               # ADR title (adr parser)
    "adr_status": str,              # ADR status (adr parser)
    "sdlc_phase_kwd": str,          # SDLC phase (sdlc_checklist parser)
    "checklist_status_kwd": str,    # Checklist status (sdlc_checklist parser)
    "priority_int": int,            # Priority level (sdlc_checklist parser)
    "assignee_tks": list[str],      # Assignee tokens (sdlc_checklist parser)
}
```

---

## 6. Shared Infrastructure

### 6.1 NLP Utilities (`rag/nlp/`)

| Utility                 | Purpose                                              |
|-------------------------|------------------------------------------------------|
| `rag_tokenizer`         | Chinese/English-aware tokenization                   |
| `naive_merge()`         | Merge text lines by token limit + delimiters         |
| `hierarchical_merge()`  | Section-level merge (for bulleted/numbered content)  |
| `tree_merge()`          | Hierarchical tree merge (for legal documents)        |
| `bullets_category()`    | Detect bullet/numbering patterns                     |
| `title_frequency()`     | Analyze heading levels for section boundaries        |
| `tokenize_chunks()`     | Finalize chunks with positions, images, tables       |
| `tokenize_table()`      | Extract table cells into tokenized form              |
| `add_positions()`       | Embed position metadata in chunk text                |
| `attach_media_context()`| Attach neighboring tables/images to text chunks      |

### 6.2 Document Parsers (`deepdoc/parser/`)

Low-level format parsers that extract raw text and layout from files:

| Parser           | Formats           | Features                          |
|------------------|-------------------|-----------------------------------|
| `PdfParser`      | PDF               | Layout recognition, OCR, tables   |
| `DocxParser`     | DOCX              | Text, images, styles, headings    |
| `ExcelParser`    | XLSX, XLS, CSV    | Sheets, merged cells, data types  |
| `PptParser`      | PPTX, PPT         | Slide text, images                |
| `HtmlParser`     | HTML              | DOM extraction, cleaning          |
| `MarkdownParser` | MD                | Heading structure, code blocks    |

### 6.3 PDF Layout Engines

Multiple backends for PDF parsing, selectable via `layout_recognize` config:

| Engine         | Description                              | Accuracy | Speed  |
|----------------|------------------------------------------|----------|--------|
| `DeepDOC`      | Built-in layout + OCR (default)          | High     | Medium |
| `MinerU`       | Vision Language Model-based parsing      | Higher   | Slower |
| `Docling`      | Advanced document understanding          | Higher   | Slower |
| `PaddleOCR`    | PaddleOCR with layout analysis           | High     | Medium |
| `PlainText`    | Simple text extraction (no layout)       | Low      | Fast   |
| `TCADP`        | Tencent Cloud Document Processing        | High     | Varies |

### 6.4 Chunking Configuration

All parsers accept a `parser_config` dictionary:

```python
parser_config = {
    "chunk_token_num": 512,                 # Max tokens per chunk (default: 512)
    "delimiter": "\n!?。；！？",            # Sentence boundary delimiters
    "layout_recognize": "DeepDOC",          # PDF parsing backend
    "table_context_size": 0,                # Tables to attach to surrounding chunks
    "image_context_size": 0,                # Images to attach to surrounding chunks
    "raptor": {},                           # RAPTOR clustering config (optional)
    "graphrag": {},                         # GraphRAG config (optional)
}
```

### 6.5 Progress Reporting

```
set_progress(task_id, from_page, to_page, progress, message)
```

- **progress**: Float 0.0 → 1.0 (negative values indicate error)
- **Cancellation**: Checks task status on each update; raises `TaskCanceledException` if cancelled
- **Redis pub/sub**: Published to `task:{task_id}:progress` channel for SSE streaming

### 6.6 LLM Integration

Parsers that need AI capabilities use `LLMBundle`:

| Model Type      | Used By                        | Purpose                         |
|-----------------|--------------------------------|---------------------------------|
| `DEFAULT`       | All parsers (post-chunking)    | Embedding generation            |
| `IMAGE2TEXT`    | picture, video, resume         | Image/video description via CV  |
| `SPEECH2TEXT`   | audio                          | Audio transcription             |
| `CHAT`          | resume, clinical, sdlc         | Structured extraction & classification |

---

## 7. Integration Points

```
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  PostgreSQL   │     │    Redis      │     │  OpenSearch   │
│  (Peewee ORM) │     │  (Valkey)     │     │  (Vector DB)  │
│               │     │               │     │               │
│  Task status  │     │  Task queue   │     │  knowledge_*  │
│  Document     │     │  Progress     │     │  index chunks │
│  metadata     │     │  pub/sub      │     │  + embeddings │
│  File records │     │  Model cache  │     │               │
└───────────────┘     └───────────────┘     └───────────────┘
        │                     │                      │
        └─────────────────────┼──────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   S3 / RustFS     │
                    │  (File Storage)   │
                    │                   │
                    │  Raw documents    │
                    │  Chunk images     │
                    │  Thumbnails       │
                    └───────────────────┘
```

---

## 8. Directory Structure — Design Documents

Each parser's detailed design is organized by feature category:

```
advance-rag/rag/app/docs/
├── OVERVIEW.md                          ← You are here
├── document-parsing/
│   ├── naive-parser.md                  # Default multi-format parser
│   ├── book-parser.md                   # Long-form book parser
│   ├── paper-parser.md                  # Academic paper parser
│   ├── manual-parser.md                 # Technical manual parser
│   ├── laws-parser.md                   # Legal document parser
│   ├── presentation-parser.md           # Slides/PPT parser
│   └── one-parser.md                    # Whole-document parser
├── structured-data/
│   ├── table-parser.md                  # Excel/CSV structured data parser
│   ├── qa-parser.md                     # Question-answer pair parser
│   └── tag-parser.md                    # Content-tag pair parser
├── media-processing/
│   ├── picture-parser.md               # Image & video parser
│   └── audio-parser.md                 # Audio transcription parser
├── communication/
│   └── email-parser.md                 # Email (.eml) parser
├── developer-tools/
│   ├── code-parser.md                  # Source code AST parser
│   ├── openapi-parser.md              # API specification parser
│   ├── adr-parser.md                  # Architecture Decision Record parser
│   └── sdlc-checklist-parser.md       # SDLC checklist parser
└── specialized/
    ├── resume-parser.md               # Resume parser (SmartResume)
    └── clinical-parser.md             # Clinical document parser
```

---

## 9. Key Design Decisions

| Decision                         | Rationale                                                      |
|----------------------------------|----------------------------------------------------------------|
| Parser-per-type architecture     | Each document type has unique structure; specialized logic wins |
| Pluggable PDF layout engines     | Trade accuracy vs speed per use case                           |
| Token-based chunking             | Aligns with LLM context windows; consistent across formats     |
| Redis pub/sub for progress       | Real-time SSE streaming without polling                        |
| Peewee ORM (not Knex)           | Python worker needs its own ORM; shared DB, separate models    |
| `knowledge_` index prefix        | Differentiates from upstream RAGFlow (`ragflow_`)              |
| Single `chunk()` entry point     | Uniform interface across all parsers                           |
| Callback-based progress          | Non-blocking progress updates during long operations           |
| Semaphore concurrency control    | Prevents resource exhaustion under load                        |

---

## 10. Adding a New Parser

1. Create `rag/app/<parser_name>.py` with a `chunk()` function matching the standard signature
2. Register the parser type in `task_executor.py` FACTORY dict
3. If a new file format is needed, add a deepdoc parser in `deepdoc/parser/`
4. Add the parser type to the `ParserType` enum in the backend
5. Create a detail design document in the appropriate `docs/` subdirectory
6. Test with representative documents of the target format

---

## 11. Error Handling & Resilience

| Pattern                    | Description                                                |
|----------------------------|------------------------------------------------------------|
| **Graceful degradation**   | Parsers fall back to simpler methods on failure            |
| **Tika fallback**          | PPT → python-pptx fails → Tika JAR                        |
| **Layout fallback**        | MinerU unavailable → DeepDOC → PlainText                  |
| **Attachment isolation**   | Email attachment failures don't block main body            |
| **Empty handling**         | Empty documents return `[]` instead of raising exceptions  |
| **Temp file cleanup**      | Audio/video parsers clean up in `finally` blocks           |
| **Task heartbeat**         | Stale tasks (>120s no update) are marked failed            |
| **Cancellation check**     | Each `set_progress()` call checks for user cancellation    |
