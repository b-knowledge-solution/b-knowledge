---
phase: 11-internal-embedding-system
plan: 01
subsystem: embedding, database, config
tags: [sentence-transformers, python, knex, migration, embedding, cpu-inference]

# Dependency graph
requires: []
provides:
  - SentenceTransformersEmbed class registered in EmbeddingModel dict via _FACTORY_NAME auto-discovery
  - LOCAL_EMBEDDING_ENABLE/MODEL/PATH env vars in advance-rag config.py
  - is_system boolean column on model_providers table
  - localEmbedding config section in backend (enabled, model)
affects: [11-02, 11-03, 11-04, 11-05]

# Tech tracking
tech-stack:
  added: [sentence-transformers>=3.4.0]
  patterns: [lazy-singleton-model-loading, dual-mode-local-or-hub, config-module-env-access]

key-files:
  created:
    - be/src/shared/db/migrations/20260403000000_add_is_system_to_model_providers.ts
  modified:
    - advance-rag/rag/llm/embedding_model.py
    - advance-rag/config.py
    - advance-rag/pyproject.toml
    - advance-rag/.env.example
    - be/src/shared/config/index.ts
    - be/.env.example
    - docker/.env.example

key-decisions:
  - "SentenceTransformersEmbed uses loguru logger (not stdlib logging) per advance-rag conventions"
  - "Model path read via config module (not os.getenv) per advance-rag abstraction pattern"
  - "torch excluded from pyproject.toml -- must be installed separately with CPU-only index URL in Dockerfile"

patterns-established:
  - "Lazy singleton with double-checked locking for in-process model loading"
  - "Dual-mode model loading: LOCAL_EMBEDDING_PATH for offline, HuggingFace Hub for online"

requirements-completed: [EMB-01, EMB-02, EMB-03]

# Metrics
duration: 2min
completed: 2026-04-03
---

# Phase 11 Plan 01: Foundation Layer Summary

**SentenceTransformersEmbed class with lazy singleton loading, is_system DB column, and LOCAL_EMBEDDING_* config across all services**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-03T09:10:40Z
- **Completed:** 2026-04-03T09:13:29Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- SentenceTransformersEmbed class auto-registered in EmbeddingModel dict via _FACTORY_NAME = "SentenceTransformers"
- Three LOCAL_EMBEDDING_* env vars (ENABLE, MODEL, PATH) added to advance-rag config and .env.example
- Knex migration adds is_system boolean column to model_providers table (default false)
- Backend config.localEmbedding section exposes enabled and model properties
- All .env.example files (advance-rag, be, docker) updated with LOCAL_EMBEDDING_* vars

## Task Commits

Each task was committed atomically:

1. **Task 1: Add SentenceTransformersEmbed class and Python env config** - `cc67cca` (feat)
2. **Task 2: DB migration for is_system column + BE config + env examples** - `34aa386` (feat)

## Files Created/Modified
- `advance-rag/rag/llm/embedding_model.py` - Added SentenceTransformersEmbed class with lazy singleton, CPU-only, loguru logging
- `advance-rag/config.py` - Added LOCAL_EMBEDDING_ENABLE, LOCAL_EMBEDDING_MODEL, LOCAL_EMBEDDING_PATH env vars
- `advance-rag/pyproject.toml` - Added sentence-transformers>=3.4.0 dependency
- `advance-rag/.env.example` - Added local embedding env vars with documentation
- `be/src/shared/db/migrations/20260403000000_add_is_system_to_model_providers.ts` - Migration adding is_system boolean column
- `be/src/shared/config/index.ts` - Added localEmbedding config section (enabled, model)
- `be/.env.example` - Added LOCAL_EMBEDDING_ENABLE and LOCAL_EMBEDDING_MODEL
- `docker/.env.example` - Added LOCAL_EMBEDDING_ENABLE, LOCAL_EMBEDDING_MODEL, LOCAL_EMBEDDING_PATH

## Decisions Made
- Used loguru (not stdlib logging) in SentenceTransformersEmbed per advance-rag conventions
- Read LOCAL_EMBEDDING_PATH via config module (not os.getenv) per advance-rag abstraction pattern
- Excluded torch from pyproject.toml to avoid pulling 2.5GB CUDA build; CPU-only torch must be installed separately in Dockerfile

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript build errors in `@/shared/constants/index.js` barrel exports (already known, out of scope per STATE.md decision). Migration and config files compile correctly.

## Known Stubs

None - all code is functional, no placeholder data.

## Next Phase Readiness
- SentenceTransformersEmbed class ready for startup hook to instantiate (Plan 02)
- is_system column ready for startup hook to mark auto-seeded providers (Plan 02)
- localEmbedding config ready for backend to check on startup (Plan 02)

---
*Phase: 11-internal-embedding-system*
*Completed: 2026-04-03*
