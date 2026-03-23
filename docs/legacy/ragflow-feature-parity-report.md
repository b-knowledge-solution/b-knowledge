# RAGFlow Feature Parity Report: next-chats & next-search

**Date**: 2026-03-10
**Branch**: `feature/rag-core`
**Purpose**: Compare RAGFlow's `next-chats` and `next-search` features with b-knowledge's current implementation to identify gaps.

---

## 1. NEXT-CHATS Feature Comparison

### 1.1 Chat Application Management (Dialog CRUD)

| RAGFlow Feature | b-knowledge Status | Gap Detail |
|---|---|---|
| Chat list page with search/filter + pagination | **Partial** | No dedicated chat list page; dialog selection is inline in `ChatDialogConfig` modal |
| Chat card grid display (avatar, name, description, last update) | **Missing** | No card-based chat app listing |
| Create chat with default config (system prompt, prologue, quote, similarity=0.2, vector_weight=0.3, top_n=8) | **Done** | `ChatDialogConfig` handles create/edit |
| Rename chat dialog | **Done** | Via `updateDialog()` |
| Delete chat dialog with confirmation | **Done** | Via `deleteDialog()` |
| Chat avatar upload | **Missing** | No avatar/icon field in dialog config UI |

### 1.2 Conversation Management

| RAGFlow Feature | b-knowledge Status | Gap Detail |
|---|---|---|
| Conversation sidebar with search | **Done** | `ChatSidebar` with search and date grouping |
| Create new conversation | **Done** | Auto-creates on first message |
| Delete single conversation | **Done** | Via dropdown in sidebar |
| Batch delete conversations (selection mode, select-all) | **Missing** | Only single delete supported |
| Conversation temporary state (unsaved before first message) | **Missing** | Always creates immediately |
| Conversation renaming | **Partial** | API exists, no UI inline edit |

### 1.3 Chat Box & Messaging

| RAGFlow Feature | b-knowledge Status | Gap Detail |
|---|---|---|
| Send message with SSE streaming | **Done** | Delta streaming implemented |
| Auto-scroll to bottom | **Done** | `ChatMessageList` |
| Message delete | **Done** | API + controller |
| Message regenerate (re-send last question) | **Missing** | No regenerate button/logic |
| Stop output (abort streaming) | **Done** | `stopStream()` in `useChatStream` |
| File upload to conversation | **Missing** | No file upload in chat |
| "Reasoning" toggle (thinking/chain-of-thought models) | **Missing** | No reasoning mode toggle |
| "Internet" toggle (when Tavily API key configured) | **Missing** | Tavily is auto-enabled via config, no user toggle |
| Prologue/opener message display | **Missing** | No welcome message in empty state from dialog config |
| Keyboard shortcuts (Enter send, Shift+Enter newline) | **Done** | `ChatInput` |

### 1.4 Multi-Model Debug Mode

| RAGFlow Feature | b-knowledge Status | Gap Detail |
|---|---|---|
| Toggle debug mode | **Missing** | Not implemented |
| 1-3 side-by-side model cards | **Missing** | Not implemented |
| Per-card LLM model selection | **Missing** | Not implemented |
| Send same message to all models simultaneously | **Missing** | Not implemented |
| Apply card config to main dialog | **Missing** | Not implemented |

### 1.5 Chat Settings Panel

| RAGFlow Feature | b-knowledge Status | Gap Detail |
|---|---|---|
| Collapsible right-side settings panel | **Missing** | Uses modal dialog instead |
| **Basic Settings:** | | |
| - Avatar upload | **Missing** | No avatar field |
| - Name, description | **Done** | In `ChatDialogConfig` |
| - Empty response (custom "no results" message) | **Done** | In `prompt_config.empty_response` |
| - Prologue/opener | **Partial** | Backend supports it, not in config UI |
| - Quote toggle (show sources) | **Missing** | Always enabled by default |
| - Keyword toggle | **Missing** | No UI toggle (auto via config) |
| - TTS toggle | **Missing** | TTS button exists on messages, but no dialog-level toggle |
| - TOC enhance toggle | **Missing** | No UI toggle |
| - Tavily API key input | **Missing** | No UI for API key |
| - Knowledge base multi-select | **Done** | In `ChatDialogConfig` |
| - Metadata filter config | **Missing** | Not implemented |
| **Prompt Engine:** | | |
| - System prompt textarea | **Done** | In `ChatDialogConfig` |
| - Similarity threshold slider | **Missing** | No UI slider |
| - Top N documents input | **Missing** | No UI control |
| - Refine multiturn toggle | **Missing** | No UI toggle |
| - Knowledge graph toggle | **Missing** | No UI toggle |
| - Reranking config | **Missing** | No UI for rerank model selection |
| - Cross-language multi-select | **Missing** | No UI for language selection |
| - Dynamic variables | **Missing** | Not implemented |
| **Model Settings:** | | |
| - LLM model dropdown | **Done** | In `ChatDialogConfig` |
| - Temperature slider | **Done** | In `ChatDialogConfig` |
| - Top-P slider | **Missing** | Not in config UI |
| - Frequency penalty slider | **Missing** | Not in config UI |
| - Presence penalty slider | **Missing** | Not in config UI |
| - Max tokens input | **Missing** | Not in config UI |

