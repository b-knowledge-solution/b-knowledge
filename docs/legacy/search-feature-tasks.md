# Search Feature Task List

**Date**: 2026-03-10
**Source**: RAGFlow `next-search/` (15 files)
**Current Coverage**: 11/47 features done (23%)

---

## Tier 1 — Core UX (Must Have)

### Task 1.1: Search AI Summary (SSE Streaming Answer)

**Current**: Search returns raw chunk results only; no AI-generated answer.
**Target**: Stream an AI summary answer with citations on top of search results, matching RAGFlow's `ask` endpoint.

| # | Sub-task | Scope | Files to Create/Modify |
|---|----------|-------|----------------------|
| 1.1.1 | Add BE endpoint `POST /api/search/apps/:id/ask` — SSE streaming AI summary | BE | `be/src/modules/search/routes/search.routes.ts` |
| 1.1.2 | Add controller method `askSearch()` — set SSE headers, delegate to service | BE | `be/src/modules/search/controllers/search.controller.ts` |
| 1.1.3 | Implement `askSearch()` in service: retrieve chunks → build context prompt → stream LLM answer with citations | BE | `be/src/modules/search/services/search.service.ts` |
| 1.1.4 | Reuse `citationPrompt`, `askSummaryPrompt` from shared prompts | BE | Import from `@/shared/prompts/` |
| 1.1.5 | Add Zod schema for ask request `{ query, enable_summary?, enable_related? }` | BE | `be/src/modules/search/schemas/search.schemas.ts` |
| 1.1.6 | Add FE `searchApi.ask(searchAppId, query)` — raw fetch with SSE handling | FE | `fe/src/features/ai/api/searchApi.ts` |
| 1.1.7 | Create `useSearchStream` hook — manage SSE state (answer, chunks, relatedQuestions, loading) | FE | `fe/src/features/ai/hooks/useSearchStream.ts` |
| 1.1.8 | Update `SearchResults` to render streaming AI summary with `MarkdownRenderer` | FE | `fe/src/features/ai/components/SearchResults.tsx` |
| 1.1.9 | Add inline citation rendering in AI summary (reuse `CitationInline`) | FE | Same |
| 1.1.10 | Add stop button to cancel SSE stream during summary generation | FE | `SearchBar.tsx` or `SearchResults.tsx` |
| 1.1.11 | Add i18n keys for AI summary section (en, vi, ja) | FE | `fe/src/i18n/locales/*.json` |

---

### Task 1.2: Document Preview from Search Results

**Current**: Search result cards are not clickable for document preview.
**Target**: Click a search result chunk to open document preview drawer with PDF highlighting.

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 1.2.1 | Create `SearchDocumentPreviewDrawer` — Sheet/Drawer wrapping `DocumentPreviewer` | FE | `fe/src/features/ai/components/SearchDocumentPreviewDrawer.tsx` |
| 1.2.2 | Add `onClick` handler to `SearchResultCard` to open drawer with doc ID + chunk | FE | `SearchResultCard.tsx` |
| 1.2.3 | Call `buildChunkHighlights()` with chunk `positions` for PDF highlighting | FE | Drawer component |
| 1.2.4 | Add document name as drawer title with file icon | FE | Same |
| 1.2.5 | Ensure BE search endpoint returns `positions: number[][]` in chunk data | BE | `search.service.ts`, `rag-search.service.ts` |
| 1.2.6 | Add `positions` field to `SearchResult` type | FE | `fe/src/features/ai/types/search.types.ts` |

---

### Task 1.3: Related Questions

**Current**: Not implemented.
**Target**: Show 5-10 clickable follow-up suggestions below search results.

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 1.3.1 | Add BE endpoint `POST /api/search/apps/:id/related-questions` | BE | Routes, controller |
| 1.3.2 | Use `relatedQuestionPrompt` from shared prompts to generate via LLM | BE | Service |
| 1.3.3 | Alternatively, return related questions as part of `/ask` SSE response | BE | `search.service.ts` |
| 1.3.4 | Create `RelatedSearchQuestions` component — clickable button chips | FE | `fe/src/features/ai/components/RelatedSearchQuestions.tsx` |
| 1.3.5 | Wire click to re-run search with selected question | FE | `DatasetSearchPage.tsx` |
| 1.3.6 | Add i18n keys ("Related Search") | FE | Locale files |

---

### Task 1.4: Search Settings Panel

