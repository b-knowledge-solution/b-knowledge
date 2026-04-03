# SQL Fallback, Tag-Based Rank Boosting, Spotlight — Design Spec

## Overview

Three features to enhance B-Knowledge's search and chat:

1. **SQL Fallback for Structured Data** — Detect field-mapped datasets, generate OpenSearch SQL via LLM, return Markdown tables with citations. Falls back to vector search on failure. Works in both search and chat.
2. **Tag-Based Rank Boosting** — Score chunks by cosine similarity between query-relevant tags and chunk tags, boosting search relevance for tag-rich datasets.
3. **Spotlight Effect** — Theme-aware radial gradient spotlight on search landing page.

**Architecture constraints (per user):**
- User-facing search page: search input + app selector only. ZERO config UI.
- Admin creates/configures search apps in Agent Studio admin pages.
- Field map editor lives in dataset settings (admin-only).
- RBAC enforced throughout.

## 1. SQL Fallback for Structured Data

### 1a. Field Map Storage

Field map lives in existing `datasets.parser_config` JSONB column:

```typescript
interface FieldMapEntry {
  type: 'text' | 'integer' | 'float' | 'date' | 'keyword'
  description?: string       // helps LLM generate better SQL
  column_name: string        // actual OpenSearch field name (e.g. "product_name_tks")
}

// In parser_config:
{
  // ...existing parser config fields
  field_map?: Record<string, FieldMapEntry>
}
```

No new DB migration needed — `field_map` is stored inside existing JSONB.

### 1b. Auto-Detection from Table Parser

When a dataset uses the `table` parser (Excel/CSV), after parsing completes:
1. Read the first chunk's metadata to extract column headers
2. Infer types from values (number to `integer`/`float`, date patterns to `date`, else `text`)
3. Generate `field_map` with OpenSearch field names (column headers tokenized to `{name}_tks` for text, `{name}_int` for integers, etc.)
4. Store in `parser_config.field_map`
5. Admin can view/edit in dataset settings

A "Generate field map" button in dataset settings triggers this for existing datasets.

### 1c. SQL Retrieval Service

**New file:** `be/src/shared/services/sql-retrieval.service.ts`

Singleton service with the following pipeline:

```
trySqlRetrieval(tenantId, datasetIds, query, llmProviderId?)
  -> getFieldMap(datasetIds)        // returns null if no field_map -> skip
  -> buildSqlPrompt(fieldMap, ...)  // system prompt with schema + rules
  -> generateSql(query, prompt)     // LLM call
  -> normalizeSql(rawSql)           // strip markdown fences, think blocks, semicolons
  -> addKbFilter(sql, datasetIds)   // inject kb_id WHERE clause
  -> executeSql(sql, tenantId)      // POST _plugins/_sql to OpenSearch
  -> formatAsMarkdown(result)       // Markdown table with citation markers
```

**Returns:** `SqlRetrievalResult | null`

```typescript
interface SqlRetrievalResult {
  answer: string                  // Markdown table with citation markers
  reference: {
    chunks: ChunkReference[]      // doc_id + doc_name for each row
    doc_aggs: DocAgg[]            // document aggregation counts
  }
}
```

Returns `null` when:
- No datasets have `field_map` -> skip (zero overhead for non-table datasets)
- LLM generates invalid SQL -> retry once with error context
- Second attempt fails -> return null -> caller falls back to vector search
- SQL returns empty results AND no aggregate answer -> return null

**Security:** OpenSearch's SQL plugin is inherently read-only (only SELECT queries). The service additionally validates that the normalized SQL starts with `SELECT` (case-insensitive) and rejects any query containing DDL/DML keywords (DROP, DELETE, UPDATE, INSERT, ALTER, CREATE). This provides defense-in-depth even though OpenSearch SQL would reject such queries anyway.

