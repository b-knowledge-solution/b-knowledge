---
phase: 05-advanced-retrieval
plan: 02
subsystem: rag
tags: [opensearch, budget-tracker, deep-research, cross-dataset, abac, multi-kb]

# Dependency graph
requires:
  - phase: 02-abac-authorization
    provides: ABAC filter building (buildOpenSearchAbacFilters, getFilters)
  - phase: 03-dataset-versioning
    provides: ChunkResult type, RagSearchService, RagDeepResearchService
provides:
  - BudgetTracker class for token/call limit enforcement
  - DeepResearchProgressEvent structured progress streaming
  - Budget-aware deep research with graceful partial results
  - Cross-dataset searchMultipleDatasets method with ABAC enforcement
  - kb_id field on ChunkResult for source dataset attribution
affects: [05-advanced-retrieval, chat-controller, search-controller]

# Tech tracking
tech-stack:
  added: []
  patterns: [budget-tracking-pattern, structured-progress-events, multi-kb-terms-filter]

key-files:
  created:
    - be/tests/rag/deep-research-budget.test.ts
    - be/tests/rag/cross-dataset-search.test.ts
  modified:
    - be/src/modules/rag/services/rag-deep-research.service.ts
    - be/src/modules/rag/services/rag-search.service.ts
    - be/src/shared/models/types.ts

key-decisions:
  - "BudgetTracker records tokens via approxTokens (chars/4) after each LLM call rather than before"
  - "Budget check before each LLM call with abort-and-return-partial on exhaustion"
  - "Cross-dataset search uses OpenSearch terms filter with multiple kb_ids in single query (pool model)"
  - "KB expansion capped at 20 to prevent OpenSearch query size limit issues"

patterns-established:
  - "Budget tracking: BudgetTracker(maxTokens, maxCalls) with recordCall/isExhausted/getStatus"
  - "Structured progress: DeepResearchProgressEvent with subEvent discriminator instead of plain strings"
  - "Multi-KB search: terms filter with array of kb_ids instead of per-KB parallel queries"

requirements-completed: [RETR-04, RETR-05, RETR-07]

# Metrics
duration: 8min
completed: 2026-03-19
---

# Phase 05 Plan 02: Budget-Aware Deep Research and Cross-Dataset Search Summary

**BudgetTracker with 50K token + 15 call caps for deep research cost control, plus cross-dataset multi-KB search with ABAC enforcement and kb_id attribution**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-19T07:12:39Z
- **Completed:** 2026-03-19T07:21:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- BudgetTracker class enforces dual limits (tokens + calls) with graceful partial result return
- Deep research emits structured DeepResearchProgressEvent objects for real-time progress streaming
- Cross-dataset searchMultipleDatasets method searches all authorized KBs in a single OpenSearch query
- ChunkResult now includes kb_id for source dataset attribution in cross-dataset results

## Task Commits

Each task was committed atomically:

1. **Task 1: BudgetTracker and budget-aware Deep Research** - `9e70380` (feat)
2. **Task 2: Cross-dataset multi-KB search** - `620e32c` (feat)

## Files Created/Modified
- `be/src/modules/rag/services/rag-deep-research.service.ts` - BudgetTracker class, DeepResearchProgressEvent, budget-aware research()
- `be/src/modules/rag/services/rag-search.service.ts` - searchMultipleDatasets method, mapHits kb_id population
- `be/src/shared/models/types.ts` - Added kb_id optional field to ChunkResult
- `be/tests/rag/deep-research-budget.test.ts` - 8 tests for BudgetTracker and budget-aware research
- `be/tests/rag/cross-dataset-search.test.ts` - 4 tests for multi-KB search with ABAC

## Decisions Made
- BudgetTracker records tokens via approxTokens (chars/4) after each LLM call -- simple heuristic that avoids requiring tokenizer dependency
- Budget check before each LLM call with abort-and-return-partial on exhaustion rather than throwing
- Cross-dataset search uses OpenSearch terms filter with multiple kb_ids in single query (leverages pool model shared index)
- KB expansion capped at 20 to prevent OpenSearch query size limit issues (Pitfall 6)
- vi.hoisted pattern for prompt mocks to survive vi.clearAllMocks() in test setup

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict mode error in follow-up loop**
- **Found during:** Task 2 (build verification)
- **Issue:** `followUps[i].query` flagged as possibly undefined by TS strict mode (exactOptionalPropertyTypes)
- **Fix:** Added non-null assertion `followUps[i]!` since loop bounds guarantee valid index
- **Files modified:** be/src/modules/rag/services/rag-deep-research.service.ts
- **Verification:** npm run build -w be succeeds
- **Committed in:** 620e32c (part of Task 2 commit)

**2. [Rule 1 - Bug] Fixed mock hoisting for prompt build functions in tests**
- **Found during:** Task 1 (test execution)
- **Issue:** vi.clearAllMocks() reset mockReturnValue on prompt build mocks, causing approxTokens to receive undefined
- **Fix:** Re-setup mockReturnValue in beforeEach after clearAllMocks, used vi.hoisted for mock definitions
- **Files modified:** be/tests/rag/deep-research-budget.test.ts
- **Verification:** All 8 tests pass
- **Committed in:** 9e70380 (part of Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Budget-aware deep research ready for integration with chat controller
- Cross-dataset search ready for multi-KB retrieval in chat and search apps
- Structured progress events ready for SSE streaming to frontend

---
*Phase: 05-advanced-retrieval*
*Completed: 2026-03-19*
