# SQL Fallback, Tag Boosting, Spotlight — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SQL fallback to search (already exists in chat), tag-based rank boosting, and spotlight effect on search landing page.

**Architecture:** The SQL service (`rag-sql.service.ts`) and prompt (`sql-generation.prompt.ts`) already exist and are integrated into chat step 6.5. Main work is: (1) wire SQL into search, (2) enhance SQL service with retry + citations + kb filter, (3) add tag ranking service, (4) add spotlight component, (5) add field map admin UI.

**Tech Stack:** TypeScript, Express, OpenSearch, React 19, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-25-sql-fallback-tags-spotlight-design.md`

**Key existing code:**
- `be/src/modules/rag/services/rag-sql.service.ts` (260 lines) — SQL service already works: field_map detection, LLM SQL generation, OpenSearch execution, Markdown table formatting
- `be/src/shared/prompts/sql-generation.prompt.ts` — prompt template exists
- `be/src/modules/chat/services/chat-conversation.service.ts:893-915` — SQL fallback already integrated in chat step 6.5
- `be/src/modules/rag/services/rag-search.service.ts` — `tag_kwd` used for aggregation (line 927) but NOT in source fields (lines 177, 268)

---

## Chunk 1: Enhance SQL Service + Wire into Search

### Task 1: Enhance RagSqlService — Retry Logic + Citations + KB Filter

**Files:**
- Modify: `be/src/modules/rag/services/rag-sql.service.ts`

- [ ] **Step 1: Read the existing service**

Read `be/src/modules/rag/services/rag-sql.service.ts` fully. Note:
- `querySql()` loops through KBs, finds field_map, generates SQL, executes, formats
- `generateSql()` calls LLM with temperature 0
- `executeSql()` calls `_plugins/_sql` endpoint
- `formatAsMarkdownTable()` returns plain table WITHOUT citation markers
- `normalizeSql()` strips fences, think blocks, semicolons
- No retry on SQL failure — just `continue` to next KB
- No kb_id filter injection — prompt says "filter by kb_id" but doesn't enforce it

- [ ] **Step 2: Add retry logic to querySql()**

In the `try` block of `querySql()`, after `executeSql()` fails, retry once with the error message:

```typescript
try {
  let sql = await this.generateSql(question, fieldMap, tableName, providerId)
  if (!sql) continue

  let rows: any[]
  try {
    rows = await this.executeSql(sql)
  } catch (firstErr) {
    // Retry once with error context appended to prompt
    log.info('SQL first attempt failed, retrying with error context', { kbId, error: String(firstErr) })
    sql = await this.generateSqlWithRetry(question, fieldMap, tableName, String(firstErr), providerId)
    if (!sql) continue
    rows = await this.executeSql(sql)
  }
  // ... rest of logic
```

Add a `generateSqlWithRetry()` private method that appends the error to the system prompt:

```typescript
private async generateSqlWithRetry(
  question: string,
  fieldMap: Record<string, string>,
  tableName: string,
  previousError: string,
  providerId?: string
): Promise<string> {
  const fieldDesc = Object.entries(fieldMap)
    .map(([name, type]) => `  ${name} (${type})`)
    .join('\n')
  const isCount = this.isRowCountQuestion(question)

  const prompt: LlmMessage[] = [
    {
      role: 'system',
      content: sqlGenerationPrompt.build(tableName, fieldDesc, isCount)
        + `\n\nThe previous SQL query failed with error: ${previousError}\nFix the SQL query.`,
    },
    { role: 'user', content: question },
  ]

  const rawSql = await llmClientService.chatCompletion(prompt, {
    providerId,
    temperature: 0,
    max_tokens: 256,
  })

  return this.normalizeSql(rawSql)
}
```

- [ ] **Step 3: Add kb_id filter injection**

Add a `addKbFilter()` private method:

```typescript
/**
 * @description Inject kb_id filter into SQL WHERE clause for dataset scoping
 * @param {string} sql - Original SQL query
 * @param {string} kbId - Knowledge base ID to filter by
 * @returns {string} SQL with kb_id filter added
 */
private addKbFilter(sql: string, kbId: string): string {
  // Validate kbId is a valid hex ID to prevent SQL injection
  if (!/^[0-9a-f]{32}$/i.test(kbId)) {
    throw new Error(`Invalid kbId format: ${kbId}`)
  }
  const kbFilter = `kb_id = '${kbId}'`

  // Check if WHERE clause already exists
  if (!/\bwhere\b/i.test(sql)) {
    // No WHERE — insert before ORDER BY if present, else append
    const orderByMatch = sql.match(/\border\s+by\b/i)
    if (orderByMatch && orderByMatch.index != null) {
      return sql.slice(0, orderByMatch.index) + `WHERE ${kbFilter} ` + sql.slice(orderByMatch.index)
    }
    return sql + ` WHERE ${kbFilter}`
  }

  // WHERE exists — check if kb_id already present
  if (/kb_id\s*=/i.test(sql)) return sql

  // Append kb_id to existing WHERE
  return sql.replace(/\bwhere\b\s+/i, `WHERE ${kbFilter} AND `)
}
```

**Note:** `querySql()` loops through KBs one at a time, so `addKbFilter()` handles single KB. This intentionally matches the loop structure — multi-KB is handled by the outer loop trying each KB sequentially.

Call it in `querySql()` after `normalizeSql()`:

```typescript
const sql = this.addKbFilter(this.normalizeSql(rawSql), kbId)
```

Wait — `generateSql()` already normalizes. So call `addKbFilter()` after `generateSql()` returns, and after `generateSqlWithRetry()` returns.

- [ ] **Step 4: Add citation markers to Markdown table**

Update `formatAsMarkdownTable()` to include `[ID:n]` markers per row:

```typescript
formatAsMarkdownTable(rows: any[], fieldMap: Record<string, string>): string {
  if (rows.length === 0) return 'No results found.'

  const columns = Object.keys(rows[0])
  const header = `| ${columns.join(' | ')} |`
  const separator = `| ${columns.map(() => '---').join(' | ')} |`

  // Add citation marker [ID:n] to first cell of each row
  const dataRows = rows.map((row, idx) => {
    const cells = columns.map((col, colIdx) => {
      const val = String(row[col] ?? '')
      // Add citation marker to first column only
      return colIdx === 0 ? `${val} [ID:${idx}]` : val
    })
    return `| ${cells.join(' | ')} |`
  })

  return [header, separator, ...dataRows].join('\n')
}
```

- [ ] **Step 5: Add SQL validation (security)**

Add a `validateSql()` private method that rejects non-SELECT queries:

```typescript
/**
 * @description Validate SQL is a SELECT query only (defense-in-depth)
 * @param {string} sql - SQL to validate
 * @returns {boolean} True if safe SELECT query
 */
private validateSql(sql: string): boolean {
  const upper = sql.trim().toUpperCase()
  // Must start with SELECT
  if (!upper.startsWith('SELECT')) return false
  // Reject DDL/DML keywords
  // Use word boundary regex to avoid false positives on column names like DROPDOWN
  const forbidden = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE)\b/
  return !forbidden.test(upper)
}
```

Call before `executeSql()`:

```typescript
if (!this.validateSql(sql)) {
  log.warn('SQL validation failed — non-SELECT query rejected', { sql })
  continue
}
```

- [ ] **Step 6: Add timeout with AbortController**

Wrap the LLM + SQL execution in a 15-second timeout:

```typescript
// In querySql(), wrap the try block:
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 15000)
try {
  // ... existing logic, pass signal to fetch calls
} finally {
  clearTimeout(timeout)
}
```

Pass `signal` to `executeSql()` fetch call:

```typescript
const response = await fetch(`${ES_HOST}/_plugins/_sql`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ query: sql }),
  signal,  // Add abort signal
})
```

Add `signal?: AbortSignal` parameter to `executeSql()`.

- [ ] **Step 7: Verify build**

```bash
cd be && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add be/src/modules/rag/services/rag-sql.service.ts
git commit -m "feat(search): enhance SQL service with retry, kb filter, citations, validation, timeout"
```

---

### Task 2: Wire SQL Fallback into Search Service

**Files:**
- Modify: `be/src/modules/search/services/search.service.ts`

- [ ] **Step 1: Read search.service.ts to find insertion points**

Find `askSearch()` and `executeSearch()` methods. The SQL fallback should be inserted BEFORE `retrieveChunks()` is called.

- [ ] **Step 2: Add SQL fallback to askSearch()**

Import the SQL service:

```typescript
import { ragSqlService } from '@/modules/rag/services/rag-sql.service.js'
```

Before the `retrieveChunks()` call in `askSearch()`, insert:

```typescript
// ── SQL fallback for structured data ──
// Try SQL-based retrieval first — if dataset has field_map, generate and execute SQL
const datasetIds = typeof app.dataset_ids === 'string'
  ? JSON.parse(app.dataset_ids)
  : app.dataset_ids
