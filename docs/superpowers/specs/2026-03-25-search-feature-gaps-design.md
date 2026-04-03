# Search Feature Gaps — Design Spec

## Overview

Close 8 UI/UX and business logic gaps between RAGFlow's `next-searchs` and B-Knowledge's search feature. Search is intentionally simple (AI summary + chunk score retrieval only). Advanced RAG features (deep research, knowledge graph, web search, cross-language, keyword extraction) remain chat-only.

**Approach:** Shared-Service Extraction — extract common logic (highlights, related questions, citation popovers) into shared services/components so both search and chat benefit.

## Scope

| # | Gap | Category |
|---|-----|----------|
| 1 | Search app avatar (emoji/icon picker) | UI + DB |
| 2 | Iframe embed + standalone share page | UI + BE |
| 3 | Server-side highlight snippets + full content popover | UI + BE |
| 4 | Rich citation popovers in AI summary | UI (shared) |
| 5 | Document preview modal with chunk positioning | UI |
| 6 | Related questions after search | UI + BE (shared) |
| 7 | Mind map progress simulation polish | UI |
| 8 | Configurable empty response per search app | UI + BE + DB |

**Out of scope:** Evaluation framework (deferred), deep research in search, knowledge graph in search, web search in search, cross-language in search, keyword extraction in search, SQL fallback, tag-based boosting, Dify API, TTS.

## 1. Database & Config Changes

### Migration: `YYYYMMDDhhmmss_search_app_avatar_empty_response.ts`

Add two columns to `search_apps` table:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `avatar` | `varchar(64)` | `null` | Emoji/icon string (e.g. `🔍`, `📚`, `💡`) |
| `empty_response` | `text` | `null` | Custom "no results" message per app |

No new tables needed. Share page reuses existing `search_embed_tokens` for authentication.

## 2. Backend Service Changes

### 2a. OpenSearch Highlight Integration

**File:** `be/src/modules/rag/services/rag-search.service.ts`

Add `highlight` configuration to all three search methods (`fullTextSearch`, `semanticSearch`, `hybridSearch`). OpenSearch returns highlighted snippets with `<em>` tags around matched terms.

```typescript
// Added to OpenSearch request body
highlight: {
  fields: {
    content_ltks: { number_of_fragments: 1, fragment_size: 200 },
    title_tks: { number_of_fragments: 1, fragment_size: 100 }
  },
  pre_tags: ['<em>'],
  post_tags: ['</em>']
}
```

Response chunk shape gains:

| Field | Type | Purpose |
|-------|------|---------|
| `highlight` | `string \| null` | Snippet with `<em>` tags from OpenSearch |
| `content_with_weight` | `string` | Full chunk content (already exists, now always returned) |

**New shared utility:** `be/src/shared/services/highlight.service.ts` — builds OpenSearch highlight config, reusable by any module that queries OpenSearch.

### 2b. Related Questions Service (Shared)

**New file:** `be/src/shared/services/related-questions.service.ts`

Extracted from chat's existing related-questions logic. Single method:

```typescript
generateRelatedQuestions(
  query: string,
  chunks: ChunkResult[],
  llmId: string,
  tenantId: string
): Promise<string[]>
```

- Takes the query + top chunks, asks LLM to generate 3-5 follow-up questions
- Reused by both search and chat modules
- Search controller calls it after retrieval

### 2c. Search Service — `askSearch()` Updates

**File:** `be/src/modules/search/services/search.service.ts`

Current flow: retrieve → stream summary → done.

New flow: retrieve (with highlights) → stream summary → generate related questions → send final SSE event.

Related questions are generated **after** the summary completes (non-blocking to streaming). Sent as final SSE event: `{ related_questions: [...] }`.

### 2d. Embed Route Expansion

**File:** `be/src/modules/search/routes/search-embed.routes.ts`

