# Chat & Search Migration Report

**Date**: 2026-03-10
**Branch**: `feature/rag-core`
**Status**: Implementation Complete — Pending Review & Testing

---

## 1. Migration Overview

Migrated RAGFlow's Chat and Search features from **iframe-based embedding** to **native React UI + Express API proxy**. This replaces the previous `RagflowIframe` component approach with fully integrated, first-party components.

### Previous Architecture
```
Frontend (iframe) → RAGFlow UI (embedded) → RAGFlow Python API
```

### New Architecture (No RAGFlow API dependency)
```
Frontend (native React) → Express API → PostgreSQL (sessions, messages, dialogs)
                                      → OpenSearch (chunk retrieval via RagSearchService)
                                      → LLM SDK (OpenAI-compatible, reads config from model_providers table)
```

---

## 2. What Was Done

### 2.1 Backend — Chat Module (`be/src/modules/chat/`)

| File | Purpose |
|------|---------|
| `services/chat-conversation.service.ts` | Proxy to RAGFlow conversation API (create/get/list/delete, SSE stream, feedback) |
| `services/chat-dialog.service.ts` | Local PostgreSQL CRUD for dialog (chat assistant) configurations |
| `controllers/chat-conversation.controller.ts` | Request handlers for conversation endpoints |
| `controllers/chat-dialog.controller.ts` | Request handlers for dialog CRUD |
| `routes/chat-conversation.routes.ts` | 7 routes for conversations |
| `routes/chat-dialog.routes.ts` | 5 routes for dialogs |
| `schemas/chat-conversation.schemas.ts` | Zod validation schemas |
| `schemas/chat-dialog.schemas.ts` | Zod validation schemas |
| `models/chat-dialog.model.ts` | Knex model for `chat_dialogs` table |
| `index.ts` | Updated barrel export |

**Chat API Endpoints:**
```
POST   /api/chat/conversations                    # Create conversation
GET    /api/chat/conversations/:id                 # Get conversation with messages
GET    /api/chat/conversations                     # List conversations (?dialogId=)
DELETE /api/chat/conversations                     # Bulk delete conversations
DELETE /api/chat/conversations/:id/messages/:msgId # Delete single message
POST   /api/chat/conversations/:id/completion      # Stream chat (SSE)
POST   /api/chat/conversations/:id/feedback        # Thumbs up/down feedback

POST   /api/chat/dialogs                           # Create dialog config
GET    /api/chat/dialogs/:id                       # Get dialog
GET    /api/chat/dialogs                           # List dialogs
PUT    /api/chat/dialogs/:id                       # Update dialog
DELETE /api/chat/dialogs/:id                       # Delete dialog
```

**SSE Streaming**: Proxies RAGFlow's `text/event-stream` response with format:
```
data: {"code": 0, "data": {"answer": "...", "reference": {...}}}\n\n
data: {"code": 0, "data": true}\n\n  (completion signal)
```

### 2.2 Backend — Search Module (`be/src/modules/search/`)

| File | Purpose |
|------|---------|
| `services/search.service.ts` | CRUD for search apps, multi-dataset search via `RagSearchService` |
| `controllers/search.controller.ts` | Request handlers |
| `routes/search.routes.ts` | 6 routes |
| `schemas/search.schemas.ts` | Zod validation |
| `models/search-app.model.ts` | Knex model for `search_apps` table |
| `index.ts` | Barrel export |

**Search API Endpoints:**
```
POST   /api/search/apps                            # Create search app
GET    /api/search/apps                            # List search apps
GET    /api/search/apps/:id                        # Get search app
PUT    /api/search/apps/:id                        # Update search app
DELETE /api/search/apps/:id                        # Delete search app
POST   /api/search/apps/:id/search                 # Execute search query
```

### 2.3 Backend — Shared Infrastructure

| File | Purpose |
|------|---------|
| `shared/services/ragflow-client.service.ts` | Singleton HTTP client with `get()`, `post()`, `put()`, `delete()`, `stream()` |
| `shared/models/types.ts` | Added `ChatDialog`, `SearchApp` interfaces |
| `shared/models/factory.ts` | Registered new model singletons |
| `shared/db/migrations/20260310_create_search_and_chat_tables.ts` | New tables + column additions |
| `app/routes.ts` | Registered conversation, dialog, and search routes |

