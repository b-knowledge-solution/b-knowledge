---
phase: 01-migrate-latest-ragflow-upstream-to-b-knowledge
plan: 03
subsystem: database, rag-worker
tags: [peewee, knex, migration, deadlock-retry, canvas-versioning, pypdf, ebooklib]

requires:
  - phase: 01-01
    provides: "Pure RAGFlow directories copied to advance-rag"
  - phase: 01-02
    provides: "Modified files merged with b-knowledge adaptations"
provides:
  - "Updated Python dependencies (pypdf>=6.8.0, ebooklib>=0.18)"
  - "Knex migration for release column and version_title column"
  - "Peewee models for API4Conversation and UserCanvasVersion"
  - "Deadlock retry decorator for DB operations"
  - "Aggregated parsing status query method"
  - "Canvas version release flag support and protection"
  - "UserCanvasVersionService with full version lifecycle"
affects: [01-04, 01-05]

tech-stack:
  added: [ebooklib]
  patterns: [deadlock-retry-decorator, released-version-protection]

key-files:
  created:
    - be/src/shared/db/migrations/20260323140000_add_ragflow_upstream_columns.ts
    - advance-rag/db/services/user_canvas_version.py
  modified:
    - advance-rag/pyproject.toml
    - advance-rag/db/db_models.py
    - advance-rag/db/services/common_service.py
    - advance-rag/db/services/document_service.py
    - advance-rag/db/services/canvas_service.py
    - advance-rag/.env.example

key-decisions:
  - "Added API4Conversation and UserCanvasVersion models to db_models.py since they were missing from b-knowledge"
  - "Skipped doc_metadata_service refactoring — b-knowledge version already has equivalent or better functionality"
  - "Used retry_deadlock_operation on delete_document_and_update_kb_counts for atomic delete safety"

patterns-established:
  - "Deadlock retry pattern: use retry_deadlock_operation() decorator for atomic multi-table operations"
  - "Released version protection: never overwrite a released canvas version with an unreleased save"

requirements-completed: [DEP-UPDATE, DB-MIGRATION, FEATURE-PORT]

duration: 5min
completed: 2026-03-23
---

# Phase 01 Plan 03: Integration Layer Updates Summary

**Updated Python deps (pypdf>=6.8.0, ebooklib>=0.18), added Knex migration for release/version_title columns, ported deadlock retry decorator, parsing status aggregation, and full canvas version release management**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-23T11:39:51Z
- **Completed:** 2026-03-23T11:45:18Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Updated pypdf to >=6.8.0 and added ebooklib>=0.18 for new EPUB parser support
- Created Knex migration adding `release` column to `user_canvas_version` and `version_title` to `api_4_conversation`
- Added missing API4Conversation and UserCanvasVersion Peewee model definitions
- Ported deadlock retry decorator with exponential backoff to common_service
- Added aggregated parsing status query (get_parsing_status_by_kb_ids) to document_service
- Built complete UserCanvasVersionService with release protection, version pruning, and DSL normalization
- Added release time enrichment and get_agent_dsl_with_release to canvas_service

## Task Commits

Each task was committed atomically:

1. **Task 1: Update Python dependencies and Peewee models, create Knex migration** - `8c7ad1c` (feat)
2. **Task 2: Port upstream improvements to protected db/services/ files** - `6acbade` (feat)

## Files Created/Modified
- `advance-rag/pyproject.toml` - Bumped pypdf, added ebooklib
- `advance-rag/db/db_models.py` - Added API4Conversation and UserCanvasVersion models
- `advance-rag/.env.example` - Added DOCLING_SERVER_URL option
- `be/src/shared/db/migrations/20260323140000_add_ragflow_upstream_columns.ts` - New Knex migration for 2 columns
- `advance-rag/db/services/common_service.py` - Added deadlock retry decorator and helper
- `advance-rag/db/services/document_service.py` - Added parsing status aggregation, deadlock retry on delete
- `advance-rag/db/services/canvas_service.py` - Added release time enrichment and DSL release retrieval
- `advance-rag/db/services/user_canvas_version.py` - New service for canvas version lifecycle management

## Decisions Made
- Added API4Conversation and UserCanvasVersion models to db_models.py — they were missing from b-knowledge but required by canvas_service and user_canvas_version service
- Skipped doc_metadata_service refactoring — b-knowledge's version (1171 lines) is already more complete than upstream (1075 lines) with better pagination and format handling
- Applied retry_deadlock_operation to delete_document_and_update_kb_counts since it performs atomic multi-table updates that are deadlock-prone

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added missing Peewee model definitions**
- **Found during:** Task 1 (Peewee model field additions)
- **Issue:** Plan assumed API4Conversation and UserCanvasVersion models already existed in b-knowledge db_models.py — they did not
- **Fix:** Added complete model definitions ported from upstream with b-knowledge conventions (Google-style docstrings)
- **Files modified:** advance-rag/db/db_models.py
- **Verification:** grep confirms release BooleanField and version_title CharField present
- **Committed in:** 8c7ad1c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for correctness — canvas_service and user_canvas_version imports would fail without these models.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Integration layer fully updated, ready for Plan 04 (config/test updates) and Plan 05 (validation)
- All new DB columns have both Knex migration and Peewee model definitions in sync

---
*Phase: 01-migrate-latest-ragflow-upstream-to-b-knowledge*
*Completed: 2026-03-23*
