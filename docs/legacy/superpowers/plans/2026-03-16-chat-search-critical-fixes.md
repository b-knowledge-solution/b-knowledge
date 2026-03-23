# Chat & Search Critical Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 17 critical and important bugs across chat and search features — broken hybrid/semantic search, silently dropped overrides, field mismatches, response shape inconsistencies, and security issues.

**Architecture:** Fixes span 3 layers: (1) RAG search service — add query embedding + fix config access, (2) Chat/Search services — wire overrides, fix config keys, fix response shapes, (3) Frontend — fix type mismatches, reset stale refs, add missing pipeline statuses. Each task is scoped to one logical bug.

**Tech Stack:** Node.js / Express / TypeScript / Knex / OpenSearch / React 19 / TanStack Query

**Excluded:** I1 (concurrent stream guard) — planned for LiteLLM integration.

---

## File Map

| # | File | Action | Tasks |
|---|------|--------|-------|
| 1 | `be/src/shared/config/index.ts` | Modify | T1 |
| 2 | `be/src/modules/rag/services/rag-search.service.ts` | Modify | T1, T2 |
| 3 | `be/src/modules/chat/services/chat-conversation.service.ts` | Modify | T2, T3, T4, T8 |
| 4 | `be/src/modules/search/services/search.service.ts` | Modify | T5, T6, T7, T9, T10 |
| 5 | `be/src/modules/search/controllers/search.controller.ts` | Modify | T11 |
| 6 | `be/src/shared/models/types.ts` | Modify | T12 |
| 7 | `fe/src/features/chat/hooks/useChatStream.ts` | Modify | T13, T14 |
| 8 | `fe/src/features/search/types/search.types.ts` | Modify | T12 |
| 9 | `fe/src/features/search/api/searchApi.ts` | Modify | T11 |
| 10 | `fe/src/features/chat/pages/ChatPage.tsx` | Modify | T15 |

---

## Chunk 1: RAG Search Foundation (Embedding + Config)

### Task 1 (C3): Replace `process.env` with `config` object in rag-search.service.ts

**Files:**
- Modify: `be/src/shared/config/index.ts` — add `opensearch` section
- Modify: `be/src/modules/rag/services/rag-search.service.ts:13-15` — use config

**Why:** `be/CLAUDE.md` rule: "Config access only through `config` object, never `process.env`."

- [ ] **Step 1: Add opensearch config fields**

In `be/src/shared/config/index.ts`, add inside the config object (before the closing `} as const`):

```typescript
  /** OpenSearch / VectorDB configuration */
  opensearch: {
    host: process.env['VECTORDB_HOST'] || process.env['ES_HOST'] || 'http://localhost:9200',
    password: process.env['VECTORDB_PASSWORD'] || process.env['ES_PASSWORD'] || '',
    systemTenantId: process.env['SYSTEM_TENANT_ID'] || '00000000-0000-0000-0000-000000000001',
  },
```

- [ ] **Step 2: Update rag-search.service.ts to use config**

Replace lines 13-15:
```typescript
// Before:
const SYSTEM_TENANT_ID = process.env['SYSTEM_TENANT_ID'] || '...'
const ES_HOST = process.env['ES_HOST'] || 'http://localhost:9200'
const ES_PASSWORD = process.env['ES_PASSWORD'] || ''

// After:
import { config } from '@/shared/config/index.js'
const SYSTEM_TENANT_ID = config.opensearch.systemTenantId
const ES_HOST = config.opensearch.host
const ES_PASSWORD = config.opensearch.password
```

- [ ] **Step 3: Verify**

Run: `cd be && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add be/src/shared/config/index.ts be/src/modules/rag/services/rag-search.service.ts
git commit -m "fix(rag): replace process.env with config object in rag-search.service"
```

---

### Task 2 (C1): Add query embedding step for hybrid/semantic search

**Files:**
- Modify: `be/src/modules/rag/services/rag-search.service.ts:171-200` — accept embedding in search dispatcher
- Modify: `be/src/modules/chat/services/chat-conversation.service.ts:767-777` — embed query before retrieval
- Modify: `be/src/modules/search/services/search.service.ts` — embed query in `retrieveChunks` and `executeSearch`

**Why:** The `search()` method receives no `queryVector`, so `hybridSearch` and `semanticSearch` always fall back to full-text only. RAGFlow always embeds the query before retrieval. The `llmClientService.embedTexts()` method already exists at `be/src/shared/services/llm-client.service.ts:291`.

