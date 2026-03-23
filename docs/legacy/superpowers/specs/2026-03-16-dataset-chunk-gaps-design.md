# Dataset & Chunk Viewer — Key Gap Implementation Design

**Date:** 2026-03-16
**Status:** Approved
**Scope:** 5 high-impact feature gaps identified from RAGFlow comparison

---

## Overview

This spec defines 5 independent features that bring B-Knowledge's dataset/chunk management to parity with RAGFlow's key capabilities. Each feature is a vertical slice (DB → backend → frontend) and can be implemented, tested, and merged independently.

**Implementation order:**
1. Chunk enable/disable toggle
2. Chunk keywords & questions management
3. Enhanced retrieval test
4. Per-document parser change
5. Web crawl as data source

---

## Feature 1: Chunk Enable/Disable Toggle

### Problem
OpenSearch stores `available_int` (0=disabled, 1=enabled) per chunk. Backend `updateChunkSchema` accepts `available: boolean`. But there is no UI to toggle individual chunks, no filter by availability in chunk listing, and no bulk switch endpoint.

### Architecture

#### Backend Changes

**Schema** (`be/src/modules/rag/schemas/rag.schemas.ts`):
```typescript
// New schema for bulk chunk switch
export const bulkChunkSwitchSchema = z.object({
  chunk_ids: z.array(z.string()).min(1),
  available: z.boolean(),
})

// Extend listChunks query params
// Add: available?: '0' | '1' | undefined (filter by availability)
```

**Route** (`be/src/modules/rag/routes/rag.routes.ts`):
```
POST /datasets/:id/chunks/bulk-switch  →  bulkSwitchChunks (requirePermission('manage_datasets'))
```

**Controller** (`be/src/modules/rag/controllers/rag.controller.ts`):
- `bulkSwitchChunks`: Validate body with `bulkChunkSwitchSchema`, call service, return `{ updated: number }`

**Service** (`be/src/modules/rag/services/rag-search.service.ts`):
- `bulkSwitchChunks(datasetId, chunkIds, available)`: Bulk update `available_int` in OpenSearch using `_bulk` API or `update_by_query`
- `listChunks()`: Add optional `available_int` filter to the bool query
- **IMPORTANT:** Add `available_int` to the `_source` array in `listChunks`, `fullTextSearch`, `semanticSearch`, and `hybridSearch` queries. Update `mapHits()` to map `available_int` → `available: boolean` in the response.

**Response shape** — extend chunk objects:
```typescript
{
  chunk_id: string
  text: string
  available: boolean  // mapped from available_int
  // ... existing fields
}
```

#### Frontend Changes

**Types** (`fe/src/features/datasets/types/index.ts`):
```typescript
export interface Chunk {
  // ... existing fields
  available: boolean  // NEW
}
```

**ChunkCard** (`fe/src/components/DocumentPreviewer/ChunkCard.tsx`):
- Add `Switch` component in the card header (right side, next to edit/delete buttons)
- `onChange` calls `onToggle(chunkId, newValue)`
- Visually dim disabled chunks (opacity-50)

**ChunkList** (`fe/src/components/DocumentPreviewer/ChunkList.tsx`):
- Add filter dropdown above chunk list: "All" / "Enabled" / "Disabled"
- Pass `available` query param to `listChunks` API call
- Add bulk select + bulk toggle action bar (optional, lower priority)

**API hooks** (`fe/src/features/datasets/api/datasetQueries.ts`):
- `useChunks`: Add `available` filter param
- Add `useToggleChunk` mutation calling `PUT /datasets/:id/chunks/:chunkId` with `{ available }`
- Add `useBulkSwitchChunks` mutation calling `POST /datasets/:id/chunks/bulk-switch`

---

## Feature 2: Chunk Keywords & Questions Management

### Problem
`important_kwd` is stored in OpenSearch but never exposed in UI. `question_kwd` doesn't exist anywhere in B-Knowledge. RAGFlow allows editing both per-chunk with tag-style inputs.

### Architecture

#### Backend Changes

**Schema** (`be/src/modules/rag/schemas/rag.schemas.ts`):
```typescript
// Update createChunkSchema
export const createChunkSchema = z.object({
  content: z.string().min(1),
  doc_id: z.string().optional(),
  important_keywords: z.array(z.string()).optional(),
  question_keywords: z.array(z.string()).optional(),  // NEW
})

// Update updateChunkSchema
export const updateChunkSchema = z.object({
  content: z.string().min(1).optional(),
  important_keywords: z.array(z.string()).optional(),
  question_keywords: z.array(z.string()).optional(),  // NEW
  available: z.boolean().optional(),
})
```

