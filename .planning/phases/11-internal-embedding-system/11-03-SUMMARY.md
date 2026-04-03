---
phase: 11-internal-embedding-system
plan: 03
subsystem: api
tags: [valkey-streams, redis, sentence-transformers, embedding, python, typescript]

requires:
  - phase: 11-01
    provides: SentenceTransformersEmbed class and config module with LOCAL_EMBEDDING_* vars

provides:
  - Python embedding worker consuming from embed:requests Valkey Stream
  - Node.js EmbeddingStreamService publishing/awaiting via XADD/BRPOP
  - LLM client routing for SentenceTransformers factory to stream bridge

affects: [11-04, 11-05]

tech-stack:
  added: []
  patterns: [valkey-stream-request-response, dedicated-brpop-client, dynamic-import-routing]

key-files:
  created:
    - advance-rag/embedding_worker.py
    - be/src/shared/services/embedding-stream.service.ts
  modified:
    - be/src/shared/services/llm-client.service.ts
    - be/src/app/index.ts

key-decisions:
  - "Dynamic import for embeddingStreamService in llm-client to avoid eager initialization"
  - "Two dedicated Redis clients (publish + BRPOP) to avoid blocking the main client"
  - "30s BRPOP timeout for embedding requests matching typical model load times"

patterns-established:
  - "Valkey Stream request-response: XADD for publish, BRPOP on per-request key for response"
  - "Dedicated Redis client for blocking operations (BRPOP) separate from non-blocking operations"

requirements-completed: [EMB-05]

duration: 4min
completed: 2026-04-03
---

# Phase 11 Plan 03: Valkey Stream Bridge Summary

**Valkey Stream bridge connecting Node.js embedding requests to Python SentenceTransformers worker via XADD/BRPOP protocol**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-03T09:15:49Z
- **Completed:** 2026-04-03T09:19:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Python embedding_worker.py with XREADGROUP consumer loop, SentenceTransformers encoding, LPUSH response with 60s TTL, and SIGTERM graceful shutdown
- Node.js EmbeddingStreamService with dedicated XADD and BRPOP Redis clients for non-blocking stream communication
- LLM client service routes embedTexts calls to Valkey Stream bridge when provider factory_name is SentenceTransformers

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Python embedding worker** - `d733f81` (feat)
2. **Task 2: Create Node.js embedding stream service + wire into llm-client** - `8eb2984` (feat)

## Files Created/Modified
- `advance-rag/embedding_worker.py` - Valkey Stream consumer for query-time embedding with SentenceTransformers
- `be/src/shared/services/embedding-stream.service.ts` - Valkey Stream producer + BRPOP response listener singleton
- `be/src/shared/services/llm-client.service.ts` - Added SentenceTransformers routing to stream bridge
- `be/src/app/index.ts` - Added embedding stream service graceful shutdown

## Decisions Made
- Used dynamic import for embeddingStreamService in llm-client to avoid eager Redis connection when SentenceTransformers is not configured
- Two separate Redis clients in EmbeddingStreamService (publish for XADD, dedicated for BRPOP) since blocking operations block the entire connection
- 30s BRPOP timeout balances model cold-start latency with reasonable user-facing timeout

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript build errors in constants/index.ts barrel exports (ProviderStatus, ModelType imports) -- these are documented in STATE.md as out-of-scope from Phase 07. Our new files introduce zero additional errors.

## Known Stubs

None - all data flows are fully wired.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Stream bridge is ready for integration testing with Plan 04 (integration + Docker)
- Python worker can be started with `python -m embedding_worker` when LOCAL_EMBEDDING_ENABLE=true
- Node.js service auto-initializes on first embedTexts call with SentenceTransformers provider

## Self-Check: PASSED

All created files verified on disk. All commit hashes verified in git log.

---
*Phase: 11-internal-embedding-system*
*Completed: 2026-04-03*
