---
phase: 03-document-management
plan: 07
subsystem: api
tags: [cron, scheduler, parsing, fifo, dataset-aware]

requires:
  - phase: 03-document-management
    provides: "Parsing scheduler cron service with system config"
provides:
  - "Dataset-aware FIFO parsing scheduler with per-dataset batch limits"
affects: [advance-rag, document-management]

tech-stack:
  added: []
  patterns: [dataset-aware-fifo-scheduling, per-dataset-batch-limit]

key-files:
  created: []
  modified:
    - be/src/shared/services/cron.service.ts

key-decisions:
  - "PER_DATASET_LIMIT = 10 as class constant for per-dataset batch cap"
  - "Static readonly constant on CronService class instead of module-level variable"

patterns-established:
  - "Dataset-aware FIFO: group by kb_id, order by create_time, cap per group"

requirements-completed: [DOCM-06]

duration: 2min
completed: 2026-03-19
---

# Phase 3 Plan 7: Parsing Scheduler Dataset-Aware FIFO Summary

**Dataset-aware FIFO parsing scheduler replacing global LIMIT 50 with per-dataset batching by kb_id**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-19T04:10:26Z
- **Completed:** 2026-03-19T04:12:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced global LIMIT 50 query with unbounded query ordered by kb_id + create_time
- Documents grouped by dataset (kb_id) and processed in per-dataset batches of PER_DATASET_LIMIT (10)
- Per-dataset logging shows queued count and remaining documents per dataset
- Summary logging tracks totalQueued and datasetsProcessed across all datasets

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite runParsingSchedule with dataset-aware FIFO sequencing** - `1ad245d` (feat)

## Files Created/Modified
- `be/src/shared/services/cron.service.ts` - Rewritten runParsingSchedule with dataset grouping, FIFO ordering, per-dataset limit

## Decisions Made
- PER_DATASET_LIMIT = 10 as static readonly class constant (co-located with CronService, easily discoverable)
- Used Map for dataset grouping rather than SQL GROUP BY to keep single query and process in application layer

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Parsing scheduler now fair across datasets; Python task_executor unchanged
- Ready for any remaining phase 3 plans or phase 4

---
*Phase: 03-document-management*
*Completed: 2026-03-19*
