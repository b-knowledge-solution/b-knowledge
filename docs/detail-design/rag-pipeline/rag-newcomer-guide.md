# RAG Pipeline Overview — B-Knowledge

> **Audience:** New team members who need to understand how Retrieval-Augmented Generation (RAG) works in this project.
>
> **Last updated:** 2026-04-14

---

## Table of Contents

1. [What is RAG?](#1-what-is-rag)
2. [Architecture at a Glance](#2-architecture-at-a-glance)
3. [Step 1 — Data Ingestion](#3-step-1--data-ingestion)
4. [Step 2 — Document Conversion](#4-step-2--document-conversion)
5. [Step 3 — Parsing & Text Extraction](#5-step-3--parsing--text-extraction)
6. [Step 4 — Chunking](#6-step-4--chunking)
7. [Step 5 — Embedding & Indexing](#7-step-5--embedding--indexing)
8. [Step 6 — Retrieval & Query](#8-step-6--retrieval--query)
9. [Step 7 — Generation (LLM Answer)](#9-step-7--generation-llm-answer)
10. [Putting It All Together](#10-putting-it-all-together)

---

## 1. What is RAG?

RAG (Retrieval-Augmented Generation) is a pattern where an LLM's answer is grounded in **real documents** instead of relying solely on its training data. The core idea:

```
User Question
    ↓
  Retrieve relevant document chunks from a vector/text index
    ↓
  Inject those chunks as context into an LLM prompt
    ↓
  LLM generates an answer grounded in the retrieved context
```

This solves the hallucination problem — the LLM answers based on **your** data.

---

## 2. Architecture at a Glance

B-Knowledge is a distributed system with four services that collaborate to implement RAG:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           Frontend (React)                              │
│                     fe/src/features/chat/                               │
│                     fe/src/features/search/                             │
└─────────────────────────────┬────────────────────────────────────────────┘
                              │ HTTP / SSE
┌─────────────────────────────▼────────────────────────────────────────────┐
│                        Backend (Express API)                            │
│  be/src/modules/chat/     ← Chat RAG pipeline (14 steps)               │
│  be/src/modules/rag/      ← Document CRUD, Search, Storage             │
│  be/src/shared/services/  ← LLM client, Redis, MinIO                   │
└───────┬──────────────┬──────────────────────┬────────────────────────────┘
        │              │                      │
   PostgreSQL    Redis/Valkey           MinIO (RustFS)
        │              │                      │
┌───────▼──────────────▼──────────────────────▼────────────────────────────┐
│                    RAG Worker (Python)                                   │
│  advance-rag/rag/svr/task_executor.py  ← Main processing engine        │
│  advance-rag/rag/app/                  ← 20 document parsers           │
│  advance-rag/rag/nlp/                  ← Chunking, search, tokenizer   │
│  advance-rag/deepdoc/                  ← PDF/OCR layout analysis       │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────┐
│                    Converter Worker (Python)                             │
│  converter/src/worker.py      ← Office → PDF via LibreOffice           │
└──────────────────────────────────────────────────────────────────────────┘
                                │
                          OpenSearch
                    (Vector + Text index)
```

**How services communicate:**

| From → To | Channel | Purpose |
|-----------|---------|---------|
| Backend → RAG Worker | Redis Streams (`rag_flow_svr_queue`) | Queue parse tasks |
| Backend → Converter | Redis keys (`converter:vjob:*`) | Queue conversion jobs |
| RAG Worker → Backend | Redis pub/sub | Progress updates |
| Backend → OpenSearch | REST API | Search queries |
| RAG Worker → OpenSearch | REST API | Index chunks |
| All services → PostgreSQL | Direct connection | Shared database (Knex on BE, Peewee on Python) |
| All services → MinIO/RustFS | S3 API | File storage |

---

## 3. Step 1 — Data Ingestion

**What happens:** A user uploads documents into a Knowledge Base (dataset). Files are validated, stored in S3, and queued for processing.

### Flow

```
User uploads files via UI
    ↓
POST /api/rag/datasets/:id/documents
    ↓
┌─────────────────────────────────────────┐
│ 1. Validate file (magic bytes + ext)    │
│ 2. Store file in MinIO/RustFS           │
│    Path: {tenantId}/{datasetId}/{fileId} │
│ 3. Create records:                      │
│    - file (PostgreSQL)                  │
│    - document (PostgreSQL via Peewee)   │
│    - file2document (link table)         │
│ 4. Route to next step:                  │
│    Office files → Converter Worker      │
│    Other files → RAG Worker directly    │
└─────────────────────────────────────────┘
```

### Key files

| File | Role |
|------|------|
| `be/src/modules/rag/controllers/rag.controller.ts` | HTTP endpoint for upload |
| `be/src/modules/rag/services/rag-document.service.ts` | Document record creation, parse triggering |
| `be/src/modules/rag/services/rag-storage.service.ts` | MinIO/RustFS file storage operations |
| `be/src/modules/rag/services/converter-queue.service.ts` | Queues Office files for conversion |
| `be/src/shared/config/file-upload.config.ts` | Allowed file types, blocklist, size limits |

### Supported formats

| Category | Formats |
|----------|---------|
| Documents | PDF, DOCX, DOC, TXT, MD, HTML, EPUB |
| Spreadsheets | XLSX, XLS, CSV |
| Presentations | PPTX, PPT |
| Images | JPG, PNG, GIF, BMP, TIFF, SVG |
| Audio | MP3, WAV, AAC, FLAC, OGG |
| Video | MP4, AVI, WebM |
| Code | Source files (any text-based) |
| Structured | JSON, XML, OpenAPI specs |
| Email | EML |

### Document lifecycle states

```
Upload:   status='1' (enabled), run='0' (not queued), progress=0
Queued:   run='1' (queued), progress=0.001-0.01
Parsing:  run='1', progress=1-99 (percentage)
Done:     run='3' (complete), progress=100
Canceled: run='2'
```

---

## 4. Step 2 — Document Conversion

**What happens:** Office files (Word, PowerPoint, Excel) cannot be parsed directly, so they are first converted to PDF by the Converter Worker.

### Flow

```
Backend creates Redis job
    ↓
converter:vjob:{jobId}   ← Job metadata hash
converter:files:{jobId}  ← Set of file IDs
converter:manual_trigger ← "1" to start immediately
    ↓
Converter Worker polls Redis every 30 seconds
    ↓
┌──────────────────────────────────────────┐
│ For each file in the job:                │
│   Word/PowerPoint → LibreOffice CLI      │
│     soffice --headless --convert-to pdf  │
│   Excel → Python-UNO bridge              │
│   PDF → Pass-through (copy)              │
│                                          │
│ Post-processing:                         │
│   - Remove empty pages                   │
│   - Trim whitespace/margins              │
│   - Parallel processing (8 workers)      │
│                                          │
│ Output: Clean PDF files                  │
└──────────────────────────────────────────┘
    ↓
Converted PDFs are then sent to RAG Worker for parsing
```

### Key files

| File | Role |
|------|------|
| `converter/src/worker.py` | Main polling loop, job orchestration |
| `converter/src/word_converter.py` | Word → PDF (LibreOffice CLI) |
| `converter/src/powerpoint_converter.py` | PowerPoint → PDF (LibreOffice CLI) |
| `converter/src/excel_converter.py` | Excel → PDF (Python-UNO bridge) |
| `converter/src/pdf_processor.py` | Post-processing (empty page removal, whitespace trimming) |

---

## 5. Step 3 — Parsing & Text Extraction

**What happens:** The RAG Worker receives a parse task via Redis Stream, selects the appropriate parser based on the document type, and extracts structured text, tables, and images.

### Flow

```
Redis Stream: rag_flow_svr_queue
    ↓
Task Executor picks up message (XREADGROUP)
    ↓
Select parser by parser_id (default: "naive")
    ↓
┌─────────────────────────────────────────────────┐
│ Parser extracts:                                │
│   - Text content (markdown, HTML, plain text)   │
│   - Table structures (preserved as HTML)        │
│   - Images (extracted, stored in S3)            │
│   - Metadata (author, dates, page numbers)      │
│   - Layout information (headings, sections)     │
└─────────────────────────────────────────────────┘
    ↓
Output: List of (text, position) sections → passed to chunking
```

### Parser types

The system includes 20 specialized parsers. The `naive` parser is the default and handles most formats:

| Parser ID | Use case | Notes |
|-----------|----------|-------|
| `naive` | **Default** — PDF, DOCX, TXT, MD, HTML, Excel, CSV, JSON, EPUB | Most versatile; supports multiple PDF backends |
| `presentation` | PowerPoint slides | Extracts slides as text + images |
| `picture` | Images, video frames | OCR + Vision LLM description |
| `audio` | Audio files | Speech-to-text transcription |
| `email` | EML files | Parses headers, body, attachments |
| `table` | Excel (structure-focused) | Preserves table layout |
| `paper` | Academic papers | Section-aware (abstract, intro, methods...) |
| `book` | Books/chapters | Chapter-level structure |
| `code` | Source code files | Code-aware parsing |
| `laws` | Legal documents | Legal structure preservation |
| `manual` | Manuals/documentation | Heading hierarchy |
| `qa` | Q&A format data | Question-answer pair extraction |
| `resume` | CVs/Resumes | Resume field extraction |
| `clinical` | Medical records | Medical entity recognition |
| `openapi` | API specifications | Schema parsing |
| `tag` | General with auto-tagging | Content tagging |
| `one` | Markdown | Simple markdown parsing |
| `adr` | Architecture Decision Records | ADR structure |
| `sdlc_checklist` | Checklists | Checklist item extraction |
| `knowledge_graph` | Graph-only processing | Entity/relationship extraction |

### PDF parsing backends

PDFs are the most complex format. The naive parser supports multiple pluggable backends:

| Backend | How it works |
|---------|-------------|
| **DeepDOC** (default) | ONNX-based layout recognition + table detection + PaddleOCR |
| **MinerU** | Server-based, OCR-focused |
| **Docling** | Inference-based layout analysis |
| **TCADP** | Tencent Cloud API |
| **PaddleOCR** | Lightweight OCR |
| **PlainText** | No layout analysis (fallback) |
| **VLM (Vision)** | Vision Language Model for complex layouts |

### Key files

| File | Role |
|------|------|
| `advance-rag/rag/svr/task_executor.py` | Main task execution engine — orchestrates the full pipeline |
| `advance-rag/rag/app/naive.py` | Default parser (handles most formats) |
| `advance-rag/rag/app/<type>.py` | Specialized parsers (20 types) |
| `advance-rag/deepdoc/parser/pdf_parser.py` | PDF parsing with layout recognition |
| `advance-rag/deepdoc/parser/docx_parser.py` | Word document parsing |
| `advance-rag/deepdoc/parser/excel_parser.py` | Excel parsing |
| `advance-rag/common/constants.py` | `ParserType` enum definition |

---

## 6. Step 4 — Chunking

**What happens:** Parsed text is split into smaller **chunks** — the fundamental unit of retrieval. Each chunk should be small enough to fit in an LLM context window but large enough to carry meaningful information.

### Why chunk?

- LLMs have limited context windows — you can't feed an entire 500-page PDF
- Smaller chunks allow more precise retrieval — only the relevant paragraphs, not the whole document
- Each chunk gets its own embedding vector for semantic search

### Chunking algorithm: Naive Merge

The primary chunking strategy is **naive merge** — a token-count-based approach:

```
Input: List of (text, position) sections from parser
    ↓
For each section:
    ↓
┌──────────────────────────────────────────────────────────────┐
│ 1. Count tokens in section                                   │
│ 2. If current chunk + section > chunk_token_num:             │
│    a. (Optional) Copy overlap% from end of previous chunk    │
│    b. Start a NEW chunk                                      │
│ 3. Otherwise: append section to current chunk                │
│                                                              │
│ Split points are determined by delimiters:                   │
│   Default: "\n。；！？" (newline + CJK punctuation)          │
│   Custom: backtick-wrapped like `---` or `## `               │
└──────────────────────────────────────────────────────────────┘
    ↓
Output: List of text chunks (each ≤ chunk_token_num tokens)
```

### Configurable parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `chunk_token_num` | 128 | Maximum tokens per chunk |
| `delimiter` | `"\n。；！？"` | Characters to split on |
| `overlapped_percent` | 0 | Overlap between consecutive chunks (0-100%) |
| `table_context_size` | 0 | Lines of surrounding text to include with tables |
| `image_context_size` | 0 | Lines of surrounding text to include with images |

### Chunking variants

| Function | Location | Use case |
|----------|----------|----------|
| `naive_merge()` | `advance-rag/rag/nlp/__init__.py:1070` | Standard text chunking |
| `naive_merge_with_images()` | `advance-rag/rag/nlp/__init__.py:1129` | Text + image chunks |
| `naive_merge_docx()` | `advance-rag/rag/nlp/__init__.py:1463` | DOCX with table/image context |

### Advanced chunking strategies (optional)

| Strategy | When enabled | What it does |
|----------|-------------|-------------|
| **RAPTOR** | `raptor_enabled: true` | Builds a hierarchical tree of chunks, then summarizes each level with an LLM. Creates summary chunks for better high-level retrieval. |
| **GraphRAG** | `graph_enabled: true` | Extracts entities and relationships from chunks to build a knowledge graph. Enables graph-based retrieval alongside vector search. |

### Key files

| File | Role |
|------|------|
| `advance-rag/rag/nlp/__init__.py` | `naive_merge()`, `naive_merge_with_images()`, `naive_merge_docx()` |
| `advance-rag/rag/flow/splitter/splitter.py` | Splitter pipeline component |
| `advance-rag/rag/flow/splitter/schema.py` | `SplitterParam` configuration schema |

---

## 7. Step 5 — Embedding & Indexing

**What happens:** Each chunk is converted into a high-dimensional vector (embedding) that captures its semantic meaning. Chunks + vectors are then indexed in OpenSearch for fast retrieval.

### Embedding

```
Text chunk: "PostgreSQL supports JSONB columns for flexible schema storage"
    ↓
Embedding model (e.g., BAAI/bge-m3)
    ↓
Dense vector: [0.023, -0.156, 0.891, ..., 0.044]  (768 or 1024 dimensions)
```

**Embedding models supported:**

| Provider | Models | Notes |
|----------|--------|-------|
| **Sentence Transformers** (local) | BAAI/bge-m3, BAAI/bge-small-en-v1.5, Qwen3-Embedding-0.6B | CPU-only, no API calls needed |
| **TEI** (Text Embeddings Inference) | Configured models | Docker sidecar service |
| **OpenAI API** | text-embedding-3-small/large | Remote API calls |
| **Ollama** | Configured models | Local instance |

The embedding worker runs as a separate process (`advance-rag/embedding_worker.py`) and communicates via Redis Streams:

```
Producer (task executor):  XADD embed:requests * requestId {uuid} text {chunk_text}
Consumer (embedding worker): XREADGROUP with consumer group "embed-workers"
Response:                  LPUSH embed:response:{requestId} {json_vector}
```

### Indexing into OpenSearch

Each chunk becomes a document in the `knowledge_{tenantId}` OpenSearch index:

```json
{
  "kb_id": "dataset-uuid",
  "doc_id": "document-uuid",
  "content_with_weight": "The actual chunk text...",
  "content_ltks": "pre-tokenized stems for BM25 matching",
  "content_sm_ltks": "smaller tokenized version",
  "title_tks": "tokenized document title",
  "title_sm_tks": "smaller title tokens",
  "docnm_kwd": "original-filename.pdf",
  "page_num_int": 5,
  "position_int": 42,
  "available_int": 1,
  "create_timestamp_flt": 1713100000.0,
  "q_1024_vec": [0.023, -0.156, ...],
  "important_kwd": ["keyword1", "keyword2"],
  "question_kwd": ["What is JSONB?"],
  "pagerank_fea": 1.0
}
```

**Key fields explained:**

| Field | Purpose |
|-------|---------|
| `content_with_weight` | Human-readable chunk text (displayed to users) |
| `content_ltks` / `content_sm_ltks` | Pre-tokenized text for BM25 full-text search |
| `q_{dim}_vec` | Dense embedding vector (dimension varies by model) |
| `available_int` | `1` = visible, `< 1` = hidden (toggled by admin) |
| `important_kwd` | LLM-extracted keywords (boosted 30x in search) |
| `question_kwd` | LLM-generated questions (boosted 20x in search) |
| `pagerank_fea` | Version recency boost (newer versions rank higher) |

### Optional enrichment (during indexing)

Before indexing, the task executor can optionally enrich chunks via LLM:

| Enrichment | What it does | Controlled by |
|------------|-------------|---------------|
| Keyword extraction | LLM generates key concepts → stored in `important_kwd` | Parser config |
| Question proposal | LLM generates Q&A pairs → stored in `question_kwd` | Parser config |
| Content tagging | LLM auto-tags chunks → stored in `tag_kwd` | Parser config |
| Metadata extraction | LLM extracts structured metadata | Parser config |

### Key files

| File | Role |
|------|------|
| `advance-rag/embedding_worker.py` | Standalone embedding worker process |
| `advance-rag/rag/llm/embedding_model.py` | Embedding model interface |
| `advance-rag/rag/svr/task_executor.py` | Orchestrates embedding + indexing in the pipeline |
| `advance-rag/rag/nlp/search.py` | `index_name()` function — generates `knowledge_{uid}` |
| `advance-rag/common/doc_store/` | OpenSearch connector (doc_store_base.py) |
| `be/src/shared/constants/embedding.ts` | Shared constants (stream names, factory names) |

> **Critical:** The OpenSearch index prefix is `knowledge_` (not `ragflow_`). This must match between the Python worker and the Node.js backend. See `advance-rag/rag/nlp/search.py:33` — `def index_name(uid): return f"knowledge_{uid}"`.

---

## 8. Step 6 — Retrieval & Query

**What happens:** When a user asks a question, the system finds the most relevant chunks from the indexed knowledge base using a combination of text search and vector similarity.

### Search methods

The backend supports three search modes, configured per assistant:

#### 1. Full-Text Search (BM25)

Traditional keyword matching with field boosting:

```
Query: "How does PostgreSQL handle JSON?"
    ↓
OpenSearch multi_match query across weighted fields:
  - important_kwd   (boost 30x)  ← LLM-extracted keywords
  - important_tks   (boost 20x)
  - question_tks    (boost 20x)  ← LLM-generated questions
  - title_tks       (boost 10x)  ← Document title
  - title_sm_tks    (boost  5x)
  - content_ltks    (boost  2x)  ← Chunk content
  - content_with_weight (boost 2x)
```

#### 2. Semantic (Vector) Search

Finds chunks with similar meaning, even without exact keyword matches:

```
Query: "How does PostgreSQL handle JSON?"
    ↓
Embed query → [0.023, -0.156, ...]
    ↓
OpenSearch kNN: find top-k chunks closest to query vector
    ↓
Filter: cosine similarity ≥ threshold (default 0.2)
```

#### 3. Hybrid Search (default)

Combines both methods with weighted fusion:

```
BM25 score (5% weight) + Vector similarity (95% weight)
    ↓
FusionExpr("weighted_sum", topk, {"weights": "0.05,0.95"})
```

This is the default and recommended mode. The heavy vector weight ensures semantic relevance, while the small BM25 component helps with exact keyword matches.

### Access control layers

Search results are filtered through 5 isolation layers:

```
1. Index isolation     ← knowledge_{tenantId} (one index per tenant)
2. Dataset filter      ← kb_id = datasetId
3. Availability filter ← available_int >= 1 (admin can hide chunks)
4. RBAC filter         ← CASL ability-based dataset authorization
5. Resource grants     ← Phase-6 per-user/team dataset grants with expiry
```

### Key files

| File | Role |
|------|------|
| `be/src/modules/rag/services/rag-search.service.ts` | `RagSearchService` — full-text, semantic, and hybrid search |
| `advance-rag/rag/nlp/search.py` | Python `Dealer` class — hybrid search from Python side |
| `advance-rag/rag/nlp/query.py` | `FulltextQueryer` — keyword extraction + query construction |

---

## 9. Step 7 — Generation (LLM Answer)

**What happens:** Retrieved chunks are assembled into a prompt with the user's question, sent to an LLM, and the answer is streamed back token-by-token via SSE (Server-Sent Events).

### The full 14-step chat pipeline

Located in `be/src/modules/chat/services/chat-conversation.service.ts` → `streamChat()`:

```
User question arrives
    ↓
 Step 1:  Store user message in PostgreSQL
 Step 2:  Load assistant config (KB IDs, prompt template, LLM settings)
 Step 2b: Detect user's language for response matching
 Step 3:  Load conversation history (last 20 messages)
 Step 4:  Multi-turn refinement (optional)
          └─ LLM rewrites question using conversation context
 Step 5:  Cross-language expansion (optional)
          └─ LLM translates query to configured languages
 Step 6:  Keyword extraction (optional)
          └─ LLM extracts 8 keywords, appended to search query
 Step 6.5: SQL retrieval (optional early exit for structured data)
 Step 7:  Hybrid retrieval from knowledge bases
          └─ Embed query → Search OpenSearch → Merge results
          └─ RBAC expansion + resource grant expansion
 Step 8:  Web search via Tavily (optional)
 Step 8a: Knowledge graph retrieval (optional)
 Step 8b: Deep research mode (optional, budget-capped)
 Step 9:  Reranking (dedicated model or score-based truncation)
 Step 9b: Convert HTML chunks to Markdown
 Step 10: Handle empty results (configurable fallback message)
 Step 11: Build context prompt with retrieved chunks + citation rules
 Step 12: LLM streaming (token-by-token via SSE)
 Step 13: Citation post-processing (match answer sentences to source chunks)
 Step 14: Non-blocking persistence (save assistant message to DB)
```

### Prompt assembly

The final prompt sent to the LLM looks like:

```
System: You are a helpful assistant. Answer based on the provided context.
        Respond in {detected_language}.
        {citation instructions}

Context:
  [1] chunk text from document A, page 5...
  [2] chunk text from document B, page 12...
  [3] chunk text from document C, page 3...
  {optional: knowledge graph context}
  {optional: web search results}

User: How does PostgreSQL handle JSON?

History:
  User: What databases do we support?
  Assistant: We support PostgreSQL and OpenSearch...
```

### SSE streaming format

The response is streamed to the frontend as Server-Sent Events:

```
data: {"status": "retrieving"}           ← Status update
data: {"status": "reranking"}            ← Status update
data: {"delta": "PostgreSQL"}            ← Token by token (NOT accumulated)
data: {"delta": " supports"}
data: {"delta": " JSONB"}
data: {"delta": " columns..."}
data: {"reference": {...chunks, doc_aggs}}  ← Source references
data: {"answer": "full text", "reference": {...}, "metrics": {...}}
data: [DONE]                             ← Stream complete
```

### Citation insertion

After the LLM finishes generating, citations are inserted that link answer sentences back to source chunks:

```
"PostgreSQL supports JSONB columns ##0$$ for flexible schema storage ##1$$"
```

Where `##0$$` and `##1$$` reference specific chunks — the frontend renders these as clickable source links.

### Key files

| File | Role |
|------|------|
| `be/src/modules/chat/services/chat-conversation.service.ts` | The complete 14-step RAG pipeline |
| `be/src/modules/chat/controllers/chat-conversation.controller.ts` | HTTP endpoint for chat |
| `be/src/shared/services/llm-client.service.ts` | LLM API calls (OpenAI SDK compatible) |
| `be/src/shared/prompts/` | 12 prompt templates (citation, refinement, keyword, etc.) |
| `be/src/modules/rag/services/rag-citation.service.ts` | Citation insertion (embedding-based + regex) |
| `be/src/modules/rag/services/rag-rerank.service.ts` | Chunk reranking |
| `be/src/modules/rag/services/rag-deep-research.service.ts` | Deep research mode (recursive decomposition) |
| `be/src/modules/rag/services/rag-graphrag.service.ts` | Knowledge graph retrieval |

---

## 10. Putting It All Together

### End-to-end flow diagram

```
                        ┌─────────────────────┐
                        │    User uploads      │
                        │    documents         │
                        └──────────┬──────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  STEP 1: DATA INGESTION     │
                    │  Backend API validates &     │
                    │  stores files in MinIO       │
                    └──────┬──────────────┬───────┘
                           │              │
              Office files │              │ PDF, text, images...
                           │              │
                    ┌──────▼──────┐ ┌─────▼───────────────┐
                    │ STEP 2:     │ │                      │
                    │ CONVERSION  │ │                      │
                    │ Office→PDF  │ │                      │
                    │ (LibreOffice│ │                      │
                    └──────┬──────┘ │                      │
                           │        │                      │
                    ┌──────▼────────▼─────────────────────┐
                    │  STEP 3: PARSING                    │
                    │  Extract text, tables, images       │
                    │  20 specialized parsers             │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  STEP 4: CHUNKING                   │
                    │  Split into token-sized chunks      │
                    │  (default 128 tokens per chunk)     │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  STEP 5: EMBEDDING & INDEXING       │
                    │  Generate vectors, extract keywords │
                    │  Store in OpenSearch                │
                    │  Index: knowledge_{tenantId}        │
                    └──────────────┬──────────────────────┘
                                   │
           ═══════════════════════════════════════════════
                  Documents are now searchable
           ═══════════════════════════════════════════════
                                   │
                        ┌──────────▼──────────┐
                        │    User asks a      │
                        │    question         │
                        └──────────┬──────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  STEP 6: RETRIEVAL                  │
                    │  Hybrid search (5% BM25 + 95% vec) │
                    │  + RBAC filtering                   │
                    │  + Optional reranking               │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  STEP 7: GENERATION                 │
                    │  Chunks injected into LLM prompt    │
                    │  Answer streamed via SSE            │
                    │  Citations link back to sources     │
                    └─────────────────────────────────────┘
```

### Key takeaways for new members

1. **Two phases:** The RAG pipeline has an **offline** phase (Steps 1-5: ingest → index) and an **online** phase (Steps 6-7: query → answer). They are decoupled by OpenSearch.

2. **Distributed processing:** Document processing is async — the Backend queues tasks, and the Python RAG Worker processes them independently. Progress is reported via Redis pub/sub.

3. **Hybrid search is default:** We combine BM25 keyword search (5%) with vector similarity (95%) for the best of both worlds. Pure keyword search misses semantic meaning; pure vector search misses exact terms.

4. **Multi-tenant isolation:** Each tenant gets its own OpenSearch index (`knowledge_{tenantId}`). Access control is enforced at the search layer via RBAC + resource grants.

5. **The `knowledge_` prefix is critical:** OpenSearch indices must use `knowledge_` (not `ragflow_`). This is a common gotcha when merging upstream RAGFlow code.

6. **Chunks are the fundamental unit:** Everything revolves around chunks — they are created during ingestion, embedded for search, retrieved during queries, and cited in answers.

### Configuration cheat sheet

| Setting | Where | Default | What it controls |
|---------|-------|---------|-----------------|
| Parser type | Per-document | `naive` | How text is extracted |
| Chunk token size | Per-dataset | 128 | Size of each chunk |
| Embedding model | Per-dataset | Configured default | Vector dimensions |
| Similarity threshold | Per-assistant | 0.2 | Minimum vector match score |
| Vector weight | Per-assistant | 0.95 | Balance between BM25 and vector search |
| Top N | Per-assistant | 6 | How many chunks to send to LLM |
| Rerank model | Per-assistant | None | Optional dedicated reranker |
| Multi-turn refinement | Per-assistant | Off | Rewrite queries using chat history |
| Cross-language | Per-assistant | Off | Translate queries for multilingual search |
| Knowledge graph | Per-assistant | Off | Graph-based structured retrieval |
| Deep research | Per-assistant | Off | Recursive question decomposition |

---

> **Next steps:** To see the code in action, run `npm run dev` and upload a PDF to a Knowledge Base. Watch the document progress from `0%` to `100%`, then ask a question in a chat assistant linked to that Knowledge Base.