**Migration creates:**
- `search_apps` table (id, name, description, dataset_ids JSONB, search_config JSONB, timestamps)
- `chat_dialogs` table (id, name, description, icon, kb_ids JSONB, llm_id, prompt_config JSONB, timestamps)
- Adds `dialog_id`, `citations` (JSONB), `message_id` columns to existing chat tables

### 2.4 Frontend — Chat UI (`fe/src/features/ai/`)

| File | Purpose |
|------|---------|
| `pages/DatasetChatPage.tsx` | 3-panel layout: sidebar / chat / references |
| `components/ChatSidebar.tsx` | Conversation list grouped by date, search, create, delete |
| `components/ChatMessageList.tsx` | Scrollable messages with auto-scroll, streaming dots, empty state |
| `components/ChatMessage.tsx` | Single message: avatar, markdown, copy, feedback, citation badges |
| `components/ChatInput.tsx` | Auto-resize textarea, Enter/Shift+Enter, stop generation |
| `components/ChatReferencePanel.tsx` | Collapsible panel with expandable chunks, scores, page numbers |
| `components/ChatDialogConfig.tsx` | Modal: KB multi-select, LLM, system prompt, temp/topK/topN sliders |
| `hooks/useChatStream.ts` | SSE streaming with message accumulation, abort, error handling |
| `hooks/useChatConversations.ts` | TanStack Query hooks for conversation CRUD |
| `hooks/useChatDialogs.ts` | Dialog management with auto-selection |
| `api/chatApi.ts` | Full CRUD + SSE streaming via raw fetch |
| `types/chat.types.ts` | ChatMessage, ChatReference, ChatChunk, Conversation, ChatDialog |

**Key Chat Features Preserved from RAGFlow:**
- [x] Delta streaming (SSE) with real-time token display
- [x] Document reference panel with chunk content and relevance scores
- [x] Citation badges inline with assistant messages
- [x] Thumbs up/down feedback on messages
- [x] Conversation management (create, list, search, delete)
- [x] Dialog/assistant configuration (KB selection, LLM, prompt, parameters)
- [x] Markdown rendering in messages
- [x] Copy message to clipboard
- [x] Stop generation during streaming

### 2.5 Frontend — Search UI (`fe/src/features/ai/`)

| File | Purpose |
|------|---------|
| `pages/DatasetSearchPage.tsx` | Google-style landing → results layout with filter sidebar |
| `components/SearchBar.tsx` | Large centered input with clear button and hints |
| `components/SearchResults.tsx` | AI summary card + result list + empty/loading/error states |
| `components/SearchResultCard.tsx` | File type icon, highlighted snippet, score bar, dataset badge |
| `components/SearchFilters.tsx` | Dataset select, file type, method radio, similarity threshold |
| `hooks/useSearch.ts` | Search execution with filters, loading/error states |
| `api/searchApi.ts` | Single and cross-dataset search API calls |
| `types/search.types.ts` | SearchResult, SearchFilters, SearchResponse |

**Key Search Features Preserved from RAGFlow:**
- [x] Hybrid / semantic / full-text search methods
- [x] Relevance score display
- [x] Document chunk highlights with keyword matching
- [x] Multi-dataset search
- [x] Similarity threshold configuration
- [x] AI-generated summary of results
- [x] File type filtering
- [x] Document preview on click

### 2.6 i18n Translations

Added `chat` and `search` translation keys to:
- `fe/src/i18n/locales/en.json`
- `fe/src/i18n/locales/vi.json`
- `fe/src/i18n/locales/ja.json`

### 2.7 Route & Navigation

- Updated `fe/src/app/App.tsx` — swapped lazy imports from iframe pages to native `DatasetChatPage` and `DatasetSearchPage`
- Existing route config and sidebar entries already pointed to `/chat` and `/search`

### 2.8 RBAC Access Control — Chat & Search