**Existing endpoints (no change):**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/search/embed/:token/info` | Returns app name, description (existing — keep for backward compat) |
| `POST` | `/api/search/embed/:token/ask` | SSE streaming search with AI summary (existing) |

**New endpoints (all token-authenticated, no session required):**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/search/embed/:token/config` | Supersedes `/info` — returns app name, description, avatar, search_config (no sensitive fields like `tavily_api_key`). The share page uses this instead of `/info`. |
| `POST` | `/api/search/embed/:token/search` | Non-streaming paginated search (for pages 2+ in share page) |
| `POST` | `/api/search/embed/:token/related-questions` | Related questions |
| `POST` | `/api/search/embed/:token/mindmap` | Mind map generation |

**Share page consumes:** `/config` (on mount), `/ask` (streaming page 1), `/search` (non-streaming pages 2+), `/related-questions`, `/mindmap`.

All validate token + expiration. Tenant resolved from token's associated search app.

**CORS:** Embed endpoints already use token-based auth (no cookies/session). The share page is served from the same origin as the API (same B-Knowledge deployment), so no additional CORS configuration is needed — the iframe loads the share page from the same domain.

**Rate limiting:** Existing rate limits (1000 req/15min) apply to embed endpoints. No additional limits needed at this stage.

**File:** `be/src/modules/search/controllers/search-embed.controller.ts` — new handlers for the above endpoints.

### 2e. Search App CRUD — Avatar & Empty Response

**Files:** `search.controller.ts`, `search.schemas.ts`, `search-app.model.ts`

- `createSearchApp` / `updateSearchApp` accept `avatar` (string, max 64 chars) and `empty_response` (text, optional)
- Returned in all GET responses (detail and list)
- Validation: both optional strings

## 3. Frontend Shared Component Changes

### 3a. Rich Citation Popovers in MarkdownRenderer

**File:** `fe/src/components/MarkdownRenderer.tsx`

Upgrade existing citation badge rendering. On hover/click, show a popover containing:

- **Header:** File type icon (colored by type: PDF red, Excel green, etc.), document name, page number, relevance score percentage
- **Body:** Chunk text preview (first ~200 characters of chunk content)
- **Footer:** Optional image thumbnail (when `img_id` exists), "View in document →" link that opens the document preview modal

Data source: `reference.chunks[]` array already passed to the renderer. No new API calls needed. During implementation, verify that chunks passed to `MarkdownRenderer` include all required fields (`img_id`, `doc_name`, `page_num`, `score`). If any module strips fields before passing, add them back.

This enhancement benefits both search and chat since `MarkdownRenderer` is shared.

### 3b. ChunkContentDisplay Component (New Shared)

**New file:** `fe/src/components/ChunkContentDisplay.tsx`

```typescript
interface ChunkContentDisplayProps {
  highlight?: string | null      // Server-side snippet with <em> tags
  fullContent: string            // Full content_with_weight
  query?: string                 // For client-side fallback highlighting
  defaultExpanded?: boolean      // Default false
}
```

- **Collapsed state (default):** Shows `highlight` field with `<em>` → yellow background. Falls back to client-side `SearchHighlight` if no server highlight.
- **"Show full content" toggle:** Expands to show full `content_with_weight` in a scrollable container (max-height 200px) with blue border.
- **"Hide full content" toggle:** Collapses back to snippet.

Used by `SearchResultCard` and available for chat reference display.

### 3c. EmojiPicker Component (New Shared)

**New file:** `fe/src/components/EmojiPicker.tsx`

Simple grid of ~50 curated emoji relevant to knowledge/search contexts (`📚🔍💡🧠📖🗂️🎯📊🔬💻` etc.) plus a text input for custom emoji entry. Lightweight, no external library.

Used by `SearchAppConfig` for avatar selection.

## 4. Share Page & Embed Dialog

### 4a. Share Page

**New file:** `fe/src/features/search/pages/SearchSharePage.tsx`