**Service** (`be/src/modules/rag/services/rag-search.service.ts`):
- `addChunk()`: Store `question_kwd` array in OpenSearch document alongside `important_kwd`
- `updateChunk()`: Support updating `question_kwd` field
- **IMPORTANT:** Add `important_kwd` and `question_kwd` to the `_source` array in `listChunks`, `fullTextSearch`, `semanticSearch`, and `hybridSearch` queries. Update `mapHits()` to include these arrays in the response.

**Response shape** — extend chunk objects:
```typescript
{
  // ... existing fields
  important_kwd: string[]   // NEW in response (was stored but not returned)
  question_kwd: string[]    // NEW
}
```

#### Frontend Changes

**Types** (`fe/src/features/datasets/types/index.ts`):
```typescript
export interface Chunk {
  // ... existing fields
  important_kwd: string[]   // NEW
  question_kwd: string[]    // NEW
}
```

**New shared component** — `TagEditor` (`fe/src/components/ui/tag-editor.tsx`):
- Input field with Enter to add tag
- Renders tag pills with X button to remove
- Props: `value: string[]`, `onChange: (tags: string[]) => void`, `placeholder: string`, `label: string`
- Supports paste with comma/newline splitting

**AddChunkModal** (`fe/src/features/datasets/components/AddChunkModal.tsx`):
- Add `TagEditor` for "Keywords" below content textarea
- Add `TagEditor` for "Questions" below keywords
- Change `onSubmit` signature from `(text: string) => Promise<void>` to `(data: { content: string, important_keywords?: string[], question_keywords?: string[] }) => Promise<void>`
- **Breaking change:** Update `ChunkList.tsx` which passes `addChunk` as `onSubmit` — update `useChunks.addChunk` to accept the new object signature `{ content, important_keywords?, question_keywords? }` instead of a plain string

**ChunkCard** (`fe/src/components/DocumentPreviewer/ChunkCard.tsx`):
- **View mode:** Display keyword pills (Badge variant="secondary") and question pills (Badge variant="outline") below text
- **Edit mode:** Show `TagEditor` for keywords and questions, editable alongside content textarea

**Note:** The existing frontend API uses `text` as the field name when calling `addChunk`, but the backend schema validates `content`. Fix this inconsistency: use `content` consistently in the frontend API layer.

---

## Feature 3: Enhanced Retrieval Test

### Problem
Current retrieval test only has query input, method selector, and top-K. Missing: similarity threshold, vector/keyword weight balance, metadata filter, highlight, and granular score breakdown (vector vs term vs overall).

### Architecture

#### Backend Changes

**Schema** (`be/src/modules/rag/schemas/rag.schemas.ts`):

> **Note:** `similarity_threshold` and `doc_ids` may already exist in the current schema. Verify before adding duplicates. The only guaranteed new field is `vector_similarity_weight`. Keep `top_k` max consistent with the existing schema value (currently `.max(100)`) unless there is a justified reason to increase it.

```typescript
export const retrievalTestSchema = z.object({
  query: z.string().min(1),
  method: z.enum(['hybrid', 'semantic', 'full_text']).default('hybrid'),
  top_k: z.number().int().min(1).max(100).default(5),                    // EXISTING — keep current max
  similarity_threshold: z.number().min(0).max(1).default(0.2),           // EXISTING or NEW — verify
  vector_similarity_weight: z.number().min(0).max(1).default(0.3),       // NEW
  doc_ids: z.array(z.string()).optional(),                                // EXISTING or NEW — verify
})
```

**Service** (`be/src/modules/rag/services/rag-search.service.ts`):

`hybridSearch()` changes:
- Accept `vectorWeight` param (currently hardcoded 0.5)
- Score formula: `finalScore = vectorWeight * vectorScore + (1 - vectorWeight) * textScore`
- Apply `similarity_threshold` post-filter: discard results below threshold
- Add OpenSearch `highlight` config on `content_with_weight` field:
  ```json
  {
    "highlight": {
      "fields": { "content_with_weight": { "pre_tags": ["<mark>"], "post_tags": ["</mark>"] } }
    }
  }
  ```
- Return per-result: `{ similarity, vector_similarity, term_similarity, highlight }`

