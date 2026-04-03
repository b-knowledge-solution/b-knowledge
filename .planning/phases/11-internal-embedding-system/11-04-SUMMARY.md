---
phase: 11-internal-embedding-system
plan: 04
subsystem: ui, api
tags: [react, express, embedding, i18n, shadcn, tailwind, redis-streams]

requires:
  - phase: 11-02
    provides: system provider registration with is_system flag
provides:
  - POST /api/rag/datasets/:id/re-embed endpoint with Redis Stream task queuing
  - System badge and disabled edit/delete on LLM Config provider rows
  - Re-embed warning banner with CTA on Dataset Settings drawer
  - i18n keys for system badge and re-embed UI in en/vi/ja
affects: [11-05, advance-rag]

tech-stack:
  added: []
  patterns: [dimension-mismatch-detection-via-known-dimensions-lookup, useConfirm-for-destructive-actions]

key-files:
  created: []
  modified:
    - be/src/modules/rag/routes/rag.routes.ts
    - be/src/modules/rag/controllers/rag.controller.ts
    - be/src/modules/rag/services/rag.service.ts
    - be/src/modules/rag/services/rag-redis.service.ts
    - fe/src/features/llm-provider/types/llmProvider.types.ts
    - fe/src/features/llm-provider/pages/LLMProviderPage.tsx
    - fe/src/features/datasets/components/GeneralSettingsForm.tsx
    - fe/src/features/datasets/api/datasetApi.ts
    - fe/src/features/datasets/api/datasetQueries.ts
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/vi.json
    - fe/src/i18n/locales/ja.json

key-decisions:
  - "Used KNOWN_DIMENSIONS lookup table for embedding dimension mismatch detection rather than API call"
  - "Used useConfirm dialog (existing project pattern) instead of AlertDialog for re-embed confirmation"
  - "Dynamic import for ragRedisService in rag.service.ts to avoid eager Redis init"

patterns-established:
  - "KNOWN_DIMENSIONS constant for client-side embedding dimension resolution"
  - "queueReEmbed in rag-redis.service.ts with synthetic doc_id 'reembed_x' for dataset-level tasks"

requirements-completed: [EMB-06, EMB-07]

duration: 9min
completed: 2026-04-03
---

# Phase 11 Plan 04: UI Components and Re-embed Endpoint Summary

**System provider badge with disabled controls on LLM Config page, re-embed warning banner with CTA on Dataset Settings, and backend POST re-embed endpoint via Redis Streams**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-03T09:23:11Z
- **Completed:** 2026-04-03T09:32:16Z
- **Tasks:** 3 of 4 (Task 4 is checkpoint:human-verify)
- **Files modified:** 12

## Accomplishments
- Backend POST /api/rag/datasets/:id/re-embed endpoint that validates dataset and enqueues re-embed task via Redis Stream
- System info badge on LLM Config page for providers with is_system=true, with disabled edit/delete buttons and tooltip
- Re-embed warning banner on Dataset Settings drawer with dimension mismatch detection and confirmation dialog
- All new UI strings available in English, Vietnamese, and Japanese

## Task Commits

Each task was committed atomically:

1. **Task 1: Create backend re-embed endpoint** - `015d4ab` (feat)
2. **Task 2: System badge + disabled controls** - `cb73f08` (feat)
3. **Task 3: Re-embed warning banner + CTA** - `283cdf2` (feat)

**Task 4:** checkpoint:human-verify (awaiting visual verification)

## Files Created/Modified
- `be/src/modules/rag/routes/rag.routes.ts` - Added POST /datasets/:id/re-embed route
- `be/src/modules/rag/controllers/rag.controller.ts` - Added reEmbedDataset controller returning 202
- `be/src/modules/rag/services/rag.service.ts` - Added reEmbedDataset with dataset validation
- `be/src/modules/rag/services/rag-redis.service.ts` - Added queueReEmbed for Redis Stream task
- `fe/src/features/llm-provider/types/llmProvider.types.ts` - Added is_system field to ModelProvider
- `fe/src/features/llm-provider/pages/LLMProviderPage.tsx` - System badge, disabled buttons, tooltips
- `fe/src/features/datasets/components/GeneralSettingsForm.tsx` - Re-embed warning banner with CTA
- `fe/src/features/datasets/api/datasetApi.ts` - Added reEmbedDataset API method
- `fe/src/features/datasets/api/datasetQueries.ts` - Added useReEmbedDataset mutation hook
- `fe/src/i18n/locales/en.json` - systemBadge, systemManagedTooltip, reembed namespace
- `fe/src/i18n/locales/vi.json` - Vietnamese translations for system badge and re-embed
- `fe/src/i18n/locales/ja.json` - Japanese translations for system badge and re-embed

## Decisions Made
- Used `KNOWN_DIMENSIONS` static lookup table for client-side dimension detection instead of adding a new API call -- simpler and no backend changes needed for common models
- Used the existing `useConfirm` dialog pattern (from `@/components/ConfirmDialog`) instead of shadcn AlertDialog since AlertDialog component wasn't installed in the project
- Used dynamic import for `ragRedisService` in `rag.service.ts` to match the existing pattern and avoid eager Redis client initialization
- Used synthetic `doc_id: 'reembed_x'` in Redis Stream message following the existing `graph_raptor_x` convention for dataset-level tasks

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict cast error**
- **Found during:** Task 3 (GeneralSettingsForm)
- **Issue:** `settings as Record<string, unknown>` failed with strict TS because DatasetSettings lacks index signature
- **Fix:** Changed to `settings as unknown as Record<string, unknown>` for proper type narrowing
- **Files modified:** fe/src/features/datasets/components/GeneralSettingsForm.tsx
- **Committed in:** 283cdf2

**2. [Rule 1 - Bug] Removed unused Info import**
- **Found during:** Task 3 verification
- **Issue:** `Info` icon was imported in LLMProviderPage but not used (TS6133 error)
- **Fix:** Removed unused import
- **Files modified:** fe/src/features/llm-provider/pages/LLMProviderPage.tsx
- **Committed in:** 283cdf2

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Minor type fixes for TypeScript strict mode compliance. No scope creep.

## Known Stubs

- `embedding_dimension` field is read from `settings` via dynamic cast but may not exist on the DatasetSettings type yet -- banner only shows when the backend includes this field in the response. This is intentional: the banner is dormant until a future plan adds `embedding_dimension` to the dataset record.
- Python task executor does not yet handle `task_type: 'reembed'` -- the endpoint queues the task but the worker-side implementation is expected in a future plan or advance-rag update.

## Issues Encountered
- Pre-existing TypeScript barrel export errors in `@/shared/constants/index.js` prevent `npm run build -w be` from succeeding, but these are unrelated to this plan's changes (documented in STATE.md as known issue)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Task 4 (visual verification) pending human approval
- Backend endpoint ready for integration testing once the advance-rag worker supports `reembed` task type
- Frontend UI ready for visual verification in both light and dark mode

---
*Phase: 11-internal-embedding-system*
*Completed: 2026-04-03*