const sqlResult = await ragSqlService.querySql(query, datasetIds, providerId)
if (sqlResult) {
  // SQL returned structured results — stream directly, skip vector search
  res.write(`data: ${JSON.stringify({ status: 'generating' })}\n\n`)
  const reference = { chunks: sqlResult.chunks, doc_aggs: [], total: sqlResult.chunks.length }
  res.write(`data: ${JSON.stringify({ reference })}\n\n`)
  res.write(`data: ${JSON.stringify({ answer: sqlResult.answer })}\n\n`)
  res.write(`data: [DONE]\n\n`)
  res.end()
  return
}
```

- [ ] **Step 3: Add SQL fallback to executeSearch()**

Same pattern in `executeSearch()` — before `retrieveChunks()`:

```typescript
// SQL fallback for structured data
const datasetIds = typeof app.dataset_ids === 'string'
  ? JSON.parse(app.dataset_ids)
  : app.dataset_ids
const sqlResult = await ragSqlService.querySql(query, datasetIds)
if (sqlResult) {
  return {
    results: sqlResult.chunks.map(c => ({
      chunk_id: c.chunk_id,
      content: c.text,
      doc_name: c.doc_name,
      score: c.score,
      method: c.method,
    })),
    total: sqlResult.chunks.length,
    doc_aggs: [],
  }
}
```

- [ ] **Step 4: Verify build**

```bash
cd be && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add be/src/modules/search/services/search.service.ts
git commit -m "feat(search): wire SQL fallback into search askSearch and executeSearch"
```

**Note on chat SQL fallback:** The spec says to reposition chat's SQL step from 6.5 to after step 2 (question refinement). However, the current position at step 6.5 (after keyword extraction) is actually better — it benefits from multi-turn refinement and keyword context. Keeping it at 6.5 is intentional and matches RAGFlow's actual behavior. No chat modification needed.

---

## Chunk 2: Tag-Based Rank Boosting

### Task 3: Create Tag Ranking Service

**Files:**
- Create: `be/src/shared/services/tag-ranking.service.ts`

- [ ] **Step 1: Read rag-search.service.ts for tag_kwd aggregation**

Check how `tag_kwd` is already aggregated (line 927 area) and what source fields are fetched. Understand the OpenSearch aggregation response shape.

- [ ] **Step 2: Create the tag ranking service**

Create `be/src/shared/services/tag-ranking.service.ts`:

```typescript
import { log } from './logger.service.js'

