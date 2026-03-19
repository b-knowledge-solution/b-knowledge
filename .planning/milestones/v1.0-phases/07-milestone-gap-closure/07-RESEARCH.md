# Phase 7: Milestone Gap Closure - Research

**Researched:** 2026-03-19
**Domain:** FE component wiring (React), BE service fix (Express/ABAC), SSE event rendering
**Confidence:** HIGH

## Summary

Phase 7 closes four "last mile" gaps identified by the v1.0 Milestone Audit. All components and services already exist -- the work is purely wiring: importing orphaned components, adding state + click handlers, creating one new display component (DeepResearchProgress), and calling one already-imported function. No new libraries, APIs, or infrastructure are needed.

The four gaps are: (1) CitationDocDrawer exists but nobody renders it in ChatPage, (2) SearchResultDocDialog exists but nobody renders it in SearchPage, (3) deepResearchEvents are parsed by useChatStream but never displayed, and (4) buildOpenSearchAbacFilters is imported in chat-conversation.service.ts but never called, leaving field-level ABAC silently inactive.

**Primary recommendation:** Treat this as 2-3 small plans: one FE plan for document viewer wiring + deep research progress, one BE plan for the ABAC filter fix. All changes are additive (no refactoring).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **CitationDocDrawer** already exists at `fe/src/features/chat/components/CitationDocDrawer.tsx` -- wire into ChatPage citation click handler
- **SearchResultDocDialog** already exists at `fe/src/features/search/components/SearchResultDocDialog.tsx` -- wire into search result click handler
- Both components wrap DocumentPreviewer -- no new components needed, only imports + click handler wiring
- `useChatStream` already parses `deepResearchEvents: DeepResearchEvent[]` from SSE sub-events
- ChatPage needs to access `stream.deepResearchEvents` and render a progress component
- Show: current sub-query label, sub-query count (N of M), budget warning when approaching limit, budget exhausted message
- Component renders inline in the chat message area during Deep Research streaming
- `buildOpenSearchAbacFilters` is already imported in `be/src/modules/chat/services/chat-conversation.service.ts` but never called
- Fix: call the function to populate `userAbacFilters` array before passing to `searchMultipleDatasets`

### Claude's Discretion
- DeepResearchProgress component layout and styling
- Exact click handler mechanism for citation drawer (onClick prop vs context)
- Search result click handler approach

### Deferred Ideas (OUT OF SCOPE)
- Embed/OpenAI-compat controllers empty tenantId (tech debt, not a requirement gap -- deferred to v1.1)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOCM-02 | Search across document versions -- query current or historical versions | CitationDocDrawer and SearchResultDocDialog are fully built and wrap DocumentPreviewer; wiring them into ChatPage and SearchPage completes the preview flow |
| RETR-04 | Deep Research recursive query decomposition -- break complex questions into sub-queries | useChatStream already parses DeepResearchEvent[] with subquery progress; a new DeepResearchProgress component renders these inline |
| RETR-06 | Cross-dataset retrieval -- search across multiple knowledge bases respecting ABAC rules | Deep Research progress display (sub-event rendering) completes the user-facing aspect; ABAC filter fix (RETR-07) completes the enforcement aspect |
| RETR-07 | Deep Research token budget and call limits -- hard caps on LLM calls and tokens per research session | buildOpenSearchAbacFilters is imported but never called; the fix gathers policy_rules from expanded datasets and calls the function |
</phase_requirements>

## Standard Stack

No new libraries needed. All work uses existing project dependencies.

### Core (Already Installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| React | 19 | Component rendering, state | Already in use |
| shadcn/ui Sheet | n/a | CitationDocDrawer wrapper | Already imported in component |
| shadcn/ui Dialog | n/a | SearchResultDocDialog wrapper | Already imported in component |
| lucide-react | n/a | Icons for progress display | Already in use |
| @casl/ability | 6.8.0 | ABAC rule evaluation | Already in use |

### Installation
```bash
# No installation needed -- all dependencies already present
```

## Architecture Patterns