- [ ] **Step 1: Add embedding helper to search service**

In `be/src/modules/search/services/search.service.ts`, add a private helper:

```typescript
  /**
   * Embed a query string for semantic/hybrid search.
   * Returns null if no embedding model is configured or embedding fails.
   * @param query - Query text to embed
   * @param providerId - Optional embedding provider ID override
   * @returns Query vector or null
   */
  private async embedQuery(query: string, providerId?: string): Promise<number[] | null> {
    try {
      const vectors = await llmClientService.embedTexts([query], providerId)
      return vectors[0] ?? null
    } catch (err) {
      log.warn('Query embedding failed, falling back to full-text search', { error: (err as Error).message })
      return null
    }
  }
```

Add the import at the top:
```typescript
import { llmClientService } from '@/shared/services/llm-client.service.js'
```

- [ ] **Step 2: Pass queryVector in `retrieveChunks`**

In the `retrieveChunks` method, after the method/threshold/vectorWeight setup, embed the query and pass it to `ragSearchService.search()`:

```typescript
// Embed query for semantic/hybrid search
let queryVector: number[] | null = null
if (method !== 'full_text') {
  queryVector = await this.embedQuery(query)
}

// Search across all datasets and merge results
const allChunks: ChunkResult[] = []
let totalHits = 0
for (const datasetId of datasetIds) {
  const result = await ragSearchService.search(
    datasetId,
    { query, top_k: topK, method, similarity_threshold: similarityThreshold,
      ...(vectorSimilarityWeight != null && { vector_similarity_weight: vectorSimilarityWeight }) },
    queryVector,
  )
  // ...rest stays same
```

- [ ] **Step 3: Pass queryVector in `executeSearch`**

Same pattern — embed query before the dataset loop:

```typescript
// Embed query for semantic/hybrid search
let queryVector: number[] | null = null
if (method !== 'full_text') {
  queryVector = await this.embedQuery(query)
}

// Search across all datasets and merge results
for (const datasetId of datasetIds) {
  const result = await ragSearchService.search(datasetId, searchReq, queryVector)
  // ...
```

- [ ] **Step 4: Embed query in chat pipeline**

In `be/src/modules/chat/services/chat-conversation.service.ts`, before the retrieval loop (around line 767), add:

```typescript
// Embed the search query for semantic/hybrid retrieval
let queryVector: number[] | null = null
try {
  const vectors = await llmClientService.embedTexts([searchQuery], undefined, trace ? langfuseTraceService.createSpan(trace, { name: 'query-embedding' }) : undefined)
  queryVector = vectors[0] ?? null
} catch (err) {
  log.warn('Query embedding failed, falling back to full-text', { error: String(err) })
}
```

Then update the `ragSearchService.search()` call inside the retrieval loop to pass `queryVector`:

```typescript
ragSearchService.search(kbId, {
  query: searchQuery,
  method: 'hybrid',
  top_k: topN * 2,
  similarity_threshold: cfg.similarity_threshold ?? 0.2,
  vector_similarity_weight: cfg.vector_similarity_weight,
}, queryVector)
```

Make sure `llmClientService` and `langfuseTraceService` are already imported (they should be).

- [ ] **Step 5: Verify**

Run: `cd be && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add be/src/modules/rag/services/rag-search.service.ts be/src/modules/chat/services/chat-conversation.service.ts be/src/modules/search/services/search.service.ts
git commit -m "feat(rag): add query embedding step for hybrid/semantic search"
```

---

## Chunk 2: Chat Service Fixes (Overrides + Double res.end)

### Task 3 (C2): Wire `overrides` parameter in chat streamChat

**Files:**
- Modify: `be/src/modules/chat/services/chat-conversation.service.ts:609,645-661`

**Why:** The `overrides` param (variables, file_ids, reasoning, temperature, llm_id) is accepted but never used. Frontend settings have zero effect.

- [ ] **Step 1: Apply overrides to pipeline config**

After `cfg` is loaded (around line 660), add override application:

```typescript
const cfg: PromptConfig = (assistant?.prompt_config || {}) as PromptConfig

// Apply per-request overrides from the client
const providerId = overrides?.llm_id || assistant?.llm_id || undefined
const topN = overrides?.top_n ?? cfg.top_n ?? 6
const kbIds = assistant?.kb_ids || []
const effectiveTemperature = overrides?.temperature ?? cfg.temperature ?? 0.7
const effectiveMaxTokens = overrides?.max_tokens ?? cfg.max_tokens
const useReasoning = overrides?.reasoning ?? cfg.reasoning ?? false
const useInternet = overrides?.use_internet ?? (cfg.tavily_api_key ? true : false)
const variableValues: Record<string, string> = overrides?.variables ?? {}
const fileIds: string[] = overrides?.file_ids ?? []
```

Remove the existing `const providerId = assistant?.llm_id || undefined` and `const topN = cfg.top_n ?? 6` lines to avoid duplication.

- [ ] **Step 2: Use effectiveTemperature and effectiveMaxTokens in LLM call**

Find the `chatCompletionStream` call (around line 935-945) and replace:

```typescript
// Before:
temperature: cfg.temperature ?? 0.7,
max_tokens: cfg.max_tokens,

// After:
temperature: effectiveTemperature,
max_tokens: effectiveMaxTokens,
```

- [ ] **Step 3: Apply variable substitution in system prompt**

After the system prompt is built, apply variable substitution:

```typescript
// Apply variable substitution to system prompt
let finalSystemPrompt = systemPrompt
for (const [key, value] of Object.entries(variableValues)) {
  finalSystemPrompt = finalSystemPrompt.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
}
```

Use `finalSystemPrompt` instead of `systemPrompt` in the LLM messages.

- [ ] **Step 4: Verify**

Run: `cd be && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add be/src/modules/chat/services/chat-conversation.service.ts
git commit -m "fix(chat): wire overrides parameter for variables, temperature, llm_id, reasoning"
```

---

### Task 4 (C4): Fix double `res.end()` in early-exit paths

**Files:**
- Modify: `be/src/modules/chat/services/chat-conversation.service.ts:748,890,1046`

**Why:** SQL path (line 748) and empty-response path (line 890) call `res.end()` before returning. The `finally` block (line 1046) calls `res.end()` again, causing write-after-end errors.

- [ ] **Step 1: Guard the finally block**

Replace the `finally` block at line 1046:

```typescript
// Before:
} finally {
  res.end()
}

// After:
} finally {
  if (!res.writableEnded) {
    res.end()
  }
}
```

- [ ] **Step 2: Verify**

Run: `cd be && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add be/src/modules/chat/services/chat-conversation.service.ts
git commit -m "fix(chat): guard res.end() in finally block to prevent write-after-end"
```

---

## Chunk 3: Search Service Fixes (Config Keys + Response Shapes)

### Task 5 (C5): Fix temperature read from wrong config path

**Files:**
- Modify: `be/src/modules/search/services/search.service.ts:544`

**Why:** Temperature is nested inside `llm_setting` in the schema, but read from top-level `searchConfig.temperature`.

- [ ] **Step 1: Fix temperature read**

```typescript
// Before (line 544):
temperature: (searchConfig?.temperature as number) ?? 0.7,

// After:
temperature: ((searchConfig?.llm_setting as any)?.temperature as number) ?? 0.7,
```

Also fix `max_tokens` if used similarly — check nearby lines for `max_tokens` and apply same pattern.

- [ ] **Step 2: Verify**

Run: `cd be && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add be/src/modules/search/services/search.service.ts
git commit -m "fix(search): read temperature from llm_setting nested path"
```

---

### Task 6 (C6): Fix `related_search` config key → `enable_related_questions`

**Files:**
- Modify: `be/src/modules/search/services/search.service.ts:567`

**Why:** `searchConfig?.related_search` is checked but no such key exists. The FE type uses `enable_related_questions`.

- [ ] **Step 1: Fix config key**

```typescript
// Before (line 567):
if (searchConfig?.related_search) {

// After:
if (searchConfig?.enable_related_questions) {
```

- [ ] **Step 2: Verify**

Run: `cd be && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add be/src/modules/search/services/search.service.ts
git commit -m "fix(search): use enable_related_questions config key for related question generation"
```

---

### Task 7 (C8): Fix `listAccessibleApps` inconsistent return shapes

**Files:**
- Modify: `be/src/modules/search/services/search.service.ts:119-167`

**Why:** Admin path returns bare `SearchApp[]`, non-admin non-paginated path returns unawaited Knex query builder. FE expects `{ data, total }`.

