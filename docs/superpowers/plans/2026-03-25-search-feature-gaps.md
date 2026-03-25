# Search Feature Gaps Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 8 UI/UX and business logic gaps between RAGFlow's search and B-Knowledge's search feature.

**Architecture:** Shared-service extraction — extract highlight config and related-questions generation into shared services. Add embed endpoints for the standalone share page. Enhance existing components (MarkdownRenderer, SearchResultCard, SearchMindMapDrawer) rather than building from scratch where possible.

**Tech Stack:** TypeScript, Express, Knex, OpenSearch, React 19, TanStack Query, Tailwind CSS, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-25-search-feature-gaps-design.md`

**Security note:** All HTML content rendered via `dangerouslySetInnerHTML` MUST be sanitized with DOMPurify before rendering. This is already the project convention — see `MarkdownRenderer.tsx` for reference.

**Key existing code:**
- `be/src/modules/search/services/search.service.ts` (994 lines) — already has inline `generateRelatedQuestions()` and sends `related_questions` SSE event
- `fe/src/features/search/hooks/useSearchStream.ts` (268 lines) — already parses `related_questions` from SSE
- `fe/src/components/MarkdownRenderer.tsx` (663 lines) — already has rich citation HoverCard with chunk preview, image thumbnail, doc metadata
- `fe/src/features/search/components/SearchMindMapDrawer.tsx` (175 lines) — already has 0→90% progress animation
- `fe/src/features/search/components/SearchResultDocDialog.tsx` (102 lines) — already accepts `selectedChunk` prop

---

## Chunk 1: Foundation — Database, Types, Schemas, i18n

### Task 1: Database Migration

**Files:**
- Create: `be/src/shared/db/migrations/YYYYMMDDhhmmss_search_app_avatar_empty_response.ts`

- [ ] **Step 1: Create the migration file**

Generate timestamp and create migration:

```bash
npm run db:migrate:make search_app_avatar_empty_response
```

- [ ] **Step 2: Write the migration**

```typescript
import type { Knex } from 'knex'

/**
 * @description Adds avatar and empty_response columns to search_apps table
 * for search app branding and custom no-results messaging.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('search_apps', (table) => {
    // Emoji/icon string for search app branding (e.g. 📚, 🔍)
    table.string('avatar', 64).nullable().defaultTo(null)

    // Custom message shown when search returns no results
    table.text('empty_response').nullable().defaultTo(null)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('search_apps', (table) => {
    table.dropColumn('avatar')
    table.dropColumn('empty_response')
  })
}
```

- [ ] **Step 3: Run the migration**

```bash
npm run db:migrate
```

Expected: Migration completes successfully, two new columns on `search_apps`.

- [ ] **Step 4: Commit**

```bash
git add be/src/shared/db/migrations/*search_app_avatar*
git commit -m "feat(search): add avatar and empty_response columns to search_apps"
```

---

### Task 2: Backend Schema Updates

**Files:**
- Modify: `be/src/modules/search/schemas/search.schemas.ts`
- Modify: `be/src/modules/search/schemas/search-embed.schemas.ts`

- [ ] **Step 1: Update create/update schemas to accept avatar and empty_response**

In `search.schemas.ts`, add to `createSearchAppSchema` body:

```typescript
// After the existing is_public field
avatar: z.string().max(64).optional(),
empty_response: z.string().optional(),
```

Add the same two fields to `updateSearchAppSchema` body.

- [ ] **Step 2: Add new embed schemas**

In `search-embed.schemas.ts`, add:

```typescript
/**
 * @description Schema for embed search (non-streaming paginated) request body
 */
export const embedSearchSchema = z.object({
  body: z.object({
    query: z.string().min(1),
    top_k: z.coerce.number().int().min(1).max(100).optional(),
    method: z.enum(['full_text', 'semantic', 'hybrid']).optional(),
    similarity_threshold: z.coerce.number().min(0).max(1).optional(),
    vector_similarity_weight: z.coerce.number().min(0).max(1).optional(),
    doc_ids: z.array(z.string()).optional(),
    metadata_filter: metadataFilterSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(50).default(10),
  }),
  params: z.object({
    token: z.string().length(64),
  }),
})

/**
 * @description Schema for embed related questions request body
 */
export const embedRelatedQuestionsSchema = z.object({
  body: z.object({
    query: z.string().min(1),
  }),
  params: z.object({
    token: z.string().length(64),
  }),
})

/**
 * @description Schema for embed mindmap request body
 */
export const embedMindmapSchema = z.object({
  body: z.object({
    query: z.string().min(1),
  }),
  params: z.object({
    token: z.string().length(64),
  }),
})
```

Import `metadataFilterSchema` from `search.schemas.ts` if not already imported.

- [ ] **Step 3: Verify build**

```bash
cd be && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add be/src/modules/search/schemas/
git commit -m "feat(search): add avatar, empty_response, and embed schemas"
```

---

### Task 3: Backend Model Update

**Files:**
- Modify: `be/src/modules/search/models/search-app.model.ts`

- [ ] **Step 1: Verify model auto-maps columns**

Read `search-app.model.ts` and confirm it extends `BaseModel` which auto-maps all columns. Since it uses Knex and the `SearchApp` type, just ensure the TypeScript type is updated.

- [ ] **Step 2: Update the SearchApp type if defined in model**

If the `SearchApp` interface is defined in the model file, add:

```typescript
avatar?: string | null
empty_response?: string | null
```

If the type is in `search.types.ts` or a shared types file, update there instead.

- [ ] **Step 3: Verify build**

```bash
cd be && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add be/src/modules/search/models/
git commit -m "feat(search): add avatar and empty_response to SearchApp model type"
```

---

### Task 4: Frontend Type Updates

**Files:**
- Modify: `fe/src/features/search/types/search.types.ts`

- [ ] **Step 1: Add avatar and empty_response to SearchApp interface**

At `search.types.ts`, add to the `SearchApp` interface (around line 118):

```typescript
avatar?: string | null
empty_response?: string | null
```

- [ ] **Step 2: Add highlight and content_with_weight to SearchResult interface**

At `search.types.ts`, add to the `SearchResult` interface (around line 13):

```typescript
// Server-side highlighted snippet from OpenSearch with <em> tags
highlight?: string | null
// Full chunk content for expand/collapse
content_with_weight?: string
```

- [ ] **Step 3: Add embed API types**

At end of `search.types.ts`, add:

```typescript
/**
 * @description Config returned by embed config endpoint for share page
 */