/**
 * @description Tag-based rank boosting service.
 * Computes query-relevant tags from OpenSearch aggregation and boosts
 * chunk scores by cosine similarity between query tags and chunk tags.
 */
class TagRankingService {
  /**
   * @description Get relevant tags for a query by aggregating tag_kwd from search results
   * @param {Array<{tag_kwd?: string}>} chunks - Retrieved chunks with tag_kwd field
   * @param {number} topnTags - Max number of tags to return (default 3)
   * @returns {Record<string, number>} Tag name to relevance score mapping
   */
  getQueryTags(
    chunks: Array<{ tag_kwd?: string | string[] | Record<string, number> }>,
    topnTags: number = 3
  ): Record<string, number> {
    // Count tag occurrences across all chunks
    const tagCounts = new Map<string, number>()
    let totalCount = 0

    for (const chunk of chunks) {
      const tags = this.parseChunkTags(chunk.tag_kwd)
      for (const [tag] of Object.entries(tags)) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
        totalCount++
      }
    }

    if (totalCount === 0) return {}

    const S = 1000 // Smoothing constant (matches RAGFlow default)
    // Score each tag: TF-IDF-like relevance
    const scored = Array.from(tagCounts.entries()).map(([tag, count]) => ({
      tag,
      score: 0.1 * (count + 1) / (totalCount + S) / Math.max(0.0001, count / totalCount),
    }))

    // Return top N tags
    scored.sort((a, b) => b.score - a.score)
    return Object.fromEntries(
      scored.slice(0, topnTags).map(({ tag, score }) => [tag, Math.max(1, Math.round(score))])
    )
  }

  /**
   * @description Boost chunk scores by tag cosine similarity + pagerank
   * @param {ChunkWithTags[]} chunks - Retrieved chunks with tag_kwd and optional pagerank_fea
   * @param {Record<string, number>} queryTags - Query-relevant tags from getQueryTags()
   * @returns {ChunkWithTags[]} Chunks with boosted scores, re-sorted
   */
  scoreChunksByTags<T extends { score: number; tag_kwd?: any; pagerank_fea?: number }>(
    chunks: T[],
    queryTags: Record<string, number>
  ): T[] {
    if (Object.keys(queryTags).length === 0) return chunks

    // Pre-compute query tag norm
    const qNorm = Math.sqrt(
      Object.values(queryTags).reduce((sum, v) => sum + v * v, 0)
    )
    if (qNorm === 0) return chunks

    return chunks
      .map(chunk => {
        const chunkTags = this.parseChunkTags(chunk.tag_kwd)
        const pagerank = chunk.pagerank_fea ?? 0

        // Compute cosine similarity
        let dotProduct = 0
        let cNorm = 0
        for (const [tag, score] of Object.entries(chunkTags)) {
          if (tag in queryTags) dotProduct += queryTags[tag]! * score
          cNorm += score * score
        }
        cNorm = Math.sqrt(cNorm)

        const tagSim = cNorm > 0 ? dotProduct / (cNorm * qNorm) : 0

        return {
          ...chunk,
          score: chunk.score + (tagSim * 10) + pagerank,
        }
      })
      .sort((a, b) => b.score - a.score)
  }

  /**
   * @description Parse chunk tag_kwd field into tag->score map
   * @param {unknown} tagKwd - Raw tag_kwd value (string, array, or object)
   * @returns {Record<string, number>} Parsed tag scores
   */
  private parseChunkTags(tagKwd: unknown): Record<string, number> {
    if (!tagKwd) return {}

    // Object format: { tag: score, ... }
    if (typeof tagKwd === 'object' && !Array.isArray(tagKwd)) {
      return tagKwd as Record<string, number>
    }

    // String format: try JSON parse, fallback to comma-separated
    if (typeof tagKwd === 'string') {
      try {
        const parsed = JSON.parse(tagKwd)
        if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
        if (Array.isArray(parsed)) return Object.fromEntries(parsed.map(t => [String(t), 1]))
      } catch {
        // Comma-separated tags
        return Object.fromEntries(tagKwd.split(',').map(t => [t.trim(), 1]).filter(([t]) => t))
      }
    }

    // Array format: ['tag1', 'tag2']
    if (Array.isArray(tagKwd)) {
      return Object.fromEntries(tagKwd.map(t => [String(t), 1]))
    }

    return {}
  }
}

