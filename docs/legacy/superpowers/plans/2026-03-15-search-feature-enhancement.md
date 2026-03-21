# Search Feature Enhancement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance B-Knowledge search to match RAGFlow feature parity while preserving the admin-managed search app model (admin creates search apps, grants access to users/teams -- same pattern as chat dialogs).

**Architecture:** Three-phase approach -- Phase 1 delivers core Search UX improvements (grounded citations, document preview, search filters UI, highlight), Phase 2 adds advanced features (cross-language, knowledge graph, web search, retrieval test), Phase 3 adds external integration (embeddable search widget, OpenAI-compatible search API). Each phase is independently deployable.

**Tech Stack:** Express 4.21 + TypeScript (BE), React 19 + TanStack Query + shadcn/ui (FE), OpenSearch for retrieval, OpenAI SDK for LLM summary, Vitest for tests.

**Key Business Logic (same as Chat):** In B-Knowledge, admins create and configure search apps and grant access to users/teams. Users only consume search -- they cannot create or configure search apps. All search app management requires `manage_users` permission. This differs from RAGFlow where users self-manage search apps.

---

## RAGFlow vs B-Knowledge Search -- Feature Comparison

### A. Search App Management

| Feature | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| Create search app | Any user (self-service) | Admin only (manage_users) | **Changed logic** |
| List search apps | User sees own | RBAC: admin=all, user=own+public+shared | **Changed logic** |
| Update search app | Owner | Admin only | **Changed logic** |
| Delete search app | Owner (soft delete) | Admin only | **Changed logic** |
| Paginated list + search | POST /search/list with page, keywords, orderby | Simple list, no server pagination | **Missing** |
| Avatar upload | Base64 icon | Not implemented | **Missing** |
| Name uniqueness check | Not enforced | Not enforced | **Missing** |

### B. Search Configuration

| Config Field | RAGFlow | B-Knowledge | Status |
|-------------|---------|-------------|--------|
| Knowledge base IDs | `kb_ids` | `dataset_ids` | **Implemented** (different name) |
| Similarity threshold | `similarity_threshold` (0.2) | `similarity_threshold` in search_config | **Implemented** |
| Vector weight | `vector_similarity_weight` (0.3) | `vector_similarity_weight` | **Implemented** |
| Top K | `top_k` (1024) | `top_k` | **Implemented** |
| Search method | Implicit (hybrid) | `search_method` (fulltext/semantic/hybrid) | **Implemented** |
| Rerank model | `rerank_id` | Not in config | **Missing** |
| LLM for summary | `chat_id` + `llm_setting` | Not in config (uses default provider) | **Missing** |
| AI Summary toggle | `summary` (boolean) | Implicit (ask endpoint always summarizes) | **Partial** |
| Cross-language | `cross_languages` array | Not implemented | **Missing** |
| Keyword extraction | `keyword` (boolean) | Not implemented | **Missing** |
| Highlight terms | `highlight` (boolean) | Not implemented | **Missing** |
| Web search | `web_search` (boolean) | Not implemented | **Missing** |
| Related questions | `related_search` (boolean) | Implemented (separate endpoint) | **Implemented** |
| Mind map | `query_mindmap` (boolean) | Implemented (separate endpoint) | **Implemented** |
| Metadata filter | `meta_data_filter` with method + manual | Not implemented | **Missing** |
| Document ID filter | `doc_ids` array | Not implemented | **Missing** |
| Knowledge graph | `use_kg` (boolean) | Not implemented | **Missing** |
| Public/private | Not in RAGFlow search | `is_public` boolean | **Extended** |
| Access control | Not in RAGFlow | user/team access table | **Extended** |

### C. Search Execution

| Feature | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| Raw search (no summary) | Implicit in retrieval_test | `POST /apps/:id/search` | **Implemented** |
| AI summary (streaming) | `POST /searchbots/ask` (SSE) | `POST /apps/:id/ask` (SSE) | **Implemented** |
| Non-streaming mode | `stream=false` parameter | Always streaming | **Missing** |
| Related questions | `POST /searchbots/related_questions` | `POST /apps/:id/related-questions` | **Implemented** |
| Mind map | `POST /searchbots/mindmap` | `POST /apps/:id/mindmap` | **Implemented** |
| Retrieval test (dry-run) | `POST /searchbots/retrieval_test` with pagination | Not implemented | **Missing** |
| Citation insertion | Post-processing with embeddings | `ragCitationService.insertCitations()` | **Implemented** |
| Langfuse tracing | If configured | Fire-and-forget tracing | **Implemented** |

