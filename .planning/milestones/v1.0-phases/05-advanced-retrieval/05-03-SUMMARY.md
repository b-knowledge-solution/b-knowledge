---
phase: 05-advanced-retrieval
plan: 03
subsystem: chat, rag
tags: [language-detection, deep-research, graphrag, abac, cross-dataset, sse]

requires:
  - phase: 05-01
    provides: Language detection utility, GraphRAG retrieval service
  - phase: 05-02
    provides: Budget-aware deep research service, cross-dataset search

provides:
  - Chat pipeline with language-aware response generation
  - Budget-controlled deep research with structured SSE streaming
  - Cross-dataset ABAC-filtered retrieval integration
  - Graph+vector hybrid retrieval validation in chat pipeline
  - Integration tests for graphrag retrieval and deep research pipeline

affects: [05-04, frontend-chat]

tech-stack:
  added: []
  patterns: [language-instruction-prepend, structured-sse-progress-events, abac-dataset-expansion]

key-files:
  created:
    - be/tests/rag/graphrag-retrieval.test.ts
    - be/tests/rag/deep-research.test.ts
  modified:
    - be/src/modules/chat/services/chat-conversation.service.ts

key-decisions:
  - "Language instruction prepended to system prompt (before kgContext merge) for consistent language matching"
  - "RBAC dataset expansion uses abilityService.buildAbilityFor per-user (not tenant-wide findAll) for ABAC security"
  - "Cross-dataset search dispatched via searchMultipleDatasets only when RBAC expansion adds new KBs"
  - "Deep research budget caps hardcoded at 50K tokens / 15 calls (matching Phase 5 Pitfall 5 requirement)"

patterns-established:
  - "Language detection runs once at pipeline entry, instruction prepended before all prompt assembly"
  - "Structured DeepResearchProgressEvent SSE format with subEvent, depth, index, total, budget fields"

requirements-completed: [RETR-03, RETR-06]

duration: 7min
completed: 2026-03-19
---

# Phase 5 Plan 3: Chat Pipeline Integration Summary

**Language-aware chat with budget-controlled deep research SSE, graph+vector hybrid retrieval, and RBAC cross-dataset search wired end-to-end**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-19T07:24:33Z
- **Completed:** 2026-03-19T07:31:33Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Chat pipeline detects user input language and injects response-language instruction into system prompt
- Budget-aware deep research streams structured SSE events (subEvent, depth, index, budget status) with 50K/15 caps
- Cross-dataset search resolves RBAC-accessible KBs using user-scoped ABAC filtering (not tenant-wide findAll)
- Graph+vector hybrid retrieval validated: use_kg calls ragGraphragService.retrieval() and merges kgContext with vector chunks
- 17 unit tests covering graphrag retrieval pipeline and deep research integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire language detection, cross-dataset ABAC, graph+vector hybrid** - `e145c61` (feat)
2. **Task 2: Wire budget-aware Deep Research SSE** - `08bff4d` (feat)
3. **Task 3: Unit tests for graphrag and deep research pipeline** - `b8abf28` (test)

## Files Created/Modified

- `be/src/modules/chat/services/chat-conversation.service.ts` - Added language detection, ABAC cross-dataset expansion, budget-aware deep research SSE, and graph+vector hybrid validation
- `be/tests/rag/graphrag-retrieval.test.ts` - Tests for query rewrite, entity search, n-hop traversal, context formatting
- `be/tests/rag/deep-research.test.ts` - Tests for sufficiency check, follow-up generation, deduplication, budget exhaustion

## Decisions Made

- Language instruction prepended to system prompt before kgContext merge so both language and graph context appear in final prompt
- RBAC dataset expansion uses abilityService.buildAbilityFor per-user with CASL ability.can() check (security-critical)
- Cross-dataset search only dispatched via searchMultipleDatasets when RBAC expansion actually adds new KBs (fallback to per-KB search otherwise)
- Deep research budget caps hardcoded at 50K tokens / 15 calls as mandated by Phase 5 Pitfall 5

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All backend services from Plans 01-03 are wired into the chat pipeline
- Ready for Plan 04 (frontend integration) to consume structured SSE events
- Deep research SSE format documented for frontend rendering

---
*Phase: 05-advanced-retrieval*
*Completed: 2026-03-19*
