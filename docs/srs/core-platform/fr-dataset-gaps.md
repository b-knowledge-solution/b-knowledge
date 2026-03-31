# FR: Dataset & Chunk Management Gaps

> Feature requirements for 5 dataset/chunk management capabilities identified from RAGFlow feature parity analysis.

## 1. Overview

This specification covers 5 features that close the dataset and chunk management gaps between B-Knowledge and RAGFlow:

| # | Feature | Priority | Status |
|---|---------|----------|--------|
| 1 | Chunk Enable/Disable Toggle | High | Implemented |
| 2 | Chunk Keywords & Questions | Medium | Implemented |
| 3 | Enhanced Retrieval Test | High | Implemented |
| 4 | Per-Document Parser Change | Medium | Implemented |
| 5 | Web Crawl as Data Source | Medium | Implemented |

---

## 2. Feature 1: Chunk Enable/Disable Toggle

### 2.1 Description

Users can enable or disable individual chunks within a dataset. Disabled chunks are excluded from search and chat retrieval, allowing users to curate which content is searchable without deleting it.

### 2.2 Functional Requirements

| ID | Requirement |
|----|-------------|
| GAP-1.1 | System SHALL allow toggling individual chunk availability (enable/disable) |
| GAP-1.2 | System SHALL support bulk enable/disable operations on multiple chunks |
| GAP-1.3 | Disabled chunks SHALL be excluded from all search queries (full-text, semantic, hybrid) |
| GAP-1.4 | Disabled chunks SHALL remain visible in the chunk management UI with a visual indicator |
| GAP-1.5 | Chunk availability state SHALL be persisted in OpenSearch (`available_int` field) |

### 2.3 User Stories

- As a knowledge base manager, I want to disable low-quality chunks so they don't pollute search results
- As a content curator, I want to bulk-disable outdated chunks without deleting them
- As a reviewer, I want to see which chunks are active vs disabled in the chunk list

---

## 3. Feature 2: Chunk Keywords & Questions

### 3.1 Description

Users can attach important keywords and expected questions to individual chunks. Keywords boost relevance during keyword search, and questions allow users to define the queries a chunk should answer.

### 3.2 Functional Requirements

| ID | Requirement |
|----|-------------|
| GAP-2.1 | System SHALL allow adding/editing important keywords per chunk (`important_kwd` field) |
| GAP-2.2 | System SHALL allow adding/editing expected questions per chunk (`question_kwd` field) |
| GAP-2.3 | Keywords and questions SHALL be stored as arrays of strings in OpenSearch |
| GAP-2.4 | Keywords and questions SHALL be editable via chunk creation and update dialogs |
| GAP-2.5 | UI SHALL provide a tag editor component supporting Enter to add, Backspace to delete, and paste (comma/newline separated) |

### 3.3 User Stories

- As a content editor, I want to add important keywords to a chunk so it ranks higher for relevant queries
- As a knowledge engineer, I want to define expected questions for a chunk to improve retrieval accuracy
- As a manager, I want to see which keywords and questions are attached to each chunk

---

## 4. Feature 3: Enhanced Retrieval Test

### 4.1 Description

Users can test retrieval quality against their dataset with configurable parameters: search method (hybrid/semantic/full-text), similarity threshold, vector-vs-keyword weight, and top-K. Results show per-chunk score breakdowns and highlighted matching text.

### 4.2 Functional Requirements

| ID | Requirement |
|----|-------------|
| GAP-3.1 | System SHALL provide a retrieval test panel accessible from the dataset detail page |
| GAP-3.2 | System SHALL support three search methods: hybrid, semantic, full-text |
| GAP-3.3 | System SHALL allow configuring similarity threshold (0.0–1.0), vector weight (0.0–1.0), and top-K (1–100) |
| GAP-3.4 | Results SHALL display per-chunk score breakdown: overall, vector similarity, term similarity |
| GAP-3.5 | Results SHALL display highlighted matching text using `<mark>` tags |
| GAP-3.6 | Results SHALL display token count per chunk |
| GAP-3.7 | Highlighted text SHALL be sanitized with DOMPurify (only `<mark>` tags allowed) to prevent XSS |
| GAP-3.8 | Hybrid search score formula SHALL be: `finalScore = vectorWeight × vectorScore + (1 - vectorWeight) × textScore` |
| GAP-3.9 | Results below the similarity threshold SHALL be filtered out |