Added centralized RBAC for both Chat Dialogs and Search Apps, allowing admins to control which users/teams can access which assistants and search apps.

**Database Schema:**

| Table | Purpose |
|-------|---------|
| `chat_dialog_access` | Junction table: dialog_id + entity_type (user/team) + entity_id |
| `search_app_access` | Junction table: app_id + entity_type (user/team) + entity_id |
| `chat_dialogs.is_public` | Boolean flag for public access (all users) |
| `search_apps.is_public` | Boolean flag for public access (all users) |

**New API Endpoints:**
```
GET    /api/chat/dialogs/:id/access       # Get dialog access entries (admin)
PUT    /api/chat/dialogs/:id/access       # Set dialog access entries (admin)
GET    /api/search/apps/:id/access        # Get search app access entries (admin)
PUT    /api/search/apps/:id/access        # Set search app access entries (admin)
```

**RBAC Flow:**
- Admin/leader: Full CRUD on all dialogs/apps + manage access assignments
- Regular user: Only sees public items, own items, or items with explicit user/team grant
- Mutations (POST/PUT/DELETE) protected by `requirePermission('manage_users')`

**Admin Pages:**
- `/admin/chat-dialogs` — Table view of all chat assistants with create/edit/delete/access actions
- `/admin/search-apps` — Table view of all search apps with create/edit/delete/access actions
- Access assignment via modal with Users/Teams tabs and searchable checkboxes

### 2.9 Tests

| File | Tests |
|------|-------|
| `be/tests/chat/chat-conversation.service.test.ts` | 10 tests |
| `be/tests/chat/chat-history.controller.test.ts` | 12 tests |
| `be/tests/chat/chat.schemas.test.ts` | 8 tests |
| `be/tests/rag/rag-search.service.test.ts` | 16 tests |
| `be/tests/rag/rag.service.test.ts` | 11 tests |
| `be/tests/rag/rag.controller.test.ts` | 14 tests |
| `be/tests/rag/rag.schemas.test.ts` | 16 tests |
| `fe/tests/features/ai/useRagflowIframe.test.ts` | 10 tests |
| `fe/tests/features/ai/RagflowIframe.comprehensive.test.tsx` | 7 tests |
| `fe/tests/features/ai/IframeActionButtons.test.tsx` | 3 tests |
| `docs/test-plans/chat-search-e2e.md` | E2E test plan |
| `be/tests/chat/chat-dialog-access.model.test.ts` | RBAC model tests |
| `be/tests/chat/chat-dialog-rbac.service.test.ts` | RBAC service tests |
| `be/tests/chat/chat-dialog-access.routes.test.ts` | RBAC route tests |
| `be/tests/search/search-app-access.model.test.ts` | RBAC model tests |
| `be/tests/search/search-app-rbac.service.test.ts` | RBAC service tests |
| `be/tests/search/search-app-access.routes.test.ts` | RBAC route tests |
| `docs/test-plans/chat-dialog-rbac-test-plan.md` | 50-scenario manual plan |
| `docs/test-plans/search-app-rbac-test-plan.md` | 50-scenario manual plan |

**Total: 107+ unit/integration tests + 3 test plans + 100 manual RBAC scenarios**

---

## 2.9 RAG Pipeline Features (Migrated from RAGFlow dialog_service.py)

The chat completion endpoint now implements the full RAGFlow pipeline locally:

