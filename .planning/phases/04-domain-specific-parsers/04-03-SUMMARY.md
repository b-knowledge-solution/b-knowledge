---
phase: 04-domain-specific-parsers
plan: 03
subsystem: rag
tags: [clinical-parser, llm-classification, parser-ui, i18n]

# Dependency graph
requires:
  - "04-01: ParserType enum with CLINICAL, FACTORY registration, stub module"
provides:
  - "Clinical document classifier with LLM-based classification into 4 categories"
  - "classify_document() async function for post-parse classification pipeline"
  - "All four new parser types (code, openapi, adr, clinical) visible in FE parser selector"
  - "PARSER_DESCRIPTIONS with format info for all four new parsers"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [post-parse LLM classification via task_executor pipeline, naive-style paragraph chunking for clinical docs]

key-files:
  created:
    - advance-rag/tests/test_clinical_parser.py
    - advance-rag/tests/fixtures/sample_clinical_protocol.txt
  modified:
    - advance-rag/rag/app/clinical.py
    - advance-rag/rag/svr/task_executor.py
    - fe/src/features/datasets/types/index.ts
    - fe/src/features/datasets/components/ParserSettingsFields.tsx
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/vi.json
    - fe/src/i18n/locales/ja.json

key-decisions:
  - "Clinical classification runs as post-parse step in task_executor (not inside chunk()) following auto_keywords async pattern"
  - "Uses asyncio.run in tests instead of pytest-asyncio to avoid adding test dependency"
  - "Japanese i18n uses proper kanji/katakana translations"

patterns-established:
  - "Post-parse LLM classification: parser chunk() produces plain chunks, task_executor adds LLM classification as tag after parsing"

requirements-completed: [PRSR-04]

# Metrics
duration: 8min
completed: 2026-03-19
---

# Phase 04 Plan 03: Clinical Classifier and FE Parser Registration Summary

**LLM-based clinical document classifier with 4-category classification (regulatory/protocol/research/administrative) and all four new parser types registered in FE selector**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-19T05:47:20Z
- **Completed:** 2026-03-19T05:55:20Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Clinical parser chunks documents using naive-style paragraph splitting with tokenization and 'clinical' tags
- classify_document() async function classifies documents via LLM into regulatory/protocol/research/administrative
- Post-parse classification block in task_executor.py with LLM cache, chat_limiter semaphore, and document metadata storage
- All four parser types (code, openapi, adr, clinical) visible in FE PARSER_OPTIONS dropdown with descriptions
- Clinical parser added to NO_CHUNK_SETTINGS_PARSERS (classification is automatic, no special settings)
- 12 unit tests pass covering all chunk and classification behaviors with mocked LLM

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement clinical document classifier (PRSR-04)** - `a7812de` (feat)
2. **Task 2: Register all four parser types in FE** - `18c6087` (feat)

## Files Created/Modified
- `advance-rag/rag/app/clinical.py` - Clinical parser with naive chunking and async LLM classification function
- `advance-rag/rag/svr/task_executor.py` - Post-parse clinical classification block after enable_metadata
- `advance-rag/tests/test_clinical_parser.py` - 12 pytest tests covering chunk and classify behaviors
- `advance-rag/tests/fixtures/sample_clinical_protocol.txt` - Phase III clinical trial protocol fixture
- `fe/src/features/datasets/types/index.ts` - PARSER_OPTIONS and PARSER_DESCRIPTIONS for code, openapi, adr, clinical
- `fe/src/features/datasets/components/ParserSettingsFields.tsx` - Added clinical to NO_CHUNK_SETTINGS_PARSERS
- `fe/src/i18n/locales/en.json` - Parser i18n keys (Code, API Spec, ADR, Clinical)
- `fe/src/i18n/locales/vi.json` - Parser i18n keys (Vietnamese translations)
- `fe/src/i18n/locales/ja.json` - Parser i18n keys (Japanese translations)

## Decisions Made
- Clinical classification runs as a post-parse step in task_executor.py (not inside chunk()) following the established auto_keywords async pattern with chat_limiter semaphore and LLM cache
- Used asyncio.run() in tests instead of adding pytest-asyncio dependency
- Japanese translations use proper kanji: コード, API仕様, 臨床

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- pytest-asyncio not installed in project venv; resolved by using asyncio.run() in tests instead (no new dependency needed)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All four domain-specific parsers are now complete (code, openapi, adr, clinical)
- FACTORY infrastructure, ParserType enum, and FE parser selector all fully populated
- Phase 4 is ready for verification

---
*Phase: 04-domain-specific-parsers*
*Completed: 2026-03-19*