- [ ] **Step 1: Rewrite `listAccessibleApps` for consistent response**

```typescript
async listAccessibleApps(
  userId: string,
  userRole: string,
  teamIds: string[],
  options?: { page?: number; pageSize?: number; search?: string; sortBy?: string; sortOrder?: string }
): Promise<{ data: SearchApp[]; total: number }> {
  const page = options?.page ?? 1
  const pageSize = options?.pageSize ?? 20
  const sortBy = options?.sortBy || 'created_at'
  const sortOrder = options?.sortOrder || 'desc'

  // Build base query
  let baseQuery = ModelFactory.searchApp.getKnex()

  // RBAC filter: admins see all, others see own + public + shared
  if (userRole !== 'admin' && userRole !== 'superadmin') {
    const accessibleIds = await ModelFactory.searchAppAccess.findAccessibleAppIds(userId, teamIds)
    baseQuery = baseQuery.where(function (this: any) {
      this.where('created_by', userId)
      this.orWhere('is_public', true)
      if (accessibleIds.length > 0) {
        this.orWhereIn('id', accessibleIds)
      }
    })
  }

  // Apply search filter
  if (options?.search) {
    baseQuery = baseQuery.where(function (this: any) {
      this.where('name', 'ilike', `%${options!.search}%`)
        .orWhere('description', 'ilike', `%${options!.search}%`)
    })
  }

  // Count total before pagination
  const countResult = await baseQuery.clone().clearSelect().clearOrder().count('* as count').first()
  const total = Number((countResult as any)?.count || 0)

  // Apply sort and pagination
  const data = await baseQuery
    .orderBy(sortBy, sortOrder)
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return { data, total }
}
```

- [ ] **Step 2: Verify**

Run: `cd be && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add be/src/modules/search/services/search.service.ts
git commit -m "fix(search): make listAccessibleApps return consistent {data,total} for all roles"
```

---

### Task 8 (I3): Fix deleteConversations ownership check order

**Files:**
- Modify: `be/src/modules/chat/services/chat-conversation.service.ts:508-531`

**Why:** Messages are deleted before verifying conversation ownership. An attacker knowing a conversation ID can destroy another user's messages.

- [ ] **Step 1: Verify ownership before deleting messages**

```typescript
async deleteConversations(
  conversationIds: string[],
  userId: string
): Promise<number> {
  // First, filter to only conversations owned by the user
  const ownedIds = await ModelFactory.chatSession.getKnex()
    .whereIn('id', conversationIds)
    .andWhere('user_id', userId)
    .pluck('id')

  if (ownedIds.length === 0) return 0

  // Delete messages only for owned conversations
  await ModelFactory.chatMessage.getKnex()
    .whereIn('session_id', ownedIds)
    .delete()

  // Delete the sessions
  const deleted = await ModelFactory.chatSession.getKnex()
    .whereIn('id', ownedIds)
    .delete()

  log.info('Conversations deleted', { count: deleted, userId })
  return deleted
}
```

- [ ] **Step 2: Verify**

Run: `cd be && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add be/src/modules/chat/services/chat-conversation.service.ts
git commit -m "fix(chat): verify conversation ownership before deleting messages"
```

---

## Chunk 4: Field Mismatch Fixes (BE ↔ FE Type Alignment)

### Task 9 (C7): Fix chunk field name mismatch — BE `text` vs FE `content`/`content_with_weight`

**Files:**
- Modify: `be/src/modules/search/services/search.service.ts` — map `text` → `content` in SSE and REST responses
- Modify: `be/src/shared/models/types.ts` — add `content` and `content_with_weight` aliases to ChunkResult

**Why:** `rag-search.service.ts:mapHits` maps OpenSearch `content_with_weight` to `ChunkResult.text`. FE `SearchResult` expects `content` and `content_with_weight`. The SSE reference event sends `text` which is `undefined` on the FE.

- [ ] **Step 1: Add content aliases in chunk mapping**

In `search.service.ts`, update `askSearch` where reference chunks are built (around line 515):

```typescript
// Before:
const reference = {
  chunks: chunks.map((c, i) => ({ ...c, chunk_id: c.chunk_id, id: i })),

// After:
const reference = {
  chunks: chunks.map((c, i) => ({
    ...c,
    chunk_id: c.chunk_id,
    id: i,
    content: c.text,
    content_with_weight: c.text,
  })),
```