| Pipeline Step | RAGFlow Function | B-Knowledge Implementation | Status |
|--------------|-----------------|---------------------------|--------|
| Multi-turn refinement | `full_question()` | `refineMultiturnQuestion()` — LLM synthesizes conversation history into single query | ✅ Done |
| Cross-language expansion | `cross_languages` prompt | `expandCrossLanguage()` — LLM translates query to target languages | ✅ Done |
| Keyword extraction | `keyword` prompt | `extractKeywords()` — LLM extracts search keywords + synonyms | ✅ Done |
| Hybrid retrieval | `retriever.retrieval()` | `ragSearchService.search()` — BM25 + vector via OpenSearch | ✅ Done |
| Web search | Tavily API | `searchWeb()` — Tavily advanced search, results as chunks | ✅ Done |
| LLM reranking | `rerank_by_model()` | `rerankChunks()` — LLM-based cross-encoder relevance ranking | ✅ Done |
| Citation instructions | `citation_prompt()` | `buildContextPrompt()` — ##ID:n$$ format instructions | ✅ Done |
| Citation post-processing | `insert_citations()` + `repair_bad_citation_formats()` | `processCitations()` — Regex extraction + format normalization | ✅ Done |
| Empty response handling | `empty_response` config | Returns configured message when no chunks found | ✅ Done |
| Delta SSE streaming | `async_chat_streamly_delta()` | Token-by-token delta streaming (not accumulated) | ✅ Done |
| Pipeline status events | N/A (new) | `{ status: "retrieving" }` events during pipeline phases | ✅ Done |
| Performance metrics | Langfuse timing | `{ metrics: { retrieval_ms, generation_ms, ... } }` in final event | ✅ Done |
| Knowledge graph | `use_kg` + GraphRAG | `ragGraphragService` — query rewrite, entity/relation search, N-hop traversal, score boosting | ✅ Done |
| Deep research | `TreeStructuredQueryDecompositionRetrieval` | `ragDeepResearchService` — recursive retrieval, sufficiency check, follow-up generation, max depth 3 | ✅ Done |
| SQL retrieval | `use_sql()` | `ragSqlService` — LLM-generated SQL, OpenSearch `/_plugins/_sql`, markdown table output | ✅ Done |
| Embedding-based citations | `insert_citations()` with embedding similarity | `ragCitationService` — sentence splitting, embedding similarity, adaptive threshold (0.63→0.3) | ✅ Done |
| Dedicated rerank model | Jina/Cohere reranker | `ragRerankService` — Jina, Cohere, generic OpenAI-compatible rerankers, hybrid scoring | ✅ Done |
| TTS | `tts_mdl` | `ttsService` — OpenAI-compatible streaming, text normalization, FE speaker button | ✅ Done |

### SSE Delta Stream Protocol

The new SSE protocol sends **delta tokens** instead of accumulated text:

```
# Phase 1: Pipeline status updates
data: {"status":"refining_question"}
data: {"status":"retrieving"}
data: {"status":"searching_web"}
data: {"status":"reranking"}

# Phase 2: Reference data (sent once, before generation)
data: {"reference":{"chunks":[...],"doc_aggs":[...]}}

# Phase 3: Delta tokens (token-by-token, NOT accumulated)
data: {"delta":"The"}
data: {"delta":" answer"}
data: {"delta":" is"}
data: {"delta":" 42"}
data: {"delta":" ##ID:0$$"}

# Phase 4: Final processed answer with citations + metrics
data: {"answer":"The answer is 42 ##ID:0$$","reference":{...},"metrics":{...}}

# Phase 5: Completion signal
data: [DONE]
```

### Dialog prompt_config Options

```typescript
{
  system: string              // System prompt template
  prologue: string            // Welcome message
  refine_multiturn: boolean   // Multi-turn question synthesis
  cross_languages: string     // Target languages (e.g. "English,Japanese,Vietnamese")
  keyword: boolean            // Keyword extraction and appending
  quote: boolean              // Enable citation insertion (default: true)
  empty_response: string      // Response when no chunks found
  tavily_api_key: string      // Tavily web search API key
  use_kg: boolean             // Knowledge graph retrieval
  temperature: number         // LLM temperature (0-2)
  top_p: number               // Nucleus sampling
  top_n: number               // Chunks to retrieve per KB (default: 6)
  similarity_threshold: number // Min score for vector search (default: 0.2)
  max_tokens: number          // Max generation tokens
}
```

---

## 3. What Needs To Be Done Next

### 3.1 Critical (Before Merge)