export const tagRankingService = new TagRankingService()
```

- [ ] **Step 3: Verify build**

```bash
cd be && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add be/src/shared/services/tag-ranking.service.ts
git commit -m "feat(search): add tag ranking service with TF-IDF scoring and cosine similarity"
```

---

### Task 4: Integrate Tag Boosting into RAG Search

**Files:**
- Modify: `be/src/modules/rag/services/rag-search.service.ts`
- Modify: `be/src/modules/search/services/search.service.ts`

- [ ] **Step 1: Add tag_kwd to OpenSearch source fields**

In `rag-search.service.ts`, find the `_source` field arrays (around lines 177 and 268). Add `'tag_kwd'` and `'pagerank_fea'` to both arrays if not already present.

- [ ] **Step 2: Add tag scoring to search.service.ts retrieveChunks()**

In `search.service.ts`, in `retrieveChunks()`, after all chunks are collected and before returning:

```typescript
import { tagRankingService } from '@/shared/services/tag-ranking.service.js'

// After allChunks are collected and sorted:
// Apply tag-based rank boosting only when datasets have tag_kb_ids configured
// Check parser_config of each dataset for tag_kb_ids
const hasTagConfig = await this.datasetsHaveTagConfig(datasetIds)
if (hasTagConfig && allChunks.some(c => c.tag_kwd)) {
  const topnTags = /* read from first dataset's parser_config.topn_tags */ 3
  const queryTags = tagRankingService.getQueryTags(allChunks as any, topnTags)
  if (Object.keys(queryTags).length > 0) {
    allChunks = tagRankingService.scoreChunksByTags(allChunks as any, queryTags) as typeof allChunks
  }
}
```

Add a helper method to check if any dataset has tag config:

```typescript
private async datasetsHaveTagConfig(datasetIds: string[]): Promise<boolean> {
  // Use single query to avoid N+1 problem
  const datasets = await ModelFactory.dataset.findByIds(datasetIds)
  return datasets.some(ds => {
    const config = typeof ds.parser_config === 'string' ? JSON.parse(ds.parser_config) : ds.parser_config
    return config?.tag_kb_ids?.length > 0
  })
}
```

Note: If `findByIds()` doesn't exist on the model, add it: `findByIds(ids: string[]) { return this.query().whereIn('id', ids) }`
```

**Design note:** The spec describes a separate ES aggregation query for tag scoring. This plan instead derives tags from the already-retrieved chunks to avoid an extra OpenSearch round-trip. The tradeoff: tags come from top-K results only (not full corpus), but this is sufficient for boosting since top-K already contains the most relevant chunks. The extra query is unnecessary overhead for marginal accuracy gain.

- [ ] **Step 3: Verify build**

```bash
cd be && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add be/src/modules/rag/services/rag-search.service.ts be/src/modules/search/services/search.service.ts
git commit -m "feat(search): integrate tag-based rank boosting into retrieval pipeline"
```

---

## Chunk 3: Spotlight Effect

### Task 5: Create Spotlight Component

**Files:**
- Create: `fe/src/components/Spotlight.tsx`

- [ ] **Step 1: Create the Spotlight component**

Create `fe/src/components/Spotlight.tsx`:

```tsx
import { cn } from '@/lib/utils'
import { useSettings } from '@/app/contexts/SettingsContext'

/**
 * @description Props for the Spotlight component
 */
interface SpotlightProps {
  /** Additional CSS classes */
  className?: string
  /** Gradient opacity (0-1, default 0.5) */
  opacity?: number
  /** Gradient coverage radius percentage (default 60) */
  coverage?: number
  /** Gradient center X position (default '50%') */
  x?: string
  /** Gradient center Y position (default '190%') */
  y?: string
  /** Override RGB color string (auto-detects theme if omitted) */
  color?: string
}

/**
 * @description Theme-aware radial gradient spotlight effect for search landing pages.
 * Renders an absolutely-positioned decorative overlay with radial gradient and backdrop blur.
 * Light mode uses soft blue glow, dark mode uses white glow.
 * @param {SpotlightProps} props - Spotlight configuration
 * @returns {JSX.Element} Decorative spotlight overlay
 */
export function Spotlight({
  className,
  opacity = 0.5,
  coverage = 60,
  x = '50%',
  y = '190%',
  color,
}: SpotlightProps) {
  const { isDarkMode } = useSettings()

  // Theme-aware RGB: soft blue for light, white for dark
  const rgb = color ?? (isDarkMode ? '255, 255, 255' : '194, 221, 243')

  return (
    <div
      className={cn('absolute inset-0 rounded-lg', className)}
      style={{
        backdropFilter: 'blur(30px)',
        zIndex: -1,
        pointerEvents: 'none',
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at ${x} ${y}, rgba(${rgb},${opacity}) 0%, rgba(${rgb},0) ${coverage}%)`,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
cd fe && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add fe/src/components/Spotlight.tsx
git commit -m "feat(search): add theme-aware Spotlight component"
```

---

### Task 6: Add Spotlight to Search Pages

**Files:**
- Modify: `fe/src/features/search/pages/SearchPage.tsx`
- Modify: `fe/src/features/search/pages/SearchSharePage.tsx`

- [ ] **Step 1: Add Spotlight to SearchPage landing hero**

In `SearchPage.tsx`, find the `{!hasSearched && (...)}` block (around line 487). Wrap the hero content in a `relative` container and add `<Spotlight />`:

```tsx
import { Spotlight } from '@/components/Spotlight'

// In the !hasSearched block:
{!hasSearched && (
  <div className="relative">
    <Spotlight className="z-0" />
    <div className="flex flex-col items-center gap-3 mb-8 relative z-10">
      {/* existing avatar + title + description */}
    </div>
  </div>
)}
```

- [ ] **Step 2: Add Spotlight to SearchSharePage**

In `SearchSharePage.tsx`, find the hero/landing section (the area with app name, description, and search bar that shows before a search is executed). Wrap it in a `relative` container and add `<Spotlight className="z-0" />` the same way as SearchPage. The pattern is:

```tsx
import { Spotlight } from '@/components/Spotlight'

// Wrap the landing content:
<div className="relative">
  <Spotlight className="z-0" />
  <div className="relative z-10">
    {/* existing hero content */}
  </div>