### D. Search UI

| Feature | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| Search landing page | Spotlight search bar | Centered search bar | **Implemented** |
| Search results with summary | Streaming answer + references | Streaming answer + chunks | **Implemented** |
| Related questions sidebar | Clickable suggestions | RelatedSearchQuestions component | **Implemented** |
| Mind map drawer | Tree visualization | MindMapTree + SearchMindMapDrawer | **Implemented** |
| Document preview | Full modal with chunk highlight | SearchDocumentPreviewDrawer | **Implemented** |
| Filter panel | Rich sidebar (20+ settings) | SearchFilters (basic: dataset, file type, method, threshold) | **Partial** |
| Pagination in results | Page/size in retrieval_test | Not present in search results | **Missing** |
| Highlight search terms | In chunk display | Not implemented | **Missing** |
| Image lightbox | For image chunks | ImageLightbox component exists | **Implemented** |
| Settings sidebar (RAGFlow) | Full config in search page | Separate admin page | **Different (by design)** |
| Retrieval testing UI | Score display, pagination | Not implemented | **Missing** |

### E. Search UI -- User Role Visibility Check

| Feature | Should User See? | Currently Visible? | Fix Needed? |
|---------|----------------|--------------------|-------------|
| Search bar + results | Yes | Yes | No |
| Filter panel (basic) | Yes | Yes | No |
| SearchAppConfig modal | Admin only | **Need to verify** | **Check** |
| SearchAppAccessDialog | Admin only | **Need to verify** | **Check** |
| Search app selector | Yes (accessible apps only) | Yes (RBAC filtered) | No |
| Related questions | Yes | Yes | No |
| Mind map | Yes | Yes | No |
| Document preview | Yes | Yes | No |

---

## File Structure Overview

### New Files to Create

```
be/src/modules/search/
  schemas/search-embed.schemas.ts     # Embed/public search schemas

fe/src/features/search/
  components/SearchHighlight.tsx       # Term highlighting in results
  components/SearchRetrievalTest.tsx   # Retrieval testing UI
  components/SearchCrossLanguage.tsx   # Cross-language config
  components/SearchMetadataFilter.tsx  # Metadata filter config (shared with chat)

fe/src/features/search-widget/
  index.ts                            # Widget barrel export
  SearchWidget.tsx                    # Embeddable search widget root
  SearchWidgetBar.tsx                 # Compact search input
  SearchWidgetResults.tsx             # Results overlay
  searchWidgetApi.ts                  # Dual-mode API client (internal/external)
```

### Existing Files to Modify

```
BE:
  be/src/modules/search/services/search.service.ts      # Cross-language, KG, web search, highlights, rerank
  be/src/modules/search/schemas/search.schemas.ts       # New config fields, pagination
  be/src/modules/search/routes/search.routes.ts         # Pagination params, retrieval test, embed routes
  be/src/modules/search/controllers/search.controller.ts # New handlers
  be/src/modules/rag/services/rag-search.service.ts     # Highlight support, metadata filter
  be/src/app/routes.ts                                  # Mount embed routes

FE:
  fe/src/features/search/api/searchApi.ts               # New API functions
  fe/src/features/search/api/searchQueries.ts           # New hooks
  fe/src/features/search/hooks/useSearchStream.ts       # Cross-language, highlights
  fe/src/features/search/pages/SearchPage.tsx           # Filters, highlights, retrieval test
  fe/src/features/search/pages/SearchAppManagementPage.tsx # Pagination, enhanced config
  fe/src/features/search/components/SearchAppConfig.tsx  # New config fields
  fe/src/features/search/components/SearchResults.tsx    # Highlight, pagination
  fe/src/features/search/components/SearchFilters.tsx    # Enhanced filters
  fe/src/features/search/types/search.types.ts          # New types
  fe/src/i18n/locales/en.json                           # New i18n keys
  fe/src/i18n/locales/vi.json
  fe/src/i18n/locales/ja.json
```

---

## Chunk 1: Phase 1 -- Core Search UX

### Task 1.0: Verify Search UI Has No Config Leakage (PRIORITY)