- [ ] **Run database migration**: `npx knex migrate:latest` to create new tables
- [ ] **Set environment variables**: Ensure `RAGFLOW_API_URL` and `RAGFLOW_API_KEY` are configured in `.env`
- [ ] **Build verification**: Run `npm run build` and fix any compilation errors
- [ ] **Run test suite**: `npm run test` and ensure all 107 tests pass
- [ ] **Manual smoke test**: Verify chat streaming and search work end-to-end in browser
- [ ] **Code review**: Review all new files for security (no credential leaks, XSS, injection)

### 3.2 RBAC Access Control (Implemented — 2026-03-10)

- [x] **Chat Dialog RBAC**: Admin page at `/admin/chat-dialogs` for managing chat assistant configs and assigning user/team access
- [x] **Search App RBAC**: Admin page at `/admin/search-apps` for managing search app configs and assigning user/team access
- [x] **Access junction tables**: `chat_dialog_access` and `search_app_access` with polymorphic `entity_type` (user/team)
- [x] **`is_public` flag**: Both `chat_dialogs` and `search_apps` support public access toggle
- [x] **RBAC-filtered listing**: Regular users only see public, own, or explicitly granted (user/team) dialogs and apps
- [x] **Admin-only mutations**: `requirePermission('manage_users')` on all create/update/delete/access endpoints
- [x] **Access management UI**: Modal with Users/Teams tabs for assigning access per dialog/app
- [x] **i18n**: All admin strings in en, vi, ja
- [x] **Tests**: 6 test files (model, service, routes for both chat and search) + 2 manual test plans

### 3.3 High Priority (Post-Merge)

- [ ] **Document preview integration**: Wire `ChatReferencePanel` chunk clicks to existing `DocumentPreviewer` component with page highlighting
- [ ] **Chat history sync**: Connect new native chat sessions with `external_chat_messages` table for unified history view
- [ ] **Search history recording**: Auto-save search queries and results to `external_search_records`
- [ ] **Error boundary**: Add React error boundaries around chat and search pages
- [ ] **Reconnection logic**: Handle SSE stream disconnections with auto-retry
- [ ] **Rate limiting**: Add rate limits on `/api/chat/conversations/:id/completion` endpoint

### 3.4 Medium Priority (Enhancements)

- [ ] **Keyboard shortcuts**: Add Cmd/Ctrl+K for search, Cmd/Ctrl+N for new conversation
- [ ] **Message editing**: Allow users to edit and resend previous messages
- [ ] **Conversation export**: Export chat history as PDF/Markdown
- [ ] **Search analytics**: Track popular queries, click-through rates
- [ ] **Mobile responsive**: Optimize 3-panel chat layout for mobile (drawer-based sidebar)
- [ ] **Accessibility audit**: Run WCAG 2.1 AA compliance check on new components

### 3.5 Low Priority (Future)

- [ ] **Voice input**: Add microphone button for voice-to-text in chat
- [ ] **Image/file upload in chat**: Support multimodal messages
- [ ] **Collaborative chat**: Multiple users in same conversation
- [ ] **Search suggestions**: Auto-complete and "did you mean" suggestions
- [ ] **Advanced search syntax**: Support filters like `type:pdf author:john`
- [ ] **Real-time collaboration**: WebSocket-based live updates when multiple users search

---

## 4. RAGFlow Feature Parity Checklist

| RAGFlow Feature | Status | Notes |
|----------------|--------|-------|
| Chat conversations CRUD | ✅ Done | Full proxy + local storage |
| Dialog/assistant config | ✅ Done | Local DB + RAGFlow sync |
| SSE streaming chat | ✅ Done | Proxy with token accumulation |
| Document references/citations | ✅ Done | Reference panel with chunks |
| Thumbs up/down feedback | ✅ Done | Stored in RAGFlow + local |
| Message deletion | ✅ Done | |
| Search app CRUD | ✅ Done | Local DB |
| Hybrid/semantic/full-text search | ✅ Done | Via RagSearchService |
| Search filters | ✅ Done | Dataset, file type, method, threshold |
| Text-to-Speech | ✅ Done | `ttsService` + FE speaker button |
| Inline citation tooltips | ✅ Done | `CitationInline` component with Popover |
| Centralized prompt templates | ✅ Done | `be/src/shared/prompts/` — migrated from RAGFlow |
| Chat dialog RBAC access control | ✅ Done | `chat_dialog_access` table, admin page, user/team assignment |
| Search app RBAC access control | ✅ Done | `search_app_access` table, admin page, user/team assignment |
| Public/private toggle (chat & search) | ✅ Done | `is_public` flag on both tables |
| Admin management pages | ✅ Done | `/admin/chat-dialogs` and `/admin/search-apps` |
| Conversation renaming | ⚠️ Partial | API ready, no inline edit UI |
| Search result pagination | ⚠️ Partial | top_k limit, no cursor pagination |
| Chat file upload | ❌ Not started | |
| Conversation sharing/embedding | ❌ Not started | |

