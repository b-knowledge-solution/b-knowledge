# Dataset & Chunk Viewer — Key Gaps Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 5 high-impact feature gaps to bring B-Knowledge dataset/chunk management to parity with RAGFlow.

**Architecture:** 5 independent vertical slices (backend schema → service → controller → route → frontend API → UI). Each feature is self-contained and can be implemented, tested, and merged independently. Features build on the same files but different sections.

**Tech Stack:** Express/TypeScript (BE), OpenSearch (chunks), PostgreSQL/Peewee (documents), React 19/TanStack Query/shadcn (FE), Python/FastAPI (advance-rag worker)

**Spec:** `docs/superpowers/specs/2026-03-16-dataset-chunk-gaps-design.md`

**Security note:** Task 3.4 uses `dangerouslySetInnerHTML` for rendering search highlights. This is safe because DOMPurify sanitizes the HTML with `ALLOWED_TAGS: ['mark']` before rendering, stripping all tags except `<mark>`.

---

## Chunk 1: Feature 1 — Chunk Enable/Disable Toggle

### Task 1.1: Backend — Extend OpenSearch _source and mapHits

**Files:**
- Modify: `be/src/modules/rag/services/rag-search.service.ts`
- Modify: `be/src/shared/models/types.ts`

- [ ] **Step 1: Add `available`, `important_kwd`, `question_kwd`, `highlight`, `token_count`, `vector_similarity`, `term_similarity` to ChunkResult interface**

In `be/src/shared/models/types.ts` at line ~1340, update `ChunkResult`:

```typescript
export interface ChunkResult {
    chunk_id: string;
    text: string;
    doc_id?: string;
    doc_name?: string;
    /** Page numbers where the chunk was extracted from */
    page_num?: number[];
    /** Position coordinates: [[page, x1, x2, y1, y2], ...] for PDF highlighting */
    positions?: number[][];
    score?: number;
    method?: string;
    /** Image ID for image-type chunks */
    img_id?: string;
    /** Whether this chunk is available for search (mapped from available_int) */
    available?: boolean;
    /** Important keywords extracted or manually assigned */
    important_kwd?: string[];
    /** Associated questions for this chunk */
    question_kwd?: string[];
    /** Highlighted text with <mark> tags from OpenSearch */
    highlight?: string;
    /** Approximate token count */
    token_count?: number;
    /** Vector/semantic search score component */
    vector_similarity?: number;
    /** Full-text/keyword search score component */
    term_similarity?: number;
}
```

- [ ] **Step 2: Add `available_int`, `important_kwd`, `question_kwd` to all _source arrays**

In `be/src/modules/rag/services/rag-search.service.ts`, update the `_source` arrays in these methods:

**fullTextSearch** (line ~109):
```typescript
_source: ['content_with_weight', 'doc_id', 'docnm_kwd', 'page_num_int', 'position_int', 'img_id', 'available_int', 'important_kwd', 'question_kwd']
```

**semanticSearch** (line ~162):
```typescript
_source: ['content_with_weight', 'doc_id', 'docnm_kwd', 'page_num_int', 'position_int', 'img_id', 'available_int', 'important_kwd', 'question_kwd']
```

**listChunks** (line ~308):
```typescript
_source: ['content_with_weight', 'content_ltks', 'doc_id', 'docnm_kwd', 'page_num_int', 'position_int', 'img_id', 'available_int', 'important_kwd', 'question_kwd']
```

- [ ] **Step 3: Update mapHits to include new fields**

In `be/src/modules/rag/services/rag-search.service.ts`, update `mapHits` method (line ~487-502):

```typescript
private mapHits(hits: any[], method?: string): ChunkResult[] {
    return hits.map((hit: any) => {
        const src = hit._source || {}
        const highlightFields = hit.highlight || {}
        return {
            chunk_id: hit._id,
            text: src.content_with_weight || src.content_ltks || '',
            doc_id: src.doc_id,
            doc_name: src.docnm_kwd,
            page_num: src.page_num_int || [],
            positions: src.position_int || [],
            score: hit._score ?? 0,
            available: src.available_int === undefined ? true : src.available_int === 1,
            important_kwd: src.important_kwd || [],
            question_kwd: src.question_kwd || [],
            token_count: Math.ceil((src.content_with_weight || '').length / 4),
            ...(method ? { method } : {}),
            ...(src.img_id ? { img_id: src.img_id } : {}),
            ...(highlightFields.content_with_weight?.[0] ? { highlight: highlightFields.content_with_weight[0] } : {}),
        }
    })
}
```

- [ ] **Step 4: Build and verify no TypeScript errors**

Run: `cd be && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add be/src/shared/models/types.ts be/src/modules/rag/services/rag-search.service.ts
git commit -m "feat(rag): extend ChunkResult with available, keywords, highlight, and token_count fields"
```

---

### Task 1.2: Backend — Add available filter to listChunks and bulk-switch endpoint

**Files:**
- Modify: `be/src/modules/rag/schemas/rag.schemas.ts`
- Modify: `be/src/modules/rag/routes/rag.routes.ts`
- Modify: `be/src/modules/rag/controllers/rag.controller.ts`
- Modify: `be/src/modules/rag/services/rag-search.service.ts`

- [ ] **Step 1: Add bulkChunkSwitchSchema to schemas**

In `be/src/modules/rag/schemas/rag.schemas.ts`, after `updateChunkSchema` (line ~125), add:

```typescript
/**
 * @description Schema for bulk chunk enable/disable switch
 */
export const bulkChunkSwitchSchema = z.object({
  chunk_ids: z.array(z.string()).min(1, 'At least one chunk ID is required'),
  available: z.boolean(),
})
```

- [ ] **Step 2: Add available filter to listChunks service**

In `be/src/modules/rag/services/rag-search.service.ts`, update `listChunks` method (line ~287). Change the options type and add filter:

```typescript
async listChunks(
    datasetId: string,
    options: { doc_id?: string; page?: number; limit?: number; available?: boolean } = {},
): Promise<{ chunks: ChunkResult[]; total: number; page: number; limit: number }> {
```

After the `doc_id` filter (line ~299), add:
```typescript
    // Filter by chunk availability if specified
    if (options.available !== undefined) {
        must.push({ term: { available_int: options.available ? 1 : 0 } })
    }
```

- [ ] **Step 3: Add bulkSwitchChunks service method**

In `be/src/modules/rag/services/rag-search.service.ts`, after `deleteChunk` method, add:

```typescript
/**
 * @description Bulk update availability status for multiple chunks
 * @param {string} datasetId - The dataset ID the chunks belong to
 * @param {string[]} chunkIds - Array of chunk IDs to update
 * @param {boolean} available - Whether chunks should be enabled or disabled
 * @returns {Promise<{ updated: number }>} Count of updated chunks
 */
async bulkSwitchChunks(
    datasetId: string,
    chunkIds: string[],
    available: boolean,
): Promise<{ updated: number }> {
    const client = getClient()
    const availableInt = available ? 1 : 0

    // Use bulk API for efficiency
    const body = chunkIds.flatMap((id) => [
        { update: { _index: getIndexName(), _id: id } },
        { doc: { available_int: availableInt } },
    ])

    const res = await client.bulk({ body, refresh: 'true' })
    const updated = res.body.items?.filter((item: any) => item.update?.status === 200).length ?? 0

    return { updated }
}
```

- [ ] **Step 4: Add controller method for bulkSwitchChunks**

In `be/src/modules/rag/controllers/rag.controller.ts`, after `deleteChunk` method, add:

```typescript
/**
 * @description Bulk enable/disable chunks by IDs
 * @param {Request} req - Express request with chunk_ids and available in body
 * @param {Response} res - Express response with updated count
 */
async bulkSwitchChunks(req: Request, res: Response): Promise<void> {
    const datasetId = req.params['id']
    if (!datasetId) { res.status(400).json({ error: 'Dataset ID is required' }); return }

    try {
        const { chunk_ids, available } = req.body
        const result = await ragSearchService.bulkSwitchChunks(datasetId, chunk_ids, available)
        res.json(result)
    } catch (error) {
        log.error('Failed to bulk switch chunks', { error: String(error) })
        res.status(500).json({ error: 'Failed to bulk switch chunks' })
    }
}
```