**Current**: No settings panel for search app configuration.
**Target**: Collapsible right-side panel with all RAGFlow search config fields.

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 1.4.1 | Create `SearchSettingsPanel` component (slide-in from right) | FE | `fe/src/features/ai/components/SearchSettingsPanel.tsx` |
| 1.4.2 | Add fields: name, avatar, description | FE | Same |
| 1.4.3 | Add **Dataset multi-select** (with embedding model validation, max 10) | FE | Same |
| 1.4.4 | Add **Similarity threshold** slider + **Vector weight** slider | FE | Same |
| 1.4.5 | Add **Rerank model** toggle + model select + Top K slider (0-2048) | FE | Same |
| 1.4.6 | Add **AI Summary** toggle with LLM settings (model, temperature, top_p, penalties) | FE | Same |
| 1.4.7 | Add **Related search** toggle | FE | Same |
| 1.4.8 | Add **Mind map** toggle | FE | Same |
| 1.4.9 | Add **Metadata filter** config section | FE | Same |
| 1.4.10 | Add Zod schema for validation | FE | `fe/src/features/ai/hooks/useSearchSettingSchema.ts` |
| 1.4.11 | Wire Save/Cancel to `searchApi.updateSearchApp()` | FE | Same |
| 1.4.12 | Add settings gear button in `DatasetSearchPage` header | FE | `DatasetSearchPage.tsx` |
| 1.4.13 | Add i18n keys for all fields (en, vi, ja) | FE | Locale files |

---

## Tier 2 — Enhanced Results & Filtering

### Task 2.1: Document-Level Filter in Results

**Current**: `SearchFilters` has dataset-level filters but not document-level.
**Target**: After search, show popover with checkboxes to filter results by specific documents (X/Y files selected).

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 2.1.1 | Create `DocumentFilterPopover` component (checkbox list with search, clear, X/Y counter) | FE | `fe/src/features/ai/components/DocumentFilterPopover.tsx` |
| 2.1.2 | Extract unique documents from search results | FE | `useSearch.ts` or new hook |
| 2.1.3 | Filter displayed chunks by selected document IDs | FE | `SearchResults.tsx` |
| 2.1.4 | Add filter badge showing "X/Y Files" count | FE | `DatasetSearchPage.tsx` |

---

### Task 2.2: Search Results Pagination

**Current**: Only `top_k` limit, no cursor/page pagination.
**Target**: Full pagination with page number selector and page size control.

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 2.2.1 | Add `page` and `page_size` params to search API request | FE/BE | `searchApi.ts`, `search.service.ts` |
| 2.2.2 | BE: implement offset-based pagination in OpenSearch query | BE | `rag-search.service.ts` |
| 2.2.3 | Add pagination controls below results (shadcn Pagination component) | FE | `SearchResults.tsx` |
| 2.2.4 | Add page size selector dropdown (10, 20, 50) | FE | Same |

---

### Task 2.3: Image Support in Search Results

**Current**: No image handling in search result chunks.
**Target**: Display inline image thumbnails for image-based chunks with lightbox preview.

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 2.3.1 | Detect image chunks in search results (by content type or extension) | FE | `SearchResultCard.tsx` |
| 2.3.2 | Display thumbnail preview in result card | FE | Same |
| 2.3.3 | Add lightbox/modal on click for full-size image | FE | New component or use existing |
| 2.3.4 | BE: include image URLs or base64 thumbnails in chunk response | BE | `rag-search.service.ts` |

---

### Task 2.4: Mind Map Visualization

**Current**: Not implemented.
**Target**: Generate and display mind map tree diagram from search query and results.

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 2.4.1 | Add BE endpoint `POST /api/search/apps/:id/mindmap` | BE | Routes, controller |
| 2.4.2 | Generate hierarchical tree structure from query + chunks via LLM | BE | Service |
| 2.4.3 | Create `SearchMindMapDrawer` component with tree visualization | FE | `fe/src/features/ai/components/SearchMindMapDrawer.tsx` |
| 2.4.4 | Add brain icon button in search header | FE | `DatasetSearchPage.tsx` |
| 2.4.5 | Add loading progress animation (0-100% over ~40s) | FE | Same |
| 2.4.6 | Install tree visualization library (e.g., `react-d3-tree` or custom SVG) | FE | `package.json` |

---

### Task 2.5: Search Home Landing Page Enhancement

**Current**: Centered search bar only, no greeting or branding.
**Target**: Match RAGFlow's search home with greeting, animated transitions, and branding.

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 2.5.1 | Add "Hi there, [username]" greeting above search bar | FE | `DatasetSearchPage.tsx` |
| 2.5.2 | Add animated transition (fade/slide) from landing → results view | FE | Same |
| 2.5.3 | Compact search bar at top after first search (sticky header) | FE | Same |
| 2.5.4 | Add branding/logo above greeting | FE | Same |