`semanticSearch()` / `fullTextSearch()` changes:
- Apply `similarity_threshold` filter
- Add highlight config
- Return appropriate score field (vector_similarity or term_similarity)

`search()` dispatcher:
- Pass `vector_similarity_weight` and `similarity_threshold` through to search methods
- Filter by `doc_ids` if provided (add terms filter on `doc_id`)

Token count:
- Compute `token_count` as approximate `Math.ceil(text.length / 4)` (simple approximation)

**Response shape:**
```typescript
export interface RetrievalChunk {
  chunk_id: string
  text: string
  doc_id?: string
  doc_name?: string
  score: number                // Overall/hybrid similarity
  vector_similarity?: number   // Vector search score
  term_similarity?: number     // Full-text/keyword score
  token_count: number          // Approximate token count
  highlight?: string           // Text with <mark> tags
  page_num?: number[]
  positions?: number[][]
}
```

#### Frontend Changes

**RetrievalTestPanel** (`fe/src/features/datasets/components/RetrievalTestPanel.tsx`):

Add controls below existing method selector:
- **Similarity threshold** — Slider (0-1, step 0.01, default 0.2) with label
- **Vector/keyword weight** — Slider (0-1, step 0.01, default 0.3) with dual label:
  - Left: "Semantic {weight*100}%"
  - Right: "Keyword {(1-weight)*100}%"
  - Only visible when method = 'hybrid'
- **Document filter** — Optional multi-select dropdown of documents in dataset

**ChunkResultCard** (`fe/src/features/datasets/components/ChunkResultCard.tsx`):

Enhance display:
- **Score breakdown:** Show 3 small progress bars or badges:
  - Overall: `{(score*100).toFixed(1)}%`
  - Vector: `{(vector_similarity*100).toFixed(1)}%` (if available)
  - Term: `{(term_similarity*100).toFixed(1)}%` (if available)
- **Highlight:** Render `highlight` field safely using DOMPurify to sanitize HTML, allowing only `<mark>` tags. Use `DOMPurify.sanitize(highlight, { ALLOWED_TAGS: ['mark'] })` before rendering. **Dependency:** Add `dompurify` and `@types/dompurify` to `fe/package.json`.
- **Token count:** Badge showing token count

**useRetrievalTest hook** (`fe/src/features/datasets/hooks/useRetrievalTest.ts`):
- Extend params type to include new fields
- Pass through to API call
- **Convention note:** Per `fe/CLAUDE.md`, `useMutation` hooks should live in `api/datasetQueries.ts`, not `hooks/`. Consider migrating `useRetrievalTest` to `datasetQueries.ts` as part of this feature to fix the existing convention violation.

---

## Feature 4: Per-Document Parser Change

### Problem
Once a document is uploaded and parsed, there's no way to change its chunking method. RAGFlow allows changing the parser, which deletes existing chunks and re-queues the document for re-parsing.

### Architecture

#### Backend Changes

**Schema** (`be/src/modules/rag/schemas/rag.schemas.ts`):
```typescript
export const changeDocumentParserSchema = z.object({
  parser_id: z.enum([
    'naive', 'qa', 'resume', 'manual', 'table', 'paper',
    'book', 'laws', 'presentation', 'one', 'picture', 'audio', 'email'
  ]),
  parser_config: z.object({
    chunk_token_num: z.number().int().min(64).max(8192).optional(),
    delimiter: z.string().optional(),
    layout_recognize: z.boolean().optional(),
    // ... other parser config fields matching dataset settings
  }).optional(),
})
```

**Route** (`be/src/modules/rag/routes/rag.routes.ts`):
```
PUT /datasets/:id/documents/:docId/parser  →  changeDocumentParser (requirePermission('manage_datasets'))
```

**Controller** (`be/src/modules/rag/controllers/rag.controller.ts`):
- `changeDocumentParser`: Validate with schema, call service, return updated document

**Service** (`be/src/modules/rag/services/rag-document.service.ts`):
1. Fetch document, verify it belongs to dataset
2. **Guard:** If document `run === '1'` (RUNNING), return 409 Conflict — cannot change parser while document is being parsed
3. If parser_id unchanged and same config → return early (no-op)
4. Delete all chunks for this document from OpenSearch (`delete_by_query` where `doc_id` matches)
5. Update document in PostgreSQL:
   - Set new `parser_id`, `parser_config`
   - Reset `progress = 0`, `progress_msg = ''`, `run = 'UNSTART'`
   - Reset `chunk_count = 0`, `token_count = 0`