- [ ] **Step 5: Update listChunks controller to parse available query param**

In `be/src/modules/rag/controllers/rag.controller.ts`, update `listChunks` method (line ~885). Change the options type and add param parsing:

```typescript
        const options: { doc_id?: string; page?: number; limit?: number; available?: boolean } = {}
        if (req.query['doc_id']) options.doc_id = req.query['doc_id'] as string
        if (req.query['page']) options.page = parseInt(req.query['page'] as string, 10)
        if (req.query['limit']) options.limit = parseInt(req.query['limit'] as string, 10)
        // Parse available filter
        if (req.query['available'] !== undefined) {
            options.available = req.query['available'] === '1' || req.query['available'] === 'true'
        }
```

- [ ] **Step 6: Add bulk-switch route**

In `be/src/modules/rag/routes/rag.routes.ts`, after the existing chunk routes (line ~49), add:

```typescript
router.post('/datasets/:id/chunks/bulk-switch', requirePermission('manage_datasets'), validate({ params: uuidParamSchema, body: bulkChunkSwitchSchema }), controller.bulkSwitchChunks.bind(controller))
```

Add `bulkChunkSwitchSchema` to the import from `../schemas/rag.schemas`.

- [ ] **Step 7: Build and verify**

Run: `cd be && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add be/src/modules/rag/schemas/rag.schemas.ts be/src/modules/rag/routes/rag.routes.ts be/src/modules/rag/controllers/rag.controller.ts be/src/modules/rag/services/rag-search.service.ts
git commit -m "feat(rag): add chunk available filter to listChunks and bulk-switch endpoint"
```

---

### Task 1.3: Frontend — Chunk type, API, and hooks for toggle

**Files:**
- Modify: `fe/src/features/datasets/types/index.ts`
- Modify: `fe/src/features/datasets/api/datasetApi.ts`
- Modify: `fe/src/features/datasets/api/datasetQueries.ts`

- [ ] **Step 1: Extend Chunk and RetrievalChunk types**

In `fe/src/features/datasets/types/index.ts`, update `Chunk` interface (line ~94):

```typescript
export interface Chunk {
  chunk_id: string
  text: string
  doc_id?: string
  doc_name?: string
  page_num?: number[]
  positions?: number[][]
  score?: number
  method?: string
  /** Whether this chunk is available for search */
  available?: boolean
  /** Important keywords */
  important_kwd?: string[]
  /** Associated questions */
  question_kwd?: string[]
}
```

Update `RetrievalChunk` interface (line ~296):

```typescript
export interface RetrievalChunk {
  chunk_id: string
  text: string
  doc_id?: string
  doc_name?: string
  score: number
  vector_similarity?: number
  term_similarity?: number
  token_count?: number
  /** Highlighted text with <mark> tags */
  highlight?: string
  page_num?: number[]
  positions?: number[][]
}
```

- [ ] **Step 2: Add bulkSwitchChunks to datasetApi and update listChunks**

In `fe/src/features/datasets/api/datasetApi.ts`, after `deleteChunk` method, add:

```typescript
/**
 * @description Bulk enable/disable chunks
 * @param {string} datasetId - Dataset ID
 * @param {object} data - Chunk IDs and availability status
 * @returns {Promise<{ updated: number }>} Count of updated chunks
 */
bulkSwitchChunks: async (datasetId: string, data: { chunk_ids: string[]; available: boolean }): Promise<{ updated: number }> => {
  return api.post<{ updated: number }>(`${BASE_URL}/datasets/${datasetId}/chunks/bulk-switch`, data)
},
```

Update `listChunks` method (line ~228) to accept `available` param. Find the query string builder and add:
```typescript
if (params.available !== undefined) searchParams.append('available', params.available ? '1' : '0')
```

- [ ] **Step 3: Update useChunks hook to support available filter and toggle mutation**

In `fe/src/features/datasets/api/datasetQueries.ts`, update `UseChunksReturn` interface (line ~433):

```typescript
export interface UseChunksReturn {
  chunks: Chunk[]
  total: number
  page: number
  loading: boolean
  search: string
  availableFilter: boolean | undefined
  setAvailableFilter: (value: boolean | undefined) => void
  setSearch: (value: string) => void
  setPage: (page: number) => void
  refresh: () => void
  addChunk: (text: string) => Promise<void>
  updateChunk: (chunkId: string, text: string) => Promise<void>
  deleteChunk: (chunkId: string) => Promise<void>
  toggleChunk: (chunkId: string, available: boolean) => Promise<void>
}
```

Inside `useChunks` function, add state and mutation:
```typescript
const [availableFilter, setAvailableFilter] = useState<boolean | undefined>(undefined)

const toggleMutation = useMutation({
  mutationKey: ['datasets', 'chunks', 'toggle'],
  mutationFn: ({ chunkId, available }: { chunkId: string; available: boolean }) =>
    datasetApi.updateChunk(datasetId!, chunkId, { available }),
  onSuccess: invalidateChunks,
})

const toggleChunk = async (chunkId: string, available: boolean) => {
  if (!datasetId) return
  await toggleMutation.mutateAsync({ chunkId, available })
}
```

Pass `available: availableFilter` to the `listChunks` API call in the query function.

- [ ] **Step 4: Build frontend**

Run: `cd fe && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add fe/src/features/datasets/types/index.ts fe/src/features/datasets/api/datasetApi.ts fe/src/features/datasets/api/datasetQueries.ts
git commit -m "feat(datasets): add chunk toggle types, API, and hooks"
```

---

### Task 1.4: Frontend — ChunkCard toggle and ChunkList filter UI

**Files:**
- Modify: `fe/src/components/DocumentPreviewer/ChunkCard.tsx`
- Modify: `fe/src/components/DocumentPreviewer/ChunkList.tsx`
- Modify: `fe/src/i18n/locales/en.json`
- Modify: `fe/src/i18n/locales/vi.json`
- Modify: `fe/src/i18n/locales/ja.json`

- [ ] **Step 1: Add toggle to ChunkCard**

In `fe/src/components/DocumentPreviewer/ChunkCard.tsx`:

Add `onToggle` to props interface (line ~19):
```typescript
interface ChunkCardProps {
  chunk: Chunk
  index: number
  isSelected?: boolean | undefined
  onClick?: ((chunk: Chunk) => void) | undefined
  onUpdate?: ((chunkId: string, text: string) => Promise<void>) | undefined
  onDelete?: ((chunkId: string) => Promise<void>) | undefined
  onToggle?: ((chunkId: string, available: boolean) => Promise<void>) | undefined
}
```

Add `onToggle` to destructuring. In the card header area (next to edit/delete buttons), add:

```tsx
{onToggle && (
  <Switch
    checked={chunk.available !== false}
    onCheckedChange={(checked) => onToggle(chunk.chunk_id, checked)}
    className="h-4 w-7"
  />
)}
```

Add conditional dimming to the card container:
```tsx
className={cn(
  // ... existing classes
  chunk.available === false && 'opacity-50'
)}
```

Import `Switch` from `@/components/ui/switch` and `cn` from `@/lib/utils`.

- [ ] **Step 2: Add filter dropdown to ChunkList**

In `fe/src/components/DocumentPreviewer/ChunkList.tsx`:

Import `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`.

After the search input area, add filter dropdown:

```tsx
<Select
  value={availableFilter === undefined ? 'all' : availableFilter ? 'enabled' : 'disabled'}
  onValueChange={(v) => setAvailableFilter(v === 'all' ? undefined : v === 'enabled')}
>
  <SelectTrigger className="w-[120px]">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">{t('chunks.filterAll', 'All')}</SelectItem>
    <SelectItem value="enabled">{t('chunks.filterEnabled', 'Enabled')}</SelectItem>
    <SelectItem value="disabled">{t('chunks.filterDisabled', 'Disabled')}</SelectItem>
  </SelectContent>
</Select>
```

Wire `toggleChunk` to `ChunkCard`:
```tsx
<ChunkCard
  // ... existing props
  onToggle={toggleChunk}
/>
```

Destructure `availableFilter`, `setAvailableFilter`, `toggleChunk` from `useChunks`.

