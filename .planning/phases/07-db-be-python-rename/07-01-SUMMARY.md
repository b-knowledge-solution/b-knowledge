---
phase: 07-db-be-python-rename
plan: 01
subsystem: database
tags: [knex, postgresql, migration, rename, python, opensearch, connector]

requires: []
provides:
  - "Atomic Knex migration renaming 7 project_* tables to knowledge_base_* and 8 FK columns"
  - "Python connector files using knowledge_doc_meta_ prefix instead of ragflow_doc_meta_"
affects: [07-02, 07-03, 08-fe-rename]

tech-stack:
  added: []
  patterns: ["knex.raw() for all DDL renames (avoid .renameColumn() bug #933)"]

key-files:
  created:
    - be/src/shared/db/migrations/20260402000000_rename_projects_to_knowledge_base.ts
  modified:
    - advance-rag/common/doc_store/es_conn_base.py
    - advance-rag/common/doc_store/ob_conn_base.py
    - advance-rag/common/doc_store/infinity_conn_base.py
    - advance-rag/rag/utils/ob_conn.py
    - advance-rag/rag/utils/infinity_conn.py

key-decisions:
  - "Used knex.raw() exclusively for all ALTER TABLE statements per D-08"
  - "Did not rename constraint names (cosmetic only, never referenced in code)"
  - "Updated infinity_conn_base.py table_name_prefix default from ragflow_ to knowledge_"

patterns-established:
  - "DB renames via knex.raw('ALTER TABLE ... RENAME ...') in atomic migration"

requirements-completed: [REN-02, REN-05]

duration: 3min
completed: 2026-04-02
---

# Phase 7 Plan 1: DB Migration + Python Prefix Rename Summary

**Atomic Knex migration renaming 7 project tables and 8 FK columns to knowledge_base, plus 18 ragflow_doc_meta_ to knowledge_doc_meta_ replacements across 5 Python connector files**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-02T08:12:23Z
- **Completed:** 2026-04-02T08:15:01Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created single atomic Knex migration with 15 ALTER TABLE statements (7 table renames + 8 column renames) and complete rollback
- Updated all 5 Python connector files to use knowledge_doc_meta_ prefix (18 occurrences)
- Updated infinity_conn_base.py default table_name_prefix from "ragflow_" to "knowledge_" (Pitfall 3 coverage)
- Verified zero ragflow_doc_meta_ occurrences remain in advance-rag/

## Task Commits

Each task was committed atomically:

1. **Task 1: Create atomic Knex migration for table and column renames** - `91293b2` (feat)
2. **Task 2: Update Python connector files to use knowledge_doc_meta_ prefix** - `fdee8af` (feat)

## Files Created/Modified
- `be/src/shared/db/migrations/20260402000000_rename_projects_to_knowledge_base.ts` - Atomic migration for all project-to-knowledge_base renames
- `advance-rag/common/doc_store/es_conn_base.py` - Updated docstring pattern (1 occurrence)
- `advance-rag/common/doc_store/ob_conn_base.py` - Updated docstring + startswith checks (4 occurrences)
- `advance-rag/common/doc_store/infinity_conn_base.py` - Updated docstrings + startswith + default param (6 occurrences)
- `advance-rag/rag/utils/ob_conn.py` - Updated startswith checks (3 occurrences)
- `advance-rag/rag/utils/infinity_conn.py` - Updated startswith checks (5 occurrences)

## Decisions Made
- Used knex.raw() exclusively per D-08 to avoid .renameColumn() DEFAULT constraint bug (#933)
- Did not rename PostgreSQL constraint names (auto-generated names like project_permissions_project_id_foreign are never referenced in code)
- Included agents.project_id rename in migration (Pitfall 1 from RESEARCH.md)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript compilation errors in unrelated files (missing exports from constants/index.js). These are not caused by this plan and do not affect the migration file.

## Known Stubs

None - all changes are complete renames with no placeholders.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- DB migration ready to run with `npm run db:migrate`
- Python connector prefixes updated, ready for Plan 02 (BE module rename) and Plan 03 (shared code updates)
- Existing ragflow_doc_meta_* OpenSearch indexes will become orphaned; new indexes use knowledge_doc_meta_ prefix

---
*Phase: 07-db-be-python-rename*
*Completed: 2026-04-02*