export interface EmbedAppConfig {
  name: string
  description?: string | null
  avatar?: string | null
  empty_response?: string | null
  search_config: SearchAppConfig
}
```

- [ ] **Step 4: Verify build**

```bash
cd fe && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add fe/src/features/search/types/
git commit -m "feat(search): add avatar, empty_response, highlight, and embed types"
```

---

### Task 5: i18n Keys

**Files:**
- Modify: `fe/src/i18n/locales/en.json`
- Modify: `fe/src/i18n/locales/vi.json`
- Modify: `fe/src/i18n/locales/ja.json`

- [ ] **Step 1: Add English keys**

In `en.json`, add under the `search` namespace:

```json
"poweredBy": "Powered by B-Knowledge",
"generatingMindmap": "Generating mind map...",
"analyzingConcepts": "Analyzing concepts and relationships...",
"buildingRelationships": "Building relationships...",
"organizingHierarchy": "Organizing hierarchy...",
"showFullContent": "Show full content",
"hideFullContent": "Hide full content",
"viewInDocument": "View in document",
"chunkLabel": "Chunk #{{n}}"
```

Add under the `searchAdmin` namespace:

```json
"avatar": "Avatar",
"avatarDesc": "Choose an emoji icon for this search app",
"emptyResponse": "Custom no-results message",
"emptyResponseDesc": "Shown when search returns no results. Leave empty for default.",
"embedCode": "Embed Code",
"embedOptions": "Options",
"showAvatar": "Show avatar & branding",
"showPoweredBy": "Show powered by footer",
"defaultLocale": "Default locale",
"copyCode": "Copy Code"
```

- [ ] **Step 2: Add Vietnamese keys**

Same keys in `vi.json` with Vietnamese translations. Use the project's existing Vietnamese translation style for consistency.

- [ ] **Step 3: Add Japanese keys**

Same keys in `ja.json` with Japanese translations.

- [ ] **Step 4: Verify no missing keys**

```bash
cd fe && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add fe/src/i18n/locales/
git commit -m "feat(search): add i18n keys for search gaps features (en, vi, ja)"
```

---

## Chunk 2: Backend Services — Highlight, Related Questions, Embed Endpoints

### Task 6: OpenSearch Highlight Integration

**Files:**
- Modify: `be/src/modules/rag/services/rag-search.service.ts`

- [ ] **Step 1: Write test for highlight config**

Create or modify the existing test file for rag-search. Write a test that verifies the search methods return a `highlight` field when highlight is enabled.

Check if test file exists at `be/tests/rag/rag-search.service.test.ts` or similar. If not, create it. The test should verify:

```typescript
it('should include highlight config in OpenSearch query when highlight=true', () => {
  // Test that the OpenSearch request body includes highlight configuration
  // when the highlight parameter is true
})