- [ ] **Step 3: Add i18n keys**

Add to all 3 locale files (`en.json`, `vi.json`, `ja.json`) under a `"chunks"` section:

**en.json:**
```json
"chunks": {
  "filterAll": "All",
  "filterEnabled": "Enabled",
  "filterDisabled": "Disabled",
  "toggleSuccess": "Chunk availability updated",
  "bulkSwitchSuccess": "{{count}} chunks updated"
}
```

**vi.json:**
```json
"chunks": {
  "filterAll": "Tất cả",
  "filterEnabled": "Đã bật",
  "filterDisabled": "Đã tắt",
  "toggleSuccess": "Đã cập nhật trạng thái chunk",
  "bulkSwitchSuccess": "Đã cập nhật {{count}} chunk"
}
```

**ja.json:**
```json
"chunks": {
  "filterAll": "すべて",
  "filterEnabled": "有効",
  "filterDisabled": "無効",
  "toggleSuccess": "チャンクの可用性を更新しました",
  "bulkSwitchSuccess": "{{count}}件のチャンクを更新しました"
}
```

- [ ] **Step 4: Build and verify**

Run: `cd fe && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add fe/src/components/DocumentPreviewer/ChunkCard.tsx fe/src/components/DocumentPreviewer/ChunkList.tsx fe/src/i18n/locales/
git commit -m "feat(datasets): add chunk enable/disable toggle UI with filter dropdown"
```

---

## Chunk 2: Feature 2 — Chunk Keywords & Questions Management

### Task 2.1: Backend — Add question_keywords to schema and service

**Files:**
- Modify: `be/src/modules/rag/schemas/rag.schemas.ts`
- Modify: `be/src/modules/rag/services/rag-search.service.ts`

- [ ] **Step 1: Add question_keywords to createChunkSchema**

In `be/src/modules/rag/schemas/rag.schemas.ts`, update `createChunkSchema` (line ~113):

```typescript
export const createChunkSchema = z.object({
  content: z.string().min(1, 'Chunk content is required'),
  doc_id: z.string().optional(),
  important_keywords: z.array(z.string()).optional(),
  question_keywords: z.array(z.string()).optional(),
})
```

- [ ] **Step 2: Add question_keywords to updateChunkSchema**

In `be/src/modules/rag/schemas/rag.schemas.ts`, update `updateChunkSchema` (line ~120):

```typescript
export const updateChunkSchema = z.object({
  content: z.string().min(1, 'Chunk content is required').optional(),
  important_keywords: z.array(z.string()).optional(),
  question_keywords: z.array(z.string()).optional(),
  available: z.boolean().optional(),
})
```

- [ ] **Step 3: Update addChunk service to store question_kwd**

In `be/src/modules/rag/services/rag-search.service.ts`, update `addChunk` method (line ~330). Change the `data` parameter type:

```typescript
async addChunk(datasetId: string, data: {
    content: string;
    doc_id?: string;
    important_keywords?: string[];
    question_keywords?: string[];
}): Promise<{ chunk_id: string }> {
```

After the `important_kwd` block (line ~343), add:
```typescript
    if (data.question_keywords?.length) {
        body.question_kwd = data.question_keywords
    }
```

- [ ] **Step 4: Update updateChunk service to support question_kwd**

In `be/src/modules/rag/services/rag-search.service.ts`, update `updateChunk` method (line ~361). Change the `data` parameter type:

```typescript
async updateChunk(
    datasetId: string,
    chunkId: string,
    data: { content?: string; important_keywords?: string[]; question_keywords?: string[]; available?: boolean },
): Promise<{ chunk_id: string; updated: boolean }> {
```

After the `important_kwd` mapping (line ~375), add:
```typescript
    if (data.question_keywords !== undefined) {
        doc.question_kwd = data.question_keywords
    }
```

- [ ] **Step 5: Build and verify**

Run: `cd be && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add be/src/modules/rag/schemas/rag.schemas.ts be/src/modules/rag/services/rag-search.service.ts
git commit -m "feat(rag): add question_keywords support to chunk create/update"
```

---

### Task 2.2: Frontend — Create TagEditor shared component

**Files:**
- Create: `fe/src/components/ui/tag-editor.tsx`

- [ ] **Step 1: Create TagEditor component**

Create `fe/src/components/ui/tag-editor.tsx`:

```tsx
'use client'

import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * @description Editable tag list with input field for adding/removing string tags
 * @param {TagEditorProps} props - Tag editor configuration
 * @returns {JSX.Element} Tag editor with pills and input
 */

interface TagEditorProps {
  /** Current tag values */
  value: string[]
  /** Callback when tags change */
  onChange: (tags: string[]) => void
  /** Input placeholder text */
  placeholder?: string
  /** Label displayed above the editor */
  label?: string
  /** Badge variant for tag pills */
  variant?: 'default' | 'secondary' | 'outline'
  /** Whether the editor is disabled */
  disabled?: boolean
}

export function TagEditor({
  value,
  onChange,
  placeholder = 'Type and press Enter',
  label,
  variant = 'secondary',
  disabled = false,
}: TagEditorProps) {
  const [input, setInput] = useState('')

  /** Split pasted or typed text into individual tags */
  const addTags = (text: string) => {
    const newTags = text
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !value.includes(t))
    if (newTags.length > 0) {
      onChange([...value, ...newTags])
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTags(input)
      setInput('')
    }
    // Remove last tag on backspace with empty input
    if (e.key === 'Backspace' && input === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    addTags(text)
    setInput('')
  }

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-1.5">
      {label && <Label className="text-xs font-medium">{label}</Label>}
      <div className="flex flex-wrap gap-1 rounded-md border p-2 min-h-[36px]">
        {value.map((tag, i) => (
          <Badge key={`${tag}-${i}`} variant={variant} className="gap-1 text-xs">
            {tag}
            {!disabled && (
              <button type="button" onClick={() => removeTag(i)} className="hover:text-destructive">
                <X size={12} />
              </button>
            )}
          </Badge>
        ))}
        {!disabled && (
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={value.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[100px] border-0 p-0 h-6 text-xs shadow-none focus-visible:ring-0"
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build and verify**

Run: `cd fe && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add fe/src/components/ui/tag-editor.tsx
git commit -m "feat(ui): create reusable TagEditor component for keyword/tag management"
```

---

### Task 2.3: Frontend — Update AddChunkModal and useChunks for keywords/questions

**Files:**
- Modify: `fe/src/features/datasets/components/AddChunkModal.tsx`
- Modify: `fe/src/features/datasets/api/datasetApi.ts`
- Modify: `fe/src/features/datasets/api/datasetQueries.ts`

- [ ] **Step 1: Fix datasetApi.addChunk field name and add keywords**

In `fe/src/features/datasets/api/datasetApi.ts`, update `addChunk` (line ~248). Change `text` to `content` and add keyword fields:

```typescript
/**
 * @description Create a new chunk in a dataset
 * @param {string} datasetId - Dataset ID
 * @param {object} data - Chunk content and optional metadata
 * @returns {Promise<Chunk>} Created chunk
 */
addChunk: async (datasetId: string, data: {
  content: string;
  doc_id?: string;
  important_keywords?: string[];
  question_keywords?: string[];
}): Promise<Chunk> => {
  return api.post<Chunk>(`${BASE_URL}/datasets/${datasetId}/chunks`, data)
},
```

- [ ] **Step 2: Update useChunks hook addChunk signature**

In `fe/src/features/datasets/api/datasetQueries.ts`, update `UseChunksReturn` — change `addChunk`:

```typescript
addChunk: (data: { content: string; important_keywords?: string[]; question_keywords?: string[] }) => Promise<void>
```

Update `addMutation` (line ~491):
```typescript
const addMutation = useMutation({
  mutationKey: ['datasets', 'chunks', 'create'],
  mutationFn: (data: { content: string; important_keywords?: string[]; question_keywords?: string[] }) =>
    datasetApi.addChunk(datasetId!, { ...data, ...(docId ? { doc_id: docId } : {}) }),
  meta: { successMessage: t('datasetSettings.chunks.addSuccess') },
  onSuccess: invalidateChunks,
})
```

Update `addChunk` handler (line ~516):
```typescript
const addChunk = async (data: { content: string; important_keywords?: string[]; question_keywords?: string[] }) => {
  if (!datasetId) return
  await addMutation.mutateAsync(data)
}
```

- [ ] **Step 3: Update AddChunkModal to include TagEditors**

In `fe/src/features/datasets/components/AddChunkModal.tsx`:

Change `onSubmit` prop type (line ~24):
```typescript
onSubmit: (data: { content: string; important_keywords?: string[]; question_keywords?: string[] }) => Promise<void>
```

Add state and imports:
```typescript
import { TagEditor } from '@/components/ui/tag-editor'