**Files:**
- Audit: `fe/src/features/search/pages/SearchPage.tsx`

**Context:** The user-facing `/search` page MUST be pure consumption -- zero configuration UI. All search app configuration belongs exclusively in the Data Studio admin page at `/data-studio/search-apps` (SearchAppManagementPage).

**Current status:** SearchPage.tsx is CLEAN -- it only has:
- Search bar (input + stop button)
- Filter sidebar (dataset, file type, method, threshold -- these are user search filters, NOT admin config)
- Mind map button
- Document preview drawer
- Related questions display

No Settings button, no SearchAppConfig modal, no admin UI leakage.

- [ ] **Step 1: Verify no config UI in SearchPage**

Read `SearchPage.tsx` and confirm there is NO:
- Settings/gear button
- SearchAppConfig modal
- SearchAppAccessDialog
- Any config state (showConfig, editingApp, etc.)

Expected: CLEAN -- no changes needed.

- [ ] **Step 2: Verify filter sidebar is user-facing search params only**

The SearchFilters component should only contain user-facing search parameters:
- Dataset selection (which KBs to search -- from accessible list)
- File type filter
- Search method (fulltext/semantic/hybrid)
- Similarity threshold slider

It should NOT contain admin settings like:
- LLM model selection
- System prompt
- Rerank model
- Tavily API key
- Cross-language config

If any admin settings are found in SearchFilters, move them to SearchAppConfig (admin-only).

- [ ] **Step 3: Document or commit if changes needed**

If clean: skip commit. If fixes needed:
```bash
git add fe/src/features/search/
git commit -m "fix: ensure search page has no admin config UI"
```

---

### Task 1.1: Search Results Pagination

**Files:**
- Modify: `be/src/modules/search/schemas/search.schemas.ts`
- Modify: `be/src/modules/search/services/search.service.ts:259-302`
- Modify: `fe/src/features/search/hooks/useSearchStream.ts`
- Modify: `fe/src/features/search/components/SearchResults.tsx`
- Modify: `fe/src/features/search/types/search.types.ts`

- [ ] **Step 1: Add pagination to search schema**

In `be/src/modules/search/schemas/search.schemas.ts`:
```typescript
export const executeSearchSchema = z.object({
  body: z.object({
    query: z.string().min(1),
    top_k: z.number().int().min(1).max(100).default(10),
    method: z.enum(['full_text', 'semantic', 'hybrid']).default('full_text'),
    similarity_threshold: z.number().min(0).max(1).default(0),
    page: z.number().int().min(1).default(1),
    page_size: z.number().int().min(1).max(50).default(10),
  }),
  params: z.object({ id: z.string().uuid() }),
})
```

- [ ] **Step 2: Implement pagination in service**

In `search.service.ts`, `executeSearch()`:
```typescript
async executeSearch(appId: string, query: string, options: {
  topK: number, method: string, similarityThreshold: number,
  page: number, pageSize: number,
}) {
  // ... existing retrieval ...
  const total = allChunks.length
  const paginated = allChunks.slice((options.page - 1) * options.pageSize, options.page * options.pageSize)
  return { results: paginated, total, page: options.page, page_size: options.pageSize }
}
```

- [ ] **Step 3: Add pagination UI in SearchResults**

Add prev/next buttons and page indicator below results.

- [ ] **Step 4: Commit**

```bash
git add be/src/modules/search/ fe/src/features/search/
git commit -m "feat: add pagination to search results"
```

---

### Task 1.2: Search Term Highlighting

**Files:**
- Create: `fe/src/features/search/components/SearchHighlight.tsx`
- Modify: `fe/src/features/search/components/SearchResultCard.tsx`

**Context:** Highlight matching search terms in result chunks. Client-side regex-based highlighting is simple and sufficient.

- [ ] **Step 1: Create SearchHighlight component**

```tsx
// fe/src/features/search/components/SearchHighlight.tsx
interface SearchHighlightProps {
  text: string
  query: string
  className?: string
}

export function SearchHighlight({ text, query, className }: SearchHighlightProps) {
  if (!query.trim()) return <span className={className}>{text}</span>

  const terms = query.split(/\s+/).filter(Boolean)
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(regex)

  return (
    <span className={className}>
      {parts.map((part, i) =>
        regex.test(part)
          ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">{part}</mark>
          : part
      )}
    </span>
  )
}
```