### 1.6 Message UI Features

| RAGFlow Feature | b-knowledge Status | Gap Detail |
|---|---|---|
| User message bubble | **Done** | Right-aligned, colored |
| Assistant message with markdown | **Done** | `MarkdownRenderer` |
| Inline citation markers → popover | **Done** | `CitationInline` with `##ID:n$` parsing |
| Document-level citation badges | **Done** | Badges below messages |
| Copy message content | **Done** | Copy button |
| Thumbs up/down feedback | **Done** | Feedback buttons |
| TTS (text-to-speech) button | **Done** | Play/stop with `useTts` |
| Message timestamp | **Done** | On hover |
| Delete message action | **Done** | API exists (no button in UI) |
| Regenerate message action | **Missing** | Not implemented |
| Click citation → document preview | **Partial** | Opens reference panel; no direct PDF viewer integration |

### 1.7 Shared/Embedded Chat

| RAGFlow Feature | b-knowledge Status | Gap Detail |
|---|---|---|
| Public chat widget (embedded iframe) | **Missing** | No embeddable chat endpoint |
| Share link generation (tokens) | **Missing** | No token CRUD |
| Embed code with iframe snippet | **Missing** | Old `RagflowIframe` component exists but points to RAGFlow |
| Theme/locale sync from URL params | **Missing** | Not applicable |
| Floating chat bubble widget | **Missing** | Not implemented |
| Session reset in shared mode | **Missing** | Not implemented |

### 1.8 Advanced Features

| RAGFlow Feature | b-knowledge Status | Gap Detail |
|---|---|---|
| Mind map generation | **Missing** | No mind map endpoint or UI |
| Related questions suggestions | **Missing** | No related questions endpoint or UI |
| Chat statistics/analytics | **Missing** | No stats endpoint |
| File upload & parse in chat | **Missing** | Not implemented |

---

## 2. NEXT-SEARCH Feature Comparison

### 2.1 Search Application Management

| RAGFlow Feature | b-knowledge Status | Gap Detail |
|---|---|---|
| Search app CRUD (create, list, update, delete) | **Done** | `search` module with full CRUD |
| Search app list page with search/filter + pagination | **Missing** | No dedicated list page |
| Rename search app modal | **Missing** | No rename UI |

### 2.2 Search Interface

| RAGFlow Feature | b-knowledge Status | Gap Detail |
|---|---|---|
| Search home landing page (large input, greeting) | **Partial** | `DatasetSearchPage` has centered search bar but no greeting |
| Search input with Enter/button trigger | **Done** | `SearchBar` component |
| Clear search input (X button) | **Done** | Clear button in `SearchBar` |
| Stop search button (during streaming) | **Missing** | No stop button for search |
| Transition animation (home → results) | **Missing** | No animation |

### 2.3 Search Results Display

| RAGFlow Feature | b-knowledge Status | Gap Detail |
|---|---|---|
| AI Summary (streaming SSE answer) | **Partial** | `SearchResults` shows `summary` if returned, but BE search endpoint doesn't generate AI summary |
| Chunk result list with highlighting | **Done** | `SearchResultCard` with keyword highlighting |
| Document name, page number | **Done** | In result cards |
| Relevance score with progress bar | **Done** | In result cards |
| Click chunk → document preview modal | **Missing** | No document preview drawer from search |
| Image support in chunks (thumbnails, lightbox) | **Missing** | No image handling in search results |
| Pagination (page number, page size) | **Partial** | `top_k` limit only, no cursor pagination |

### 2.4 Search Filtering

| RAGFlow Feature | b-knowledge Status | Gap Detail |
|---|---|---|
| Document filter (checkbox multi-select with X/Y count) | **Missing** | `SearchFilters` has dataset-level filter, not document-level |
| Popover-based document selector with search | **Missing** | Not implemented |
| Dataset checkbox filter | **Done** | In `SearchFilters` |
| File type filter badges | **Done** | PDF, DOCX, XLSX, etc. |
| Search method radio buttons | **Done** | Hybrid, semantic, fulltext |
| Similarity threshold slider | **Done** | In `SearchFilters` |
| Metadata filter builder (manual key-value-operator) | **Missing** | Not implemented |