**Route:** `/search/share/:token` (added to `routeConfig.ts`, code-split via `React.lazy`)

Standalone page for iframe embedding. No sidebar navigation, no app layout wrapper. Code-split as a separate route to minimize bundle size when loaded in iframes.

**Auth flow:**
1. On mount, call `GET /api/search/embed/:token/config`
2. If token invalid/expired → show error page
3. If valid → render search UI with app config

**Layout:**
- Minimal header: avatar + app name + description + locale switcher (pills for en/vi/ja)
- Centered search bar (same `SearchBar` component)
- Results area: `SearchResults`, `SearchResultCard`, `RelatedSearchQuestions`, `SearchMindMapDrawer`
- Footer: "Powered by B-Knowledge" (optional, controlled by URL param)

**Excluded from share page:** Sidebar filters, admin controls, feedback buttons, document filter popover, tag filter chips, app switcher.

**URL parameters:**
- `?locale=vi` — override default locale
- `?hide_avatar=true` — hide avatar and branding header
- `?hide_powered_by=true` — hide footer

**API endpoints consumed by share page:**
- `GET /api/search/embed/:token/config` — load app config on mount
- `POST /api/search/embed/:token/ask` — streaming search with AI summary (page 1)
- `POST /api/search/embed/:token/search` — non-streaming paginated search (pages 2+)
- `POST /api/search/embed/:token/related-questions` — related question suggestions
- `POST /api/search/embed/:token/mindmap` — mind map generation

### 4b. SearchAppEmbedDialog Enhancement

**File:** `fe/src/features/search/components/SearchAppEmbedDialog.tsx`

Currently shows embed token management only. Enhanced with:

- **Iframe code section:** Generated `<iframe>` HTML with the share URL, copy-to-clipboard button
- **Options section:**
  - Checkbox: "Show avatar & branding" (toggles `hide_avatar` URL param)
  - Checkbox: "Show powered by footer" (toggles `hide_powered_by` URL param)
  - Select: "Default locale" (en/vi/ja — sets `locale` URL param)
- Iframe code updates live as options change

### 4c. Search Home — Avatar Display

**File:** `fe/src/features/search/pages/SearchPage.tsx`

- Landing/hero state shows the app's `avatar` emoji above the title (40px font size)
- Compact search header (when actively searching) shows avatar next to app name badge

**File:** `fe/src/features/search/pages/SearchAppManagementPage.tsx`

- Table rows show avatar emoji next to app name

**File:** `fe/src/features/search/components/SearchAppConfig.tsx`

- New "Avatar" field with `EmojiPicker` component
- Positioned at top of "Basic" section, above name field

## 5. Document Preview, Related Questions, Mind Map & Empty Response

### 5a. Document Preview with Chunk Positioning

**File:** `fe/src/features/search/components/SearchResultDocDialog.tsx`

Enhancements:

- Receives `chunk.page_num` and `chunk.position` from the search result
- Scrolls `DocumentPreviewer` to the correct page on open
- Highlights chunk location: yellow background (`#fef9c3`), left border (`#eab308`), "Chunk #N" label badge
- Header: file icon, document name, "Chunk on Page N · Score: X%", download button, close button
- Footer: page navigation (prev/next)
- For PDFs: uses `positions` array to highlight exact bounding box
- For text-based docs: uses text matching to locate and highlight chunk content

### 5b. Related Questions Integration

**Backend:** After `askSearch` SSE completes, calls `relatedQuestionsService.generate()` and sends `{ related_questions: [...] }` SSE event. Only when `enable_related_questions` is true in app config.

**Frontend hook:** `useSearchStream.ts` — already has `relatedQuestions` state field. Now populated from the new SSE event.

**Frontend component:** `RelatedSearchQuestions` (already exists) renders pill chips with search icon. Clicking triggers new search with that question. Shows between last result card and pagination. Only renders when questions array is non-empty.