---

## 5. RAGFlow Prompt Migration Status

All chat/search-related prompts from `advance-rag/rag/prompts/` have been migrated to `be/src/shared/prompts/`:

| RAGFlow Prompt File | BE Prompt Module | Used By | Status |
|---|---|---|---|
| `citation_prompt.md` | `citation.prompt.ts` | `chat-conversation.service.ts` | ✅ Migrated (full rules, examples, RTL) |
| `keyword_prompt.md` | `keyword.prompt.ts` | `chat-conversation.service.ts` | ✅ Migrated |
| `full_question_prompt.md` | `full-question.prompt.ts` | `chat-conversation.service.ts` | ✅ Migrated (with date conversion) |
| `cross_languages_sys/user_prompt.md` | `cross-language.prompt.ts` | `chat-conversation.service.ts` | ✅ Migrated (sys + user) |
| `sufficiency_check.md` | `sufficiency-check.prompt.ts` | `rag-deep-research.service.ts` | ✅ Migrated |
| `multi_queries_gen.md` | `multi-queries.prompt.ts` | `rag-deep-research.service.ts` | ✅ Migrated |
| `related_question.md` | `related-question.prompt.ts` | Search expansion (available) | ✅ Migrated |
| `ask_summary.md` | `ask-summary.prompt.ts` | Default system prompt | ✅ Migrated |
| `meta_filter.md` | `meta-filter.prompt.ts` | Metadata filtering (available) | ✅ Migrated |
| (inline in service) | `graphrag.prompt.ts` | `rag-graphrag.service.ts` | ✅ Centralized |
| (inline in service) | `sql-generation.prompt.ts` | `rag-sql.service.ts` | ✅ Centralized |

### Not Migrated (Dataset/Parsing — Out of Scope for Chat/Search)

| RAGFlow Prompt | Reason |
|---|---|
| `question_prompt.md` | Dataset processing (question proposal) |
| `content_tagging_prompt.md` | Content classification |
| `toc_*.md` (9 files) | Document TOC extraction/parsing |
| `vision_llm_*.md` (3 files) | Document image/figure parsing |
| `resume_*.md` (10 files) | Resume-specific parsing |
| `meta_data.md` | Metadata extraction (dataset) |
| `structured_output_prompt.md` | Optional JSON output constraint |
| `analyze_task_*.md`, `next_step.md`, `reflect.md` | Agent/agentic features |
| `rank_memory.md`, `summary4memory.md` | Agent memory management |
| `tool_call_summary.md` | Agent tool analysis |

---

## 6. Files Changed Summary

```
New files:     56 (+15 RBAC)
Modified files: 21 (+15 RBAC)
Tests:         17 (+6 RBAC)
Total:         77 files
```

### New Backend Files (16)
```
be/src/modules/chat/services/chat-conversation.service.ts
be/src/modules/chat/services/chat-dialog.service.ts
be/src/modules/chat/controllers/chat-conversation.controller.ts
be/src/modules/chat/controllers/chat-dialog.controller.ts
be/src/modules/chat/routes/chat-conversation.routes.ts
be/src/modules/chat/routes/chat-dialog.routes.ts
be/src/modules/chat/schemas/chat-conversation.schemas.ts
be/src/modules/chat/schemas/chat-dialog.schemas.ts
be/src/modules/chat/models/chat-dialog.model.ts
be/src/modules/search/services/search.service.ts
be/src/modules/search/controllers/search.controller.ts
be/src/modules/search/routes/search.routes.ts
be/src/modules/search/schemas/search.schemas.ts
be/src/modules/search/models/search-app.model.ts
be/src/modules/search/index.ts
be/src/shared/services/ragflow-client.service.ts
be/src/shared/db/migrations/20260310_create_search_and_chat_tables.ts
```