- [ ] **Step 2: Use in SearchResultCard**

Replace plain text rendering with `<SearchHighlight text={chunk.content} query={lastQuery} />`.

- [ ] **Step 3: Add highlight toggle to search config**

In `SearchAppConfig.tsx`, add a "Highlight terms" toggle that saves to `search_config.highlight`.

- [ ] **Step 4: Commit**

```bash
git add fe/src/features/search/components/SearchHighlight.tsx fe/src/features/search/
git commit -m "feat: add search term highlighting in result chunks"
```

---

### Task 1.3: Grounded Citations in Search Summary

**Files:**
- Modify: `fe/src/features/search/components/SearchResults.tsx`
- Modify: `fe/src/features/search/hooks/useSearchStream.ts`
- Reference: `fe/src/components/CitationInline.tsx` (reuse from chat)
- Reference: `fe/src/components/DocumentPreviewer/` (reuse from chat)

**Context:** The search `askSearch` SSE stream already returns citations with `##ID:n$$` markers (same as chat). We need to render them using the shared `CitationInline` component and connect to DocumentPreviewer.

- [ ] **Step 1: Use CitationInline in search summary rendering**

In `SearchResults.tsx`, render the AI summary using `CitationInline`:

```tsx
import { CitationInline } from '@/components/CitationInline'

// In the summary display section:
<CitationInline
  content={answer}
  reference={{ chunks: docChunks, doc_aggs: docAggs }}
  onCitationClick={(chunk) => openDocumentPreview(chunk)}
/>
```

- [ ] **Step 2: Connect to SearchDocumentPreviewDrawer**

Wire the existing `SearchDocumentPreviewDrawer` to open when clicking a citation:

```tsx
const [previewChunk, setPreviewChunk] = useState<SearchResult | null>(null)

const openDocumentPreview = (chunk: ChatChunk) => {
  setPreviewChunk({
    chunk_id: chunk.chunk_id,
    content: chunk.content_with_weight,
    doc_id: chunk.doc_id,
    doc_name: chunk.docnm_kwd,
    page_num: chunk.page_num_int,
    positions: chunk.positions,
    score: chunk.score || 0,
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add fe/src/features/search/
git commit -m "feat: add grounded citations with document preview in search summary"
```

---

### Task 1.4: Enhanced Search Filters

**Files:**
- Modify: `fe/src/features/search/components/SearchFilters.tsx`
- Modify: `fe/src/features/search/components/SearchAppConfig.tsx`
- Modify: `fe/src/features/search/types/search.types.ts`

**Context:** Expand the filter panel for users and the config panel for admins.

- [ ] **Step 1: Add filter fields to SearchFilters**

Enhanced SearchFilters with:
- Dataset multi-select (existing)
- File type filter (existing)
- Search method selector (existing)
- Similarity threshold slider (existing)
- Top K slider (new)
- Vector weight slider (new -- only for hybrid method)
- Document ID filter (new -- dropdown from available docs)

- [ ] **Step 2: Add advanced config to SearchAppConfig**

For admin configuration, add:
- Rerank model selector (dropdown from available models)
- LLM model selector (for summary generation)
- Cross-language multi-select
- Keyword extraction toggle
- Knowledge graph toggle
- Web search toggle (with Tavily API key field)
- AI summary toggle (default on)
- Related questions toggle
- Mind map toggle

- [ ] **Step 3: Update SearchAppConfig type**

```typescript
interface SearchAppConfig {
  similarity_threshold?: number
  top_k?: number
  search_method?: 'fulltext' | 'semantic' | 'hybrid'
  vector_similarity_weight?: number
  // New fields:
  rerank_id?: string
  llm_id?: string
  llm_setting?: { temperature?: number; top_p?: number; max_tokens?: number }
  cross_languages?: string
  keyword?: boolean
  highlight?: boolean
  use_kg?: boolean
  web_search?: boolean
  tavily_api_key?: string
  enable_summary?: boolean
  enable_related_questions?: boolean
  enable_mindmap?: boolean
  metadata_filter?: { logic: 'and' | 'or'; conditions: MetadataCondition[] }
}
```

- [ ] **Step 4: Commit**

