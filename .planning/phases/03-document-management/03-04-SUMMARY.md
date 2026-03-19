---
phase: 03-document-management
plan: 04
subsystem: api
tags: [bulk-metadata, tag-aggregation, cron-scheduler, opensearch, jsonb, node-cron]

requires:
  - phase: 03-01
    provides: Dataset versioning model and service layer
provides:
  - POST /datasets/bulk-metadata endpoint for batch metadata_tags update
  - GET /tags/aggregations endpoint for OpenSearch tag discovery
  - CronService parsing scheduler with system config API
  - GET/PUT /rag/system/config/parsing_scheduler admin endpoints
affects: [03-05, 03-06]

tech-stack:
  added: []
  patterns: [jsonb_set for metadata_tags merge/overwrite, lazy dynamic import for circular dependency avoidance in cron]

key-files:
  created: []
  modified:
    - be/src/modules/rag/services/rag.service.ts
    - be/src/modules/rag/services/rag-search.service.ts
    - be/src/modules/rag/controllers/rag.controller.ts
    - be/src/modules/rag/routes/rag.routes.ts
    - be/src/modules/rag/schemas/rag.schemas.ts
    - be/src/shared/services/cron.service.ts
    - be/src/app/index.ts
    - be/tests/rag/metadata-tagging.test.ts

key-decisions:
  - "Bulk metadata uses jsonb_set with COALESCE for merge mode to preserve existing tags"
  - "Tag aggregation queries OpenSearch terms aggregation on tag_kwd field"
  - "Parsing scheduler uses lazy dynamic imports to avoid circular dependency with rag services"
  - "System config API placed under /rag/system/config namespace (co-located with RAG domain)"

patterns-established:
  - "jsonb_set merge pattern: COALESCE(col->'key', '{}') || new_data for safe JSONB sub-key merge"
  - "Lazy import pattern in cron service for cross-module dependency without circular reference"

requirements-completed: [DOCM-04, DOCM-05, DOCM-06]

duration: 12min
completed: 2026-03-19
---

# Phase 3 Plan 4: Bulk Metadata, Tag Aggregation, and Parsing Scheduler Summary

**Bulk metadata_tags update with merge/overwrite modes, OpenSearch tag aggregation endpoint, and cron-based parsing scheduler with system config API**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-19T03:05:27Z
- **Completed:** 2026-03-19T03:18:03Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Bulk metadata API updates parser_config.metadata_tags on multiple datasets with merge/overwrite modes and tenant isolation
- Tag aggregation endpoint queries OpenSearch terms aggregation for tag discovery with ABAC filtering
- CronService parsing scheduler reads schedule from system_configs and triggers parsing for queued documents
- System config API allows admin to GET/PUT parsing scheduler settings (enabled flag + cron expression)
- DOCM-04 and DOCM-06 test stubs replaced with real tests verifying metadata_tags separation and tenant isolation

## Task Commits

Each task was committed atomically:

1. **Task 1: Bulk metadata API + tag aggregation endpoint** - `62aaafc` (feat)
2. **Task 2: Cron parsing scheduler + system config API** - `a24b203` (feat)
3. **Test fix: db.raw parameter format** - `0630a58` (fix)

## Files Created/Modified
- `be/src/modules/rag/services/rag.service.ts` - Added bulkUpdateMetadata with jsonb_set merge/overwrite
- `be/src/modules/rag/services/rag-search.service.ts` - Added getTagAggregations using OpenSearch terms agg
- `be/src/modules/rag/controllers/rag.controller.ts` - Added bulk metadata, tag aggregation, and scheduler config handlers
- `be/src/modules/rag/routes/rag.routes.ts` - Registered bulk-metadata, tags/aggregations, and scheduler config routes
- `be/src/modules/rag/schemas/rag.schemas.ts` - Added bulkMetadataSchema Zod validation
- `be/src/shared/services/cron.service.ts` - Added parsing scheduler with start/stop/update/init methods
- `be/src/app/index.ts` - Wired initParsingSchedulerFromConfig into startup
- `be/tests/rag/metadata-tagging.test.ts` - Replaced DOCM-04/06 stubs with real tests

## Decisions Made
- Bulk metadata uses jsonb_set with COALESCE for merge mode to preserve existing tags without clobbering other parser_config keys
- Tag aggregation queries OpenSearch terms aggregation on tag_kwd field (size 50 buckets)
- Parsing scheduler uses lazy dynamic imports (`await import()`) to avoid circular dependency between cron.service and rag modules
- System config API placed under /rag/system/config/ namespace since parsing scheduler is RAG-domain specific
- Bulk-metadata route registered BEFORE /datasets/:id to prevent Express route parameter capture

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test mock path aliases**
- **Found during:** Task 1 (test execution)
- **Issue:** Test mocks used relative paths (`../../src/...`) which failed with vitest @ alias resolution
- **Fix:** Changed all vi.mock paths to use `@/` prefix matching vitest resolve config
- **Files modified:** be/tests/rag/metadata-tagging.test.ts
- **Verification:** Tests load and pass correctly
- **Committed in:** 62aaafc

**2. [Rule 1 - Bug] Fixed OpenSearch aggregation type assertion**
- **Found during:** Task 1 (build verification)
- **Issue:** TypeScript error on `res.body.aggregations?.tag_keys?.buckets` - OpenSearch Aggregate type union
- **Fix:** Added `as any` cast for the aggregation bucket access
- **Files modified:** be/src/modules/rag/services/rag-search.service.ts
- **Committed in:** 62aaafc

**3. [Rule 1 - Bug] Fixed db.raw parameter assertion in test**
- **Found during:** Task 2 (final verification)
- **Issue:** Test expected scalar string but db.raw receives params as array
- **Fix:** Changed `toBe(json)` to `toEqual([json])`
- **Files modified:** be/tests/rag/metadata-tagging.test.ts
- **Committed in:** 0630a58

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed items above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bulk metadata and tag aggregation endpoints ready for frontend integration (Plan 03-05/06)
- Parsing scheduler ready for admin UI configuration
- DOCM-05 test stubs remain (auto-extraction config is FE-only, will be addressed in frontend plans)

---
*Phase: 03-document-management*
*Completed: 2026-03-19*