---

## Tier 3 — Search App Management & Sharing

### Task 3.1: Search App List Page

**Current**: No dedicated list page for managing search apps.
**Target**: Card grid with search/filter, pagination, create/rename/delete.

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 3.1.1 | Create `SearchListPage` with card grid layout | FE | `fe/src/features/ai/pages/SearchListPage.tsx` |
| 3.1.2 | Create `SearchAppCard` component (name, description, dataset count, last updated, dropdown) | FE | `fe/src/features/ai/components/SearchAppCard.tsx` |
| 3.1.3 | Add search/filter bar and pagination | FE | Same page |
| 3.1.4 | Add "Create Search App" button with rename dialog | FE | Same page |
| 3.1.5 | Add route to `routeConfig.ts` | FE | `app/routeConfig.ts` |
| 3.1.6 | Add sidebar nav entry | FE | `layouts/Sidebar.tsx` |

---

### Task 3.2: Share Token CRUD for Search

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 3.2.1 | Create DB migration for `search_share_tokens` table | BE | `be/src/shared/db/migrations/` |
| 3.2.2 | Add BE endpoints: create/list/delete tokens for search app | BE | Routes, controller |
| 3.2.3 | Add `EmbedSearchDialog` component with iframe snippet + copy button | FE | `fe/src/features/ai/components/EmbedSearchDialog.tsx` |
| 3.2.4 | Add locale selector and profile visibility toggle | FE | Same |

---

### Task 3.3: Public Search Page

**Current**: Not implemented.
**Target**: Shared search interface accessible via token link without auth.

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 3.3.1 | Add public route at `/shared/search/:sharedId` (no auth) | FE | Route, new page |
| 3.3.2 | Add BE endpoints: `GET /api/public/search/:sharedId/info`, `POST /ask`, `POST /mindmap`, `POST /related-questions` | BE | Routes, controller |
| 3.3.3 | Create `SharedSearchPage` (simplified, no settings, avatar header from config) | FE | `fe/src/features/ai/pages/SharedSearchPage.tsx` |
| 3.3.4 | Read locale/theme from URL params | FE | Same |

---

## Tier 4 — Advanced / Nice-to-Have

### Task 4.1: Metadata Filter UI

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 4.1.1 | Create `MetadataFilterBuilder` (key-value-operator rows, add/remove) | FE | Shared component |
| 4.1.2 | Add to `SearchSettingsPanel` | FE | Settings panel |
| 4.1.3 | BE: use `metaFilterPrompt` to auto-generate filters from query (semi-auto mode) | BE | `search.service.ts` |
| 4.1.4 | Apply metadata filters to OpenSearch query | BE | `rag-search.service.ts` |

---

### Task 4.2: Vector Similarity Weight Control

**Current**: Only similarity threshold; no vector vs keyword weight slider.
**Target**: Add slider to control balance between vector search and keyword search (0-1).

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 4.2.1 | Add vector weight slider to `SearchFilters` component | FE | `SearchFilters.tsx` |
| 4.2.2 | Pass `vector_similarity_weight` param in search request | FE | `searchApi.ts` |
| 4.2.3 | BE: use weight to balance BM25 vs vector scores in hybrid search | BE | `rag-search.service.ts` |

---

### Task 4.3: Knowledge Graph Toggle for Search

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 4.3.1 | Add `use_kg` toggle to search settings | FE | `SearchSettingsPanel.tsx` |
| 4.3.2 | Store in search app config | BE | `search.service.ts` |
| 4.3.3 | When enabled, run GraphRAG retrieval alongside standard search | BE | `search.service.ts`, `rag-graphrag.service.ts` |

---

### Task 4.4: Rerank in Search

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 4.4.1 | Add rerank toggle + model select + top_k to search settings | FE | `SearchSettingsPanel.tsx` |
| 4.4.2 | Store `rerank_id` and `use_rerank` in search app config | BE | Model/schema |
| 4.4.3 | Apply `ragRerankService.rerank()` after search retrieval when enabled | BE | `search.service.ts` |

---

## Summary

| Tier | Tasks | Sub-tasks | Priority |
|------|-------|-----------|----------|
| **Tier 1** | 4 tasks | 36 sub-tasks | Must have for usable search |
| **Tier 2** | 5 tasks | 22 sub-tasks | Enhanced results & UX |
| **Tier 3** | 3 tasks | 13 sub-tasks | App management & sharing |
| **Tier 4** | 4 tasks | 12 sub-tasks | Advanced / nice-to-have |
| **Total** | **16 tasks** | **83 sub-tasks** | |