- [ ] **Step 2: Same fix in `executeSearch` response**

In `executeSearch`, before returning:

```typescript
const mappedChunks = limited.map((c: any) => ({
  ...c,
  content: c.text,
  content_with_weight: c.text,
}))
return { chunks: mappedChunks, total: totalHits, doc_aggs: this.buildDocAggs(limited) }
```

- [ ] **Step 3: Same fix in `retrievalTest` response**

In `retrievalTest`:

```typescript
return {
  chunks: chunks.map((c, i) => ({
    ...c,
    chunk_id: c.chunk_id,
    id: i,
    content: c.text,
    content_with_weight: c.text,
  })),
  doc_aggs: this.buildDocAggs(chunks),
  total,
}
```

- [ ] **Step 4: Also fix in chat service `buildReference`**

In `chat-conversation.service.ts`, in the `buildReference` function (around line 400-412), add `content` and `content_with_weight` to the chunk mapping:

```typescript
chunks: chunks.map((c, i) => ({
  chunk_id: c.chunk_id,
  content_with_weight: c.text,
  content: c.text,
  // ... rest of existing fields
```

- [ ] **Step 5: Verify**

Run: `cd be && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add be/src/modules/search/services/search.service.ts be/src/modules/chat/services/chat-conversation.service.ts
git commit -m "fix(search,chat): map chunk text field to content/content_with_weight for FE compatibility"
```

---

### Task 10 (I2): Refactor `executeSearch` to use `retrieveChunks` (apply reranking)

**Files:**
- Modify: `be/src/modules/search/services/search.service.ts:288-347`

**Why:** `executeSearch` calls `ragSearchService.search()` directly, bypassing `retrieveChunks` which applies reranking. Page 2+ results have different ranking than page 1.

- [ ] **Step 1: Refactor `executeSearch` to use `retrieveChunks`**

```typescript
async executeSearch(
  searchId: string,
  query: string,
  options?: {
    topK?: number
    method?: 'full_text' | 'semantic' | 'hybrid'
    similarityThreshold?: number
    vectorSimilarityWeight?: number
    page?: number
    pageSize?: number
  }
): Promise<{ chunks: any[]; total: number; doc_aggs: { doc_id: string; doc_name: string; count: number }[] }> {
  const app = await ModelFactory.searchApp.findById(searchId)
  if (!app) throw new Error('Search app not found')

  const topK = options?.topK ?? 10
  const method = options?.method ?? 'full_text'
  const similarityThreshold = options?.similarityThreshold ?? 0
  const vectorSimilarityWeight = options?.vectorSimilarityWeight

  // Use shared retrieveChunks (applies reranking if configured)
  const { chunks: allChunks, total: totalHits } = await this.retrieveChunks(
    app, query, topK, method, similarityThreshold, vectorSimilarityWeight,
  )

  // Apply pagination
  let limited = allChunks
  if (options?.page && options?.pageSize) {
    const start = (options.page - 1) * options.pageSize
    limited = allChunks.slice(start, start + options.pageSize)
  }

  // Map content fields for FE compatibility
  const mappedChunks = limited.map((c: any) => ({
    ...c,
    content: c.text,
    content_with_weight: c.text,
  }))

  return { chunks: mappedChunks, total: totalHits, doc_aggs: this.buildDocAggs(limited) }
}
```

- [ ] **Step 2: Verify**

Run: `cd be && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add be/src/modules/search/services/search.service.ts
git commit -m "refactor(search): executeSearch uses retrieveChunks for consistent reranking"
```

---

### Task 11 (I5): Fix mindmap response shape mismatch

**Files:**
- Modify: `be/src/modules/search/controllers/search.controller.ts:264-280`

**Why:** Backend returns `{ name, children }`, frontend expects `{ mindmap: any }`.

- [ ] **Step 1: Wrap response in `{ mindmap }` in controller**

```typescript
// Before (line 268):
res.json(tree)

// After:
res.json({ mindmap: tree })
```

- [ ] **Step 2: Verify**

Run: `cd be && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add be/src/modules/search/controllers/search.controller.ts
git commit -m "fix(search): wrap mindmap response in {mindmap} to match FE type"
```

---

### Task 12 (I6): Fix `page_num` type mismatch — BE `number[]` vs FE `number`