const [keywords, setKeywords] = useState<string[]>([])
const [questions, setQuestions] = useState<string[]>([])
```

Update `handleSubmit`:
```typescript
const handleSubmit = async () => {
  if (!text.trim()) return
  setSaving(true)
  try {
    await onSubmit({
      content: text,
      ...(keywords.length > 0 ? { important_keywords: keywords } : {}),
      ...(questions.length > 0 ? { question_keywords: questions } : {}),
    })
    setText('')
    setKeywords([])
    setQuestions([])
    onClose()
  } finally {
    setSaving(false)
  }
}
```

Add `TagEditor` components after the textarea in JSX:
```tsx
<TagEditor
  label={t('chunks.keywords', 'Keywords')}
  value={keywords}
  onChange={setKeywords}
  placeholder={t('chunks.keywordsPlaceholder', 'Add keyword and press Enter')}
/>
<TagEditor
  label={t('chunks.questions', 'Questions')}
  value={questions}
  onChange={setQuestions}
  placeholder={t('chunks.questionsPlaceholder', 'Add question and press Enter')}
  variant="outline"
/>
```

- [ ] **Step 4: Build and verify**

Run: `cd fe && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add fe/src/features/datasets/components/AddChunkModal.tsx fe/src/features/datasets/api/datasetApi.ts fe/src/features/datasets/api/datasetQueries.ts
git commit -m "feat(datasets): add keywords and questions support to chunk creation"
```

---

### Task 2.4: Frontend — ChunkCard keyword/question display and editing

**Files:**
- Modify: `fe/src/components/DocumentPreviewer/ChunkCard.tsx`
- Modify: `fe/src/features/datasets/api/datasetQueries.ts`
- Modify: `fe/src/i18n/locales/en.json`
- Modify: `fe/src/i18n/locales/vi.json`
- Modify: `fe/src/i18n/locales/ja.json`

- [ ] **Step 1: Update ChunkCard onUpdate signature for keyword editing**

In `fe/src/components/DocumentPreviewer/ChunkCard.tsx`, update `onUpdate` in props:

```typescript
onUpdate?: ((chunkId: string, data: { content?: string; important_keywords?: string[]; question_keywords?: string[] }) => Promise<void>) | undefined
```

- [ ] **Step 2: Add keyword/question display in view mode**

After the text preview area in the card, add:

```tsx
{!editing && (chunk.important_kwd?.length || chunk.question_kwd?.length) ? (
  <div className="flex flex-wrap gap-1 mt-2">
    {chunk.important_kwd?.map((kw, i) => (
      <Badge key={`kw-${i}`} variant="secondary" className="text-xs">{kw}</Badge>
    ))}
    {chunk.question_kwd?.map((q, i) => (
      <Badge key={`q-${i}`} variant="outline" className="text-xs">{q}</Badge>
    ))}
  </div>
) : null}
```

- [ ] **Step 3: Add keyword/question editing in edit mode**

Add state:
```typescript
const [editKeywords, setEditKeywords] = useState<string[]>(chunk.important_kwd || [])
const [editQuestions, setEditQuestions] = useState<string[]>(chunk.question_kwd || [])
```

In the edit mode section, add `TagEditor` components after the textarea:
```tsx
<TagEditor label={t('chunks.keywords', 'Keywords')} value={editKeywords} onChange={setEditKeywords} variant="secondary" />
<TagEditor label={t('chunks.questions', 'Questions')} value={editQuestions} onChange={setEditQuestions} variant="outline" />
```

Update save handler:
```typescript
const handleSave = async () => {
  if (onUpdate) {
    await onUpdate(chunk.chunk_id, {
      content: editText,
      important_keywords: editKeywords,
      question_keywords: editQuestions,
    })
  }
  setEditing(false)
}
```

Import `TagEditor` from `@/components/ui/tag-editor` and `Badge` from `@/components/ui/badge`.

- [ ] **Step 4: Update useChunks.updateChunk to accept full data**

In `fe/src/features/datasets/api/datasetQueries.ts`, update `updateChunk` in `UseChunksReturn`:

```typescript
updateChunk: (chunkId: string, data: { content?: string; important_keywords?: string[]; question_keywords?: string[] }) => Promise<void>
```

Update the mutation and handler to pass the full data object to `datasetApi.updateChunk`.

- [ ] **Step 5: Add i18n keys**

Add to all 3 locale files under `"chunks"`:

**en.json:** `"keywords": "Keywords", "keywordsPlaceholder": "Add keyword and press Enter", "questions": "Questions", "questionsPlaceholder": "Add question and press Enter"`

**vi.json:** `"keywords": "Từ khóa", "keywordsPlaceholder": "Thêm từ khóa và nhấn Enter", "questions": "Câu hỏi", "questionsPlaceholder": "Thêm câu hỏi và nhấn Enter"`

**ja.json:** `"keywords": "キーワード", "keywordsPlaceholder": "キーワードを入力してEnterを押す", "questions": "質問", "questionsPlaceholder": "質問を入力してEnterを押す"`

- [ ] **Step 6: Build and verify**

Run: `cd fe && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add fe/src/components/DocumentPreviewer/ChunkCard.tsx fe/src/features/datasets/api/datasetQueries.ts fe/src/i18n/locales/
git commit -m "feat(datasets): add keyword and question display/editing to ChunkCard"
```

---

## Chunk 3: Feature 3 — Enhanced Retrieval Test

### Task 3.1: Backend — Add vector_similarity_weight and highlight to search service

**Files:**
- Modify: `be/src/modules/rag/schemas/rag.schemas.ts`
- Modify: `be/src/modules/rag/services/rag-search.service.ts`
- Modify: `be/src/modules/rag/controllers/rag.controller.ts`

- [ ] **Step 1: Add vector_similarity_weight to retrievalTestSchema**

In `be/src/modules/rag/schemas/rag.schemas.ts`, update `retrievalTestSchema` (line ~152). Add after `similarity_threshold`:

```typescript
  vector_similarity_weight: z.number().min(0).max(1).optional().default(0.3),
```

- [ ] **Step 2: Add highlight config to fullTextSearch and semanticSearch**

In `be/src/modules/rag/services/rag-search.service.ts`:

For **fullTextSearch** (line ~91), add to the search body:
```typescript
highlight: {
    fields: {
        content_with_weight: {
            pre_tags: ['<mark>'],
            post_tags: ['</mark>'],
            fragment_size: 300,
            number_of_fragments: 1,
        },
    },
},
```

Same for **semanticSearch** (line ~129).

- [ ] **Step 3: Update hybridSearch to accept vectorWeight param**

In `be/src/modules/rag/services/rag-search.service.ts`, update `hybridSearch` method signature (line ~182) to accept `vectorWeight: number = 0.5` param. Update the score merging logic:

```typescript
const score = vectorWeight * (vectorScore ?? 0) + (1 - vectorWeight) * (textScore ?? 0)
```

Add highlight config to both internal search queries.

- [ ] **Step 4: Update search dispatcher to pass new params and apply threshold**

In the `search` dispatcher method (line ~244):

```typescript
// Filter by doc_ids if provided
if (req.doc_ids?.length) {
    extraFilters.push({ terms: { doc_id: req.doc_ids } })
}

