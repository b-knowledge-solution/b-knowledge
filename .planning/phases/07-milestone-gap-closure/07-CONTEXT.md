# Phase 7: Milestone Gap Closure - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning
**Source:** v1.0 Milestone Audit (.planning/v1.0-MILESTONE-AUDIT.md)

<domain>
## Phase Boundary

Wire orphaned document viewer components into chat and search UIs, add Deep Research progress display in chat, and fix field-level ABAC filter application in cross-dataset search. All components and services already exist — this phase only connects them.

</domain>

<decisions>
## Implementation Decisions

### Document Viewer Wiring (DOCM-02)
- **CitationDocDrawer** already exists at `fe/src/features/chat/components/CitationDocDrawer.tsx` — wire into ChatPage citation click handler
- **SearchResultDocDialog** already exists at `fe/src/features/search/components/SearchResultDocDialog.tsx` — wire into search result click handler
- Both components wrap DocumentPreviewer — no new components needed, only imports + click handler wiring

### Deep Research Progress Display (RETR-04, RETR-06)
- `useChatStream` already parses `deepResearchEvents: DeepResearchEvent[]` from SSE sub-events
- ChatPage needs to access `stream.deepResearchEvents` and render a progress component
- Show: current sub-query label, sub-query count (N of M), budget warning when approaching limit, budget exhausted message
- Component renders inline in the chat message area during Deep Research streaming

### ABAC Field Filter Fix (RETR-07)
- `buildOpenSearchAbacFilters` is already imported in `be/src/modules/chat/services/chat-conversation.service.ts` but never called
- Fix: call the function to populate `userAbacFilters` array before passing to `searchMultipleDatasets`
- This is a 1-line fix in the BE service — the function and the parameter slot both exist

### Claude's Discretion
- DeepResearchProgress component layout and styling
- Exact click handler mechanism for citation drawer (onClick prop vs context)
- Search result click handler approach

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Audit Report
- `.planning/v1.0-MILESTONE-AUDIT.md` — Full audit with gap details, evidence, and fix suggestions

### Orphaned Components (DOCM-02)
- `fe/src/features/chat/components/CitationDocDrawer.tsx` — Sheet wrapping DocumentPreviewer for chat citations
- `fe/src/features/search/components/SearchResultDocDialog.tsx` — Dialog wrapping DocumentPreviewer for search results
- `fe/src/components/DocumentPreviewer/` — Shared document preview component used by both

### Deep Research SSE (RETR-04, RETR-06)
- `fe/src/features/chat/hooks/useChatStream.ts` — Produces `deepResearchEvents` array from SSE
- `fe/src/features/chat/types/chat.types.ts` — `DeepResearchEvent` interface definition

### ABAC Filter (RETR-07)
- `be/src/modules/chat/services/chat-conversation.service.ts` — Where buildOpenSearchAbacFilters is imported but not called
- `be/src/shared/services/ability.service.ts` — `buildOpenSearchAbacFilters` function definition

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **CitationDocDrawer**: Complete Sheet component, just needs import + render trigger
- **SearchResultDocDialog**: Complete Dialog component, just needs import + render trigger
- **useChatStream.deepResearchEvents**: Already parsed and available as array
- **buildOpenSearchAbacFilters**: Already imported, just needs to be called

### Integration Points
- ChatPage message area — where citations render, where Deep Research progress should show
- Search results area — where result cards render, where click should open dialog
- chat-conversation.service.ts line ~846 — where userAbacFilters is initialized as empty array

</code_context>

<specifics>
## Specific Ideas

- All 4 gaps are "last mile" wiring — components and services are built, just never connected
- The BE fix is literally adding one function call
- FE fixes are import + state + click handler additions to existing pages

</specifics>

<deferred>
## Deferred Ideas

- Embed/OpenAI-compat controllers empty tenantId (tech debt, not a requirement gap — deferred to v1.1)

</deferred>

---

*Phase: 07-milestone-gap-closure*
*Context gathered: 2026-03-19 via Milestone Audit*
