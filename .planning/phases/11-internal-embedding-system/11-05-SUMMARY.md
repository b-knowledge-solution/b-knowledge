---
phase: 11-internal-embedding-system
plan: 05
subsystem: infra
tags: [docker, embedding, torch, sentence-transformers, huggingface]

requires:
  - phase: 11-01
    provides: embedding worker Python module (embedding_worker.py)
  - phase: 11-03
    provides: Redis Stream integration for embedding requests
provides:
  - embedding-worker Docker Compose service definition
  - persistent HuggingFace model cache volume
  - torch CPU-only installation in advance-rag Dockerfile
affects: [deployment, scaling, advance-rag]

tech-stack:
  added: [torch-cpu, sentence-transformers]
  patterns: [shared-image-different-command, persistent-model-cache]

key-files:
  created: []
  modified:
    - docker/docker-compose.yml
    - advance-rag/Dockerfile

key-decisions:
  - "Shared image with task-executor (same advance-rag Dockerfile) with different command entry point"
  - "torch CPU-only installed before pyproject.toml deps to prevent CUDA wheel download"

patterns-established:
  - "Model cache persistence: named Docker volumes for ML model caches (hf-cache)"
  - "Worker scaling: identical image with --scale flag for horizontal scaling"

requirements-completed: [EMB-08]

duration: 1min
completed: 2026-04-03
---

# Phase 11 Plan 05: Docker Compose Embedding Worker Summary

**Docker Compose embedding-worker service with persistent HuggingFace cache volume and CPU-only torch in Dockerfile**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-03T09:22:18Z
- **Completed:** 2026-04-03T09:23:18Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added embedding-worker service to docker-compose.yml with all required env vars (DB, Redis, local embedding config)
- Added persistent hf-cache volume for HuggingFace model cache across container restarts
- Installed torch CPU-only and sentence-transformers in Dockerfile before pyproject.toml deps
- Service is scalable via `docker compose up --scale embedding-worker=N`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add embedding-worker service to Docker Compose + Dockerfile deps** - `ea85597` (feat)

## Files Created/Modified
- `docker/docker-compose.yml` - Added embedding-worker service definition with env vars, hf-cache volume mount, and hf-cache volume declaration
- `advance-rag/Dockerfile` - Added torch CPU-only and sentence-transformers installation before pyproject.toml dependencies

## Decisions Made
- Shared the same Docker image as task-executor (b-knowledge-rag) with a different command (`python -m embedding_worker`) to avoid maintaining a separate Dockerfile
- Installed torch from CPU-only index before pyproject.toml deps so sentence-transformers finds torch already satisfied and skips CUDA wheels

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all configuration wired to environment variables.

## Next Phase Readiness
- Embedding worker can be started alongside existing services
- Workers can be horizontally scaled for throughput
- HuggingFace model cache persists across restarts avoiding re-downloads

---
*Phase: 11-internal-embedding-system*
*Completed: 2026-04-03*