// Pass vector_similarity_weight to hybridSearch
const vectorWeight = req.vector_similarity_weight ?? 0.3
```

After getting results, apply threshold:
```typescript
const threshold = req.similarity_threshold ?? 0.2
const filtered = results.filter((chunk) => chunk.score >= threshold)
```

- [ ] **Step 5: Update controller to pass new params**

In `be/src/modules/rag/controllers/rag.controller.ts`, update `retrievalTest` (line ~835):

```typescript
const result = await ragSearchService.search(datasetId, {
    query: req.body.query,
    method: req.body.method || 'hybrid',
    top_k: req.body.top_k || 5,
    similarity_threshold: req.body.similarity_threshold ?? 0.2,
    vector_similarity_weight: req.body.vector_similarity_weight ?? 0.3,
    doc_ids: req.body.doc_ids,
})
```

- [ ] **Step 6: Build and verify**

Run: `cd be && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add be/src/modules/rag/schemas/rag.schemas.ts be/src/modules/rag/services/rag-search.service.ts be/src/modules/rag/controllers/rag.controller.ts
git commit -m "feat(rag): add vector weight, highlight, and threshold to retrieval test"
```

---

### Task 3.2: Frontend — Install DOMPurify and update retrieval test types/API

**Files:**
- Modify: `fe/package.json` (via npm install)
- Modify: `fe/src/features/datasets/api/datasetApi.ts`

- [ ] **Step 1: Install DOMPurify**

Run: `cd fe && npm install dompurify @types/dompurify`

- [ ] **Step 2: Update runRetrievalTest API params**

In `fe/src/features/datasets/api/datasetApi.ts`, update `runRetrievalTest` (line ~306):

```typescript
/**
 * @description Run retrieval test with configurable search parameters
 * @param {string} datasetId - Dataset ID
 * @param {object} params - Test parameters including query, method, thresholds
 * @returns {Promise<RetrievalTestResult>} Ranked chunks with scores
 */
runRetrievalTest: async (
  datasetId: string,
  params: {
    query: string
    method?: string
    top_k?: number
    similarity_threshold?: number
    vector_similarity_weight?: number
    doc_ids?: string[]
  },
): Promise<RetrievalTestResult> => {
  return api.post<RetrievalTestResult>(`${BASE_URL}/datasets/${datasetId}/retrieval-test`, params)
},
```

- [ ] **Step 3: Commit**

```bash
git add fe/package.json fe/package-lock.json fe/src/features/datasets/api/datasetApi.ts
git commit -m "feat(datasets): install DOMPurify and update retrieval test API params"
```

---

### Task 3.3: Frontend — Enhanced RetrievalTestPanel and ChunkResultCard

**Files:**
- Modify: `fe/src/features/datasets/components/RetrievalTestPanel.tsx`
- Modify: `fe/src/features/datasets/components/ChunkResultCard.tsx`
- Modify: `fe/src/features/datasets/hooks/useRetrievalTest.ts`
- Modify: `fe/src/i18n/locales/en.json`
- Modify: `fe/src/i18n/locales/vi.json`
- Modify: `fe/src/i18n/locales/ja.json`

- [ ] **Step 1: Add controls to RetrievalTestPanel**

In `fe/src/features/datasets/components/RetrievalTestPanel.tsx`, add state:

```typescript
const [similarityThreshold, setSimilarityThreshold] = useState(0.2)
const [vectorWeight, setVectorWeight] = useState(0.3)
```

After the existing top-K control, add slider controls:

```tsx
{/* Similarity threshold slider */}
<div className="space-y-1">
  <Label className="text-xs">{t('retrievalTest.similarityThreshold', 'Similarity Threshold')}: {similarityThreshold.toFixed(2)}</Label>
  <Slider value={[similarityThreshold]} onValueChange={([v]) => setSimilarityThreshold(v)} min={0} max={1} step={0.01} />
</div>

{/* Vector/keyword weight — only for hybrid */}
{method === 'hybrid' && (
  <div className="space-y-1">
    <div className="flex justify-between text-xs">
      <span>{t('retrievalTest.semantic', 'Semantic')} {Math.round(vectorWeight * 100)}%</span>
      <span>{t('retrievalTest.keyword', 'Keyword')} {Math.round((1 - vectorWeight) * 100)}%</span>
    </div>
    <Slider value={[vectorWeight]} onValueChange={([v]) => setVectorWeight(v)} min={0} max={1} step={0.01} />
  </div>
)}
```

Update `handleTest`:
```typescript
const handleTest = () => {
  if (!query.trim()) return
  runTest({ query, method, top_k: topK, similarity_threshold: similarityThreshold, vector_similarity_weight: vectorWeight })
}
```

Import `Slider` from `@/components/ui/slider` and `Label` from `@/components/ui/label`.

- [ ] **Step 2: Update useRetrievalTest hook params**

In `fe/src/features/datasets/hooks/useRetrievalTest.ts`, extend the params type to include `similarity_threshold`, `vector_similarity_weight`, `doc_ids`.

- [ ] **Step 3: Enhance ChunkResultCard with score breakdown and highlight**

In `fe/src/features/datasets/components/ChunkResultCard.tsx`:

```tsx
import DOMPurify from 'dompurify'

// Score breakdown section:
<div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
  <div className="flex items-center gap-1">
    <span>{t('retrievalTest.overallScore', 'Overall')}:</span>
    <Badge variant="default" className="text-xs">{(chunk.score * 100).toFixed(1)}%</Badge>
  </div>
  {chunk.vector_similarity !== undefined && (
    <div className="flex items-center gap-1">
      <span>{t('retrievalTest.vectorScore', 'Vector')}:</span>
      <Badge variant="secondary" className="text-xs">{(chunk.vector_similarity * 100).toFixed(1)}%</Badge>
    </div>
  )}
  {chunk.term_similarity !== undefined && (
    <div className="flex items-center gap-1">
      <span>{t('retrievalTest.termScore', 'Term')}:</span>
      <Badge variant="outline" className="text-xs">{(chunk.term_similarity * 100).toFixed(1)}%</Badge>
    </div>
  )}
  {chunk.token_count !== undefined && (
    <span>{chunk.token_count} {t('retrievalTest.tokens', 'tokens')}</span>
  )}
</div>

{/* Text with optional highlighting — sanitized with DOMPurify */}
{chunk.highlight ? (
  <p
    className="text-sm line-clamp-6"
    dangerouslySetInnerHTML={{
      __html: DOMPurify.sanitize(chunk.highlight, { ALLOWED_TAGS: ['mark'] }),
    }}
  />
) : (
  <p className="text-sm line-clamp-6">{chunk.text}</p>
)}
```

- [ ] **Step 4: Add i18n keys for retrieval test**

**en.json:**
```json
"retrievalTest": {
  "similarityThreshold": "Similarity Threshold",
  "semantic": "Semantic",
  "keyword": "Keyword",
  "overallScore": "Overall",
  "vectorScore": "Vector",
  "termScore": "Term",
  "tokens": "tokens"
}
```

**vi.json:**
```json
"retrievalTest": {
  "similarityThreshold": "Ngưỡng tương đồng",
  "semantic": "Ngữ nghĩa",
  "keyword": "Từ khóa",
  "overallScore": "Tổng thể",
  "vectorScore": "Vector",
  "termScore": "Từ khóa",
  "tokens": "token"
}
```

**ja.json:**
```json
"retrievalTest": {
  "similarityThreshold": "類似度閾値",
  "semantic": "セマンティック",
  "keyword": "キーワード",
  "overallScore": "総合",
  "vectorScore": "ベクトル",
  "termScore": "用語",
  "tokens": "トークン"
}
```

- [ ] **Step 5: Build and verify**

Run: `cd fe && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add fe/src/features/datasets/components/RetrievalTestPanel.tsx fe/src/features/datasets/components/ChunkResultCard.tsx fe/src/features/datasets/hooks/useRetrievalTest.ts fe/src/i18n/locales/
git commit -m "feat(datasets): enhance retrieval test with threshold, weight sliders, score breakdown, and highlight"
```

---

## Chunk 4: Feature 4 — Per-Document Parser Change

### Task 4.1: Backend — Add changeDocumentParser endpoint

**Files:**
- Modify: `be/src/modules/rag/schemas/rag.schemas.ts`
- Modify: `be/src/modules/rag/routes/rag.routes.ts`
- Modify: `be/src/modules/rag/controllers/rag.controller.ts`
- Modify: `be/src/modules/rag/services/rag-document.service.ts`
- Modify: `be/src/modules/rag/services/rag-search.service.ts`

- [ ] **Step 1: Add changeDocumentParserSchema and deleteChunksByDocId**

In `be/src/modules/rag/schemas/rag.schemas.ts`, add:

```typescript
/**
 * @description Schema for changing a document's parser/chunking method
 */
