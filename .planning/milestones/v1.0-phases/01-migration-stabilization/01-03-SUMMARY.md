---
phase: 01-migration-stabilization
plan: 03
subsystem: testing
tags: [e2e, opensearch, chunks, embeddings, playwright]

requires:
  - phase: 01-migration-stabilization/01-01
    provides: Playwright E2E infrastructure, auth setup, API helper
  - phase: 01-migration-stabilization/01-02
    provides: Document upload/parse helpers, wait helpers, sample.pdf test data
provides:
  - OpenSearch direct query helper for E2E chunk verification
  - Chunk existence, embedding, content, search, and count consistency E2E tests
affects: [01-04, 02-01]

tech-stack:
  added: []
  patterns: [direct-opensearch-query-for-e2e, uuid-normalization-32hex]

key-files:
  created:
    - fe/e2e/helpers/opensearch.helper.ts
    - fe/e2e/dataset/chunk-verify.spec.ts
  modified: []

key-decisions:
  - "Direct OpenSearch fetch (not @opensearch-project/opensearch client) for E2E helper -- simpler, no extra dependency"
  - "UUID normalization (strip hyphens) in helper rather than in each test -- centralizes the 36-char to 32-char conversion"
  - "Cache chunks in beforeAll for all test assertions -- avoids repeated OpenSearch queries per test"

patterns-established:
  - "OpenSearch helper pattern: direct HTTP fetch for E2E verification bypassing backend API"
  - "UUID normalization: always .replace(/-/g, '') before OpenSearch queries"

requirements-completed: [STAB-03, STAB-04]

duration: 2min
completed: 2026-03-18
---

# Phase 1 Plan 3: Chunk/Embedding/Indexing E2E Tests Summary

**E2E tests verifying chunk existence, embedding vectors, content match, search API, and chunk count consistency in OpenSearch after document parsing**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-18T08:08:14Z
- **Completed:** 2026-03-18T08:10:15Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Created OpenSearchHelper class for direct index queries with UUID normalization, chunk retrieval, text search, and index refresh
- Added 5 E2E tests: chunk existence (@smoke), embedding vectors (q_vec), content match, search API integration, and chunk count vs metadata consistency
- Helper uses native fetch (no extra dependency) with proper 32-char hex UUID normalization

## Task Commits

Each task was committed atomically:

1. **Task 1: Create OpenSearch helper and write chunk verification E2E tests** - `6551cb6` (test)

**Plan metadata:** [pending final commit]

## Files Created/Modified
- `fe/e2e/helpers/opensearch.helper.ts` - OpenSearch direct query helper with getChunksByDocId, searchChunks, refreshIndex, UUID normalization
- `fe/e2e/dataset/chunk-verify.spec.ts` - 5 E2E tests verifying chunk indexing pipeline end-to-end

## Decisions Made
- Used native fetch instead of @opensearch-project/opensearch client for the E2E helper -- keeps test dependencies minimal and avoids version coupling with the backend
- Centralized UUID normalization in the helper's normalizeUuid method rather than requiring each test to handle format conversion
- Cached chunks in beforeAll to avoid redundant OpenSearch queries across tests while keeping assertions independent

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Chunk verification E2E tests ready for CI integration
- OpenSearch helper available for reuse in Plan 01-04 (chat/search E2E tests)
- All STAB-03 and STAB-04 requirements covered by test assertions

---
*Phase: 01-migration-stabilization*
*Completed: 2026-03-18*