### Existing Code Structure (No Changes)
```
fe/src/features/chat/
  components/
    CitationDocDrawer.tsx        # EXISTS -- orphaned, needs import in ChatPage
    ChatDocumentPreviewDrawer.tsx # EXISTS -- basic chunk-only preview (currently used)
  hooks/
    useChatStream.ts             # EXISTS -- already exposes deepResearchEvents
  pages/
    ChatPage.tsx                 # MODIFY -- add CitationDocDrawer + DeepResearchProgress

fe/src/features/search/
  components/
    SearchResultDocDialog.tsx     # EXISTS -- orphaned, needs import in SearchPage
    SearchDocumentPreviewDrawer.tsx # EXISTS -- currently used in SearchPage
  pages/
    SearchPage.tsx               # MODIFY -- swap/add SearchResultDocDialog

be/src/modules/chat/services/
  chat-conversation.service.ts   # MODIFY -- add buildOpenSearchAbacFilters call
```

### Pattern 1: Chat Citation -> Document Drawer (DOCM-02, Chat Side)

**Current state:** ChatPage has `handleChunkCitationClick` which opens `ChatDocumentPreviewDrawer` -- a Headless UI drawer that only shows raw chunk text. The richer `CitationDocDrawer` (shadcn Sheet + DocumentPreviewer with file routing and chunk list) exists but is never imported.

**What to wire:**
```typescript
// In ChatPage.tsx -- import the richer component
import CitationDocDrawer from '../components/CitationDocDrawer'

// State already exists:
// const [showDocPreview, setShowDocPreview] = useState(false)
// const [previewChunk, setPreviewChunk] = useState<ChatChunk | null>(null)

// Render CitationDocDrawer instead of (or alongside) ChatDocumentPreviewDrawer
<CitationDocDrawer
  open={showDocPreview}
  onClose={() => setShowDocPreview(false)}
  documentId={previewChunk?.doc_id}
  documentName={previewChunk?.docnm_kwd}
  datasetId={previewDatasetId}
/>
```

**Key insight:** ChatPage already has the state (`showDocPreview`, `previewChunk`) and handlers (`handleChunkCitationClick`, `handleDocumentClick`) that set this state. The fix is replacing the `ChatDocumentPreviewDrawer` render with `CitationDocDrawer`, which accepts the same data through slightly different props (`documentId` vs `chunk`).

### Pattern 2: Search Result -> Document Dialog (DOCM-02, Search Side)

**Current state:** SearchPage already uses `SearchDocumentPreviewDrawer` (a Sheet) for result click previews. The `SearchResultDocDialog` (a full Dialog with chunk highlighting) exists but is never imported.

**Options:**
1. **Replace** SearchDocumentPreviewDrawer with SearchResultDocDialog
2. **Add** SearchResultDocDialog as a second option (e.g., dialog for full preview, drawer for quick peek)

**Recommendation:** Replace -- SearchResultDocDialog provides a better experience (larger viewport, chunk highlighting via `selectedChunk` prop) and uses the same DocumentPreviewer underneath. The SearchPage already has `handleResultClick` setting `previewDoc` state.

```typescript
// In SearchPage.tsx -- swap import
import SearchResultDocDialog from '../components/SearchResultDocDialog'

// Replace the current SearchDocumentPreviewDrawer render:
<SearchResultDocDialog
  open={previewDoc.open}
  onClose={() => setPreviewDoc({ open: false, result: null })}
  documentId={previewDoc.result?.doc_id}
  documentName={previewDoc.result?.doc_name}
  datasetId={previewDoc.result?.dataset_id}
  selectedChunk={previewDoc.result ? {
    positions: previewDoc.result.positions,
    text: previewDoc.result.content,
  } : null}
/>
```

### Pattern 3: Deep Research Progress Display (RETR-04, RETR-06)

**Current state:** `useChatStream` exposes `deepResearchEvents: DeepResearchEvent[]` which accumulates events during Deep Research streaming. `pipelineStatus` is set to `'deep_research'` when these events arrive. ChatPage never reads `stream.deepResearchEvents`.