### 2.5 AI Features in Search

| RAGFlow Feature | b-knowledge Status | Gap Detail |
|---|---|---|
| AI Summary toggle (enable/disable) | **Missing** | Not configurable |
| AI Summary with citations (markdown + popover) | **Missing** | No citation parsing in search summary |
| LLM model selection for summary | **Missing** | Not configurable |
| LLM parameter tuning (temperature, top_p, penalties) | **Missing** | Not configurable |
| Related search questions (5-10 suggestions) | **Missing** | Not implemented |
| Mind map visualization (tree diagram) | **Missing** | Not implemented |
| Rerank model toggle + top_k | **Missing** | Not in search settings UI |
| Knowledge graph toggle | **Missing** | Not in search settings UI |

### 2.6 Search Settings Panel

| RAGFlow Feature | b-knowledge Status | Gap Detail |
|---|---|---|
| Slide-in settings panel | **Missing** | No settings panel for search |
| Name, avatar, description | **Missing** | Not in UI |
| Dataset multi-select (with embedding model validation) | **Partial** | Basic dataset selection exists |
| Similarity threshold + vector weight | **Partial** | Threshold exists, no vector weight |
| Rerank model config | **Missing** | Not in UI |
| AI Summary toggle with LLM settings | **Missing** | Not in UI |
| Related search toggle | **Missing** | Not in UI |
| Mind map toggle | **Missing** | Not in UI |
| Metadata filter config | **Missing** | Not in UI |

### 2.7 Shared/Embedded Search

| RAGFlow Feature | b-knowledge Status | Gap Detail |
|---|---|---|
| Embed search as iframe | **Missing** | Not implemented |
| Share link with token | **Missing** | Not implemented |
| Public search page | **Missing** | Not implemented |
| Profile/avatar visibility toggle | **Missing** | Not implemented |
| Locale selector for embed | **Missing** | Not implemented |

### 2.8 Document Preview in Search

| RAGFlow Feature | b-knowledge Status | Gap Detail |
|---|---|---|
| Document preview drawer/modal | **Missing** | Not implemented for search (exists for datasets) |
| Chunk highlighting in PDF | **Missing** | `buildChunkHighlights()` utility exists but not wired to search |
| File type auto-detection | **Done** | `document-util.ts` has `getExtension()`, `isPdf()` |

---

## 3. Backend API Parity

### 3.1 Chat APIs

| RAGFlow Endpoint | b-knowledge Endpoint | Status |
|---|---|---|
| `GET /dialogs/{id}` | `GET /api/chat/dialogs/:id` | **Done** |
| `POST /dialogs` | `POST /api/chat/dialogs` | **Done** |
| `POST /dialogs/delete` | `DELETE /api/chat/dialogs/:id` | **Done** |
| `GET /dialogs?page=...` | `GET /api/chat/dialogs` | **Done** (no pagination) |
| `GET /conversations?dialog_id=` | `GET /api/chat/conversations?dialogId=` | **Done** |
| `GET /conversations/{id}` | `GET /api/chat/conversations/:id` | **Done** |
| `POST /conversations` | `POST /api/chat/conversations` | **Done** |
| `POST /conversations/delete` | `DELETE /api/chat/conversations` | **Done** |
| `POST /conversations/{id}/completions` (SSE) | `POST /api/chat/conversations/:id/completion` | **Done** |
| `POST /conversations/{id}/delete_message` | `DELETE /api/chat/conversations/:id/messages/:msgId` | **Done** |
| `POST /conversations/{id}/thumbup` | `POST /api/chat/conversations/:id/feedback` | **Done** |
| `POST /conversations/{id}/upload_and_parse` | — | **Missing** |
| `POST /conversations/mindmap` | — | **Missing** |
| `POST /conversations/related_questions` | — | **Missing** |
| `POST /dialogs/token` (create share token) | — | **Missing** |
| `GET /dialogs/token` (list tokens) | — | **Missing** |
| `POST /dialogs/token/delete` | — | **Missing** |
| `GET /chatbots/{sharedId}/info` | — | **Missing** |
| `POST /chatbots/{sharedId}/completions` | — | **Missing** |
| TTS endpoint | `POST /api/chat/tts` | **Done** |

### 3.2 Search APIs