**Config toggle:** The `enable_related_questions` field already exists in `SearchAppConfig` type and the config dialog UI. No new toggle needed — verify during implementation that the existing toggle is wired to the SSE logic.

### 5c. Mind Map Progress Simulation

**File:** `fe/src/features/search/components/SearchMindMapDrawer.tsx`

Enhancements:

- Timed progress simulation: 0% → 90% over ~30 seconds via `setInterval`
- Progress jumps to 100% when API response arrives
- Phase labels rotate: "Analyzing concepts..." → "Building relationships..." → "Organizing hierarchy..."
- Brain emoji (`🧠`) + gradient progress bar (blue → purple)
- Error state with retry button (already exists, no change)
- On completion: smooth transition to `MindMapTree` component

### 5d. Configurable Empty Response

**Backend:** `SearchApp` model returns `empty_response` field. No special processing.

**Frontend:** `SearchPage` checks `searchApp.empty_response`:
- If set: displays custom message instead of default i18n string
- If not set: falls back to `t('search.noResults')` (current behavior)
- Custom message is plain text only (no markdown)

**Share page:** Also respects custom empty response from app config.

**Config dialog:** `SearchAppConfig` gets a new textarea field: "Custom no-results message (optional)" with description text.

## 6. API Contract Changes

### Updated Endpoints

| Endpoint | Change |
|----------|--------|
| `POST /api/search/apps` | Accept `avatar`, `empty_response` |
| `PUT /api/search/apps/:id` | Accept `avatar`, `empty_response` |
| `GET /api/search/apps/:id` | Return `avatar`, `empty_response` |
| `GET /api/search/apps` | Return `avatar` in list items |
| `POST /api/search/apps/:id/ask` | New SSE event: `{ related_questions: [...] }` |
| `POST /api/search/apps/:id/search` | Response chunks include `highlight`, `content_with_weight` |

### New Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| `GET` | `/api/search/embed/:token/config` | Token | App config for share page |
| `POST` | `/api/search/embed/:token/search` | Token | Non-streaming search |
| `POST` | `/api/search/embed/:token/related-questions` | Token | Related questions |
| `POST` | `/api/search/embed/:token/mindmap` | Token | Mind map generation |

### Zod Schema Updates

- `createSearchAppSchema` / `updateSearchAppSchema`: add `avatar: z.string().max(64).optional()`, `empty_response: z.string().optional()`
- `executeSearchSchema` response: chunk shape includes `highlight: z.string().nullable()`
- Add to existing `search-embed.schemas.ts`: `embedConfigSchema` for embed config response, `embedSearchSchema`, `embedRelatedQuestionsSchema` (reuse existing search schemas)

## 7. Frontend Type Updates

```typescript
// search.types.ts — additions

interface SearchApp {
  // ...existing fields
  avatar?: string | null
  empty_response?: string | null
}

interface SearchResult {
  // ...existing fields
  highlight?: string | null
  content_with_weight?: string
}
```

## 8. i18n Additions

New keys across all 3 locales (en, vi, ja):

| Key | EN Value |
|-----|----------|
| `searchAdmin.avatar` | "Avatar" |
| `searchAdmin.avatarDesc` | "Choose an emoji icon for this search app" |
| `searchAdmin.emptyResponse` | "Custom no-results message" |
| `searchAdmin.emptyResponseDesc` | "Shown when search returns no results. Leave empty for default." |
| `searchAdmin.embedCode` | "Embed Code" |
| `searchAdmin.embedOptions` | "Options" |
| `searchAdmin.showAvatar` | "Show avatar & branding" |
| `searchAdmin.showPoweredBy` | "Show powered by footer" |
| `searchAdmin.defaultLocale` | "Default locale" |
| `searchAdmin.copyCode` | "Copy Code" |
| `search.poweredBy` | "Powered by B-Knowledge" |
| `search.generatingMindmap` | "Generating mind map..." |
| `search.analyzingConcepts` | "Analyzing concepts and relationships..." |
| `search.buildingRelationships` | "Building relationships..." |
| `search.organizingHierarchy` | "Organizing hierarchy..." |
| `search.showFullContent` | "Show full content" |
| `search.hideFullContent` | "Hide full content" |
| `search.viewInDocument` | "View in document" |
| `search.chunkLabel` | "Chunk #{{n}}" |