export const changeDocumentParserSchema = z.object({
  parser_id: z.enum([
    'naive', 'qa', 'resume', 'manual', 'table', 'paper',
    'book', 'laws', 'presentation', 'one', 'picture', 'audio', 'email',
  ]),
  parser_config: z.record(z.unknown()).optional(),
})
```

In `be/src/modules/rag/services/rag-search.service.ts`, add `deleteChunksByDocId` method:

```typescript
/**
 * @description Delete all chunks belonging to a specific document
 * @param {string} datasetId - Dataset ID
 * @param {string} docId - Document ID whose chunks to delete
 * @returns {Promise<{ deleted: number }>} Count of deleted chunks
 */
async deleteChunksByDocId(datasetId: string, docId: string): Promise<{ deleted: number }> {
    const client = getClient()
    const res = await client.deleteByQuery({
        index: getIndexName(),
        body: {
            query: {
                bool: {
                    must: [
                        { term: { kb_id: datasetId } },
                        { term: { doc_id: docId } },
                    ],
                },
            },
        },
        refresh: true,
    })
    return { deleted: res.body.deleted ?? 0 }
}
```

- [ ] **Step 2: Add changeDocumentParser to rag-document.service**

In `be/src/modules/rag/services/rag-document.service.ts`, add:

```typescript
/**
 * @description Change a document's parser and reset for re-parsing
 * @param {string} datasetId - Dataset ID
 * @param {string} docId - Document ID
 * @param {object} data - New parser_id and optional parser_config
 * @returns {Promise<any>} Updated document record
 * @throws {Error} If document is currently being parsed (409 Conflict)
 */
async changeDocumentParser(
    datasetId: string,
    docId: string,
    data: { parser_id: string; parser_config?: Record<string, unknown> },
): Promise<any> {
    const doc = await this.getDocument(docId)
    if (!doc || doc.kb_id !== datasetId) {
        throw new Error('Document not found in this dataset')
    }

    // Guard: cannot change parser while parsing
    if (doc.run === '1') {
        const error = new Error('Cannot change parser while document is being parsed')
        ;(error as any).statusCode = 409
        throw error
    }

    // No-op if unchanged
    if (doc.parser_id === data.parser_id && !data.parser_config) {
        return doc
    }

    // Delete existing chunks
    await ragSearchService.deleteChunksByDocId(datasetId, docId)

    // Reset document
    const updateData: Record<string, unknown> = {
        parser_id: data.parser_id,
        progress: 0,
        progress_msg: '',
        run: '0',
        chunk_num: 0,
        token_num: 0,
    }
    if (data.parser_config) {
        updateData.parser_config = JSON.stringify(data.parser_config)
    }

    await this.updateDocument(docId, updateData)
    return { ...doc, ...updateData }
}
```

Import `ragSearchService` from `./rag-search.service` at the top if not already imported.

- [ ] **Step 3: Add controller and route**

In `be/src/modules/rag/controllers/rag.controller.ts`, add:

```typescript
/**
 * @description Change a document's parser/chunking method
 * @param {Request} req - Express request with parser_id and optional parser_config
 * @param {Response} res - Express response with updated document
 */
async changeDocumentParser(req: Request, res: Response): Promise<void> {
    const { id: datasetId, docId } = req.params
    if (!datasetId || !docId) {
        res.status(400).json({ error: 'Dataset ID and document ID are required' })
        return
    }

    try {
        const result = await ragDocumentService.changeDocumentParser(datasetId, docId, req.body)
        res.json(result)
    } catch (error: any) {
        if (error.statusCode === 409) {
            res.status(409).json({ error: error.message })
            return
        }
        log.error('Failed to change document parser', { error: String(error) })
        res.status(500).json({ error: 'Failed to change document parser' })
    }
}
```

In `be/src/modules/rag/routes/rag.routes.ts`, add:

```typescript
router.put('/datasets/:id/documents/:docId/parser', requirePermission('manage_datasets'), validate({ body: changeDocumentParserSchema }), controller.changeDocumentParser.bind(controller))
```

- [ ] **Step 4: Build and verify**

Run: `cd be && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add be/src/modules/rag/schemas/rag.schemas.ts be/src/modules/rag/routes/rag.routes.ts be/src/modules/rag/controllers/rag.controller.ts be/src/modules/rag/services/rag-document.service.ts be/src/modules/rag/services/rag-search.service.ts
git commit -m "feat(rag): add per-document parser change endpoint with conflict guard"
```

---

### Task 4.2: Frontend — ChangeParserDialog and DocumentTable integration

**Files:**
- Create: `fe/src/features/datasets/components/ChangeParserDialog.tsx`
- Modify: `fe/src/features/datasets/api/datasetApi.ts`
- Modify: `fe/src/features/datasets/api/datasetQueries.ts`
- Modify: `fe/src/features/datasets/components/DocumentTable.tsx`
- Modify: `fe/src/i18n/locales/en.json`
- Modify: `fe/src/i18n/locales/vi.json`
- Modify: `fe/src/i18n/locales/ja.json`

- [ ] **Step 1: Add changeDocumentParser to API and create mutation hook**

In `fe/src/features/datasets/api/datasetApi.ts`, add:

```typescript
/**
 * @description Change a document's parser/chunking method
 * @param {string} datasetId - Dataset ID
 * @param {string} docId - Document ID
 * @param {object} data - New parser_id and optional config
 * @returns {Promise<Document>} Updated document
 */
changeDocumentParser: async (
  datasetId: string,
  docId: string,
  data: { parser_id: string; parser_config?: Record<string, unknown> },
): Promise<Document> => {
  return api.put<Document>(`${BASE_URL}/datasets/${datasetId}/documents/${docId}/parser`, data)
},
```

In `fe/src/features/datasets/api/datasetQueries.ts`, add:

```typescript
/**
 * @description Mutation hook for changing a document's parser
 * @param {string} datasetId - Dataset ID
 * @returns {UseMutationResult} Mutation result
 */
export function useChangeDocumentParser(datasetId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['datasets', datasetId, 'change-parser'],
    mutationFn: ({ docId, parser_id, parser_config }: {
      docId: string
      parser_id: string
      parser_config?: Record<string, unknown>
    }) => datasetApi.changeDocumentParser(datasetId, docId, { parser_id, parser_config }),
    meta: { successMessage: t('datasets.changeParserSuccess', 'Parser changed. Document will be re-parsed.') },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets', datasetId, 'documents'] })
      queryClient.invalidateQueries({ queryKey: ['datasets', datasetId, 'chunks'] })
    },
  })
}
```

- [ ] **Step 2: Create ChangeParserDialog component**

Create `fe/src/features/datasets/components/ChangeParserDialog.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import type { Document } from '../types'

/**
 * @description Dialog to change a document's chunking/parser method
 * @param {ChangeParserDialogProps} props - Dialog configuration
 * @returns {JSX.Element} Parser change dialog
 */

const PARSER_OPTIONS = [
  'naive', 'qa', 'resume', 'manual', 'table', 'paper',
  'book', 'laws', 'presentation', 'one', 'picture', 'audio', 'email',
] as const

interface ChangeParserDialogProps {
  open: boolean
  onClose: () => void
  document: Document | null
  onConfirm: (parserId: string) => Promise<void>
}

