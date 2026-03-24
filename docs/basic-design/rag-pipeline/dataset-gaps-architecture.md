# Dataset & Chunk Gaps — Basic Design

> Architecture design for the 5 dataset/chunk management gap features: chunk toggle, keywords/questions, retrieval test, parser change, and web crawl.

## 1. Overview

This document describes the system architecture for the 5 gap features that enhance dataset and chunk management. All features follow the existing B-Knowledge architecture patterns: Express backend with Zod validation, OpenSearch for chunk storage, Redis for task queuing, and React frontend with TanStack Query.

---

## 2. System Context

```
┌────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                           │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │ Chunk Toggle  │  │ Retrieval   │  │ Web Crawl    │             │
│  │ + Keywords    │  │ Test Panel  │  │ + Parser Chg │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
└─────────┼──────────────────┼──────────────────┼────────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌────────────────────────────────────────────────────────────────────┐
│                    Backend API (Express)                            │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   RAG Module                                 │  │
│  │  rag.controller.ts → rag-search.service.ts                  │  │
│  │                    → rag-document.service.ts                 │  │
│  └──────────┬───────────────────┬──────────────────┬───────────┘  │
└─────────────┼───────────────────┼──────────────────┼──────────────┘
              │                   │                  │
     ┌────────▼────────┐  ┌──────▼──────┐  ┌────────▼────────┐
     │   OpenSearch     │  │ PostgreSQL  │  │     Redis       │
     │                  │  │             │  │                 │
     │ knowledge_{id}   │  │ document    │  │ Task Queue      │
     │ available_int    │  │ source_type │  │ (crawl, parse)  │
     │ important_kwd    │  │ source_url  │  │                 │
     │ question_kwd     │  │ parser_id   │  │                 │
     │ highlight        │  │             │  │                 │
     └─────────────────┘  └─────────────┘  └────────┬────────┘
                                                     │
                                            ┌────────▼────────┐
                                            │  advance-rag    │
                                            │  Worker         │
                                            │                 │
                                            │  - web crawl    │
                                            │  - re-parse     │
                                            └─────────────────┘
```

---

## 3. Data Model

### 3.1 OpenSearch — Chunk Fields

| Field | Type | Feature | Description |
|-------|------|---------|-------------|
| `available_int` | integer | Chunk Toggle | 0 = disabled, 1 = enabled |
| `important_kwd` | keyword[] | Keywords | Boost keywords for relevance |
| `question_kwd` | keyword[] | Questions | Expected questions this chunk answers |

### 3.2 PostgreSQL — Document Fields

| Column | Type | Feature | Description |
|--------|------|---------|-------------|
| `source_type` | varchar | Web Crawl | `'local'` or `'web_crawl'` |
| `source_url` | varchar (nullable) | Web Crawl | Original URL for web-crawled docs |
| `parser_id` | varchar | Parser Change | Parser type identifier |
| `parser_config` | jsonb | Parser Change | Parser-specific configuration |

### 3.3 Backend Type — ChunkResult

```typescript
interface ChunkResult {
  id: string
  content_with_weight: string
  available: boolean
  important_kwd: string[]
  question_kwd: string[]
  highlight: string
  token_count: number
  vector_similarity: number
  term_similarity: number
  similarity: number
}
```

---

## 4. Feature Architecture

### 4.1 Chunk Toggle

```
User clicks toggle → PATCH /chunks/:id { available: boolean }
                    → Bulk: POST /chunks/bulk-switch { chunk_ids[], available }
                    → OpenSearch update: available_int = 0 | 1

Search queries → Filter: available_int = 1 (always applied)
```

**Key decisions:**
- Stored as `available_int` (integer) in OpenSearch, mapped to `available` (boolean) in API response
- Filter is applied at the OpenSearch query level, not post-filter, for performance
- Bulk switch supports up to 1000 chunks per request

### 4.2 Chunk Keywords & Questions

```
User edits chunk → TagEditor component → string[]
                 → POST/PUT /chunks { important_keywords, question_keywords }
                 → OpenSearch: important_kwd[], question_kwd[]
```

**Key decisions:**
- Keywords stored as OpenSearch `keyword` type for exact-match filtering
- TagEditor supports: Enter to add, Backspace to delete, comma/newline paste
- Both fields are optional (can be empty arrays)

### 4.3 Enhanced Retrieval Test

```
User configures test → POST /retrieval-test {
                         question, method, similarity_threshold,
                         vector_similarity_weight, top_k
                       }

Backend executes:
  1. Run search (hybrid/semantic/full-text)
  2. For hybrid: score = weight × vector + (1-weight) × text
  3. Apply similarity_threshold filter
  4. Return chunks with highlight + score breakdown

Frontend renders:
  - ChunkResultCard with score badges
  - Highlighted text (DOMPurify sanitized)
```