| RAGFlow Endpoint | b-knowledge Endpoint | Status |
|---|---|---|
| `POST /search/create` | `POST /api/search/apps` | **Done** |
| `POST /search/list` | `GET /api/search/apps` | **Done** |
| `GET /search/detail` | `GET /api/search/apps/:id` | **Done** |
| `POST /search/update` | `PUT /api/search/apps/:id` | **Done** |
| `POST /search/delete` | `DELETE /api/search/apps/:id` | **Done** |
| `POST /search/ask` (SSE AI summary) | — | **Missing** |
| `POST /search/mindmap` | — | **Missing** |
| `POST /search/related_questions` | — | **Missing** |
| `GET /search/detail/share` | — | **Missing** |
| `POST /search/ask/share` | — | **Missing** |
| Retrieval test / chunk search | `POST /api/search/apps/:id/search` | **Done** |

---

## 4. Summary Scorecard

### Next-Chats (34 files in RAGFlow)

| Category | Total Features | Done | Partial | Missing |
|---|---|---|---|---|
| Dialog CRUD | 6 | 4 | 0 | 2 |
| Conversation Mgmt | 6 | 3 | 1 | 2 |
| Chat Box & Messaging | 10 | 4 | 0 | 6 |
| Multi-Model Debug | 5 | 0 | 0 | 5 |
| Chat Settings | 25 | 5 | 1 | 19 |
| Message UI | 11 | 8 | 1 | 2 |
| Shared/Embedded | 6 | 0 | 0 | 6 |
| Advanced | 4 | 0 | 0 | 4 |
| **Total** | **73** | **24 (33%)** | **3 (4%)** | **46 (63%)** |

### Next-Search (15 files in RAGFlow)

| Category | Total Features | Done | Partial | Missing |
|---|---|---|---|---|
| Search App Mgmt | 3 | 1 | 0 | 2 |
| Search Interface | 5 | 2 | 1 | 2 |
| Results Display | 7 | 3 | 1 | 3 |
| Search Filtering | 7 | 4 | 0 | 3 |
| AI Features | 8 | 0 | 0 | 8 |
| Settings Panel | 9 | 0 | 1 | 8 |
| Shared/Embedded | 5 | 0 | 0 | 5 |
| Document Preview | 3 | 1 | 0 | 2 |
| **Total** | **47** | **11 (23%)** | **3 (6%)** | **33 (70%)** |

---

## 5. Recommended Priority Tiers

### Tier 1 — Core UX (High Impact, Essential for Chat/Search)

1. **Chat Settings Panel** — Move from modal to collapsible right panel; add all RAGFlow config fields (similarity threshold, top_n, refine_multiturn, cross_languages, use_kg, rerank_id, quote toggle, keyword toggle, Tavily API key)
2. **Message Regenerate** — Add "regenerate" button on assistant messages
3. **Search AI Summary** — Add SSE streaming answer endpoint for search (`POST /api/search/apps/:id/ask`)
4. **Document Preview from Search/Chat** — Wire `DocumentPreviewer` to citation clicks with PDF highlighting via `buildChunkHighlights()`
5. **Related Questions** — Add endpoint and UI for follow-up suggestions (backend prompt already migrated)
6. **Prologue/Welcome Message** — Display dialog's `prologue` in empty conversation state

### Tier 2 — Power User Features (Medium Impact)

7. **Batch Delete Conversations** — Selection mode with select-all and bulk delete
8. **Internet Toggle** — User-facing toggle for Tavily web search on/off per message
9. **Reasoning Toggle** — Chain-of-thought/thinking mode toggle
10. **Search Settings Panel** — Slide-in config for search app (datasets, rerank, AI summary toggle, LLM settings)
11. **Mind Map** — Backend endpoint + tree visualization drawer
12. **File Upload in Chat** — Upload and parse documents within conversation
13. **Chat App List Page** — Dedicated page with card grid, search/filter, pagination

### Tier 3 — Sharing & Embedding (Lower Priority)

14. **Share Token CRUD** — Create/list/delete share tokens for chat/search
15. **Public Chat Widget** — Embedded chat endpoint with theme/locale sync
16. **Public Search Page** — Shared search interface via token
17. **Embed Code Generator** — Iframe snippet with customization options

### Tier 4 — Advanced/Nice-to-Have

18. **Multi-Model Debug Mode** — Side-by-side LLM comparison (complex, low user demand)
19. **Dynamic Variables** — Template variable substitution in prompts
20. **Chat Statistics** — Analytics dashboard for chat usage
21. **Metadata Filter UI** — Key-value-operator filter builder for both chat and search
22. **Floating Chat Bubble Widget** — Embeddable bubble for external sites