## 9. File Inventory

### New Files (6)

| File | Type | Purpose |
|------|------|---------|
| `be/src/shared/services/related-questions.service.ts` | Shared service | LLM-based related question generation |
| `be/src/shared/services/highlight.service.ts` | Shared service | OpenSearch highlight config builder |
| `fe/src/features/search/pages/SearchSharePage.tsx` | Page | Standalone share/embed page |
| `fe/src/components/EmojiPicker.tsx` | Shared component | Emoji grid picker |
| `fe/src/components/ChunkContentDisplay.tsx` | Shared component | Highlight snippet + expand toggle |
| `be/src/shared/db/migrations/YYYYMMDDhhmmss_search_app_avatar_empty_response.ts` | Migration | New columns |

### Modified Files (23)

| File | Changes |
|------|---------|
| `be/src/modules/search/services/search.service.ts` | Highlight param, related questions, embed endpoints |
| `be/src/modules/search/controllers/search.controller.ts` | Accept avatar, empty_response |
| `be/src/modules/search/controllers/search-embed.controller.ts` | New config/search/related-questions/mindmap handlers |
| `be/src/modules/search/routes/search-embed.routes.ts` | New embed routes |
| `be/src/modules/search/schemas/search.schemas.ts` | Updated schemas |
| `be/src/modules/search/schemas/search-embed.schemas.ts` | New embed schemas |
| `be/src/modules/search/models/search-app.model.ts` | Avatar + empty_response columns |
| `be/src/modules/rag/services/rag-search.service.ts` | OpenSearch highlight config |
| `fe/src/features/search/api/searchApi.ts` | New embed API calls |
| `fe/src/features/search/api/searchQueries.ts` | Share page query hooks |
| `fe/src/features/search/types/search.types.ts` | New fields on SearchApp, SearchResult |
| `fe/src/features/search/components/SearchAppConfig.tsx` | Avatar picker + empty response input |
| `fe/src/features/search/components/SearchAppEmbedDialog.tsx` | Iframe code generation + options |
| `fe/src/features/search/components/SearchResultCard.tsx` | Use ChunkContentDisplay |
| `fe/src/features/search/components/SearchResults.tsx` | Pass highlight data |
| `fe/src/features/search/components/SearchMindMapDrawer.tsx` | Progress simulation |
| `fe/src/features/search/components/SearchResultDocDialog.tsx` | Chunk position highlighting |
| `fe/src/features/search/pages/SearchPage.tsx` | Avatar display, custom empty response |
| `fe/src/features/search/pages/SearchAppManagementPage.tsx` | Avatar in table |
| `fe/src/features/search/hooks/useSearchStream.ts` | Handle related_questions SSE event |
| `fe/src/components/MarkdownRenderer.tsx` | Rich citation popovers |
| `fe/src/app/routeConfig.ts` | Add share page route |
| `fe/src/i18n/locales/*.json` | New keys (en, vi, ja) |

## 10. Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Avatar format | Emoji/icon picker (string) | Matches RAGFlow pattern, avoids file storage complexity |
| Embed approach | Standalone share page + iframe | Proven pattern, reuses existing components |
| Highlight method | OpenSearch native server-side | Better snippets with context ellipsis, small BE change |
| Implementation strategy | Shared-service extraction | DRY — changes propagate to both search and chat |
| Evaluation framework | Deferred | Large independent feature, deserves own design cycle |
| Empty response format | Plain text only | Keeps it simple, avoids rendering complexity |
| Related questions timing | After summary completes | Non-blocking to streaming UX |