**Files:**
- Modify: `fe/src/features/search/types/search.types.ts:25-26`

**Why:** Backend sends `page_num: number[]` (array of page numbers from OpenSearch). FE types it as `number` (scalar). Same for `position`.

- [ ] **Step 1: Update FE types to match BE**

In `fe/src/features/search/types/search.types.ts`:

```typescript
// Before:
/** Page number in the document */
page_num: number
/** Position within the page */
position: number

// After:
/** Page number(s) in the document */
page_num: number | number[]
/** Position within the page */
position: number | number[]
```

Also update `RetrievalTestChunk`:
```typescript
// Before:
page_num: number

// After:
page_num: number | number[]
```

- [ ] **Step 2: Check callers**

Search for `page_num` usage in FE components and ensure they handle both array and scalar. Use `Array.isArray(r.page_num) ? r.page_num[0] : r.page_num` where a scalar is needed (e.g., `SearchPage.tsx:buildReference`).

- [ ] **Step 3: Verify**

Run: `cd fe && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add fe/src/features/search/types/search.types.ts
git commit -m "fix(search): align page_num type with backend number[] format"
```

---

## Chunk 5: Frontend Fixes (Stale Refs + Pipeline Status + Conversation Switch)

### Task 13 (C9): Reset `referencesRef.current` at start of `sendMessage`

**Files:**
- Modify: `fe/src/features/chat/hooks/useChatStream.ts:132`

**Why:** `referencesRef.current` is not cleared when starting a new message. If the new response has no citations, stale refs from the previous answer leak into the new message.

- [ ] **Step 1: Add reset**

After `answerRef.current = ''` (line 132), add:

```typescript
referencesRef.current = null
```

- [ ] **Step 2: Verify**

Run: `cd fe && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add fe/src/features/chat/hooks/useChatStream.ts
git commit -m "fix(chat): reset referencesRef at start of sendMessage to prevent stale citations"
```

---

### Task 14 (I8): Add missing `PipelineStatus` values

**Files:**
- Modify: `fe/src/features/chat/hooks/useChatStream.ts:24-30`

**Why:** Backend emits `deep_research` and `searching_knowledge_graph` statuses, but the FE type union only has 5 values. These are silently cast with no UI match.

- [ ] **Step 1: Add missing values to union**

```typescript
// Before:
export type PipelineStatus =
  | 'refining_question'
  | 'retrieving'
  | 'searching_web'
  | 'reranking'
  | 'generating'

// After:
export type PipelineStatus =
  | 'refining_question'
  | 'retrieving'
  | 'searching_web'
  | 'searching_knowledge_graph'
  | 'reranking'
  | 'generating'
  | 'deep_research'
  | 'embedding'
```

- [ ] **Step 2: Verify**

Run: `cd fe && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add fe/src/features/chat/hooks/useChatStream.ts
git commit -m "fix(chat): add missing pipeline status values for deep_research and knowledge_graph"
```

---

### Task 15 (I9): Guard conversation switch during active streaming

**Files:**
- Modify: `fe/src/features/chat/pages/ChatPage.tsx:93-102`

**Why:** If user switches conversations while streaming, `stream.setMessages()` overwrites the in-flight stream's state. The old stream's AbortController is orphaned.

- [ ] **Step 1: Abort active stream before loading new conversation**

In the conversation-loading `useEffect`:

```typescript
useEffect(() => {
  // Abort any in-flight stream when switching conversations
  if (stream.isStreaming) {
    stream.stopStream()
  }

  const conv = conversations.activeConversation
  if (conv?.messages) {
    stream.setMessages(conv.messages)
  } else {
    stream.clearMessages()
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [conversations.activeConversation?.id])
```

- [ ] **Step 2: Verify**

Run: `cd fe && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add fe/src/features/chat/pages/ChatPage.tsx
git commit -m "fix(chat): abort active stream before switching conversations"
```

---

### Task 16 (I4): Pass `metadata_filter` through to retrieval

**Files:**
- Modify: `be/src/modules/search/services/search.service.ts` — `retrieveChunks` and `askSearch`
- Modify: `be/src/modules/rag/services/rag-search.service.ts` — apply filter in OpenSearch query

**Why:** `askSearchSchema` accepts `metadata_filter` but it's never forwarded to OpenSearch queries.

- [ ] **Step 1: Add `metadataFilter` param to `retrieveChunks`**

