---
phase: 01-migrate-latest-ragflow-upstream-to-b-knowledge
plan: 02
subsystem: rag
tags: [python, ragflow, upstream-merge, parser, graphrag, epub, raptor]

# Dependency graph
requires:
  - phase: 01-01
    provides: Pure RAGFlow directories overwritten with upstream code
provides:
  - Merged rag/app/ files with upstream EPUB support and b-knowledge imports
  - Cross-KB collision guard in task_executor RAPTOR function
  - Response normalization and truncated cache detection in graphrag extractor
affects: [01-03, 01-04, 01-05]

# Tech tracking
tech-stack:
  added: [EpubParser]
  patterns: [upstream-merge-with-import-translation, parent-class-method-delegation]

key-files:
  modified:
    - advance-rag/rag/app/naive.py
    - advance-rag/rag/app/manual.py
    - advance-rag/rag/app/qa.py
    - advance-rag/rag/svr/task_executor.py
    - advance-rag/rag/graphrag/general/extractor.py

key-decisions:
  - "Removed get_picture override from naive.py Docx — now inherited from parent DocxParser which uses LazyDocxImage"
  - "Removed get_picture and concat_img from manual.py and qa.py Docx classes — parent class and rag.nlp handle these"
  - "Skipped sync_data_source.py — not present in b-knowledge (RAGFlow-only connector feature)"
  - "Skipped handle_save_to_memory_task import — b-knowledge handles memory via Node.js backend module"

patterns-established:
  - "Import translation: all 'from api.db.*' must become 'from db.*' when merging upstream"
  - "Parent class delegation: DocxParser.get_picture inherited rather than overridden per file"

requirements-completed: [MANUAL-MERGE]

# Metrics
duration: 7min
completed: 2026-03-23
---

# Phase 01 Plan 02: Manual Merge of b-knowledge-modified RAGFlow Files Summary

**Merged 10 upstream RAGFlow files preserving b-knowledge db.services imports, adding EPUB support, cross-KB RAPTOR guard, and graphrag response normalization**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-23T11:29:53Z
- **Completed:** 2026-03-23T11:37:40Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- All rag/app/ files (naive.py, manual.py, picture.py, qa.py) merged with upstream changes while preserving b-knowledge import patterns
- EPUB file format support added to naive.py parser via EpubParser registration
- Cross-KB document name collision guard added to RAPTOR function in task_executor.py
- Response normalization and truncated cache detection added to graphrag extractor

## Task Commits

Each task was committed atomically:

1. **Task 1: Merge rag/app/ files** - `0369c79` (feat)
2. **Task 2: Merge rag/svr/ and rag/graphrag/ files** - `c18c34f` (feat)

## Files Created/Modified
- `advance-rag/rag/app/naive.py` - Added EpubParser import and EPUB elif block, removed get_picture override, updated by_docling with callback guard and DOCLING_* env vars
- `advance-rag/rag/app/manual.py` - Copied upstream: removed get_picture/concat_img from Docx, uses concat_img from rag.nlp
- `advance-rag/rag/app/qa.py` - Copied upstream: removed PIL import, get_picture now inherited from DocxParser
- `advance-rag/rag/svr/task_executor.py` - Added doc_name_by_id cross-KB collision guard in run_raptor_for_kb
- `advance-rag/rag/graphrag/general/extractor.py` - Added _normalize_response_text and _is_truncated_cache helpers, updated _chat method

## Decisions Made
- Removed get_picture override from naive.py Docx class since parent DocxParser now provides it with LazyDocxImage support
- Removed get_picture and concat_img from manual.py and qa.py Docx classes for the same reason
- Skipped sync_data_source.py merge since b-knowledge does not include RAGFlow's data source connector system
- Skipped handle_save_to_memory_task import from upstream task_executor since b-knowledge memory is handled by the Node.js backend
- picture.py, raptor.py, search.py, and discord_svr.py required no changes (already had correct imports and no meaningful upstream code differences)

## Deviations from Plan

### Adjustments

**1. sync_data_source.py not present in b-knowledge**
- **Found during:** Task 2
- **Issue:** Plan listed sync_data_source.py for merge but it does not exist in advance-rag/rag/svr/
- **Resolution:** Skipped — this is a RAGFlow-specific connector feature not used by b-knowledge
- **Impact:** None — file was never part of b-knowledge

**2. picture.py, raptor.py, search.py, discord_svr.py already up-to-date**
- **Found during:** Task 1 and Task 2
- **Issue:** These files had no meaningful code differences from upstream (only import paths and docstrings)
- **Resolution:** No changes applied — b-knowledge versions already had correct imports and all upstream logic
- **Impact:** None — reduced churn

---

**Total deviations:** 2 scope adjustments (no auto-fixes needed)
**Impact on plan:** Minor scope reduction. All critical upstream changes (EPUB, cross-KB guard, response normalization) successfully applied.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All b-knowledge-modified RAGFlow files now contain upstream improvements
- Zero `from api.db.*` imports remain in merged files
- Ready for remaining merge tasks (01-03 through 01-05)

---
*Phase: 01-migrate-latest-ragflow-upstream-to-b-knowledge*
*Completed: 2026-03-23*

## Self-Check: PASSED