**LLM provider resolution:** `llmProviderId` is optional. When omitted, the service uses the search app's `search_config.llm_id` (for search) or the assistant's `prompt_config.chat_id` (for chat). The caller is responsible for passing the appropriate provider ID.

**Timeout:** Total budget for LLM generation + SQL execution is 15 seconds. If exceeded, return `null` and fall back to vector search. Use `AbortController` with timeout signal for both the LLM call and the OpenSearch SQL call.

### 1d. SQL Prompt Template

**New file:** `be/src/shared/prompts/sql-generation.prompt.ts`

System prompt includes:
- Index name: `knowledge_{tenantId}`
- Schema: field names and types from `field_map`, formatted as a table definition
- Rules for OpenSearch SQL dialect:
  - Use exact field names from schema
  - Quote field names starting with digits
  - Add `IS NOT NULL` in WHERE when question asks to "show" or "display" columns
  - No trailing semicolons (OpenSearch SQL parser doesn't accept them)
  - KB filter: `kb_id = '{datasetId}'` in WHERE clause
- LIMIT default: 100 rows max

On retry (after error):
- Append the error message to the prompt: "The previous SQL failed with error: {error}. Fix the SQL."

### 1e. OpenSearch SQL Execution

Uses OpenSearch's SQL plugin endpoint:

```
POST https://{opensearch_host}/_plugins/_sql
Content-Type: application/json

{
  "query": "SELECT product_name_tks, price_int FROM knowledge_tenant123 WHERE kb_id = 'abc' AND price_int > 100"
}
```

Response format:
```json
{
  "schema": [{ "name": "product_name_tks", "type": "text" }],
  "datarows": [["Widget A", 150], ["Widget B", 200]],
  "total": 2,
  "size": 2,
  "status": 200
}
```

### 1f. Markdown Table Formatting

Converts SQL results to Markdown with citations:

```markdown
| Product | Price |
|---------|-------|
| Widget A [ID:0] | 150 |
| Widget B [ID:1] | 200 |
```

Citation markers map to `reference.chunks[N]` which contains `doc_id` and `doc_name` for each row.

For aggregate queries (COUNT, SUM, AVG), the answer is a simple text statement:
```
The total count is **42**. [ID:0]
```

### 1g. Pipeline Integration

**In `search.service.ts` — `askSearch()` and `executeSearch()`:**

Before `retrieveChunks()`:
```typescript
const sqlResult = await sqlRetrievalService.trySqlRetrieval(tenantId, datasetIds, query, llmId)
if (sqlResult) {
  // Short-circuit: send SQL result directly, skip vector search
  return
}
// Otherwise: continue with normal vector search
```

**In `chat-conversation.service.ts`:**

Same pattern — insert SQL fallback check after multi-turn question refinement (step 2 of the 12-step pipeline) but before the knowledge retrieval step (step 5). Specifically, after `questions` array is finalized and before `ragSearchService.search()` is called. If SQL returns a result, skip steps 5-8 (retrieval, web search, KG, reranking) and jump directly to response streaming with the SQL result as the knowledge context.

### 1h. SQL Normalization

Cleans up LLM-generated SQL before execution:
- Remove `<think>...</think>` blocks (some models output reasoning)
- Remove markdown code fences (triple backticks with optional `sql` language tag)
- Strip trailing semicolons (OpenSearch SQL parser rejects them)
- Trim whitespace

### 1i. KB Filter Injection

For multi-dataset scoping, inject `kb_id` filter into the WHERE clause:
- Single dataset: `WHERE kb_id = '{datasetId}'`
- Multiple datasets: `WHERE (kb_id = 'id1' OR kb_id = 'id2')`
- If WHERE already exists: append with AND
- If no WHERE but has ORDER BY: insert before ORDER BY

### 1j. Admin UI — Field Map Editor

**In dataset settings page** (admin-only, existing page):

New section "Structured Data — Field Map":
- "Auto-detect" button: reads first chunk, infers field_map, populates editor
- Table editor: rows of `Display Name | Type (dropdown) | OpenSearch Field | Description`
- Add/remove row buttons
- Save updates `parser_config.field_map`
- Only visible when dataset uses `table` parser or has existing `field_map`

## 2. Tag-Based Rank Boosting

### 2a. Tag Ranking Service

**New file:** `be/src/shared/services/tag-ranking.service.ts`

```typescript
class TagRankingService {
  /**
   * Get relevant tags for a query by aggregating tag_kwd from matching chunks.
   */
  async getQueryTags(
    tenantId: string,
    datasetIds: string[],
    query: string,
    topnTags?: number
  ): Promise<Record<string, number>>

  /**
   * Boost chunk scores by tag cosine similarity + pagerank.
   */
  scoreChunksByTags(
    chunks: ChunkResult[],
    queryTags: Record<string, number>
  ): ChunkResult[]
}
```

### 2b. Query Tag Scoring

1. Execute text-match query against datasets (lightweight, just for tag aggregation)
2. Aggregate `tag_kwd` field from OpenSearch response
3. Score each tag using TF-IDF formula:
   ```
   score = 0.1 * (matchCount + 1) / (totalCount + S) / max(0.0001, globalFrequency)
   ```
   Where `S = 1000` (smoothing constant, tunable — higher S reduces tag influence), `globalFrequency` = tag's frequency across all chunks. The value 1000 matches RAGFlow's default.
4. Return top N tags sorted by score descending

### 2c. Chunk Scoring

For each retrieved chunk:
1. Parse `tag_kwd` field (stored as JSON string with tag names and scores)
2. Compute cosine similarity between chunk's tag vector and query's tag vector:
   ```
   similarity = dotProduct(chunkTags, queryTags) / (norm(chunkTags) * norm(queryTags))
   ```
3. Add to final score: `finalScore = hybridScore + (tagSimilarity * 10) + pagerank`
4. Re-sort chunks by final score descending

### 2d. Integration

**In `rag-search.service.ts`:**

- Add `tag_kwd` to the list of OpenSearch source fields fetched
- After retrieval (in `search()` method), if `rankFeature` tags are provided:
  1. Call `tagRankingService.scoreChunksByTags(chunks, queryTags)`
  2. Return re-scored chunks

**Caller side** — in `search.service.ts` `retrieveChunks()`:
- Check if any dataset has `tag_kb_ids` in `parser_config`
- If yes: call `tagRankingService.getQueryTags()` to get query-relevant tags
- Pass tags to the search call

**No UI change on user search page.** Tag boosting is automatic when datasets have tags.

**Config in dataset `parser_config`:**

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `tag_kb_ids` | `string[]` | `[]` | Dataset IDs containing tag definitions |
| `topn_tags` | `number` | `3` | Max tags to boost by |

Admin configures these in dataset settings (existing `parser_config` editor).

## 3. Spotlight Effect

### 3a. Spotlight Component

**New file:** `fe/src/components/Spotlight.tsx`

```typescript
interface SpotlightProps {
  className?: string
  opacity?: number      // default 0.5
  coverage?: number     // gradient radius %, default 60
  x?: string            // center X, default '50%'
  y?: string            // center Y, default '190%'
  color?: string        // override RGB string, auto-detects theme if omitted
}
```

Implementation:
- Absolutely-positioned div with `radial-gradient` background
- `backdrop-filter: blur(30px)` for soft glow effect
- Theme-aware: light mode `rgb(194, 221, 243)`, dark mode `rgb(255, 255, 255)`
- `z-index: -1`, `pointer-events: none` — decorative only
- Uses existing `useTheme()` hook for dark mode detection

### 3b. Integration

- `SearchPage.tsx`: wrap landing hero with `<Spotlight className="z-0" />` when `!hasSearched`
- `SearchSharePage.tsx`: same spotlight on share page landing
- No config, no feature toggle — purely decorative design element

## 4. API Changes

### New Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/rag/datasets/:id/generate-field-map` | Auto-detect field map from first chunk |

### Modified Behavior

| Endpoint | Change |
|----------|--------|
| `POST /api/search/apps/:id/ask` | May return SQL table result when dataset has field_map |
| `POST /api/search/apps/:id/search` | Same SQL fallback behavior |
| Chat streaming endpoints | Same SQL fallback behavior |

The SSE event format remains unchanged — SQL results use the same `{ answer, reference }` shape.

## 5. i18n Additions

New keys for field map editor in dataset settings (all 3 locales):

| Key | EN Value |
|-----|----------|
| `datasets.fieldMap` | "Structured Data — Field Map" |
| `datasets.fieldMapDesc` | "Define field mappings for SQL-based retrieval on structured datasets" |
| `datasets.autoDetectFieldMap` | "Auto-detect from data" |
| `datasets.fieldName` | "Display Name" |
| `datasets.fieldType` | "Type" |
| `datasets.fieldColumn` | "OpenSearch Field" |
| `datasets.fieldDescription` | "Description" |
| `datasets.addField` | "Add Field" |
| `datasets.removeField` | "Remove" |
| `datasets.generateFieldMapSuccess` | "Field map generated successfully" |
| `datasets.noFieldMapData` | "No structured data found to generate field map" |

## 6. File Inventory

### New Files (7)

| File | Purpose |
|------|---------|
| `be/src/shared/services/sql-retrieval.service.ts` | SQL fallback pipeline |
| `be/src/shared/prompts/sql-generation.prompt.ts` | LLM prompt for SQL generation |
| `be/src/shared/services/tag-ranking.service.ts` | Tag query scoring + chunk boosting |
| `fe/src/components/Spotlight.tsx` | Theme-aware spotlight effect |
| `be/tests/shared/sql-retrieval.service.test.ts` | Tests for SQL fallback (normalization, KB filter, formatting, retry) |
| `be/tests/shared/tag-ranking.service.test.ts` | Tests for tag scoring and chunk boosting |
| `fe/tests/components/Spotlight.test.tsx` | Tests for spotlight rendering and theme detection |

### Modified Files (10)

| File | Change |
|------|--------|
| `be/src/modules/search/services/search.service.ts` | SQL fallback before retrieveChunks(), pass tag scores |
| `be/src/modules/chat/services/chat-conversation.service.ts` | SQL fallback before retrieval step |
| `be/src/modules/rag/services/rag-search.service.ts` | Fetch tag_kwd field, apply tag boost scoring |
| `be/src/modules/rag/models/dataset.model.ts` | getFieldMap(), autoGenerateFieldMap() methods |
| `be/src/modules/rag/controllers/rag.controller.ts` | New generate-field-map endpoint handler |
| `be/src/modules/rag/routes/rag.routes.ts` | Register generate-field-map route |
| `fe/src/features/search/pages/SearchPage.tsx` | Add Spotlight to landing hero |
| `fe/src/features/search/pages/SearchSharePage.tsx` | Add Spotlight to landing hero |
| `fe/src/features/datasets/components/ParserSettingsFields.tsx` | Field map editor section (within existing parser config UI) |
| `fe/src/i18n/locales/*.json` | New field map editor keys (en, vi, ja) |

## 7. Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SQL engine | OpenSearch SQL only | YAGNI — B-Knowledge only uses OpenSearch |
| SQL scope | Both search and chat | Shared service, maximum coverage |
| Field map config | Auto-detect + manual override | Auto from table parser, editable in dataset settings |
| Field map storage | Existing parser_config JSONB | No migration needed |
| Tag boost scope | Automatic when tag datasets configured | No user-facing config |
| Spotlight theme | Auto-detect light/dark | Matches project's class-based dark mode |
| Retry strategy | Max 2 LLM attempts | Balance between reliability and latency |
| SQL result format | Markdown table with citations | Consistent with existing answer format |