**Key decisions:**
- Score formula is linear weighted average (not multiplicative)
- Highlight uses OpenSearch native `highlight` on `content_with_weight`
- DOMPurify whitelist limited to `<mark>` tags only (XSS prevention)
- Threshold filtering is post-search (applied after scoring)

### 4.4 Per-Document Parser Change

```
User selects new parser → PUT /documents/:docId/parser { parser_id, parser_config }

Backend executes:
  1. Validate document not currently parsing (status ≠ RUNNING) → 409 if busy
  2. Delete all existing chunks from OpenSearch (delete_by_query)
  3. Decrement dataset chunk_count and token_count
  4. Update document: parser_id, parser_config, reset progress
  5. Queue re-parse task to advance-rag worker via Redis
```

**Key decisions:**
- Destructive operation: all existing chunks are deleted before re-parsing
- 409 Conflict guard prevents parser change during active parsing
- Only available for documents with status DONE or FAIL
- Re-parse is async (queued to worker, not synchronous)

### 4.5 Web Crawl

```
User enters URL → POST /documents/web-crawl { url, name?, auto_parse? }

Backend executes:
  1. Validate URL format (http/https only)
  2. SSRF check: resolve hostname, block private IP ranges
  3. Create placeholder document (source_type='web_crawl', status=UNSTART)
  4. Queue crawl task to advance-rag worker via Redis

Worker executes:
  1. Fetch URL content
  2. Convert HTML → PDF
  3. Upload PDF to S3/RustFS
  4. If auto_parse: chain parse task
```

**Key decisions:**
- SSRF prevention is server-side (blocks 10.x, 172.16-31.x, 192.168.x, 127.x, ::1)
- Placeholder document created immediately for UI feedback
- HTML-to-PDF conversion ensures consistent parsing pipeline
- Auto-parse is opt-in (default: enabled)

---

## 5. API Design

### 5.1 Endpoints

| Method | Path | Request Body | Response |
|--------|------|-------------|----------|
| POST | `/datasets/:id/chunks/bulk-switch` | `{ chunk_ids: string[], available: boolean }` | `{ updated: number }` |
| POST | `/datasets/:id/chunks` | `{ content, important_keywords?, question_keywords? }` | `ChunkResult` |
| PUT | `/datasets/:id/chunks/:chunkId` | `{ content?, important_keywords?, question_keywords?, available? }` | `ChunkResult` |
| POST | `/datasets/:id/retrieval-test` | `{ question, method, similarity_threshold?, vector_similarity_weight?, top_k? }` | `{ chunks: RetrievalChunk[] }` |
| PUT | `/datasets/:id/documents/:docId/parser` | `{ parser_id, parser_config? }` | `Document` |
| POST | `/datasets/:id/documents/web-crawl` | `{ url, name?, auto_parse? }` | `Document` |

### 5.2 Validation Schemas (Zod)

```typescript
// Retrieval test parameters
{
  question: z.string().min(1),
  method: z.enum(['hybrid', 'semantic', 'full_text']),
  similarity_threshold: z.number().min(0).max(1).optional(),
  vector_similarity_weight: z.number().min(0).max(1).optional(),
  top_k: z.number().int().min(1).max(100).optional()
}

// Web crawl parameters
{
  url: z.string().url(),
  name: z.string().optional(),
  auto_parse: z.boolean().default(true)
}

// Parser change parameters
{
  parser_id: z.enum([...ParserType values]),
  parser_config: z.record(z.unknown()).optional()
}
```

---

## 6. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| SSRF via web crawl | Server-side IP range blocking (private, loopback, link-local) |
| XSS via highlighted text | DOMPurify sanitization (whitelist: `<mark>` only) |
| Unauthorized chunk mutation | `requirePermission('manage_datasets')` middleware |
| Race condition on parser change | 409 Conflict if document status = RUNNING |

---

## 7. Frontend Components

| Component | Feature | Description |
|-----------|---------|-------------|
| `TagEditor` | Keywords/Questions | Reusable tag input with badge rendering |
| `RetrievalTestPanel` | Retrieval Test | Query input + parameter sliders + results |
| `ChunkResultCard` | Retrieval Test | Score badges + highlighted text |
| `ChangeParserDialog` | Parser Change | Parser selector + config fields + warning |
| `WebCrawlDialog` | Web Crawl | URL input + name + auto-parse toggle |

All components support dark mode (class-based) and i18n (en, vi, ja).