### 4.3 User Stories

- As a knowledge engineer, I want to test how well my dataset retrieves relevant chunks for specific queries
- As a developer, I want to tune vector-vs-keyword weight to optimize search quality
- As a QA tester, I want to see score breakdowns to understand why certain chunks rank higher

---

## 5. Feature 4: Per-Document Parser Change

### 5.1 Description

Users can change the parser type for an individual document after upload. This deletes existing chunks, updates the parser configuration, and re-parses the document with the new parser.

### 5.2 Functional Requirements

| ID | Requirement |
|----|-------------|
| GAP-4.1 | System SHALL allow changing the parser type for a document that is not currently parsing |
| GAP-4.2 | Changing the parser SHALL delete all existing chunks for that document |
| GAP-4.3 | System SHALL update the document's parser_id and parser_config in the database |
| GAP-4.4 | System SHALL queue a re-parse task to the advance-rag worker after parser change |
| GAP-4.5 | System SHALL decrement the dataset's chunk and token counts when deleting old chunks |
| GAP-4.6 | UI SHALL show a destructive warning: "Changing the parser will delete all existing chunks and re-parse the document" |
| GAP-4.7 | Parser change SHALL only be available for documents with status DONE or FAIL |
| GAP-4.8 | System SHALL return 409 Conflict if the document is currently being parsed |
| GAP-4.9 | UI SHALL display parser-specific configuration fields when applicable |

### 5.3 User Stories

- As a user, I want to re-parse a PDF document with a different parser (e.g., switch from Naive to Paper) to get better chunking
- As a knowledge manager, I want to correct a parser selection mistake without re-uploading the document
- As a content curator, I want to try different parser configurations to find the optimal one

---

## 6. Feature 5: Web Crawl as Data Source

### 6.1 Description

Users can add web pages as documents by providing a URL. The system crawls the URL, converts the HTML content to PDF, uploads it to storage, and optionally auto-parses it into chunks.

### 6.2 Functional Requirements

| ID | Requirement |
|----|-------------|
| GAP-5.1 | System SHALL accept HTTP/HTTPS URLs as document sources |
| GAP-5.2 | System SHALL validate URL format (must be http:// or https://) |
| GAP-5.3 | System SHALL prevent SSRF attacks by blocking private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1, link-local) |
| GAP-5.4 | System SHALL create a placeholder document record immediately upon submission |
| GAP-5.5 | Document record SHALL store `source_type: 'web_crawl'` and `source_url` |
| GAP-5.6 | System SHALL support optional auto-parse after crawl completion (default: enabled) |
| GAP-5.7 | System SHALL support optional custom document name (default: auto-detected from page title) |
| GAP-5.8 | UI SHALL display a globe icon for web-crawled documents with the original URL as tooltip |
| GAP-5.9 | The crawl task SHALL be queued to the advance-rag worker via Redis |

### 6.3 User Stories

- As a knowledge manager, I want to add web articles to my knowledge base without manually downloading them
- As a researcher, I want to crawl reference documentation pages and make them searchable
- As a user, I want web-crawled documents to be automatically parsed and indexed

---

## 7. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| GAP-NF.1 | All features SHALL support i18n in 3 locales (English, Vietnamese, Japanese) |
| GAP-NF.2 | All features SHALL support dark mode (class-based theming) |
| GAP-NF.3 | All highlighted text rendering SHALL use DOMPurify sanitization |
| GAP-NF.4 | Web crawl SSRF prevention SHALL be enforced server-side, not client-side only |
| GAP-NF.5 | Bulk operations SHALL handle up to 1000 chunks per request |
| GAP-NF.6 | Retrieval test SHALL return results within 5 seconds for datasets up to 100K chunks |

---

## 8. API Surface

| Method | Endpoint | Feature |
|--------|----------|---------|
| POST | `/datasets/:id/chunks/bulk-switch` | Chunk toggle |
| POST | `/datasets/:id/chunks` | Chunk create (with keywords/questions) |
| PUT | `/datasets/:id/chunks/:chunkId` | Chunk update (with keywords/questions) |
| POST | `/datasets/:id/retrieval-test` | Retrieval test |
| PUT | `/datasets/:id/documents/:docId/parser` | Parser change |
| POST | `/datasets/:id/documents/web-crawl` | Web crawl |