```bash
git add fe/src/features/search/
git commit -m "feat: enhance search filter panel and admin configuration"
```

---

### Task 1.5: Search App List Pagination (Admin)

**Files:**
- Modify: `be/src/modules/search/routes/search.routes.ts`
- Modify: `be/src/modules/search/schemas/search.schemas.ts`
- Modify: `be/src/modules/search/services/search.service.ts`
- Modify: `fe/src/features/search/pages/SearchAppManagementPage.tsx`
- Modify: `fe/src/features/search/api/searchApi.ts`

**Context:** Same pattern as chat dialog pagination (Task 1.7 in chat plan).

- [ ] **Step 1: Add pagination schema**

```typescript
export const listSearchAppsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
    sort_by: z.enum(['created_at', 'name']).default('created_at'),
    sort_order: z.enum(['asc', 'desc']).default('desc'),
  }),
})
```

- [ ] **Step 2: Update service with pagination + name uniqueness**

Same pattern as chat: RBAC-filtered query with ILIKE search, count, offset/limit.

- [ ] **Step 3: Update admin page with server-side pagination**

- [ ] **Step 4: Commit**

```bash
git add be/src/modules/search/ fe/src/features/search/
git commit -m "feat: add pagination and search to search app management"
```

---

## Chunk 2: Phase 2 -- Advanced Search Features

### Task 2.1: Cross-Language Search

**Files:**
- Modify: `be/src/modules/search/services/search.service.ts:304-530`
- Modify: `be/src/modules/search/schemas/search.schemas.ts`
- Create: `fe/src/features/search/components/SearchCrossLanguage.tsx`

**Context:** Same as chat cross-language -- expand query to multiple languages before retrieval. Uses the same `expandCrossLanguage()` helper that chat uses.

- [ ] **Step 1: Add cross_languages to search config schema**

```typescript
// In search app config:
cross_languages: z.string().max(256).optional() // comma-separated: "en,vi,ja"
```

- [ ] **Step 2: Implement in askSearch pipeline**

In `search.service.ts`, `askSearch()`, after loading config:
```typescript
// Cross-language expansion (reuse from chat module helper)
if (config.cross_languages) {
  const languages = config.cross_languages.split(',').map(l => l.trim())
  query = await expandCrossLanguage(query, languages, providerId, traceSpan)
}
```

**Note:** Extract `expandCrossLanguage` to a shared utility in `be/src/shared/services/` so both chat and search can use it.

- [ ] **Step 3: Add cross-language config UI**

Multi-select dropdown in SearchAppConfig for target languages.

- [ ] **Step 4: Commit**

```bash
git add be/src/modules/search/ be/src/shared/ fe/src/features/search/
git commit -m "feat: add cross-language query expansion to search"
```

---

### Task 2.2: Reranking in Search

**Files:**
- Modify: `be/src/modules/search/services/search.service.ts`
- Modify: `be/src/modules/search/schemas/search.schemas.ts`

**Context:** Add optional reranking step using a dedicated rerank model (same as chat reranking pipeline).

- [ ] **Step 1: Add rerank_id to search config**

```typescript
rerank_id: z.string().max(128).optional()
```

- [ ] **Step 2: Apply reranking in retrieveChunks**

In `search.service.ts`, `retrieveChunks()`:
```typescript
if (config.rerank_id) {
  chunks = await ragRerankService.rerank(query, chunks, config.rerank_id, topK)
}
```

Note: `ragRerankService` is already used in the search service. Verify existing implementation before adding.

- [ ] **Step 3: Commit**

```bash
git add be/src/modules/search/
git commit -m "feat: add configurable reranking to search pipeline"
```

---

### Task 2.3: Knowledge Graph + Keyword Extraction + Web Search

**Files:**
- Modify: `be/src/modules/search/services/search.service.ts:304-530`
- Modify: `be/src/modules/search/schemas/search.schemas.ts`

**Context:** Add the same RAG enhancements that chat has. These are config toggles that activate pipeline steps.

- [ ] **Step 1: Add toggles to search config schema**

```typescript
keyword: z.boolean().optional(),      // Extract keywords from query
use_kg: z.boolean().optional(),       // Knowledge graph retrieval
web_search: z.boolean().optional(),   // Tavily web search
tavily_api_key: z.string().optional(),
```

- [ ] **Step 2: Implement in askSearch pipeline**