it('should return highlight field in chunk results', () => {
  // Test that chunk results include the highlight string from OpenSearch response
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd be && npx vitest run tests/rag/rag-search.service.test.ts --reporter=verbose
```

Expected: FAIL — highlight not implemented.

- [ ] **Step 3: Add highlight config to fullTextSearch**

In `rag-search.service.ts`, in the `fullTextSearch()` method, add to the OpenSearch request body:

```typescript
// Add highlight configuration for server-side snippet generation
...(highlight && {
  highlight: {
    fields: {
      content_ltks: { number_of_fragments: 1, fragment_size: 200 },
      title_tks: { number_of_fragments: 1, fragment_size: 100 },
    },
    pre_tags: ['<em>'],
    post_tags: ['</em>'],
  },
}),
```

In the response mapping, extract the highlight:

```typescript
// Extract highlight snippet from OpenSearch response
const highlightText = hit.highlight?.content_ltks?.[0]
  ?? hit.highlight?.title_tks?.[0]
  ?? null
```

Add `highlight: highlightText` to the returned chunk object.

- [ ] **Step 4: Add highlight config to semanticSearch and hybridSearch**

Same pattern as fullTextSearch — add highlight config to OpenSearch body, extract highlight from response hits, add to chunk objects.

- [ ] **Step 5: Add highlight parameter to the search() dispatcher method**

Ensure the `search()` method (which routes to fullText/semantic/hybrid) passes the `highlight` boolean through.

- [ ] **Step 6: Run tests**

```bash
cd be && npx vitest run tests/rag/rag-search.service.test.ts --reporter=verbose
```

Expected: PASS.

- [ ] **Step 7: Wire highlight into search.service.ts**

In `search.service.ts`, in `retrieveChunks()`, pass `highlight: true` to the rag search calls. In `executeSearch()`, ensure the chunk response includes `highlight` and `content_with_weight` fields.

- [ ] **Step 8: Verify build**

```bash
cd be && npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add be/src/modules/rag/services/rag-search.service.ts be/src/modules/search/services/search.service.ts be/tests/
git commit -m "feat(search): add OpenSearch highlight support for server-side snippets"
```

---

### Task 7: Extract Related Questions to Shared Service

**Files:**
- Create: `be/src/shared/services/related-questions.service.ts`
- Modify: `be/src/modules/search/services/search.service.ts`

- [ ] **Step 1: Write test for shared service**

Create `be/tests/shared/related-questions.service.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('RelatedQuestionsService', () => {
  it('should generate 3-5 related questions from query', async () => {
    // Mock llmClientService.chatCompletion to return newline-separated questions
    // Call generateRelatedQuestions(query, providerId)
    // Assert result is array of trimmed, non-empty strings
  })

  it('should return empty array when LLM returns empty response', async () => {
    // Mock empty response
    // Assert result is []
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd be && npx vitest run tests/shared/related-questions.service.test.ts --reporter=verbose
```

- [ ] **Step 3: Verify prompt file shape**

Read `be/src/shared/prompts/related-question.prompt.ts` and verify it exports an object with a `.system` property. If it uses a different shape (e.g., a plain string export), adapt the import in the service accordingly.

- [ ] **Step 4: Create the shared service**

Create `be/src/shared/services/related-questions.service.ts`:

```typescript
import { llmClientService } from './llm-client.service'
import { relatedQuestionPrompt } from '../prompts/related-question.prompt'

/**
 * @description Generates related follow-up questions from a search query using LLM.
 * Shared service used by both search and chat modules.
 */
class RelatedQuestionsService {
  /**
   * @description Generates 3-5 related questions based on the user's query
   * @param {string} query - The original search query
   * @param {string} [providerId] - Optional LLM provider ID
   * @returns {Promise<string[]>} Array of related question strings
   */
  async generateRelatedQuestions(
    query: string,
    providerId?: string
  ): Promise<string[]> {
    const response = await llmClientService.chatCompletion(
      [
        { role: 'system', content: relatedQuestionPrompt.system },
        { role: 'user', content: query },
      ],
      { providerId }
    )

    // Parse LLM response as newline-separated questions
    return response
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }
}

export const relatedQuestionsService = new RelatedQuestionsService()
```

- [ ] **Step 5: Update search.service.ts to use shared service**

Search for the private `generateRelatedQuestions()` method in `search.service.ts` (search by method name, not line number — file may have shifted from earlier edits). Replace it with the shared service:

```typescript
// Replace private method with shared service import
import { relatedQuestionsService } from '@shared/services/related-questions.service'

// In askSearch() and relatedQuestions() methods, replace:
//   this.generateRelatedQuestions(query, providerId)
// with:
//   relatedQuestionsService.generateRelatedQuestions(query, providerId)
```

Remove the private `generateRelatedQuestions()` method from the class.

- [ ] **Step 6: Run related-questions tests**

```bash
cd be && npx vitest run tests/shared/related-questions.service.test.ts --reporter=verbose
```

Expected: PASS.

- [ ] **Step 7: Verify build**

```bash
cd be && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add be/src/shared/services/related-questions.service.ts be/src/modules/search/services/search.service.ts be/tests/shared/
git commit -m "refactor(search): extract related questions to shared service"
```

**Note:** The spec lists `be/src/shared/services/highlight.service.ts` as a new shared file. This plan intentionally inlines the highlight config directly in `rag-search.service.ts` (Task 6) since it's a small object literal. If highlight config needs to be reused by other modules later, extract it then.

---

### Task 8: Search Controller — Avatar & Empty Response in CRUD

**Files:**
- Modify: `be/src/modules/search/controllers/search.controller.ts`
- Modify: `be/src/modules/search/services/search.service.ts`

- [ ] **Step 1: Update createSearchApp in service**

In `search.service.ts`, in `createSearchApp()`, ensure `avatar` and `empty_response` from the request body are passed through to the model insert.

- [ ] **Step 2: Update updateSearchApp in service**

Same for `updateSearchApp()` — pass `avatar` and `empty_response` through.

- [ ] **Step 3: Verify GET endpoints return new fields**

Check that `getSearchApp()` and `listSearchApps()` / `listAccessibleApps()` return the full row including `avatar` and `empty_response`. Since these use `SELECT *` or full column returns from the model, they should already include the new columns. Verify by reading the code.

- [ ] **Step 4: Verify build and run existing tests**

```bash
cd be && npx tsc --noEmit && npx vitest run tests/ --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add be/src/modules/search/
git commit -m "feat(search): pass avatar and empty_response through CRUD endpoints"
```

---

### Task 9: Embed Endpoints — Config, Search, Related Questions, Mindmap

**Files:**
- Modify: `be/src/modules/search/controllers/search-embed.controller.ts`
- Modify: `be/src/modules/search/routes/search-embed.routes.ts`

- [ ] **Step 1: Write tests for new embed endpoints**

Create or extend `be/tests/search/search-embed.controller.test.ts`:

```typescript
describe('Embed Endpoints', () => {
  describe('GET /api/search/embed/:token/config', () => {
    it('should return app config for valid token', async () => {
      // Mock token validation, mock search app retrieval
      // Assert response includes name, description, avatar, search_config
      // Assert sensitive fields (tavily_api_key) are stripped
    })

    it('should return 401 for invalid token', async () => {
      // Mock token validation failure
      // Assert 401 response
    })
  })

  describe('POST /api/search/embed/:token/search', () => {
    it('should return paginated search results for valid token', async () => {
      // Mock token, mock search execution
      // Assert paginated response shape
    })
  })

  describe('POST /api/search/embed/:token/related-questions', () => {
    it('should return related questions for valid token', async () => {
      // Mock token, mock LLM
      // Assert array of strings
    })
  })

  describe('POST /api/search/embed/:token/mindmap', () => {
    it('should return mindmap tree for valid token', async () => {
      // Mock token, mock mindmap generation
      // Assert tree structure
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd be && npx vitest run tests/search/search-embed.controller.test.ts --reporter=verbose
```

- [ ] **Step 3: Add getConfig handler to embed controller**

In `search-embed.controller.ts`, add after `getInfo()`:

```typescript
/**
 * @description Returns search app configuration for the share page.
 * Supersedes /info — returns full config without sensitive fields.
 * @param {Request} req - Request with :token param
 * @param {Response} res - Response with EmbedAppConfig
 */
async getConfig(req: Request, res: Response): Promise<void> {
  const { token } = req.params

  // Validate embed token
  const tokenRecord = await searchEmbedTokenService.validateToken(token)
  if (!tokenRecord) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  // Load search app
  const app = await searchService.getSearchApp(tokenRecord.app_id)
  if (!app) {
    res.status(404).json({ error: 'Search app not found' })
    return
  }

  // Strip sensitive fields using allowlist to prevent future API key leaks
  const fullConfig = app.search_config as Record<string, unknown>
  const ALLOWED_CONFIG_KEYS = [
    'search_method', 'top_k', 'similarity_threshold', 'vector_similarity_weight',
    'rerank_id', 'rerank_top_k', 'llm_id', 'llm_setting',
    'enable_summary', 'enable_related_questions', 'enable_mindmap',
    'highlight', 'keyword', 'use_kg', 'web_search', 'cross_languages',
    'metadata_filter',
  ]
  const config: Record<string, unknown> = {}
  for (const key of ALLOWED_CONFIG_KEYS) {
    if (key in fullConfig) config[key] = fullConfig[key]
  }

  res.json({
    name: app.name,
    description: app.description,
    avatar: app.avatar,
    empty_response: app.empty_response,
    search_config: config,
  })
}
```

- [ ] **Step 4: Add executeSearch handler to embed controller**

```typescript
/**
 * @description Non-streaming paginated search via embed token.
 * Used by share page for pages 2+.
 * @param {Request} req - Request with :token param and search body
 * @param {Response} res - Paginated search results
 */
async executeSearch(req: Request, res: Response): Promise<void> {
  const { token } = req.params

  const tokenRecord = await searchEmbedTokenService.validateToken(token)
  if (!tokenRecord) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  // Resolve tenantId from the search app's owner for proper tenant isolation
  const app = await searchService.getSearchApp(tokenRecord.app_id)
  if (!app) {
    res.status(404).json({ error: 'Search app not found' })
    return
  }
  const tenantId = app.created_by ?? ''

  const results = await searchService.executeSearch(
    tenantId,
    tokenRecord.app_id,
    req.body
  )

  res.json(results)
}
```

- [ ] **Step 5: Add relatedQuestions and mindmap handlers**

Follow the same token-validation + tenantId-resolution pattern as Steps 3-4. For each handler:
1. Validate token
2. Load search app to resolve tenantId (`app.created_by`)
3. Delegate to `searchService.relatedQuestions(tenantId, appId, req.body)` or `searchService.mindmap(tenantId, appId, req.body)`

- [ ] **Step 6: Register new routes**

In `search-embed.routes.ts`, add after the existing `/ask` route:

```typescript
// Embed config (supersedes /info, includes avatar + full config)
router.get(
  '/embed/:token/config',
  validate(embedTokenParamSchema),
  controller.getConfig.bind(controller)
)

// Non-streaming search for share page pagination
router.post(
  '/embed/:token/search',
  validate(embedSearchSchema),
  controller.executeSearch.bind(controller)
)

// Related questions via embed token
router.post(
  '/embed/:token/related-questions',
  validate(embedRelatedQuestionsSchema),
  controller.relatedQuestions.bind(controller)
)

// Mindmap via embed token
router.post(
  '/embed/:token/mindmap',
  validate(embedMindmapSchema),
  controller.mindmap.bind(controller)
)
```

- [ ] **Step 7: Run tests**

```bash
cd be && npx vitest run tests/search/ --reporter=verbose
```

Expected: PASS.

- [ ] **Step 8: Verify build**

```bash
cd be && npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add be/src/modules/search/controllers/search-embed.controller.ts be/src/modules/search/routes/search-embed.routes.ts be/tests/search/
git commit -m "feat(search): add embed config, search, related-questions, and mindmap endpoints"
```

---

## Chunk 3: Frontend Shared Components

### Task 10: EmojiPicker Component

**Files:**
- Create: `fe/src/components/EmojiPicker.tsx`

- [ ] **Step 1: Write test**

Create `fe/tests/components/EmojiPicker.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { EmojiPicker } from '@/components/EmojiPicker'

describe('EmojiPicker', () => {
  it('should render emoji grid', () => {
    render(<EmojiPicker value="" onChange={vi.fn()} />)
    expect(screen.getByText('📚')).toBeInTheDocument()
  })

  it('should call onChange when emoji clicked', () => {
    const onChange = vi.fn()
    render(<EmojiPicker value="" onChange={onChange} />)
    fireEvent.click(screen.getByText('🔍'))
    expect(onChange).toHaveBeenCalledWith('🔍')
  })

  it('should highlight selected emoji', () => {
    render(<EmojiPicker value="📚" onChange={vi.fn()} />)
    // Assert the 📚 button has selected styling (ring-2 class)
  })

  it('should support custom emoji via text input', () => {
    const onChange = vi.fn()
    render(<EmojiPicker value="" onChange={onChange} />)
    const input = screen.getByPlaceholderText(/custom/i)
    fireEvent.change(input, { target: { value: '🎯' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith('🎯')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd fe && npx vitest run tests/components/EmojiPicker.test.tsx --reporter=verbose
```

- [ ] **Step 3: Create EmojiPicker component**

Create `fe/src/components/EmojiPicker.tsx` with:
- A grid of ~50 curated knowledge/search-relevant emoji
- Click to select, visual ring highlight on selected
- Custom text input for arbitrary emoji
- Clear button when a value is selected

See the spec design section for the full component code. Key points:
- Use `cn()` for conditional class merging
- Use shadcn `Input` component for custom input
- Use `useTranslation()` for labels
- Grid: `grid-cols-10 gap-1` with `h-8 w-8` buttons

- [ ] **Step 4: Run test**

```bash
cd fe && npx vitest run tests/components/EmojiPicker.test.tsx --reporter=verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add fe/src/components/EmojiPicker.tsx fe/tests/components/EmojiPicker.test.tsx
git commit -m "feat(search): add EmojiPicker shared component"
```

---

### Task 11: ChunkContentDisplay Component

**Files:**
- Create: `fe/src/components/ChunkContentDisplay.tsx`

- [ ] **Step 1: Write test**

Create `fe/tests/components/ChunkContentDisplay.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { ChunkContentDisplay } from '@/components/ChunkContentDisplay'

describe('ChunkContentDisplay', () => {
  it('should render server-side highlight with em tags as yellow marks', () => {
    render(
      <ChunkContentDisplay
        highlight="...documents are <em>chunked</em> using recursive..."
        fullContent="Full content here"
      />
    )
    expect(screen.getByText(/chunked/)).toBeInTheDocument()
  })

  it('should fall back to client-side highlighting when no server highlight', () => {
    render(
      <ChunkContentDisplay
        fullContent="documents are chunked using recursive splitting"
        query="chunked"
      />
    )
    expect(screen.getByText(/chunked/)).toBeInTheDocument()
  })

  it('should toggle full content on click', () => {
    render(
      <ChunkContentDisplay
        highlight="Short snippet..."
        fullContent="Full content that is much longer and has more detail"
      />
    )
    expect(screen.queryByText(/Full content that is much longer/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText(/show full content/i))
    expect(screen.getByText(/Full content that is much longer/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd fe && npx vitest run tests/components/ChunkContentDisplay.test.tsx --reporter=verbose
```

- [ ] **Step 3: Create ChunkContentDisplay component**

Create `fe/src/components/ChunkContentDisplay.tsx` with:

- Props: `highlight?: string | null`, `fullContent: string`, `query?: string`, `defaultExpanded?: boolean`
- Collapsed state: renders `highlight` via DOMPurify-sanitized HTML (only `<em>` tags allowed), with CSS rule `[&>em]:bg-yellow-200 [&>em]:not-italic dark:[&>em]:bg-yellow-900/50`
- Fallback: uses `SearchHighlight` component for client-side highlighting when no server highlight
- Expand toggle: "Show full content" / "Hide full content" with chevron icons
- Expanded state: shows `fullContent` in a scrollable `max-h-[200px]` container with `bg-muted/50` background

**Security:** The `highlight` field is rendered via `dangerouslySetInnerHTML` but sanitized with `DOMPurify.sanitize(highlight, { ALLOWED_TAGS: ['em'] })` to prevent XSS. Only `<em>` tags from OpenSearch are allowed through.

- [ ] **Step 4: Run test**

```bash
cd fe && npx vitest run tests/components/ChunkContentDisplay.test.tsx --reporter=verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add fe/src/components/ChunkContentDisplay.tsx fe/tests/components/ChunkContentDisplay.test.tsx
git commit -m "feat(search): add ChunkContentDisplay shared component with highlight + expand"
```

---

## Chunk 4: Frontend Search Features

### Task 12: SearchResultCard — Use ChunkContentDisplay

**Files:**
- Modify: `fe/src/features/search/components/SearchResultCard.tsx`

- [ ] **Step 1: Replace SearchHighlight with ChunkContentDisplay**

In `SearchResultCard.tsx`, around line 175 where the snippet is rendered, replace the `<SearchHighlight>` usage with:

```tsx
<ChunkContentDisplay
  highlight={result.highlight}
  fullContent={result.content_with_weight ?? result.content ?? ''}
  query={query}
/>
```

Add the import at the top:

```tsx
import { ChunkContentDisplay } from '@/components/ChunkContentDisplay'
```

- [ ] **Step 2: Verify visually**

Run the dev server and search for something. Verify:
- Chunks with server-side highlights show `<em>` content with yellow marks
- "Show full content" toggle appears and works
- Chunks without highlights fall back to client-side SearchHighlight

```bash
npm run dev:fe
```

- [ ] **Step 3: Commit**

```bash
git add fe/src/features/search/components/SearchResultCard.tsx
git commit -m "feat(search): use ChunkContentDisplay in SearchResultCard for highlight + expand"
```

---

### Task 13: SearchAppConfig — Avatar & Empty Response Fields

**Files:**
- Modify: `fe/src/features/search/components/SearchAppConfig.tsx`

- [ ] **Step 1: Add avatar field to config dialog**

In `SearchAppConfig.tsx`, add in the "Basic" section (before or after the name field):

```tsx
{/* Avatar picker */}
<div className="space-y-2">
  <Label>{t('searchAdmin.avatar')}</Label>
  <EmojiPicker value={avatar} onChange={setAvatar} />
</div>
```

Add state: `const [avatar, setAvatar] = useState(editingApp?.avatar ?? '')`

Add import: `import { EmojiPicker } from '@/components/EmojiPicker'`

- [ ] **Step 2: Add empty_response field**

After the "Feature toggles" section, add:

```tsx
{/* Custom empty response */}
<div className="space-y-2">
  <Label>{t('searchAdmin.emptyResponse')}</Label>
  <p className="text-xs text-muted-foreground">{t('searchAdmin.emptyResponseDesc')}</p>
  <Textarea
    value={emptyResponse}
    onChange={(e) => setEmptyResponse(e.target.value)}
    placeholder={t('search.noResults')}
    rows={2}
  />
</div>
```

Add state: `const [emptyResponse, setEmptyResponse] = useState(editingApp?.empty_response ?? '')`

- [ ] **Step 3: Include new fields in save handler**

In `handleSave()`, add `avatar` and `empty_response` to the payload:

```typescript
const payload: CreateSearchAppPayload = {
  ...existingPayload,
  avatar: avatar || undefined,
  empty_response: emptyResponse || undefined,
}
```

- [ ] **Step 4: Initialize state from existing app on edit**

Ensure `avatar` and `emptyResponse` states are initialized from `editingApp` when editing.

- [ ] **Step 5: Verify build**

```bash
cd fe && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add fe/src/features/search/components/SearchAppConfig.tsx
git commit -m "feat(search): add avatar picker and empty response to SearchAppConfig dialog"
```

---

### Task 14: SearchPage — Avatar Display & Custom Empty Response

**Files:**
- Modify: `fe/src/features/search/pages/SearchPage.tsx`

- [ ] **Step 1: Add avatar to landing hero**

In `SearchPage.tsx`, in the empty search state block (around line 485), replace the default search icon with a conditional avatar:

```tsx
{currentApp?.avatar ? (
  <span className="text-5xl">{currentApp.avatar}</span>
) : (
  <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center">
    <Search className="h-10 w-10 text-primary" />
  </div>
)}
```

- [ ] **Step 2: Add avatar to compact search header**

When actively searching, show the avatar emoji next to the app name badge in the header bar.

- [ ] **Step 3: Custom empty response**

Find the no-results rendering. Replace static i18n fallback:

```tsx
const emptyMessage = currentApp?.empty_response ?? t('search.noResults')
```

- [ ] **Step 4: Verify visually**

```bash
npm run dev:fe
```

- [ ] **Step 5: Commit**

```bash
git add fe/src/features/search/pages/SearchPage.tsx
git commit -m "feat(search): display avatar on search home and support custom empty response"
```

---

### Task 15: SearchAppManagementPage — Avatar in Table

**Files:**
- Modify: `fe/src/features/search/pages/SearchAppManagementPage.tsx`

- [ ] **Step 1: Add avatar to table name column**

In the table row rendering, add avatar before app name:

```tsx
<td>
  <div className="flex items-center gap-2">
    {app.avatar && <span className="text-lg">{app.avatar}</span>}
    <span className="font-medium">{app.name}</span>
  </div>
</td>
```

- [ ] **Step 2: Verify visually**

```bash
npm run dev:fe
```

- [ ] **Step 3: Commit**

```bash
git add fe/src/features/search/pages/SearchAppManagementPage.tsx
git commit -m "feat(search): show avatar in search app management table"
```

---

### Task 16: SearchAppEmbedDialog — Iframe Code Generation

**Files:**
- Modify: `fe/src/features/search/components/SearchAppEmbedDialog.tsx`

- [ ] **Step 1: Enhance embed dialog with iframe code section**

Rewrite `SearchAppEmbedDialog.tsx` (currently 67 lines) to include:

1. Existing `EmbedTokenManager` (keep as-is)
2. New section: generated iframe code with live-updating URL based on options
3. Copy-to-clipboard button with visual feedback (checkmark)
4. Options: show avatar checkbox, show powered-by checkbox, locale selector dropdown
5. Selected token populates the iframe URL (replace `YOUR_TOKEN` placeholder)

Key implementation details:
- Compute iframe URL as a plain variable (no `useMemo` — React Compiler handles memoization per project convention)
- Iframe code template: `<iframe src="..." width="100%" height="600" frameborder="0" allow="clipboard-write"></iframe>`
- URL params: `?hide_avatar=true`, `?hide_powered_by=true`, `?locale=vi`
- Use `navigator.clipboard.writeText()` for copy with 2-second checkmark feedback

- [ ] **Step 2: Update EmbedTokenManager to support onTokenSelect callback**

If `EmbedTokenManager` doesn't expose a token selection callback, add `onTokenSelect?: (token: string) => void` prop.

- [ ] **Step 3: Verify build**

```bash
cd fe && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add fe/src/features/search/components/SearchAppEmbedDialog.tsx
git commit -m "feat(search): enhance embed dialog with iframe code generation and options"
```

---

### Task 17: SearchSharePage — Standalone Embed Page

**Files:**
- Create: `fe/src/features/search/pages/SearchSharePage.tsx`
- Create: `fe/src/features/search/api/searchEmbedApi.ts`
- Modify: `fe/src/app/routeConfig.ts`
- Modify: `fe/src/app/App.tsx`
- Modify: `fe/src/features/search/index.ts`

- [ ] **Step 1: Create embed API layer**

Create `fe/src/features/search/api/searchEmbedApi.ts` with methods:
- `getConfig(token)` → `GET /api/search/embed/:token/config`
- `askSearch(token, query, filters, signal)` → `POST /api/search/embed/:token/ask` (returns raw Response for SSE)
- `search(token, query, options)` → `POST /api/search/embed/:token/search`
- `fetchRelatedQuestions(token, query)` → `POST /api/search/embed/:token/related-questions`
- `fetchMindMap(token, query)` → `POST /api/search/embed/:token/mindmap`

All use token in URL path, no session headers.

- [ ] **Step 2: Add apiOverrides to useSearchStream hook**

Modify `fe/src/features/search/hooks/useSearchStream.ts` to accept an optional `apiOverrides` parameter:

```typescript
interface SearchStreamApiOverrides {
  askSearch: (query: string, filters: Record<string, unknown>, signal?: AbortSignal) => Promise<Response>
}

// Add to the hook's parameters:
export function useSearchStream(apiOverrides?: SearchStreamApiOverrides) {
  // In askSearch(), use apiOverrides.askSearch() if provided,
  // otherwise use the default searchApi.askSearch()
}
```

This allows the share page to inject embed API calls without changing the hook's SSE parsing logic.

- [ ] **Step 3: Write test for searchEmbedApi**

Create `fe/tests/features/search/searchEmbedApi.test.ts`:

```typescript
describe('searchEmbedApi', () => {
  it('should call correct URL for getConfig', async () => {
    // Mock fetch, call getConfig('abc123')
    // Assert URL is /api/search/embed/abc123/config
  })

  it('should call correct URL for askSearch', async () => {
    // Mock fetch, call askSearch('abc123', 'query', {})
    // Assert URL, method=POST, body includes query
  })
})
```

- [ ] **Step 4: Create SearchSharePage**

Create `fe/src/features/search/pages/SearchSharePage.tsx`:

Key implementation details:
- Extract `:token` from route params via `useParams()`
- Extract `locale`, `hide_avatar`, `hide_powered_by` from `useSearchParams()`
- On mount: call `searchEmbedApi.getConfig(token)`, show loading spinner, handle invalid token (show error page)
- Layout: minimal header (avatar + name + description + locale pills), `SearchBar`, `SearchResults`, `RelatedSearchQuestions`, `SearchMindMapDrawer`, optional "Powered by" footer
- Pass embed API functions to `useSearchStream` via `apiOverrides`
- No auth layout wrapper — standalone route outside the main app shell
- Code-split via `React.lazy()`

- [ ] **Step 5: Add route to routeConfig.ts**

```typescript
'/search/share/:token': {
  titleKey: 'pages.aiSearch.title',
  fullBleed: true,
  public: true,
},
```

- [ ] **Step 6: Add lazy route to App.tsx**

Add outside the authenticated layout:

```tsx
const SearchSharePage = lazy(() =>
  import('@/features/search/pages/SearchSharePage').then(m => ({ default: m.SearchSharePage }))
)

// In router, before catch-all, outside auth wrapper:
<Route path="/search/share/:token" element={<SearchSharePage />} />
```

- [ ] **Step 7: Update barrel export**

In `fe/src/features/search/index.ts`:

```typescript
export { SearchSharePage } from './pages/SearchSharePage'
export { searchEmbedApi } from './api/searchEmbedApi'
```

- [ ] **Step 8: Verify build**

```bash
cd fe && npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add fe/src/features/search/pages/SearchSharePage.tsx fe/src/features/search/api/searchEmbedApi.ts fe/src/features/search/hooks/useSearchStream.ts fe/tests/features/search/searchEmbedApi.test.ts fe/src/app/routeConfig.ts fe/src/app/App.tsx fe/src/features/search/index.ts
git commit -m "feat(search): add standalone share page for iframe embedding"
```

---

### Task 18: SearchResultDocDialog — Chunk Position Highlighting

**Files:**
- Modify: `fe/src/features/search/components/SearchResultDocDialog.tsx`

- [ ] **Step 1: Enhance header with chunk metadata**

Update header to show chunk info:

```tsx
{selectedChunk && (
  <span className="text-xs text-muted-foreground">
    {t('search.chunkLabel', { n: selectedChunkIndex + 1 })}
    {selectedChunk.page_num && ` · Page ${selectedChunk.page_num}`}
    {selectedChunk.score != null && ` · ${Math.round(selectedChunk.score * 100)}%`}
  </span>
)}
```

- [ ] **Step 2: Pass page number to DocumentPreviewer**

Read `fe/src/components/DocumentPreviewer/` to find the prop interface. Check if it accepts `initialPage`, `page`, or similar. Also check the `PdfPreview` component at `fe/src/components/DocumentPreviewer/previews/PdfPreview.tsx` for page navigation props. Then:

- If a page prop exists: pass `selectedChunk?.page_num`
- If no page prop exists: add an `initialPage?: number` prop to `DocumentPreviewer` and wire it through to `PdfPreview`'s page state initialization

The `selectedChunk` prop already exists on `DocumentPreviewer` — verify it's used for highlighting within the preview.

- [ ] **Step 3: Verify visually**

Click a search result → verify document preview shows chunk metadata in header.

- [ ] **Step 4: Commit**

```bash
git add fe/src/features/search/components/SearchResultDocDialog.tsx
git commit -m "feat(search): show chunk metadata in document preview header"
```

---

### Task 19: SearchMindMapDrawer — Phase Labels

**Files:**
- Modify: `fe/src/features/search/components/SearchMindMapDrawer.tsx`

- [ ] **Step 1: Add rotating phase labels**

In `SearchMindMapDrawer.tsx`, add a helper function:

```tsx
const getPhaseLabel = (progress: number): string => {
  if (progress < 30) return t('search.analyzingConcepts')
  if (progress < 60) return t('search.buildingRelationships')
  return t('search.organizingHierarchy')
}
```

In the loading state render, replace static text with:

```tsx
<span className="text-3xl">🧠</span>
<p className="text-sm font-medium">{t('search.generatingMindmap')}</p>
<Progress value={progress} className="h-1.5 [&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-purple-500" />
<p className="text-xs text-muted-foreground">{getPhaseLabel(progress)}</p>
```

- [ ] **Step 2: Verify visually**

Open mind map → verify phase labels rotate during progress.

- [ ] **Step 3: Commit**

```bash
git add fe/src/features/search/components/SearchMindMapDrawer.tsx
git commit -m "feat(search): add rotating phase labels to mind map progress"
```

---

### Task 20: Verify Related Questions End-to-End

**Files:**
- Verify: `be/src/modules/search/services/search.service.ts`
- Verify: `fe/src/features/search/hooks/useSearchStream.ts`
- Verify: `fe/src/features/search/components/SearchResults.tsx`

- [ ] **Step 1: Verify backend sends related_questions SSE event**

Search for `related_questions` in `search.service.ts`. In `askSearch()`, confirm that after summary generation, if `enable_related_questions` is true, the service calls `relatedQuestionsService.generateRelatedQuestions()` and includes the result in the final SSE event.

- [ ] **Step 2: Verify frontend parses and renders**

Search for `related_questions` in `useSearchStream.ts` — confirm it handles `data.related_questions`.
Search for `RelatedSearchQuestions` in `SearchResults.tsx` — confirm it renders the component.
Search in `SearchPage.tsx` — confirm it passes `relatedQuestions` and `onRelatedQuestionClick` props.

- [ ] **Step 3: Test end-to-end**

```bash
npm run dev
```

Create a search app with `enable_related_questions: true` and an LLM configured. Run a search and verify related questions appear below results.

- [ ] **Step 4: Fix any wiring issues found**

If any step is broken, fix it. Common issues: SSE event name mismatch, missing prop pass-through, config toggle not wired.

- [ ] **Step 5: Commit fixes (if any)**

```bash
git add be/src/modules/search/ fe/src/features/search/
git commit -m "fix(search): wire related questions end-to-end"
```

---

### Task 21: Verify Citation Popovers

**Files:**
- Verify: `fe/src/components/MarkdownRenderer.tsx`

- [ ] **Step 1: Verify MarkdownRenderer citation popovers are rich**

Search for `HoverCard` in `MarkdownRenderer.tsx`. Confirm the citation popovers show:
- Chunk content preview (sanitized with DOMPurify)
- Optional image thumbnail
- Document metadata (file icon, name, page, score)
- `onCitationClick` callback

- [ ] **Step 2: Verify reference data is passed through in SearchResults**

Check that `SearchResults.tsx` passes `reference={{ chunks: [...] }}` and `onCitationClick` to `MarkdownRenderer`. Verify chunk data includes `img_id`, `doc_name`, `page_num`, `score`.

- [ ] **Step 3: Test visually**

Search for something that generates a summary with citations. Hover over citation badges.

- [ ] **Step 4: Fix any missing data fields**

If popover data is incomplete, trace where fields are lost and add them.

- [ ] **Step 5: Commit fixes (if any)**

```bash
git add fe/src/features/search/ fe/src/components/MarkdownRenderer.tsx
git commit -m "fix(search): ensure citation popovers receive complete chunk data"
```

---

### Task 22: Frontend API Updates

**Files:**
- Modify: `fe/src/features/search/api/searchApi.ts`

- [ ] **Step 1: Verify createSearchApp and updateSearchApp pass new fields**

Check that `createSearchApp()` and `updateSearchApp()` in `searchApi.ts` use generic `apiClient.post/put` with the full payload body. If they manually pick fields, add `avatar` and `empty_response`.

- [ ] **Step 2: Verify build**

```bash
cd fe && npx tsc --noEmit
```

- [ ] **Step 3: Commit (if changes needed)**

```bash
git add fe/src/features/search/api/searchApi.ts
git commit -m "feat(search): pass avatar and empty_response through search API layer"
```

---

### Task 23: Final Integration Test

- [ ] **Step 1: Run full backend test suite**

```bash
cd be && npx vitest run --reporter=verbose
```

Expected: All tests pass.

- [ ] **Step 2: Run full frontend test suite**

```bash
cd fe && npx vitest run --reporter=verbose
```

Expected: All tests pass.

- [ ] **Step 3: Run full build**

```bash
npm run build
```

Expected: Clean build with no errors.

- [ ] **Step 4: Manual E2E verification**

Start the full dev stack and verify each gap:

1. **Avatar:** Create search app with emoji avatar → shows on landing, in table, in header
2. **Embed:** Open embed dialog → see iframe code with options → copy and test in standalone HTML file
3. **Highlights:** Search → chunks show server-side snippets with yellow marks → expand to full content
4. **Citations:** AI summary has citation badges → hover shows rich popover with chunk preview
5. **Doc preview:** Click chunk → document preview opens → shows chunk metadata in header
6. **Related questions:** After search → related question pills appear → click triggers new search
7. **Mind map:** Open mind map → progress bar with rotating phase labels → tree renders
8. **Empty response:** Configure custom no-results message → search for nonsense → custom message shows

- [ ] **Step 5: Final commit**

```bash
git add be/src/ fe/src/ fe/tests/
git commit -m "feat(search): complete search feature gaps — 8 UI/UX gaps closed"
```