### New Frontend Files (18)
```
fe/src/features/ai/pages/DatasetChatPage.tsx
fe/src/features/ai/pages/DatasetSearchPage.tsx
fe/src/features/ai/components/ChatSidebar.tsx
fe/src/features/ai/components/ChatMessageList.tsx
fe/src/features/ai/components/ChatMessage.tsx
fe/src/features/ai/components/ChatInput.tsx
fe/src/features/ai/components/ChatReferencePanel.tsx
fe/src/features/ai/components/ChatDialogConfig.tsx
fe/src/features/ai/components/SearchBar.tsx
fe/src/features/ai/components/SearchResults.tsx
fe/src/features/ai/components/SearchResultCard.tsx
fe/src/features/ai/components/SearchFilters.tsx
fe/src/features/ai/hooks/useChatStream.ts
fe/src/features/ai/hooks/useChatConversations.ts
fe/src/features/ai/hooks/useChatDialogs.ts
fe/src/features/ai/hooks/useSearch.ts
fe/src/features/ai/api/chatApi.ts
fe/src/features/ai/api/searchApi.ts
fe/src/features/ai/types/chat.types.ts
fe/src/features/ai/types/search.types.ts
```

### New RBAC Backend Files (4)
```
be/src/shared/db/migrations/20260311_add_chat_dialog_access.ts
be/src/shared/db/migrations/20260312_add_search_app_access.ts
be/src/modules/chat/models/chat-dialog-access.model.ts
be/src/modules/search/models/search-app-access.model.ts
```

### New RBAC Frontend Files (5)
```
fe/src/features/ai/pages/ChatDialogManagementPage.tsx
fe/src/features/ai/pages/SearchAppManagementPage.tsx
fe/src/features/ai/components/ChatDialogAccessDialog.tsx
fe/src/features/ai/components/SearchAppAccessDialog.tsx
fe/src/features/ai/components/SearchAppConfig.tsx
```

### New RBAC Test Files (6) + Docs (3)
```
be/tests/chat/chat-dialog-access.model.test.ts
be/tests/chat/chat-dialog-rbac.service.test.ts
be/tests/chat/chat-dialog-access.routes.test.ts
be/tests/search/search-app-access.model.test.ts
be/tests/search/search-app-rbac.service.test.ts
be/tests/search/search-app-access.routes.test.ts
docs/test-plans/chat-dialog-rbac-test-plan.md
docs/test-plans/search-app-rbac-test-plan.md
docs/chat-dialog-admin-design.md
```

### Modified Files (21)
```
be/src/modules/chat/index.ts
be/src/shared/models/types.ts
be/src/shared/models/factory.ts
be/src/app/routes.ts
be/src/modules/chat/schemas/chat-dialog.schemas.ts
be/src/modules/chat/services/chat-dialog.service.ts
be/src/modules/chat/controllers/chat-dialog.controller.ts
be/src/modules/chat/routes/chat-dialog.routes.ts
be/src/modules/search/schemas/search.schemas.ts
be/src/modules/search/services/search.service.ts
be/src/modules/search/controllers/search.controller.ts
be/src/modules/search/routes/search.routes.ts
fe/src/app/App.tsx
fe/src/app/routeConfig.ts
fe/src/layouts/Sidebar.tsx
fe/src/features/ai/index.ts
fe/src/features/ai/types/chat.types.ts
fe/src/features/ai/types/search.types.ts
fe/src/features/ai/api/chatApi.ts
fe/src/features/ai/api/searchApi.ts
fe/src/features/ai/components/ChatDialogConfig.tsx
fe/src/i18n/locales/en.json
fe/src/i18n/locales/vi.json
fe/src/i18n/locales/ja.json
```
