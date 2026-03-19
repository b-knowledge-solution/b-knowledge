---
phase: 04-domain-specific-parsers
plan: 02
subsystem: rag
tags: [openapi, swagger, prance, adr, madr, nygard, y-statement, section-chunking]

# Dependency graph
requires:
  - "04-01: FACTORY registration, ParserType enum, stub modules"
provides:
  - "OpenAPI/Swagger endpoint parser (rag/app/openapi.py) with prance ref resolution"
  - "ADR template-aware section parser (rag/app/adr.py) with MADR/Nygard/Y-statement detection"
affects: [04-03]

# Tech tracking
tech-stack:
  added: [openapi-spec-validator >=0.8.0]
  patterns: [prance ResolvingParser for OpenAPI ref resolution, regex-based ADR section classification, sub-heading merging into parent sections]

key-files:
  created:
    - advance-rag/rag/app/openapi.py
    - advance-rag/rag/app/adr.py
    - advance-rag/tests/test_openapi_parser.py
    - advance-rag/tests/test_adr_parser.py
    - advance-rag/tests/fixtures/sample_openapi3.yaml
    - advance-rag/tests/fixtures/sample_swagger2.json
    - advance-rag/tests/fixtures/sample_adr_madr.md
    - advance-rag/tests/fixtures/sample_adr_nygard.md
    - advance-rag/tests/fixtures/sample_adr_ystatement.md
  modified:
    - advance-rag/pyproject.toml

key-decisions:
  - "Added openapi-spec-validator as explicit dependency (prance validation backend)"
  - "Options pattern checked before consequences to correctly classify MADR 'Pros and Cons of the Options' heading"
  - "Sub-headings (### level) merged into parent H2 section to preserve section integrity in ADR chunking"

patterns-established:
  - "OpenAPI parser: prance parse -> iterate paths/methods -> build chunk text with inlined schemas -> tokenize"
  - "ADR parser: detect format -> extract metadata -> split by H2 sections -> classify headings -> build chunks"

requirements-completed: [PRSR-02, PRSR-03]

# Metrics
duration: 9min
completed: 2026-03-19
---

# Phase 04 Plan 02: OpenAPI & ADR Parsers Summary

**OpenAPI/Swagger endpoint parser with prance ref resolution and ADR template-aware section parser supporting MADR, Nygard, and Y-statement formats**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-19T05:46:57Z
- **Completed:** 2026-03-19T05:56:09Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- OpenAPI parser produces one chunk per endpoint with path, method, summary, parameters, request body, and responses inlined
- Swagger 2.0 and OpenAPI 3.x both supported via prance ResolvingParser with all $ref pointers resolved
- ADR parser detects MADR, Nygard, and Y-statement formats via regex heuristics
- ADR sections (context, decision, consequences, status, options) become individual chunks with section_type metadata
- ADR metadata (status, title, date, superseded_by) extracted and attached to every chunk
- All 27 tests pass (13 OpenAPI + 14 ADR)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement OpenAPI/Swagger endpoint parser (PRSR-02)** - `3fa9096` (feat)
2. **Task 2: Implement ADR template-aware section parser (PRSR-03)** - `fbcd2f6` (feat)

## Files Created/Modified
- `advance-rag/rag/app/openapi.py` - OpenAPI/Swagger endpoint parser with prance ref resolution
- `advance-rag/rag/app/adr.py` - ADR template-aware parser for MADR, Nygard, Y-statement formats
- `advance-rag/tests/test_openapi_parser.py` - 13 tests for OpenAPI parser
- `advance-rag/tests/test_adr_parser.py` - 14 tests for ADR parser
- `advance-rag/tests/fixtures/sample_openapi3.yaml` - OpenAPI 3.0.3 fixture with 3 endpoints
- `advance-rag/tests/fixtures/sample_swagger2.json` - Swagger 2.0 fixture with 2 endpoints
- `advance-rag/tests/fixtures/sample_adr_madr.md` - MADR-format ADR fixture
- `advance-rag/tests/fixtures/sample_adr_nygard.md` - Nygard-format ADR fixture
- `advance-rag/tests/fixtures/sample_adr_ystatement.md` - Y-statement ADR fixture
- `advance-rag/pyproject.toml` - Added openapi-spec-validator dependency

## Decisions Made
- Added `openapi-spec-validator` as explicit dependency since prance requires a validation backend but does not bundle one
- Ordered ADR_SECTION_PATTERNS so `options` is checked before `consequences` to correctly classify MADR "Pros and Cons of the Options" heading (which would otherwise match the `consequences` pattern)
- Sub-headings (H3+) are merged into their parent H2 section content to preserve section integrity (prevents empty parent sections when sub-headings immediately follow)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed openapi-spec-validator dependency**
- **Found during:** Task 1 (OpenAPI parser implementation)
- **Issue:** prance.ResolvingParser requires a validation backend; none was installed
- **Fix:** Installed openapi-spec-validator and added it to pyproject.toml
- **Files modified:** advance-rag/pyproject.toml
- **Verification:** All 13 OpenAPI tests pass
- **Committed in:** 3fa9096 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed ADR sub-headings splitting parent sections**
- **Found during:** Task 2 (ADR parser implementation)
- **Issue:** H3 sub-headings (### Option 1, ### Option 2) under "## Pros and Cons of the Options" caused the parent section to have empty content, filtering it out
- **Fix:** Modified _split_by_sections to only create section boundaries at H1/H2 level; H3+ headings are merged into parent section content
- **Files modified:** advance-rag/rag/app/adr.py
- **Verification:** All 14 ADR tests pass, including options section detection
- **Committed in:** fbcd2f6 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correct operation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- OpenAPI and ADR parsers complete, ready for Plan 03 (clinical document classifier)
- All FACTORY registrations already in place from Plan 01
- 27 parser tests provide regression safety

---
*Phase: 04-domain-specific-parsers*
*Completed: 2026-03-19*