6. Decrement dataset's aggregate chunk/token counts — **Note:** Add a `decrementChunkTokenCounts(datasetId, chunkCount, tokenCount)` method to `KnowledgebaseModel` since no such method currently exists. The `knowledgebase` table is Peewee-managed; update via the RAG document service's existing DB connection.
7. Queue re-parse task to advance-rag worker via Redis

#### Frontend Changes

**DocumentTable** (`fe/src/features/datasets/components/DocumentTable.tsx`):
- Add "Change Parser" to per-row dropdown menu (between "Parse" and "Delete")
- Only show for documents with status DONE or FAIL (not while parsing)

**New component** — `ChangeParserDialog` (`fe/src/features/datasets/components/ChangeParserDialog.tsx`):
- Dialog/Sheet with:
  - Current parser display (read-only badge)
  - Parser method selector (Select dropdown with 13 options, same as GeneralSettingsForm)
  - Conditional config fields based on selected parser (chunk size, delimiter, etc.)
  - Warning alert: "Changing the parser will delete all existing chunks and re-parse the document."
  - Cancel / Confirm buttons
- On confirm: call API, invalidate document + chunk queries, close dialog

**API** (`fe/src/features/datasets/api/datasetApi.ts`):
```typescript
changeDocumentParser(datasetId: string, docId: string, data: { parser_id: string, parser_config?: object }): Promise<Document>
```

**Hooks** (`fe/src/features/datasets/api/datasetQueries.ts`):
- `useChangeDocumentParser(datasetId)` mutation hook

---

## Feature 5: Web Crawl as Data Source

### Problem
No way to add documents from URLs. RAGFlow converts URLs to PDF via `html2pdf` and creates documents. This is a common use case for knowledge bases.

### Architecture

#### Database Changes

> **IMPORTANT:** The `document` table (singular) is Peewee-managed by advance-rag at runtime, but **all schema migrations go through Knex** on the backend (project convention). The `source_type` column **already exists** with default `'local'`. Only `source_url` is truly new.

**Knex migration** (`be/src/shared/db/migrations/YYYYMMDDhhmmss_add_document_source_url.ts`):
```typescript
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('document', (table) => {
    table.string('source_url', 2048).nullable()
  })
}
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('document', (table) => {
    table.dropColumn('source_url')
  })
}
```

- `source_type`: Reuse existing column. Values: `'local'` (existing default for uploads) | `'web_crawl'` (new)
- `source_url`: New column — original URL for web-crawled documents

**Backend TypeScript type** — update `DocumentRow` in `be/src/shared/models/types.ts` to include `source_type` and `source_url` fields so the Express backend can read them from PostgreSQL.

#### Backend Changes

**Schema** (`be/src/modules/rag/schemas/rag.schemas.ts`):
```typescript
export const webCrawlSchema = z.object({
  url: z.string().url('Invalid URL format'),
  name: z.string().min(1).max(255).optional(),  // Auto-derived from URL if not provided
  auto_parse: z.boolean().default(true),
})
```

**Route** (`be/src/modules/rag/routes/rag.routes.ts`):
```
POST /datasets/:id/documents/web-crawl  →  webCrawlDocument (requirePermission('manage_datasets'))
```

**Controller** (`be/src/modules/rag/controllers/rag.controller.ts`):
- `webCrawlDocument`: Validate with schema, call service, return created document

**Service** (`be/src/modules/rag/services/rag-document.service.ts`):

> **Async flow:** The API returns a placeholder document immediately. The crawl+conversion happens asynchronously in the worker. This matches the existing document upload pattern.

1. Validate URL format. **SSRF prevention:** Block private/internal IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1, link-local). Set a HEAD request timeout of 10 seconds.
2. Create placeholder document record in PostgreSQL immediately:
   - `name`: provided name or derived from URL hostname+path
   - `type`: `'pdf'` (will be converted)
   - `source_type`: `'web_crawl'`
   - `source_url`: original URL
   - `run`: `'0'` (UNSTART), `progress`: 0
   - `parser_id`: inherit from dataset
3. Queue crawl task to advance-rag worker via Redis:
   - Worker fetches URL, converts HTML → PDF using headless browser or `wkhtmltopdf`
   - Worker uploads PDF to S3 (RustFS)
   - Worker updates document record with: `location` (S3 path), `size`, `type`
   - If `auto_parse: true`, worker chains parse task immediately
4. Return placeholder document record (frontend polls status like normal document parsing)

