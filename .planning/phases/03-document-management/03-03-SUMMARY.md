---
phase: 03-document-management
plan: 03
subsystem: search, ui
tags: [opensearch, rank_feature, pagerank, react, split-view, drawer, dialog]

requires:
  - phase: 03-01
    provides: version-as-dataset model with pagerank field
provides:
  - rank_feature boost on pagerank_fea in all RagSearchService search methods
  - ChunkDetailPage with split-view document preview and chunk CRUD
  - CitationDocDrawer for chat citation document viewing
  - SearchResultDocDialog for search result document viewing
  - Document name navigation to chunk detail page
affects: [chat, search, datasets]

tech-stack:
  added: []
  patterns: [rank_feature in should clause for version recency boost, split-view pattern reuse across full page / drawer / dialog]

key-files:
  created:
    - fe/src/features/datasets/pages/ChunkDetailPage.tsx
    - fe/src/features/datasets/components/ChunkToolbar.tsx
    - fe/src/features/chat/components/CitationDocDrawer.tsx
    - fe/src/features/search/components/SearchResultDocDialog.tsx
  modified:
    - be/src/modules/rag/services/rag-search.service.ts
    - be/tests/rag/version-history.test.ts
    - fe/src/features/datasets/components/DocumentTable.tsx
    - fe/src/app/App.tsx
    - fe/src/app/routeConfig.ts
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/vi.json
    - fe/src/i18n/locales/ja.json

key-decisions:
  - "rank_feature in should clause (not must/filter) — proportional boost without excluding non-versioned documents"
  - "Fixed pre-existing test mock paths to use @/ alias matching vitest resolve config"
  - "Reused existing DocumentPreviewer in all three viewer patterns (page, drawer, dialog)"

patterns-established:
  - "rank_feature boost: always add { rank_feature: { field: 'pagerank_fea', linear: {} } } to should clause in search queries"
  - "Document viewer reuse: DocumentPreviewer wraps into ChunkDetailPage (full page), CitationDocDrawer (Sheet), SearchResultDocDialog (Dialog)"

requirements-completed: [DOCM-02]

duration: 13min
completed: 2026-03-19
---

# Phase 3 Plan 03: Version-Aware Search & Chunk Detail Page Summary

**OpenSearch rank_feature boost on pagerank_fea for version recency ranking + ChunkDetailPage split-view with three document viewer patterns (full page, chat drawer, search dialog)**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-19T03:05:24Z
- **Completed:** 2026-03-19T03:18:47Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- All search methods (fullTextSearch, semanticSearch) now include rank_feature boost on pagerank_fea — newer dataset versions rank higher
- ChunkDetailPage provides full-page split-view with document preview and chunk list with CRUD
- Document name in DocumentTable navigates to chunk detail page
- CitationDocDrawer and SearchResultDocDialog wrap DocumentPreviewer for chat and search contexts
- All 10 version-history tests pass (DOCM-01, DOCM-02, DOCM-03)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add rank_feature boost to RagSearchService + update test stubs** - `e2befe3` (feat)
2. **Task 2: Build ChunkDetailPage, ChunkToolbar, and document viewer patterns** - `eb8e527` (feat)

## Files Created/Modified
- `be/src/modules/rag/services/rag-search.service.ts` - Added rank_feature on pagerank_fea to fullTextSearch and semanticSearch should clauses
- `be/tests/rag/version-history.test.ts` - Replaced DOCM-02 stubs with real tests + fixed mock paths
- `fe/src/features/datasets/pages/ChunkDetailPage.tsx` - Full-page split-view chunk detail page
- `fe/src/features/datasets/components/ChunkToolbar.tsx` - Toolbar with chunk count, search, sort, add chunk
- `fe/src/features/chat/components/CitationDocDrawer.tsx` - Sheet wrapping DocumentPreviewer for chat citations
- `fe/src/features/search/components/SearchResultDocDialog.tsx` - Dialog wrapping DocumentPreviewer for search results
- `fe/src/features/datasets/components/DocumentTable.tsx` - Document name navigates to chunks page
- `fe/src/app/App.tsx` - Added ChunkDetailPage route with FeatureErrorBoundary
- `fe/src/app/routeConfig.ts` - Added route metadata with dynamic path matching
- `fe/src/i18n/locales/en.json` - Added chunk detail i18n keys
- `fe/src/i18n/locales/vi.json` - Added chunk detail i18n keys (Vietnamese)
- `fe/src/i18n/locales/ja.json` - Added chunk detail i18n keys (Japanese)

## Decisions Made
- rank_feature placed in should clause (not must/filter) — gives proportional boost without excluding documents that lack the field
- Fixed pre-existing broken test mock paths from `../../src/` to `@/` alias format matching vitest resolve config
- Reused existing DocumentPreviewer component in all three viewer contexts rather than creating separate preview implementations

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed vitest mock path resolution for version-history tests**
- **Found during:** Task 1 (running tests)
- **Issue:** All vi.mock paths used `../../src/` relative paths but vitest resolves modules via `@/` alias — tests failed to load modules
- **Fix:** Changed all vi.mock paths to use `@/` prefix matching vitest.config.ts resolve alias
- **Files modified:** be/tests/rag/version-history.test.ts
- **Verification:** All 10 tests pass
- **Committed in:** e2befe3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Pre-existing test infrastructure issue. Fix necessary to run any tests in this file.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Version-aware search ranking is operational
- Chunk detail page ready for user testing
- CitationDocDrawer and SearchResultDocDialog can be wired into existing chat/search click handlers in future plans

---
*Phase: 03-document-management*
*Completed: 2026-03-19*