**DeepResearchEvent shape (already defined):**
```typescript
interface DeepResearchEvent {
  subEvent: 'subquery_start' | 'subquery_result' | 'budget_warning' | 'budget_exhausted' | 'info'
  query?: string        // sub-query text
  depth?: number        // recursion depth
  index?: number        // 1-based sub-query index
  total?: number        // total sub-queries at this depth
  chunks?: number       // chunks found
  message?: string      // human-readable status
  tokensUsed?: number   // consumed tokens
  tokensMax?: number    // budget ceiling
  callsUsed?: number    // LLM calls consumed
  callsMax?: number     // call budget ceiling
  completed?: number    // completed sub-queries (for exhausted)
}
```

**New component needed:** `DeepResearchProgress` -- renders inline in the chat message area when `stream.pipelineStatus === 'deep_research'` and `stream.deepResearchEvents.length > 0`.

**Display elements:**
- Current sub-query label (from latest `subquery_start` event's `query` field)
- Progress counter: "Sub-query N of M" (from `index` and `total`)
- Budget indicator: tokens used / max, calls used / max (from `tokensUsed`/`tokensMax`, `callsUsed`/`callsMax`)
- Budget warning message (from `budget_warning` event's `message`)
- Budget exhausted message (from `budget_exhausted` event's `message`)

**Placement in ChatPage:** Between the `ChatMessageList` and the variable form / chat input area, conditionally rendered when Deep Research is active.

### Pattern 4: ABAC Field Filter Fix (RETR-07)

**Current state (line ~846 of chat-conversation.service.ts):**
```typescript
let userAbacFilters: Record<string, unknown>[] = []
// ... dataset expansion happens but userAbacFilters stays empty ...
const crossResult = await ragSearchService.searchMultipleDatasets(
  tenantId, allKbIds, searchReq, queryVector, userAbacFilters // <-- always []
)
```

**The bug:** The `allTenantDatasets` query fetches `id, name, tenant_id` but NOT `policy_rules`. Even if it did, nobody calls `buildOpenSearchAbacFilters()` to convert those rules into OpenSearch filter clauses.

**The fix (2-3 lines):**
1. Add `policy_rules` to the SELECT in the allTenantDatasets query
2. Gather all policy_rules from the authorized datasets (flatten the arrays)
3. Call `buildOpenSearchAbacFilters(allPolicies)` and assign to `userAbacFilters`

```typescript
// 1. Add policy_rules to SELECT
const allTenantDatasets = await ModelFactory.dataset.getKnex()
  .where('tenant_id', tenantId)
  .select('id', 'name', 'tenant_id', 'policy_rules')  // <-- add policy_rules

// 2. After filtering authorized datasets, gather and flatten policies
const authorizedDatasets = allTenantDatasets
  .filter((d: any) => userAbility.can('read', { __caslSubjectType__: 'Dataset', ...d } as any))
  .filter((d: any) => !kbIds.includes(d.id))

const authorizedKbIds = authorizedDatasets.map((d: any) => d.id as string)

// 3. Build ABAC filters from all datasets' policy_rules
const allPolicies = [...kbIds, ...authorizedKbIds]
  .flatMap(id => {
    const ds = allTenantDatasets.find((d: any) => d.id === id)
    const rules = ds?.policy_rules
    return Array.isArray(rules) ? rules : []
  })
if (allPolicies.length > 0) {
  userAbacFilters = buildOpenSearchAbacFilters(allPolicies)
}
```

### Anti-Patterns to Avoid

- **Creating new viewer components:** CitationDocDrawer and SearchResultDocDialog are already built and tested. Do NOT create new ones.
- **Over-abstracting the Deep Research progress:** It is used in exactly one place (ChatPage). Do not create a context or hook for it -- a simple component with props is sufficient.
- **Modifying useChatStream:** The hook already exposes everything needed. Do not add new state or event types.
- **Touching rag-search.service.ts for the ABAC fix:** The fix is entirely in chat-conversation.service.ts where the filter array is populated before being passed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Document preview | New preview component | CitationDocDrawer / SearchResultDocDialog | Already built with DocumentPreviewer integration |
| SSE event parsing | New event parser | useChatStream.deepResearchEvents | Already parsed and accumulated |
| ABAC filter translation | Manual OpenSearch filter construction | buildOpenSearchAbacFilters() | Already handles allow/deny, condition translation |
| Budget display formatting | Custom number formatting | Simple `${used}/${max}` with Intl.NumberFormat | Budget numbers are small enough for simple display |

## Common Pitfalls

### Pitfall 1: Duplicate Drawer/Dialog Rendering
**What goes wrong:** Rendering both the old ChatDocumentPreviewDrawer AND the new CitationDocDrawer creates two overlapping drawers.
**Why it happens:** Forgetting to remove or guard the old component when adding the new one.
**How to avoid:** Replace the ChatDocumentPreviewDrawer render block with CitationDocDrawer. Remove the old import.
**Warning signs:** Two drawers animating on citation click.

### Pitfall 2: Missing datasetId for Chat Citations
**What goes wrong:** CitationDocDrawer needs `datasetId` but chat chunks don't always carry it.
**Why it happens:** Chat chunks from the backend may not include `dataset_id` in every response format.
**How to avoid:** ChatPage already has fallback logic at lines 388-396 using `(match as any)?.dataset_id || assistants.activeAssistant?.kb_ids[0]`. Reuse this pattern.
**Warning signs:** DocumentPreviewer shows "no data" despite valid documentId.

### Pitfall 3: Deep Research Events Accumulate Across Messages
**What goes wrong:** Events from a previous Deep Research query bleed into the next display.
**Why it happens:** Not checking that events are cleared between messages.
**How to avoid:** useChatStream already clears `deepResearchEvents` at the start of each `sendMessage()` (line 144-145). The progress component just needs to conditionally render based on `isStreaming && pipelineStatus === 'deep_research'`.
**Warning signs:** Old sub-query labels showing in a new research session.

### Pitfall 4: ABAC policy_rules Column May Be NULL or Empty
**What goes wrong:** Calling `buildOpenSearchAbacFilters([])` or with null values produces unexpected filters.
**Why it happens:** Most datasets have no ABAC policies (`policy_rules` defaults to `[]`).
**How to avoid:** Guard with `Array.isArray(rules) && rules.length > 0` before flattening. Only call `buildOpenSearchAbacFilters` when there are actual policies.
**Warning signs:** All search results disappearing when ABAC expansion is enabled.

### Pitfall 5: SearchResultDocDialog selectedChunk Type Mismatch
**What goes wrong:** The `selectedChunk` prop expects a `Chunk` type from `@/features/datasets/types`, not a `SearchResult`.
**Why it happens:** SearchPage works with `SearchResult` objects, not `Chunk` objects.
**How to avoid:** Map the SearchResult fields to match the expected Chunk shape, or pass `null` and let DocumentPreviewer handle chunk display internally.
**Warning signs:** TypeScript compile error on `selectedChunk` prop.

## Code Examples

### DeepResearchProgress Component Pattern
```typescript
// Source: Derived from DeepResearchEvent interface in chat.types.ts
interface DeepResearchProgressProps {
  events: DeepResearchEvent[]
  isActive: boolean
}

function DeepResearchProgress({ events, isActive }: DeepResearchProgressProps) {
  if (!isActive || events.length === 0) return null

  // Find the latest event of each type for display
  const latestStart = [...events].reverse().find(e => e.subEvent === 'subquery_start')
  const latestResult = [...events].reverse().find(e => e.subEvent === 'subquery_result')
  const warning = [...events].reverse().find(e => e.subEvent === 'budget_warning')
  const exhausted = [...events].reverse().find(e => e.subEvent === 'budget_exhausted')

  // Use latest event with budget info for progress display
  const budgetEvent = exhausted || warning || latestResult || latestStart

  return (
    <div className="...">
      {/* Sub-query progress */}
      {latestStart && (
        <div>Researching: {latestStart.query} ({latestStart.index}/{latestStart.total})</div>
      )}
      {/* Budget indicator */}
      {budgetEvent?.tokensMax && (
        <div>Tokens: {budgetEvent.tokensUsed}/{budgetEvent.tokensMax}</div>
      )}
      {/* Warning/exhausted messages */}
      {warning && <div className="text-amber-600">{warning.message}</div>}
      {exhausted && <div className="text-red-600">{exhausted.message}</div>}
    </div>
  )
}
```

### ChatPage Wiring Pattern
```typescript
// In ChatPage render, after ChatMessageList:
{stream.pipelineStatus === 'deep_research' && stream.deepResearchEvents.length > 0 && (
  <DeepResearchProgress
    events={stream.deepResearchEvents}
    isActive={stream.isStreaming}
  />
)}
```

## State of the Art

No technology changes apply. All components use patterns already established in the codebase.

| Current Pattern | Used In | Status |
|----------------|---------|--------|
| Sheet drawer for document preview | SearchDocumentPreviewDrawer, CitationDocDrawer | Established |
| Dialog for document preview | SearchResultDocDialog | Established |
| SSE event accumulation with ref+state sync | useChatStream deepResearchEvents | Established |
| buildOpenSearchAbacFilters for ABAC | ability.service.ts | Established, unused in cross-dataset path |

## Open Questions

None. All gaps are well-characterized by the audit with clear fix paths.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (FE: jsdom, BE: node) |
| Config file | `fe/vitest.config.ts`, `be/vitest.config.ts` |
| Quick run command | `npm run test -w fe -- --run` / `npm run test -w be -- --run` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCM-02 | CitationDocDrawer renders in ChatPage on citation click | unit | `npm run test -w fe -- --run tests/features/chat/ChatPage.test.tsx` | Exists (needs update) |
| DOCM-02 | SearchResultDocDialog renders in SearchPage on result click | unit | `npm run test -w fe -- --run tests/features/search/SearchPage.test.tsx` | Exists (needs update) |
| RETR-04 | DeepResearchProgress renders when deepResearchEvents available | unit | `npm run test -w fe -- --run tests/features/chat/DeepResearchProgress.test.tsx` | Wave 0 |
| RETR-06 | Deep Research events displayed inline during streaming | unit | `npm run test -w fe -- --run tests/features/chat/ChatPage.test.tsx` | Exists (needs update) |
| RETR-07 | buildOpenSearchAbacFilters called with dataset policy_rules | unit | `npm run test -w be -- --run tests/chat/chat-conversation.service.test.ts` | Exists (needs update) |

### Sampling Rate
- **Per task commit:** `npm run test -w fe -- --run` and `npm run test -w be -- --run`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `fe/tests/features/chat/DeepResearchProgress.test.tsx` -- covers RETR-04 (new component)
- Existing test files for ChatPage, SearchPage, and chat-conversation.service cover DOCM-02 and RETR-07 with updates

## Sources

### Primary (HIGH confidence)
- Direct code inspection of all referenced files in the codebase
- `CitationDocDrawer.tsx` -- complete component, props interface verified
- `SearchResultDocDialog.tsx` -- complete component, props interface verified
- `useChatStream.ts` -- deepResearchEvents state and ref+state sync pattern verified
- `chat.types.ts` -- DeepResearchEvent interface verified
- `chat-conversation.service.ts` lines 840-894 -- userAbacFilters gap verified
- `ability.service.ts` -- buildOpenSearchAbacFilters signature and behavior verified
- `ChatPage.tsx` -- existing state/handlers mapped to new component props
- `SearchPage.tsx` -- existing state/handlers mapped to new component props

### Secondary (MEDIUM confidence)
- None needed -- all evidence from direct code inspection

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing
- Architecture: HIGH -- all components inspected, props verified, fix paths clear
- Pitfalls: HIGH -- identified from actual code structure and type mismatches

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable -- no external dependencies changing)