export function ChangeParserDialog({ open, onClose, document, onConfirm }: ChangeParserDialogProps) {
  const { t } = useTranslation()
  const [parserId, setParserId] = useState(document?.parser_id || 'naive')
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    try {
      await onConfirm(parserId)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('datasets.changeParser', 'Change Parser')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm">{t('datasets.currentParser', 'Current')}:</Label>
            <Badge variant="secondary">{document?.parser_id || 'naive'}</Badge>
          </div>

          <div className="space-y-1">
            <Label className="text-sm">{t('datasets.newParser', 'New Parser')}</Label>
            <Select value={parserId} onValueChange={setParserId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARSER_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t('datasets.changeParserWarning', 'Changing the parser will delete all existing chunks and re-parse the document.')}
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button onClick={handleConfirm} disabled={saving || parserId === document?.parser_id}>
            {saving ? t('common.saving', 'Saving...') : t('common.confirm', 'Confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Add "Change Parser" action to DocumentTable**

In `fe/src/features/datasets/components/DocumentTable.tsx`, in the per-row actions area (line ~312), after the Parse button add:

```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon" className="h-7 w-7"
        onClick={() => { setParserChangeDoc(doc); setParserDialogOpen(true) }}
        disabled={doc.run === '1'}>
        <Settings2 size={14} />
      </Button>
    </TooltipTrigger>
    <TooltipContent>{t('datasets.changeParser', 'Change Parser')}</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

Add state, dialog, and imports. Import `Settings2` from `lucide-react`, `ChangeParserDialog`, `useChangeDocumentParser`.

- [ ] **Step 4: Add i18n keys**

**en.json:** `"changeParser": "Change Parser", "currentParser": "Current", "newParser": "New Parser", "changeParserWarning": "Changing the parser will delete all existing chunks and re-parse the document.", "changeParserSuccess": "Parser changed. Document will be re-parsed."`

**vi.json:** `"changeParser": "Đổi Parser", "currentParser": "Hiện tại", "newParser": "Parser mới", "changeParserWarning": "Đổi parser sẽ xóa tất cả chunk hiện tại và phân tích lại tài liệu.", "changeParserSuccess": "Đã đổi parser. Tài liệu sẽ được phân tích lại."`

**ja.json:** `"changeParser": "パーサー変更", "currentParser": "現在", "newParser": "新しいパーサー", "changeParserWarning": "パーサーを変更すると、既存のチャンクがすべて削除され、ドキュメントが再解析されます。", "changeParserSuccess": "パーサーを変更しました。ドキュメントは再解析されます。"`

- [ ] **Step 5: Build and verify**

Run: `cd fe && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add fe/src/features/datasets/components/ChangeParserDialog.tsx fe/src/features/datasets/components/DocumentTable.tsx fe/src/features/datasets/api/datasetApi.ts fe/src/features/datasets/api/datasetQueries.ts fe/src/i18n/locales/
git commit -m "feat(datasets): add per-document parser change dialog and integration"
```

---

## Chunk 5: Feature 5 — Web Crawl as Data Source

### Task 5.1: Backend — Add web crawl endpoint

**Files:**
- Modify: `be/src/modules/rag/schemas/rag.schemas.ts`
- Modify: `be/src/modules/rag/routes/rag.routes.ts`
- Modify: `be/src/modules/rag/controllers/rag.controller.ts`
- Modify: `be/src/modules/rag/services/rag-document.service.ts`
- Modify: `be/src/shared/models/types.ts`

- [ ] **Step 1: Add webCrawlSchema**

In `be/src/modules/rag/schemas/rag.schemas.ts`, add:

```typescript
/**
 * @description Schema for web crawl document creation
 */
export const webCrawlSchema = z.object({
  url: z.string().url('Invalid URL format'),
  name: z.string().min(1).max(255).optional(),
  auto_parse: z.boolean().optional().default(true),
})
```

- [ ] **Step 2: Add SSRF validation and webCrawlDocument service**

In `be/src/modules/rag/services/rag-document.service.ts`, add:

```typescript
/**
 * @description Validate URL is not targeting internal/private networks (SSRF prevention)
 * @param {string} urlString - URL to validate
 * @throws {Error} If URL targets a private/internal IP range
 */
private validateUrlSafety(urlString: string): void {
    const url = new URL(urlString)
    const hostname = url.hostname
    const privatePatterns = [
        /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
        /^127\./, /^0\./, /^localhost$/i, /^::1$/, /^fe80:/i,
    ]
    for (const pattern of privatePatterns) {
        if (pattern.test(hostname)) {
            throw new Error('URL targets a private/internal network address')
        }
    }
}

/**
 * @description Create a document from a web URL (async crawl via worker)
 * @param {string} datasetId - Dataset ID
 * @param {object} data - URL, optional name, and auto_parse flag
 * @returns {Promise<any>} Placeholder document record
 */
async webCrawlDocument(
    datasetId: string,
    data: { url: string; name?: string; auto_parse?: boolean },
): Promise<any> {
    this.validateUrlSafety(data.url)

    const url = new URL(data.url)
    const name = data.name || `${url.hostname}${url.pathname}`.replace(/\/$/, '').substring(0, 255)

    const dataset = await this.getKnowledgebase(datasetId)
    if (!dataset) throw new Error('Dataset not found')

    const doc = await this.createDocument({
        kb_id: datasetId,
        name,
        type: 'pdf',
        source_type: 'web_crawl',
        source_url: data.url,
        run: '0',
        progress: 0,
        progress_msg: 'Queued for web crawl',
        parser_id: dataset.parser_id || 'naive',
        size: 0,
    })

    // Queue crawl task via Redis
    // TODO: implement Redis queue push matching advance-rag worker pattern

    return doc
}
```

- [ ] **Step 3: Add controller and route**

Controller method:

```typescript
/**
 * @description Create a document from a web URL via crawling
 * @param {Request} req - Express request with url, name, auto_parse
 * @param {Response} res - Express response with placeholder document
 */
async webCrawlDocument(req: Request, res: Response): Promise<void> {
    const datasetId = req.params['id']
    if (!datasetId) { res.status(400).json({ error: 'Dataset ID is required' }); return }

    try {
        const result = await ragDocumentService.webCrawlDocument(datasetId, req.body)
        res.status(201).json(result)
    } catch (error: any) {
        if (error.message?.includes('private/internal')) {
            res.status(400).json({ error: error.message })
            return
        }
        log.error('Failed to create web crawl document', { error: String(error) })
        res.status(500).json({ error: 'Failed to create web crawl document' })
    }
}
```

Route:
```typescript
router.post('/datasets/:id/documents/web-crawl', requirePermission('manage_datasets'), validate({ params: uuidParamSchema, body: webCrawlSchema }), controller.webCrawlDocument.bind(controller))
```

- [ ] **Step 4: Update types to include source fields**

In `be/src/shared/models/types.ts`, ensure document-related types include:
```typescript
source_type?: string;
source_url?: string;
```

- [ ] **Step 5: Build and verify**

Run: `cd be && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add be/src/modules/rag/schemas/rag.schemas.ts be/src/modules/rag/routes/rag.routes.ts be/src/modules/rag/controllers/rag.controller.ts be/src/modules/rag/services/rag-document.service.ts be/src/shared/models/types.ts
git commit -m "feat(rag): add web crawl endpoint with SSRF protection and async worker queue"
```

---

### Task 5.2: Frontend — WebCrawlDialog and DatasetDetailPage integration

**Files:**
- Create: `fe/src/features/datasets/components/WebCrawlDialog.tsx`
- Modify: `fe/src/features/datasets/types/index.ts`
- Modify: `fe/src/features/datasets/api/datasetApi.ts`
- Modify: `fe/src/features/datasets/api/datasetQueries.ts`
- Modify: `fe/src/features/datasets/pages/DatasetDetailPage.tsx`
- Modify: `fe/src/features/datasets/components/DocumentTable.tsx`
- Modify: `fe/src/i18n/locales/en.json`
- Modify: `fe/src/i18n/locales/vi.json`
- Modify: `fe/src/i18n/locales/ja.json`

- [ ] **Step 1: Update Document type and add API/hook**

In `fe/src/features/datasets/types/index.ts`, add to `Document` interface:
```typescript
  source_type?: 'local' | 'web_crawl'
  source_url?: string
```

In `fe/src/features/datasets/api/datasetApi.ts`, add:
```typescript
/**
 * @description Create a document from a web URL
 * @param {string} datasetId - Dataset ID
 * @param {object} data - URL, optional name, auto_parse flag
 * @returns {Promise<Document>} Created placeholder document
 */
webCrawlDocument: async (
  datasetId: string,
  data: { url: string; name?: string; auto_parse?: boolean },
): Promise<Document> => {
  return api.post<Document>(`${BASE_URL}/datasets/${datasetId}/documents/web-crawl`, data)
},
```

In `fe/src/features/datasets/api/datasetQueries.ts`, add:
```typescript
/**
 * @description Mutation hook for creating a document from a web URL
 * @param {string} datasetId - Dataset ID
 * @returns {UseMutationResult} Mutation result
 */
export function useWebCrawl(datasetId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['datasets', datasetId, 'web-crawl'],
    mutationFn: (data: { url: string; name?: string; auto_parse?: boolean }) =>
      datasetApi.webCrawlDocument(datasetId, data),
    meta: { successMessage: t('datasets.webCrawlSuccess', 'Web page queued for processing') },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets', datasetId, 'documents'] })
    },
  })
}
```

- [ ] **Step 2: Create WebCrawlDialog component**

Create `fe/src/features/datasets/components/WebCrawlDialog.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

/**
 * @description Dialog for adding a document by crawling a web URL
 * @param {WebCrawlDialogProps} props - Dialog configuration
 * @returns {JSX.Element} Web crawl dialog
 */

interface WebCrawlDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: { url: string; name?: string; auto_parse?: boolean }) => Promise<void>
}

