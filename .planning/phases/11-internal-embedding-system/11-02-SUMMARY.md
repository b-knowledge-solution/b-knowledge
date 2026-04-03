---
phase: 11-internal-embedding-system
plan: 02
subsystem: api
tags: [express, knex, postgresql, embedding, sentence-transformers, startup-hook]

requires:
  - phase: 11-internal-embedding-system/01
    provides: "is_system column in model_providers table, LOCAL_EMBEDDING_ENABLE/MODEL config vars"
provides:
  - "ModelProvider.is_system field in TypeScript interface"
  - "findPublicList exposes is_system so frontend can detect system providers"
  - "upsertSystemProvider and removeSystemProviders model methods"
  - "seedSystemEmbeddingProvider service method for idempotent auto-seeding"
  - "Backend startup hook that auto-manages system embedding provider"
affects: [11-internal-embedding-system/03, 11-internal-embedding-system/04, 11-internal-embedding-system/05]

tech-stack:
  added: []
  patterns: ["startup hook auto-seed pattern for system-managed DB records"]

key-files:
  created: []
  modified:
    - be/src/shared/models/types.ts
    - be/src/modules/rag/models/model-provider.model.ts
    - be/src/modules/llm-provider/services/llm-provider.service.ts
    - be/src/app/index.ts

key-decisions:
  - "System provider uses api_key='__system__' sentinel value to distinguish from user-configured providers"
  - "Startup hook placed after migrations + root user bootstrap to ensure DB schema is ready"
  - "removeSystemProviders hard-deletes (not soft-delete) to cleanly remove stale records"

patterns-established:
  - "Startup auto-seed: service method called from app/index.ts after migrations for idempotent DB seeding"

requirements-completed: [EMB-04]

duration: 4min
completed: 2026-04-03
---

# Phase 11 Plan 02: System Provider Auto-Seed Summary

**Startup hook auto-seeds SentenceTransformers model_providers record when LOCAL_EMBEDDING_ENABLE=true, with is_system field exposed in public API**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-03T09:15:40Z
- **Completed:** 2026-04-03T09:19:21Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added is_system boolean to ModelProvider TypeScript interface and findPublicList SELECT
- Implemented upsertSystemProvider and removeSystemProviders model methods for idempotent system provider management
- Added seedSystemEmbeddingProvider service method that routes to model layer based on config
- Wired startup hook in app/index.ts after migrations and root user bootstrap

## Task Commits

Each task was committed atomically:

1. **Task 1: Add is_system to ModelProvider type + update findPublicList + add model methods** - `8fbe2c7` (feat)
2. **Task 2: Add service method + startup hook for auto-seeding** - `abe8140` (feat)

## Files Created/Modified

- `be/src/shared/models/types.ts` - Added is_system: boolean to ModelProvider interface
- `be/src/modules/rag/models/model-provider.model.ts` - Added is_system to findPublicList SELECT, upsertSystemProvider, removeSystemProviders methods
- `be/src/modules/llm-provider/services/llm-provider.service.ts` - Added seedSystemEmbeddingProvider method with config-based routing
- `be/src/app/index.ts` - Added startup hook calling seedSystemEmbeddingProvider after migrations

## Decisions Made

- Used `api_key: '__system__'` sentinel value for system-managed providers to distinguish them from user-configured ones
- Placed startup hook after migrations + root user bootstrap to guarantee schema readiness
- Hard-delete (not soft-delete) for removeSystemProviders since stale system records should be fully cleaned up

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing TypeScript build errors in `openai-format.service.ts` and `tts.service.ts` (missing exports from constants/index.js) -- not caused by this plan's changes, confirmed by testing without changes applied.

## Known Stubs

None - all code is fully wired with no placeholder data.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Model layer and service layer ready for Plan 03 (Python embedding worker) and Plan 04 (frontend provider display)
- is_system field now available in public API responses for frontend detection

---
*Phase: 11-internal-embedding-system*
*Completed: 2026-04-03*