In `search.service.ts`, `askSearch()`:

```typescript
// Keyword extraction (same helper as chat)
if (config.keyword) {
  const keywords = await extractKeywords(query, providerId, traceSpan)
  query = `${query} ${keywords.join(' ')}`
}

// Knowledge graph retrieval
let kgContext = ''
if (config.use_kg && datasetIds.length) {
  const kgResult = await ragGraphragService.retrieval(datasetIds, query, providerId)
  if (kgResult) kgContext = kgResult
}

// Web search
let webChunks: ChunkResult[] = []
if (config.web_search && config.tavily_api_key) {
  webChunks = await searchWeb(query, config.tavily_api_key, 3)
  allChunks.push(...webChunks)
}
```

- [ ] **Step 3: Send pipeline status events**

Add SSE status events for each step:
```typescript
sendSSE(res, { status: 'extracting_keywords' })
sendSSE(res, { status: 'searching_knowledge_graph' })
sendSSE(res, { status: 'searching_web' })
```

- [ ] **Step 4: Commit**

```bash
git add be/src/modules/search/
git commit -m "feat: add keyword extraction, knowledge graph, and web search to search pipeline"
```

---

### Task 2.4: Retrieval Testing Endpoint

**Files:**
- Modify: `be/src/modules/search/routes/search.routes.ts`
- Modify: `be/src/modules/search/controllers/search.controller.ts`
- Modify: `be/src/modules/search/services/search.service.ts`
- Modify: `be/src/modules/search/schemas/search.schemas.ts`
- Create: `fe/src/features/search/components/SearchRetrievalTest.tsx`
- Modify: `fe/src/features/search/pages/SearchPage.tsx`

**Context:** A dry-run retrieval endpoint that returns raw chunks without LLM summary. Useful for testing search quality, debugging relevance, and tuning configuration changes.

- [ ] **Step 1: Add retrieval test schema**

```typescript
export const retrievalTestSchema = z.object({
  body: z.object({
    query: z.string().min(1),
    top_k: z.number().int().min(1).max(100).default(30),
    similarity_threshold: z.number().min(0).max(1).default(0),
    vector_similarity_weight: z.number().min(0).max(1).default(0.3),
    search_method: z.enum(['full_text', 'semantic', 'hybrid']).default('hybrid'),
    doc_ids: z.array(z.string()).optional(),
    page: z.number().int().min(1).default(1),
    page_size: z.number().int().min(1).max(50).default(10),
  }),
  params: z.object({ id: z.string().uuid() }),
})
```

- [ ] **Step 2: Add retrieval test route**

```typescript
router.post(
  '/apps/:id/retrieval-test',
  requireAuth,
  validate(retrievalTestSchema),
  searchController.retrievalTest.bind(searchController)
)
```

- [ ] **Step 3: Implement service method**

```typescript
async retrievalTest(appId: string, options: RetrievalTestOptions): Promise<{
  chunks: ChunkResult[]
  total: number
  page: number
  page_size: number
  doc_aggs: DocAggregate[]
}> {
  const app = await this.searchApp.findById(appId)
  if (!app) throw new Error('Search app not found')

  const datasetIds = app.dataset_ids as string[]
  const allChunks = await this.retrieveChunks(datasetIds, options.query, {
    topK: options.top_k,
    method: options.search_method,
    similarityThreshold: options.similarity_threshold,
    vectorWeight: options.vector_similarity_weight,
    docIds: options.doc_ids,
  })

  const total = allChunks.length
  const paginated = allChunks.slice(
    (options.page - 1) * options.page_size,
    options.page * options.page_size,
  )
  const docAggs = this.buildDocAggs(allChunks)

  return { chunks: paginated, total, page: options.page, page_size: options.page_size, doc_aggs: docAggs }
}
```

- [ ] **Step 4: Create FE retrieval test component**

Admin-only component accessible via button in SearchPage.
Shows: query input, parameter sliders, run test button.
Results: chunk cards with score, doc name, page, content.
Pagination, sort by score.

- [ ] **Step 5: Commit**

```bash
git add be/src/modules/search/ fe/src/features/search/
git commit -m "feat: add retrieval testing endpoint for search quality assessment"
```

---

### Task 2.5: Metadata Filtering in Search