**advance-rag worker** (`advance-rag/`):
- New endpoint or Redis task handler: `web_crawl`
- Uses `playwright` or `wkhtmltopdf` to render URL → PDF
- Uploads PDF to S3
- Returns `{ s3_path, file_size, page_count, title }`

#### Frontend Changes

**DatasetDetailPage** (`fe/src/features/datasets/pages/DatasetDetailPage.tsx`):
- Add "Web Crawl" button (Globe icon) next to "Upload" button in the action bar
- Opens `WebCrawlDialog`

**New component** — `WebCrawlDialog` (`fe/src/features/datasets/components/WebCrawlDialog.tsx`):
- Dialog with:
  - URL input field with validation (must start with http:// or https://)
  - Document name input (optional, placeholder: "Auto-detected from page title")
  - "Auto-parse after crawl" checkbox (default: checked)
  - Submit button with loading state
- On success: close dialog, show toast, invalidate document queries

**DocumentTable** (`fe/src/features/datasets/components/DocumentTable.tsx`):
- Add source icon column or indicator:
  - Upload icon for `source_type === 'local'`
  - Globe icon for `source_type === 'web_crawl'`
- Tooltip on globe icon shows original URL

**API** (`fe/src/features/datasets/api/datasetApi.ts`):
```typescript
webCrawlDocument(datasetId: string, data: { url: string, name?: string, auto_parse?: boolean }): Promise<Document>
```

**Hooks** (`fe/src/features/datasets/api/datasetQueries.ts`):
- `useWebCrawl(datasetId)` mutation hook

**Types** (`fe/src/features/datasets/types/index.ts`):
```typescript
export interface Document {
  // ... existing fields
  source_type: 'local' | 'web_crawl'   // EXISTING field, add to FE type (default: 'local')
  source_url?: string                   // NEW (only for web_crawl)
}
```

---

## Files Modified Summary

### Backend (`be/`)

| File | Features |
|------|----------|
| `src/modules/rag/schemas/rag.schemas.ts` | 1, 2, 3, 4, 5 |
| `src/modules/rag/routes/rag.routes.ts` | 1, 4, 5 |
| `src/modules/rag/controllers/rag.controller.ts` | 1, 3, 4, 5 |
| `src/modules/rag/services/rag-search.service.ts` | 1, 2, 3 |
| `src/modules/rag/services/rag-document.service.ts` | 4, 5 |
| `src/shared/models/types.ts` | 2, 3, 5 |

### Frontend (`fe/`)

| File | Features |
|------|----------|
| `src/features/datasets/types/index.ts` | 1, 2, 3, 5 |
| `src/features/datasets/api/datasetApi.ts` | 1, 4, 5 |
| `src/features/datasets/api/datasetQueries.ts` | 1, 2, 4, 5 |
| `src/features/datasets/hooks/useRetrievalTest.ts` | 3 |
| `src/components/DocumentPreviewer/ChunkCard.tsx` | 1, 2 |
| `src/components/DocumentPreviewer/ChunkList.tsx` | 1 |
| `src/features/datasets/components/AddChunkModal.tsx` | 2 |
| `src/features/datasets/components/RetrievalTestPanel.tsx` | 3 |
| `src/features/datasets/components/ChunkResultCard.tsx` | 3 |
| `src/features/datasets/components/DocumentTable.tsx` | 4, 5 |
| `src/features/datasets/pages/DatasetDetailPage.tsx` | 5 |
| `src/components/ui/tag-editor.tsx` | 2 (new file) |
| `src/features/datasets/components/ChangeParserDialog.tsx` | 4 (new file) |
| `src/features/datasets/components/WebCrawlDialog.tsx` | 5 (new file) |

### advance-rag (`advance-rag/`)

| File | Features |
|------|----------|
| `db/db_models.py` (Peewee migration for `source_url` column) | 5 |
| Web crawl task handler (new) | 5 |

### i18n

All 5 features require new translation keys in `en`, `vi`, `ja` locales.

---

## Non-Goals

- Reranker model selection in retrieval test (requires LLM provider integration — separate feature)
- Cross-language retrieval (requires translation service — separate feature)
- Tag parser chunking method (niche use case, low priority)
- Share retrieval test results (low priority)
- Mind map view for knowledge graph (low priority)
- Data source connectors (DB, API, Cloud — large scope, separate initiative)
- Bulk metadata update on documents (separate feature)
- Auto-keyword/question extraction during parsing (requires advance-rag worker LLM integration — separate feature)