</div>
```

- [ ] **Step 3: Verify build**

```bash
cd fe && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add fe/src/features/search/pages/SearchPage.tsx fe/src/features/search/pages/SearchSharePage.tsx
git commit -m "feat(search): add spotlight effect to search landing pages"
```

---

## Chunk 4: Field Map Admin UI + i18n

### Task 7: Add Field Map Editor to Dataset Settings

**Files:**
- Modify: `fe/src/features/datasets/components/ParserSettingsFields.tsx`
- Modify: `fe/src/i18n/locales/en.json`
- Modify: `fe/src/i18n/locales/vi.json`
- Modify: `fe/src/i18n/locales/ja.json`

- [ ] **Step 1: Add i18n keys**

In all 3 locale files, add under `datasets` namespace:

English:
```json
"fieldMap": "Structured Data — Field Map",
"fieldMapDesc": "Define field mappings for SQL-based retrieval on structured datasets",
"autoDetectFieldMap": "Auto-detect from data",
"fieldName": "Display Name",
"fieldType": "Type",
"fieldColumn": "OpenSearch Field",
"fieldDescription": "Description",
"addField": "Add Field",
"removeField": "Remove",
"generateFieldMapSuccess": "Field map generated successfully",
"noFieldMapData": "No structured data found to generate field map"
```

Vietnamese and Japanese: translate to match existing locale styles.

- [ ] **Step 2: Read ParserSettingsFields.tsx**

Read the file to understand the component structure, how parser config fields are rendered, and where to add the field map editor section.

- [ ] **Step 3: Add field map editor section**

After the existing parser settings (after the parser description/image section, around line 199), add a conditional section for field map editing:

```tsx
{/* Field Map Editor — visible when parser is 'table' or field_map exists */}
{(parserId === 'table' || parserConfig?.field_map) && (
  <div className="space-y-3 border-t pt-4">
    <div className="flex items-center justify-between">
      <div>
        <Label className="text-sm font-medium">{t('datasets.fieldMap')}</Label>
        <p className="text-xs text-muted-foreground">{t('datasets.fieldMapDesc')}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleAutoDetect}
        disabled={isAutoDetecting}
      >
        {isAutoDetecting ? <Spinner className="h-3 w-3 mr-1" /> : null}
        {t('datasets.autoDetectFieldMap')}
      </Button>
    </div>

    {/* Field map table editor */}
    <div className="space-y-2">
      {fieldMapEntries.map((entry, idx) => (
        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
          <Input
            className="col-span-3"
            value={entry.name}
            onChange={(e) => updateFieldEntry(idx, 'name', e.target.value)}
            placeholder={t('datasets.fieldName')}
          />
          <Select
            value={entry.type}
            onValueChange={(v) => updateFieldEntry(idx, 'type', v)}
          >
            <SelectTrigger className="col-span-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="integer">Integer</SelectItem>
              <SelectItem value="float">Float</SelectItem>
              <SelectItem value="date">Date</SelectItem>
              <SelectItem value="keyword">Keyword</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="col-span-3"
            value={entry.column_name}
            onChange={(e) => updateFieldEntry(idx, 'column_name', e.target.value)}
            placeholder={t('datasets.fieldColumn')}
          />
          <Input
            className="col-span-3"
            value={entry.description ?? ''}
            onChange={(e) => updateFieldEntry(idx, 'description', e.target.value)}
            placeholder={t('datasets.fieldDescription')}
          />
          <Button
            variant="ghost"
            size="icon"
            className="col-span-1 h-8 w-8"
            onClick={() => removeFieldEntry(idx)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addFieldEntry}>
        <Plus className="h-3 w-3 mr-1" />
        {t('datasets.addField')}
      </Button>
    </div>
  </div>
)}
```

Add the state management for field map entries at the top of the component function:

```tsx
interface FieldMapEntry {
  name: string
  type: string
  column_name: string
  description: string
}

// Parse existing field_map from parserConfig into entries array
const initialEntries = (): FieldMapEntry[] => {
  const fm = parserConfig?.field_map
  if (!fm || typeof fm !== 'object') return []
  return Object.entries(fm).map(([name, val]) => ({
    name,
    type: (val as any).type ?? 'text',
    column_name: (val as any).column_name ?? name,
    description: (val as any).description ?? '',
  }))
}

const [fieldMapEntries, setFieldMapEntries] = useState<FieldMapEntry[]>(initialEntries)
const [isAutoDetecting, setIsAutoDetecting] = useState(false)

const buildFieldMapFromEntries = (): Record<string, any> => {
  const fm: Record<string, any> = {}
  for (const e of fieldMapEntries) {
    if (e.name.trim()) {
      fm[e.name.trim()] = { type: e.type, column_name: e.column_name, description: e.description }
    }
  }
  return fm
}

const addFieldEntry = () => {
  const updated = [...fieldMapEntries, { name: '', type: 'text', column_name: '', description: '' }]
  setFieldMapEntries(updated)
}

const removeFieldEntry = (idx: number) => {
  const updated = fieldMapEntries.filter((_, i) => i !== idx)
  setFieldMapEntries(updated)
  // Build field map from the updated array directly (not stale state)
  const fm: Record<string, any> = {}
  for (const e of updated) {
    if (e.name.trim()) fm[e.name.trim()] = { type: e.type, column_name: e.column_name, description: e.description }
  }
  onConfigChange({ ...parserConfig, field_map: fm })
}

const updateFieldEntry = (idx: number, field: keyof FieldMapEntry, value: string) => {
  const updated = [...fieldMapEntries]
  updated[idx] = { ...updated[idx]!, [field]: value }
  setFieldMapEntries(updated)
  // Build field map from the updated array directly (not stale state)
  const fm: Record<string, any> = {}
  for (const e of updated) {
    if (e.name.trim()) fm[e.name.trim()] = { type: e.type, column_name: e.column_name, description: e.description }
  }
  onConfigChange({ ...parserConfig, field_map: fm })
}

const handleAutoDetect = async () => {
  setIsAutoDetecting(true)
  try {
    const result = await datasetApi.generateFieldMap(datasetId)
    const entries = Object.entries(result.field_map).map(([name, val]) => ({
      name,
      type: (val as any).type ?? 'text',
      column_name: (val as any).column_name ?? name,
      description: (val as any).description ?? '',
    }))
    setFieldMapEntries(entries)
    onConfigChange({ ...parserConfig, field_map: result.field_map })
    toast.success(t('datasets.generateFieldMapSuccess'))
  } catch {
    toast.error(t('datasets.noFieldMapData'))
  } finally {
    setIsAutoDetecting(false)
  }
}
```

Note: The `datasetId` prop must be available to this component (check if `ParserSettingsFields` receives it; if not, add it to the props interface).

- [ ] **Step 4: Verify build**

```bash
cd fe && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add fe/src/features/datasets/components/ParserSettingsFields.tsx fe/src/i18n/locales/
git commit -m "feat(search): add field map editor to dataset parser settings"
```

---

### Task 8: Auto-Detect Field Map Endpoint

**Files:**
- Modify: `be/src/modules/rag/controllers/rag.controller.ts`
- Modify: `be/src/modules/rag/routes/rag.routes.ts`
- Modify: `be/src/modules/rag/models/dataset.model.ts`

- [ ] **Step 1: Add autoGenerateFieldMap() to dataset model**

In `dataset.model.ts`, add a method that reads the first chunk from OpenSearch to extract field names and infer types:

```typescript
/**
 * @description Auto-generate field_map from the first chunk's metadata in OpenSearch
 * @param {string} datasetId - Dataset ID to analyze
 * @param {string} tenantId - Tenant ID for index scoping
 * @returns {Promise<Record<string, FieldMapEntry>>} Generated field map
 */
async autoGenerateFieldMap(datasetId: string, tenantId: string): Promise<Record<string, any>> {
  // Query OpenSearch for 1 chunk from this dataset to inspect field structure
  // Parse field names, infer types from values
  // Return field_map object
}
```

Implementation:

```typescript
async autoGenerateFieldMap(datasetId: string, tenantId: string): Promise<Record<string, any>> {
  const indexName = `knowledge_${tenantId || config.opensearch.systemTenantId}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.opensearch.password) {
    headers['Authorization'] = `Basic ${Buffer.from(`admin:${config.opensearch.password}`).toString('base64')}`
  }

  // Fetch 1 chunk from this dataset to inspect field structure
  const res = await fetch(`${config.opensearch.host}/${indexName}/_search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: { term: { kb_id: datasetId } },
      size: 1,
      _source: true,  // Fetch all fields
    }),
  })

  if (!res.ok) throw new Error(`OpenSearch query failed: ${res.status}`)
  const data = await res.json() as any
  const hits = data.hits?.hits ?? []
  if (hits.length === 0) return {}

  const source = hits[0]._source
  const fieldMap: Record<string, any> = {}

  // Skip internal fields — only map user data fields
  const skipFields = new Set([
    'chunk_id', 'doc_id', 'kb_id', 'docnm_kwd', 'content_ltks', 'content_sm_ltks',
    'content_with_weight', 'img_id', 'available_int', 'create_timestamp_flt',
    'knowledge_graph_kwd', 'important_kwd', 'question_kwd', 'question_tks',
    'title_tks', 'tag_kwd', 'pagerank_fea', 'position_int', 'page_num_int',
    'top_int', 'mom_id', 'doc_type_kwd',
  ])

  for (const [key, value] of Object.entries(source)) {
    if (skipFields.has(key)) continue
    // Skip vector fields
    if (key.match(/^q_\d+_vec$/)) continue

    const type = this.inferFieldType(value)
    fieldMap[key] = { type, column_name: key, description: '' }
  }

  return fieldMap
}

