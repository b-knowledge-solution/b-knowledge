---
phase: 05-advanced-retrieval
plan: 04
subsystem: ui
tags: [react, tanstack-query, sse, i18n, graphrag, deep-research, rbac]

# Dependency graph
requires:
  - phase: 05-advanced-retrieval/plan-01
    provides: GraphRAG metrics endpoint and Light/Full mode API
  - phase: 05-advanced-retrieval/plan-02
    provides: Deep Research SSE event format with budget tracking
  - phase: 05-advanced-retrieval/plan-03
    provides: Chat pipeline integration with language, deep research, graph+vector, ABAC
provides:
  - KnowledgeGraphTab metrics panel with entity/relation/community counts and last-built timestamp
  - Light/Full mode selector for GraphRAG builds
  - ChatAssistantConfig toggles for Knowledge Graph mode, Deep Research, and RBAC datasets
  - useChatStream Deep Research SSE event parsing with deepResearchEvents array
  - DeepResearchEvent type for structured SSE sub-events
  - i18n keys for all new UI strings in en, vi, ja locales
affects: [chat-ui, dataset-management, search-config]

# Tech tracking
tech-stack:
  added: []
  patterns: [MetricCard component pattern, formatLastBuilt relative time helper, SSE sub-event parsing with ref+state sync]

key-files:
  created: []
  modified:
    - fe/src/features/datasets/components/KnowledgeGraphTab.tsx
    - fe/src/features/datasets/api/datasetApi.ts
    - fe/src/features/datasets/api/datasetQueries.ts
    - fe/src/features/chat/components/ChatAssistantConfig.tsx
    - fe/src/features/chat/hooks/useChatStream.ts
    - fe/src/features/chat/types/chat.types.ts
    - fe/src/lib/queryKeys.ts
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/vi.json
    - fe/src/i18n/locales/ja.json

key-decisions:
  - "MetricCard as inline local component in KnowledgeGraphTab (not shared) since metrics display is specific to KG context"
  - "formatLastBuilt uses relative time for recent dates, absolute for older -- no external date library"
  - "useRunGraphRAG uses unknown cast for legacy endpoint return type compatibility with mode-aware endpoint"
  - "Deep Research events accumulated via ref+state pattern matching existing useChatStream approach"
  - "Existing reasoning state preserved in ChatAssistantConfig, only UI label changed to Deep Research"

patterns-established:
  - "MetricCard: lightweight stat card with label (text-xs muted) and value (text-lg font-semibold)"
  - "SSE sub-event parsing: check data.status parent, then data.subEvent for structured nested events"

requirements-completed: [RETR-01, RETR-02, RETR-03, RETR-04, RETR-05, RETR-06, RETR-07]

# Metrics
duration: 14min
completed: 2026-03-19
---

# Phase 5 Plan 4: Frontend Integration Summary

**KG metrics panel, Light/Full mode selector, Deep Research/KG/RBAC assistant toggles, and structured SSE event handling across 10 files in 3 locales**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-19T07:34:15Z
- **Completed:** 2026-03-19T07:49:02Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- KnowledgeGraphTab displays entity/relation/community counts and last-built timestamp with 30s auto-refresh
- Light and Full mode buttons replace single Run GraphRAG button, routing to mode-aware API
- ChatAssistantConfig has Knowledge Graph, Deep Research (renamed from Reasoning), and Allow RBAC Datasets toggles
- useChatStream parses structured Deep Research SSE sub-events (subquery progress, budget warning, budget exhausted) and exposes deepResearchEvents array
- All new UI strings added to en.json, vi.json, ja.json (3 locales)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend KnowledgeGraphTab with metrics panel and mode selector** - `fabd0d5` (feat)
2. **Task 2: Add assistant config toggles and Deep Research SSE handling** - `7747efa` (feat)

## Files Created/Modified
- `fe/src/features/datasets/components/KnowledgeGraphTab.tsx` - Added MetricCard, formatLastBuilt, metrics panel, Light/Full mode buttons
- `fe/src/features/datasets/api/datasetApi.ts` - Added getGraphMetrics and runGraphRAGWithMode API functions
- `fe/src/features/datasets/api/datasetQueries.ts` - Added useGraphMetrics hook, updated useRunGraphRAG for mode param
- `fe/src/lib/queryKeys.ts` - Added graphMetrics query key
- `fe/src/features/chat/components/ChatAssistantConfig.tsx` - Added allowRbacDatasets state/toggle, relabeled KG and Deep Research toggles
- `fe/src/features/chat/hooks/useChatStream.ts` - Added Deep Research SSE sub-event parsing and deepResearchEvents state
- `fe/src/features/chat/types/chat.types.ts` - Added DeepResearchEvent interface and allow_rbac_datasets to PromptConfig
- `fe/src/i18n/locales/en.json` - Added datasets metrics, chatSettings toggles, and chat deep research keys
- `fe/src/i18n/locales/vi.json` - Vietnamese translations for all new keys
- `fe/src/i18n/locales/ja.json` - Japanese translations for all new keys

## Decisions Made
- MetricCard kept as local component in KnowledgeGraphTab (not shared) since metrics display is KG-specific
- formatLastBuilt uses relative time for recent dates, absolute for older (no external date library needed)
- useRunGraphRAG legacy endpoint return cast via `unknown` for strict TypeScript compatibility
- Existing `reasoning` state variable preserved in ChatAssistantConfig; only the UI label changed to "Deep Research"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript strict mode type mismatch in useRunGraphRAG mutation**
- **Found during:** Task 1 (useRunGraphRAG mode parameter update)
- **Issue:** Return types of runGraphRAGWithMode and runGraphRAG differ; TypeScript strict mode rejected direct union
- **Fix:** Used `unknown` intermediate cast for legacy endpoint return to satisfy strict type checking
- **Files modified:** fe/src/features/datasets/api/datasetQueries.ts
- **Verification:** FE build passes with no type errors
- **Committed in:** fabd0d5 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor type cast needed for backward compatibility. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 5 frontend integration complete -- all Phase 5 features have user-facing surface
- KG metrics, mode selection, Deep Research toggles, and RBAC dataset toggles ready for end-to-end testing
- Deep Research SSE events are captured and exposed for future UI display components (progress indicators, budget warnings)

---
*Phase: 05-advanced-retrieval*
*Completed: 2026-03-19*
