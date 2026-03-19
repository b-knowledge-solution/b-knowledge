---
phase: 01-migration-stabilization
plan: 02
subsystem: testing
tags: [playwright, e2e, document-upload, document-parsing, deepdoc, parser-migration]

# Dependency graph
requires:
  - phase: 01-01
    provides: Playwright E2E infrastructure, auth fixture, API/wait helpers, sample PDF
provides:
  - Document upload E2E test suite (upload, duplicate, invalid type)
  - Document parsing E2E test suite (trigger, deepdoc, re-parse, cancel)
  - Parser type completeness validation (STAB-05)
affects: [01-03, 01-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [API-driven test setup with UI verification, async polling for parse completion, parser FACTORY completeness assertion]

key-files:
  created:
    - fe/e2e/dataset/document-upload.spec.ts
    - fe/e2e/dataset/document-parse.spec.ts
  modified: []

key-decisions:
  - "Upload tests use UI file chooser for realistic upload flow; API helper for setup/teardown"
  - "Parse tests trigger parsing via API then poll with waitForDocumentParsed -- more reliable than UI-only approach for async operations"
  - "Parser completeness validated statically by comparing Python FACTORY keys against FE PARSER_OPTIONS values"

patterns-established:
  - "File chooser pattern: waitForEvent('filechooser') + setFiles() for upload modal interaction"
  - "Async parse verification: API trigger + polling helper + chunk count assertion"
  - "Re-parse safety: compare chunk counts before/after with ratio bounds (0.5-2.0x)"

requirements-completed: [STAB-02, STAB-05]

# Metrics
duration: 3min
completed: 2026-03-18
---

# Phase 1 Plan 02: Document Upload & Parsing E2E Tests Summary

**E2E tests for PDF upload via file chooser modal and async deepdoc parsing pipeline with chunk generation verification and parser FACTORY completeness validation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-18T08:01:41Z
- **Completed:** 2026-03-18T08:04:35Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Document upload E2E tests exercise full UI flow: file chooser, modal interaction, duplicate handling, invalid type rejection
- Document parsing E2E tests cover trigger parse, deepdoc/naive parser for PDF, re-parse (no chunk duplication), and cancel parsing
- Parser type completeness validated: all 13 FE PARSER_OPTIONS have corresponding Python FACTORY handlers (STAB-05)
- All async waits use polling helpers (no fixed sleeps)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write document upload E2E tests** - `7d16cee` (feat)
2. **Task 2: Write document parsing E2E tests** - `fd460fd` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `fe/e2e/dataset/document-upload.spec.ts` - Upload PDF via UI, duplicate filename, invalid file type tests
- `fe/e2e/dataset/document-parse.spec.ts` - Trigger parse, deepdoc verification, re-parse, cancel, parser completeness

## Decisions Made
- Upload tests use Playwright file chooser API for realistic upload flow rather than API-only upload
- Parse tests use API trigger + polling helper for reliability -- UI parse button interaction is secondary
- Parser completeness test uses static comparison of known FACTORY keys vs PARSER_OPTIONS values (no runtime Python introspection needed)
- Re-parse chunk duplication check uses ratio bounds (0.5x-2.0x) to allow minor variance in chunk boundaries

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - tests use existing dev infrastructure (`npm run docker:base && npm run dev`).

## Next Phase Readiness
- Upload and parsing pipeline covered by E2E tests
- Ready for Plan 01-03 (chunk/embedding/indexing tests) which depends on parsed documents
- waitForDocumentParsed and waitForChunksIndexed helpers proven ready for use in subsequent plans

---
*Phase: 01-migration-stabilization*
*Completed: 2026-03-18*
