---
phase: 05-advanced-retrieval
plan: 01
subsystem: api
tags: [graphrag, language-detection, franc, opensearch, aggregation]

# Dependency graph
requires:
  - phase: 04-domain-specific-parsers
    provides: parsed documents in OpenSearch for GraphRAG indexing
provides:
  - GraphRAG metrics aggregation endpoint (entity/relation/community counts)
  - GraphRAG trigger endpoint with LazyGraphRAG/Full mode selection
  - Language detection utility with Unicode script fallback (7+ languages)
  - Language instruction prompt builder for multilingual responses
affects: [05-02-deep-research, 05-03-graphrag-ui, 05-04-retrieval-settings]

# Tech tracking
tech-stack:
  added: [franc]
  patterns: [Unicode script fallback for short text, OpenSearch count aggregation, graph data clear-before-rebuild]

key-files:
  created:
    - be/src/shared/utils/language-detect.ts
    - be/src/shared/prompts/language-instruction.prompt.ts
    - be/tests/rag/language-detect.test.ts
    - be/tests/rag/graphrag-indexing.test.ts
  modified:
    - be/src/modules/rag/services/rag-graphrag.service.ts
    - be/src/modules/rag/controllers/rag.controller.ts
    - be/src/modules/rag/routes/rag.routes.ts
    - be/src/modules/rag/schemas/rag.schemas.ts
    - be/src/shared/prompts/index.ts
    - be/package.json

key-decisions:
  - "Vietnamese detection uses diacritical mark regex for short text, franc trigrams for long text"
  - "Graph data cleared before rebuild to prevent mixed Light/Full entity format corruption"
  - "Config shape matches task_executor.py exactly: use_graphrag, resolution, community, entity_types, method"

patterns-established:
  - "Unicode script range detection: codepoint ranges for CJK/Hangul/Hiragana/Katakana/Cyrillic/Arabic/Thai"
  - "Clear-before-rebuild pattern for graph data to prevent mixed format corruption"

requirements-completed: [RETR-01, RETR-02]

# Metrics
duration: 9min
completed: 2026-03-19
---

# Phase 5 Plan 1: GraphRAG Indexing Pipeline Summary

**GraphRAG metrics/trigger endpoints with clear-before-rebuild pattern, franc-based language detection with Unicode script fallback for 7+ languages**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-19T07:12:36Z
- **Completed:** 2026-03-19T07:21:36Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Language detection utility supporting 11 languages with Unicode script fallback for short text (<20 chars)
- GraphRAG metrics endpoint returning entity/relation/community counts from OpenSearch aggregations
- GraphRAG trigger endpoint with LazyGraphRAG (light) default and Full mode opt-in
- Graph data clear-before-rebuild preventing mixed entity format corruption
- Config shape perfectly matching Python task_executor.py expectations
- 18 unit tests passing for language detection and GraphRAG metrics

## Task Commits

Each task was committed atomically:

1. **Task 1: Install franc + create language detection utility and GraphRAG metrics method** - `8d431ee` (feat - prior commit already contained this work)
2. **Task 2: Add GraphRAG metrics and trigger API endpoints** - `25892ff` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `be/src/shared/utils/language-detect.ts` - Language detection with franc + Unicode script fallback
- `be/src/shared/prompts/language-instruction.prompt.ts` - System prompt language instruction builder
- `be/src/shared/prompts/index.ts` - Added languageInstructionPrompt export
- `be/src/modules/rag/services/rag-graphrag.service.ts` - Added getGraphMetrics and clearGraphData methods
- `be/src/modules/rag/controllers/rag.controller.ts` - Added getGraphMetrics and triggerGraphRag endpoints
- `be/src/modules/rag/routes/rag.routes.ts` - Registered graph/metrics and graph/run routes
- `be/src/modules/rag/schemas/rag.schemas.ts` - Added graphRunSchema for mode validation
- `be/tests/rag/language-detect.test.ts` - 15 tests for detectLanguage, buildLanguageInstruction, LANG_NAMES
- `be/tests/rag/graphrag-indexing.test.ts` - 3 tests for getGraphMetrics (counts, empty, errors)
- `be/package.json` - Added franc dependency

## Decisions Made
- Vietnamese detection for short text uses diacritical mark regex pattern rather than Unicode range (Vietnamese uses Latin script with diacritics)
- Graph data cleared before rebuild to prevent corrupted data from mixed Light/Full entity formats (per CONTEXT.md rebuild-from-scratch decision)
- GraphRAG config shape matches task_executor.py exactly: use_graphrag, resolution, community, entity_types, method
- LazyGraphRAG (method: 'light') as default, Full GraphRAG (method: 'general') as opt-in

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Vietnamese test text missing diacritical marks**
- **Found during:** Task 1 (TDD GREEN phase)
- **Issue:** Test used "Xin chao cac ban" without Vietnamese diacritics, causing franc to detect Tagalog
- **Fix:** Changed test text to "Xin chao cac ban, hom nay la mot ngay dep troi" with proper diacritics
- **Files modified:** be/tests/rag/language-detect.test.ts
- **Verification:** Test passes, franc correctly returns 'vie'
- **Committed in:** 8d431ee (prior commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test text correction. No scope creep.

## Issues Encountered
- Task 1 was already implemented in a prior commit (8d431ee) from an earlier session. Verified existing implementation met all acceptance criteria and tests passed, then proceeded to Task 2.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GraphRAG metrics and trigger endpoints ready for frontend integration (Plan 05-03)
- Language detection utility available for Deep Research multilingual support (Plan 05-02)
- Backend builds cleanly, all tests pass

---
*Phase: 05-advanced-retrieval*
*Completed: 2026-03-19*