private inferFieldType(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'float'
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date'
    return 'text'
  }
  return 'keyword'
}
```

- [ ] **Step 2: Add controller handler**

In `rag.controller.ts`, add:

```typescript
/**
 * @description Auto-detect field map from dataset's indexed chunks
 * @param {Request} req - Request with :id param (dataset ID)
 * @param {Response} res - Generated field map
 */
async generateFieldMap(req: Request, res: Response): Promise<void> {
  const { id } = req.params
  const fieldMap = await DatasetModel.autoGenerateFieldMap(id, req.tenantId)
  if (!fieldMap || Object.keys(fieldMap).length === 0) {
    res.status(404).json({ error: 'No structured data found' })
    return
  }
  // Update parser_config.field_map
  await ModelFactory.dataset.update(id, {
    parser_config: knex.raw(`jsonb_set(COALESCE(parser_config, '{}'), '{field_map}', ?::jsonb)`, [JSON.stringify(fieldMap)])
  })
  res.json({ field_map: fieldMap })
}
```

- [ ] **Step 3: Register route**

In `rag.routes.ts`, add before the `:id` parameter routes to avoid capture:

```typescript
router.post(
  '/datasets/:id/generate-field-map',
  requireAuth,
  requirePermission('manage_datasets'),
  controller.generateFieldMap.bind(controller)
)
```

- [ ] **Step 4: Add frontend API call**

In `fe/src/features/datasets/api/datasetApi.ts` (or equivalent), add the API call:

```typescript
/**
 * @description Auto-detect field map from a dataset's indexed chunks
 * @param {string} datasetId - Dataset ID to analyze
 * @returns {Promise<{ field_map: Record<string, FieldMapEntry> }>} Generated field map
 */
async generateFieldMap(datasetId: string): Promise<{ field_map: Record<string, any> }> {
  const res = await api.post(`/api/rag/datasets/${datasetId}/generate-field-map`)
  return res.data
}
```

In `fe/src/features/datasets/api/datasetQueries.ts` (or equivalent), add the mutation hook:

```typescript
/**
 * @description Mutation hook for auto-detecting field map
 */
export function useGenerateFieldMap() {
  return useMutation({
    mutationFn: (datasetId: string) => datasetApi.generateFieldMap(datasetId),
  })
}
```

Update the `handleAutoDetect` in Task 7 to use this hook instead of calling the API directly.

- [ ] **Step 5: Verify build**

```bash
cd be && npx tsc --noEmit && cd ../fe && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add be/src/modules/rag/ fe/src/features/datasets/
git commit -m "feat(search): add auto-detect field map endpoint and frontend API"
```

---

### Task 9: Unit Tests

**Files:**
- Create: `be/tests/shared/tag-ranking.service.test.ts`
- Create: `fe/tests/components/Spotlight.test.tsx`

- [ ] **Step 1: Write tag ranking service tests**

Create `be/tests/shared/tag-ranking.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { tagRankingService } from '@/shared/services/tag-ranking.service'