**Files:**
- Modify: `be/src/modules/search/schemas/search.schemas.ts`
- Modify: `be/src/modules/search/services/search.service.ts`
- Modify: `be/src/modules/rag/services/rag-search.service.ts`
- Create: `fe/src/features/search/components/SearchMetadataFilter.tsx`

**Context:** Same as chat metadata filtering (Task 2.2 in chat plan). Reuse the same `buildMetadataFilter()` helper from rag-search.service.ts.

- [ ] **Step 1: Add metadata_filter to search config + ask schema**

```typescript
metadata_filter: z.object({
  logic: z.enum(['and', 'or']).default('and'),
  conditions: z.array(z.object({
    name: z.string().min(1),
    comparison_operator: z.enum(['is', 'is_not', 'contains', 'gt', 'lt', 'range']),
    value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
  })).max(10),
}).optional()
```

- [ ] **Step 2: Apply filter in search service**

Pass metadata_filter to `ragSearchService.search()` -- same pattern as chat.

- [ ] **Step 3: Create filter config UI (shared with chat)**

`SearchMetadataFilter.tsx` can be the same component as `ChatMetadataFilter.tsx`. Consider extracting to `fe/src/components/MetadataFilterBuilder.tsx` as a shared component.

- [ ] **Step 4: Commit**

```bash
git add be/src/modules/search/ be/src/modules/rag/ fe/src/features/search/ fe/src/components/
git commit -m "feat: add metadata filtering to search retrieval"
```

---

### Task 2.6: LLM Configuration for Search Summary

**Files:**
- Modify: `be/src/modules/search/schemas/search.schemas.ts`
- Modify: `be/src/modules/search/services/search.service.ts`
- Modify: `fe/src/features/search/components/SearchAppConfig.tsx`

**Context:** Allow admin to configure which LLM model and parameters to use for search summary generation.

- [ ] **Step 1: Add LLM config to search app schema**

```typescript
llm_id: z.string().max(128).optional(),
llm_setting: z.object({
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().min(1).max(128000).optional(),
}).optional(),
enable_summary: z.boolean().optional(), // Toggle AI summary on/off
```

- [ ] **Step 2: Apply in askSearch**

Use `config.llm_id` as providerId and `config.llm_setting` as temperature/top_p overrides when calling `llmClientService.chatCompletionStream()`.

If `enable_summary === false`, skip LLM call and return only retrieval results.

- [ ] **Step 3: Update SearchAppConfig UI**

Add LLM model input, temperature slider, and "Enable AI Summary" toggle.

- [ ] **Step 4: Commit**

```bash
git add be/src/modules/search/ fe/src/features/search/
git commit -m "feat: add configurable LLM model and summary toggle to search"
```

---

## Chunk 3: Phase 3 -- External Integration

### Task 3.1: Embeddable Search Widget (Dual-Mode)

**Files:**
- Create: `fe/src/features/search-widget/SearchWidget.tsx`
- Create: `fe/src/features/search-widget/SearchWidgetBar.tsx`
- Create: `fe/src/features/search-widget/SearchWidgetResults.tsx`
- Create: `fe/src/features/search-widget/searchWidgetApi.ts`
- Create: `fe/src/features/search-widget/index.ts`
- Create: `be/src/modules/search/routes/search-embed.routes.ts`
- Create: `be/src/modules/search/controllers/search-embed.controller.ts`
- Create: `be/src/shared/db/migrations/20260316000003_search_embed_tokens.ts`
- Modify: `be/src/app/routes.ts`

**Context:** Same dual-mode pattern as chat widget (Task 3.1 in chat plan):
1. **Internal mode** -- React component within B-Knowledge, uses session auth
2. **External mode** -- IIFE bundle for third-party sites, uses API key

- [ ] **Step 1: Create search embed token table**

Same structure as chat_embed_tokens but referencing search_apps:

```typescript
await knex.schema.createTable('search_embed_tokens', (table) => {
  table.uuid('id').primary().defaultTo(knex.fn.uuid())
  table.uuid('app_id').notNullable().references('id').inTable('search_apps').onDelete('CASCADE')
  table.string('token', 64).notNullable().unique()
  table.string('name', 128).notNullable()
  table.boolean('is_active').defaultTo(true)
  table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
  table.timestamp('created_at').defaultTo(knex.fn.now())
  table.timestamp('expires_at').nullable()
})
```