Add a 7th optional parameter:
```typescript
private async retrieveChunks(
  app: SearchApp,
  query: string,
  topK: number = 10,
  method: 'full_text' | 'semantic' | 'hybrid' = 'full_text',
  similarityThreshold: number = 0,
  vectorSimilarityWeight?: number,
  metadataFilter?: { logic: string; conditions: Array<{ name: string; comparison_operator: string; value: unknown }> },
)
```

Pass it to `ragSearchService.search()`:
```typescript
const result = await ragSearchService.search(
  datasetId,
  { query, top_k: topK, method, similarity_threshold: similarityThreshold,
    ...(vectorSimilarityWeight != null && { vector_similarity_weight: vectorSimilarityWeight }),
    ...(metadataFilter && { metadata_filter: metadataFilter }),
  },
  queryVector,
)
```

- [ ] **Step 2: Pass metadata_filter from `askSearch`**

In `askSearch`, destructure and forward:
```typescript
const { query, top_k = 10, method = 'full_text', similarity_threshold = 0, vector_similarity_weight, metadata_filter } = params
// ...
const { chunks, total } = await this.retrieveChunks(app, query, top_k, method, similarity_threshold, vector_similarity_weight, metadata_filter)
```

- [ ] **Step 3: Apply metadata_filter in rag-search.service.ts**

In the `search()` method dispatcher, build additional OpenSearch filter clauses from `req.metadata_filter` and add them to each search method's bool query. This requires modifying `fullTextSearch`, `semanticSearch`, and `hybridSearch` to accept and apply an optional filter array.

For each search method, add `metadataFilter` conditions to the `bool.filter` array:

```typescript
const extraFilters = this.buildMetadataFilters(req.metadata_filter)
// Merge into existing filter array
filter: [
  { term: { available_int: 1 } },
  ...extraFilters,
],
```

Add a helper:
```typescript
private buildMetadataFilters(filter?: SearchRequest['metadata_filter']): Record<string, unknown>[] {
  if (!filter?.conditions?.length) return []
  return filter.conditions.map(c => {
    switch (c.comparison_operator) {
      case 'is': return { term: { [c.name]: c.value } }
      case 'is_not': return { bool: { must_not: [{ term: { [c.name]: c.value } }] } }
      case 'contains': return { match: { [c.name]: c.value } }
      case 'gt': return { range: { [c.name]: { gt: c.value } } }
      case 'lt': return { range: { [c.name]: { lt: c.value } } }
      case 'range': return { range: { [c.name]: { gte: (c.value as any[])[0], lte: (c.value as any[])[1] } } }
      default: return {}
    }
  }).filter(f => Object.keys(f).length > 0)
}
```

- [ ] **Step 4: Verify**

Run: `cd be && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add be/src/modules/search/services/search.service.ts be/src/modules/rag/services/rag-search.service.ts
git commit -m "feat(search): forward metadata_filter to OpenSearch queries"
```

---

### Task 17 (I7): Fix admin `listAccessibleApps` ignoring pagination/search/sort

**Why:** Already fixed in Task 7 — the rewrite applies pagination/search/sort for all roles including admin. No separate task needed.

---

## Task Dependency Graph

```
Task 1 (config) ──────────┐
                           ├── Task 2 (embedding) depends on Task 1
Task 3 (overrides)  ───────┤── Independent
Task 4 (res.end)    ───────┤── Independent
Task 5 (temperature)───────┤── Independent
Task 6 (related_q)  ───────┤── Independent
Task 7 (listApps)   ───────┤── Independent
Task 8 (deleteConv)  ──────┤── Independent
Task 9 (field names) ──────┤── Independent
Task 10 (executeSearch) ───┤── Depends on Task 2 (uses retrieveChunks with embedding)
Task 11 (mindmap)    ──────┤── Independent
Task 12 (page_num)   ──────┤── Independent (FE only)
Task 13 (stale ref)  ──────┤── Independent (FE only)
Task 14 (pipeline)   ──────┤── Independent (FE only)
Task 15 (conv switch)──────┤── Independent (FE only)
Task 16 (metadata)   ──────┘── Depends on Task 2 (adds to retrieveChunks)
```

**Recommended execution waves:**

**Wave 1 (all independent):** Tasks 1, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15
**Wave 2 (depends on Wave 1):** Tasks 2, 10, 16