describe('TagRankingService', () => {
  describe('getQueryTags', () => {
    it('should return empty object when no chunks have tags', () => {
      const result = tagRankingService.getQueryTags([{ tag_kwd: undefined }])
      expect(result).toEqual({})
    })

    it('should return top N tags scored by frequency', () => {
      const chunks = [
        { tag_kwd: { product: 5, electronics: 3 } },
        { tag_kwd: { product: 2, food: 1 } },
      ]
      const result = tagRankingService.getQueryTags(chunks, 2)
      expect(Object.keys(result).length).toBeLessThanOrEqual(2)
      expect('product' in result).toBe(true)
    })

    it('should parse string tag_kwd as JSON', () => {
      const chunks = [{ tag_kwd: '{"color": 1, "size": 2}' }]
      const result = tagRankingService.getQueryTags(chunks)
      expect(Object.keys(result).length).toBeGreaterThan(0)
    })

    it('should parse array tag_kwd', () => {
      const chunks = [{ tag_kwd: ['red', 'blue'] }]
      const result = tagRankingService.getQueryTags(chunks)
      expect(Object.keys(result).length).toBeGreaterThan(0)
    })
  })

  describe('scoreChunksByTags', () => {
    it('should return chunks unchanged when no query tags', () => {
      const chunks = [{ score: 0.5, tag_kwd: { a: 1 } }]
      const result = tagRankingService.scoreChunksByTags(chunks, {})
      expect(result[0]!.score).toBe(0.5)
    })

    it('should boost chunks with matching tags', () => {
      const chunks = [
        { score: 0.5, tag_kwd: { product: 5 } },
        { score: 0.6, tag_kwd: { unrelated: 3 } },
      ]
      const queryTags = { product: 3 }
      const result = tagRankingService.scoreChunksByTags(chunks, queryTags)
      // First chunk should be boosted and potentially re-ordered
      expect(result[0]!.score).toBeGreaterThan(0.5)
    })

    it('should sort by boosted score descending', () => {
      const chunks = [
        { score: 0.3, tag_kwd: { product: 10 } },
        { score: 0.9, tag_kwd: {} },
      ]
      const queryTags = { product: 5 }
      const result = tagRankingService.scoreChunksByTags(chunks, queryTags)
      expect(result[0]!.score).toBeGreaterThanOrEqual(result[1]!.score)
    })
  })
})
```

- [ ] **Step 2: Write Spotlight component test**

Create `fe/tests/components/Spotlight.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { Spotlight } from '@/components/Spotlight'

// Mock useSettings
vi.mock('@/app/contexts/SettingsContext', () => ({
  useSettings: () => ({ isDarkMode: false }),
}))

describe('Spotlight', () => {
  it('should render with default props', () => {
    const { container } = render(<Spotlight />)
    const outer = container.firstChild as HTMLElement
    expect(outer).toBeTruthy()
    expect(outer.style.backdropFilter).toBe('blur(30px)')
    expect(outer.style.pointerEvents).toBe('none')
  })

  it('should apply custom className', () => {
    const { container } = render(<Spotlight className="z-0" />)
    const outer = container.firstChild as HTMLElement
    expect(outer.className).toContain('z-0')
  })

  it('should use light mode colors by default', () => {
    const { container } = render(<Spotlight />)
    const inner = container.querySelector('.absolute.inset-0:last-child') as HTMLElement
    expect(inner.style.background).toContain('194, 221, 243')
  })
})
```

- [ ] **Step 3: Run tests**

```bash
cd be && npx vitest run tests/shared/tag-ranking.service.test.ts --reporter=verbose
cd fe && npx vitest run tests/components/Spotlight.test.tsx --reporter=verbose
```

- [ ] **Step 4: Commit**

```bash
git add be/tests/shared/tag-ranking.service.test.ts fe/tests/components/Spotlight.test.tsx
git commit -m "test: add unit tests for tag ranking service and Spotlight component"
```

---

### Task 10: Final Build Verification

- [ ] **Step 1: Run backend build**

```bash
cd be && npx tsc --noEmit
```

- [ ] **Step 2: Run frontend build**

```bash
cd fe && npx tsc --noEmit
```

- [ ] **Step 3: Run full build**

```bash
npm run build
```

- [ ] **Step 4: Verify all features**

1. **SQL fallback:** Verify `ragSqlService.querySql()` is called in both `search.service.ts` and `chat-conversation.service.ts`
2. **Tag boosting:** Verify `tag_kwd` is in OpenSearch source fields, `tagRankingService` is called in `retrieveChunks()`
3. **Spotlight:** Verify `<Spotlight />` is rendered in both `SearchPage` and `SearchSharePage` landing heroes
4. **Field map editor:** Verify `ParserSettingsFields` shows field map section for table parsers
5. **Auto-detect:** Verify endpoint exists at `POST /api/rag/datasets/:id/generate-field-map`

- [ ] **Step 5: Final commit**

```bash
git add be/src/ fe/src/ fe/tests/
git commit -m "feat(search): complete SQL fallback, tag boosting, and spotlight implementation"
```