- [ ] **Step 2: Create embed routes**

```
POST /api/search/embed/:token/ask          -- Token-based search (SSE)
GET  /api/search/embed/:token/info         -- Get search app info
POST /api/search/embed/:token/related      -- Related questions
```

- [ ] **Step 3: Create SearchWidget component**

Compact search bar that expands to show results. Less complex than chat widget -- no session management, no conversation history.

```tsx
// Internal: <SearchWidget mode="internal" appId="..." />
// External: BKnowledgeSearch.init({ token: '...', baseUrl: '...' })
```

- [ ] **Step 4: Create IIFE bundle**

Separate Vite config similar to chat widget:
```typescript
// fe/vite.search-widget.config.ts
lib: { entry: 'src/features/search-widget/index.ts', name: 'BKnowledgeSearch' }
```

- [ ] **Step 5: Add token management UI to search admin page**

Same pattern as chat embed tokens.

- [ ] **Step 6: Commit**

```bash
git add be/src/modules/search/ fe/src/features/search-widget/
git commit -m "feat: add embeddable search widget with dual auth mode"
```

---

### Task 3.2: OpenAI-Compatible Search API

**Files:**
- Create: `be/src/modules/search/routes/search-openai.routes.ts`
- Create: `be/src/modules/search/controllers/search-openai.controller.ts`
- Modify: `be/src/app/routes.ts`

**Context:** Provide an OpenAI-compatible `/v1/search/completions` endpoint for tooling. Reuses the same response format service from chat (Task 3.2 in chat plan).

- [ ] **Step 1: Create OpenAI search route**

```typescript
// Mount at /api/v1/search/completions
router.post('/search/completions', searchOpenaiController.completion.bind(searchOpenaiController))
```

- [ ] **Step 2: Create controller**

Accept Bearer token auth, extract question from messages, route to askSearch service, format response as OpenAI chat completion.

- [ ] **Step 3: Commit**

```bash
git add be/src/modules/search/
git commit -m "feat: add OpenAI-compatible search completion API"
```

---

## Dependency Graph

```
Phase 1 (Core UX):
  Task 1.0 (Fix admin UI) -- independent, PRIORITY
  Task 1.1 (Pagination) -- independent
  Task 1.2 (Highlighting) -- independent
  Task 1.3 (Grounded citations) -- independent
  Task 1.4 (Enhanced filters) -- independent
  Task 1.5 (Admin pagination) -- independent

Phase 2 (Advanced):
  Task 2.1 (Cross-language) -- depends on shared helper extraction from chat
  Task 2.2 (Reranking) -- independent
  Task 2.3 (KG + Keywords + Web) -- depends on shared helpers from chat
  Task 2.4 (Retrieval test) -- independent
  Task 2.5 (Metadata filter) -- depends on shared MetadataFilterBuilder component
  Task 2.6 (LLM config) -- independent

Phase 3 (Integration):
  Task 3.1 (Widget) -- depends on Phase 1, shares pattern with chat widget
  Task 3.2 (OpenAI API) -- depends on 3.1 for tokens, shares format service with chat
```

## Shared Components Between Chat and Search Plans

These components should be extracted to shared locations to avoid duplication:

| Component | Current Location | Shared Location | Used By |
|-----------|-----------------|-----------------|---------|
| `expandCrossLanguage()` | `chat-conversation.service.ts` | `be/src/shared/services/rag-query.service.ts` | Chat + Search |
| `extractKeywords()` | `chat-conversation.service.ts` | `be/src/shared/services/rag-query.service.ts` | Chat + Search |
| `buildMetadataFilter()` | New in rag-search.service | `be/src/modules/rag/services/rag-search.service.ts` | Chat + Search |
| `MetadataFilterBuilder` | New | `fe/src/components/MetadataFilterBuilder.tsx` | Chat + Search config |
| `CitationInline` | `fe/src/components/CitationInline.tsx` | Already shared | Chat + Search |
| `DocumentPreviewer` | `fe/src/components/DocumentPreviewer/` | Already shared | Chat + Search |
| `OpenAI format service` | `chat-openai.service.ts` | `be/src/shared/services/openai-format.service.ts` | Chat + Search OpenAI API |
| Embed token model pattern | Per-module | Consider shared `embed-token.model.ts` | Chat + Search widgets |