export function WebCrawlDialog({ open, onClose, onSubmit }: WebCrawlDialogProps) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [autoParse, setAutoParse] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isValidUrl = (u: string) => {
    try {
      const parsed = new URL(u)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }

  const handleSubmit = async () => {
    setError('')
    if (!isValidUrl(url)) {
      setError(t('datasets.webCrawlInvalidUrl', 'Please enter a valid HTTP or HTTPS URL'))
      return
    }
    setSaving(true)
    try {
      await onSubmit({
        url,
        ...(name.trim() ? { name: name.trim() } : {}),
        auto_parse: autoParse,
      })
      setUrl('')
      setName('')
      onClose()
    } catch (err: any) {
      setError(err.message || t('datasets.webCrawlFailed', 'Failed to crawl URL'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe size={18} />
            {t('datasets.webCrawl', 'Web Crawl')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>{t('datasets.webCrawlUrl', 'URL')}</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/page" type="url" />
          </div>

          <div className="space-y-1">
            <Label>{t('datasets.webCrawlName', 'Document Name')} ({t('common.optional', 'Optional')})</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('datasets.webCrawlNamePlaceholder', 'Auto-detected from page')} />
          </div>

          <div className="flex items-center justify-between">
            <Label>{t('datasets.webCrawlAutoParse', 'Auto-parse after crawl')}</Label>
            <Switch checked={autoParse} onCheckedChange={setAutoParse} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button onClick={handleSubmit} disabled={saving || !url.trim()}>
            {saving ? t('common.processing', 'Processing...') : t('datasets.webCrawlSubmit', 'Crawl')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Add Web Crawl button to DatasetDetailPage**

In `fe/src/features/datasets/pages/DatasetDetailPage.tsx`, in the admin action bar (line ~127), before the Upload button, add:

```tsx
<Button variant="outline" onClick={() => setWebCrawlOpen(true)}>
  <Globe size={16} className="mr-1" />
  {t('datasets.webCrawl', 'Web Crawl')}
</Button>
```

Add state and dialog:
```tsx
const [webCrawlOpen, setWebCrawlOpen] = useState(false)
const webCrawlMutation = useWebCrawl(datasetId)

<WebCrawlDialog
  open={webCrawlOpen}
  onClose={() => setWebCrawlOpen(false)}
  onSubmit={async (data) => { await webCrawlMutation.mutateAsync(data) }}
/>
```

Import `Globe` from `lucide-react`, `WebCrawlDialog`, `useWebCrawl`.

- [ ] **Step 4: Add source icon to DocumentTable**

In `fe/src/features/datasets/components/DocumentTable.tsx`, in the document name cell, add:

```tsx
<div className="flex items-center gap-1.5">
  {doc.source_type === 'web_crawl' ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger><Globe size={14} className="text-muted-foreground shrink-0" /></TooltipTrigger>
        <TooltipContent>{doc.source_url}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : null}
  <span className="truncate">{doc.name}</span>
</div>
```

Import `Globe` from `lucide-react`.

- [ ] **Step 5: Add i18n keys**

**en.json:** `"webCrawl": "Web Crawl", "webCrawlUrl": "URL", "webCrawlName": "Document Name", "webCrawlNamePlaceholder": "Auto-detected from page", "webCrawlAutoParse": "Auto-parse after crawl", "webCrawlSubmit": "Crawl", "webCrawlSuccess": "Web page queued for processing", "webCrawlInvalidUrl": "Please enter a valid HTTP or HTTPS URL", "webCrawlFailed": "Failed to crawl URL"`

**vi.json:** `"webCrawl": "Thu thập Web", "webCrawlUrl": "URL", "webCrawlName": "Tên tài liệu", "webCrawlNamePlaceholder": "Tự động phát hiện từ trang web", "webCrawlAutoParse": "Tự động phân tích sau khi thu thập", "webCrawlSubmit": "Thu thập", "webCrawlSuccess": "Trang web đã được đưa vào hàng đợi xử lý", "webCrawlInvalidUrl": "Vui lòng nhập URL HTTP hoặc HTTPS hợp lệ", "webCrawlFailed": "Không thể thu thập URL"`

**ja.json:** `"webCrawl": "Webクロール", "webCrawlUrl": "URL", "webCrawlName": "ドキュメント名", "webCrawlNamePlaceholder": "ページから自動検出", "webCrawlAutoParse": "クロール後に自動解析", "webCrawlSubmit": "クロール", "webCrawlSuccess": "Webページが処理キューに追加されました", "webCrawlInvalidUrl": "有効なHTTPまたはHTTPS URLを入力してください", "webCrawlFailed": "URLのクロールに失敗しました"`

- [ ] **Step 6: Build and verify**

Run: `cd fe && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add fe/src/features/datasets/components/WebCrawlDialog.tsx fe/src/features/datasets/pages/DatasetDetailPage.tsx fe/src/features/datasets/components/DocumentTable.tsx fe/src/features/datasets/api/datasetApi.ts fe/src/features/datasets/api/datasetQueries.ts fe/src/features/datasets/types/index.ts fe/src/i18n/locales/
git commit -m "feat(datasets): add web crawl dialog with URL input and source icon in document table"
```

---

### Task 5.3: advance-rag — Web crawl worker (placeholder)

**Files:**
- Modify: `advance-rag/db/db_models.py`

- [ ] **Step 1: Add Peewee migration for source_url column**

In `advance-rag/db/db_models.py`, locate the migration section (~line 1507) and add:

```python
try:
    migrate(migrator.add_column('document', 'source_url', CharField(max_length=2048, null=True)))
except Exception:
    pass
```

- [ ] **Step 2: Document web crawl worker requirements**

The advance-rag worker needs a new task handler for `web_crawl_queue` that:
1. Pops tasks from Redis `web_crawl_queue`
2. Fetches URL using `playwright` or `wkhtmltopdf`
3. Converts HTML → PDF
4. Uploads PDF to S3 (RustFS)
5. Updates document record in PostgreSQL
6. If `auto_parse: true`, chains parse task

> This requires a separate implementation ticket for the Python worker. The BE endpoint and FE UI are complete and will work once the worker is implemented.

- [ ] **Step 3: Commit**

```bash
git add advance-rag/db/db_models.py
git commit -m "feat(advance-rag): add source_url migration and document web crawl worker requirements"
```

---

## Summary

| Chunk | Feature | Tasks | Key Files |
|-------|---------|-------|-----------|
| 1 | Chunk Enable/Disable Toggle | 4 tasks | rag-search.service, ChunkCard, ChunkList |
| 2 | Chunk Keywords & Questions | 4 tasks | rag.schemas, TagEditor, AddChunkModal, ChunkCard |
| 3 | Enhanced Retrieval Test | 3 tasks | rag-search.service, RetrievalTestPanel, ChunkResultCard |
| 4 | Per-Document Parser Change | 2 tasks | rag-document.service, ChangeParserDialog, DocumentTable |
| 5 | Web Crawl as Data Source | 3 tasks | rag-document.service, WebCrawlDialog, DatasetDetailPage |

**Total:** 16 tasks, 5 independent features
