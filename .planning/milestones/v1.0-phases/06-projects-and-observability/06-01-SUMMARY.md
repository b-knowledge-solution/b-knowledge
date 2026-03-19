---
phase: 06-projects-and-observability
plan: 01
subsystem: database
tags: [knex, migration, multi-tenant, analytics, query-log, projects]

requires:
  - phase: 02-abac-multi-tenancy
    provides: user_tenant junction table for tenant_id backfill
provides:
  - tenant_id column on projects table with NOT NULL constraint
  - query_log table for search/chat analytics
  - QueryLogService with fire-and-forget logging pattern
  - ProjectModel.findByTenant() for tenant-scoped project queries
affects: [06-02, 06-03, 06-04, observability dashboards, project CRUD]

tech-stack:
  added: []
  patterns: [fire-and-forget void promise pattern for non-blocking logging]

key-files:
  created:
    - be/src/shared/db/migrations/20260320000000_add_tenant_id_to_projects.ts
    - be/src/shared/db/migrations/20260320000001_create_query_log.ts
    - be/src/modules/rag/models/query-log.model.ts
    - be/src/modules/rag/services/query-log.service.ts
  modified:
    - be/src/shared/models/types.ts
    - be/src/shared/models/factory.ts
    - be/src/modules/projects/models/project.model.ts
    - be/src/modules/projects/services/projects.service.ts
    - be/src/modules/projects/controllers/projects.controller.ts
    - be/src/modules/rag/index.ts

key-decisions:
  - "Backfill tenant_id from user_tenant with COALESCE default for orphaned projects"
  - "QueryLogService uses void promise + catch pattern for guaranteed non-blocking logging"
  - "getAccessibleProjects tenantId parameter changed from optional to required for safety"

patterns-established:
  - "Fire-and-forget logging: void ModelFactory.X.create(data).catch(err => log.warn(...))"

requirements-completed: [PROJ-01, OBSV-01]

duration: 3min
completed: 2026-03-19
---

# Phase 6 Plan 01: DB Foundation Summary

**Multi-tenant project isolation via tenant_id migration and async query_log analytics table with fire-and-forget QueryLogService**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-19T10:59:20Z
- **Completed:** 2026-03-19T11:02:20Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Two database migrations: tenant_id on projects (with backfill) and query_log table for analytics
- QueryLogService with fire-and-forget pattern that never blocks the request pipeline
- ProjectModel.findByTenant() and tenant-scoped ProjectsService for multi-org isolation

## Task Commits

Each task was committed atomically:

1. **Task 1: DB migrations + types** - `13e8428` (feat)
2. **Task 2: QueryLog model + QueryLogService + tenant-scoped ProjectModel** - `cfb99f7` (feat)

## Files Created/Modified
- `be/src/shared/db/migrations/20260320000000_add_tenant_id_to_projects.ts` - Adds tenant_id to projects with backfill
- `be/src/shared/db/migrations/20260320000001_create_query_log.ts` - Creates query_log table for analytics
- `be/src/modules/rag/models/query-log.model.ts` - QueryLogModel extending BaseModel
- `be/src/modules/rag/services/query-log.service.ts` - Non-blocking query logging service
- `be/src/shared/models/types.ts` - Added tenant_id to Project, new QueryLog interface
- `be/src/shared/models/factory.ts` - Registered queryLog model in ModelFactory
- `be/src/modules/projects/models/project.model.ts` - Added findByTenant() method
- `be/src/modules/projects/services/projects.service.ts` - Tenant-scoped getAccessibleProjects
- `be/src/modules/projects/controllers/projects.controller.ts` - Passes tenantId from request context
- `be/src/modules/rag/index.ts` - Barrel export for queryLogService

## Decisions Made
- Backfill strategy uses COALESCE with 'default' fallback for projects whose creator has no user_tenant mapping
- QueryLogService uses `void ModelFactory.queryLog.create(data).catch(...)` pattern to guarantee non-blocking behavior
- Changed getAccessibleProjects tenantId from optional to required to prevent accidental unscoped queries

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated ProjectsController to pass tenantId**
- **Found during:** Task 2
- **Issue:** Controller called getAccessibleProjects without tenantId, which became required
- **Fix:** Added getTenantId(req) import and passes tenant context to service
- **Files modified:** be/src/modules/projects/controllers/projects.controller.ts
- **Verification:** BE builds clean
- **Committed in:** cfb99f7 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for type safety after parameter change. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema foundation ready for subsequent plans (project CRUD routes, query analytics dashboard)
- QueryLogService ready to be wired into chat and search pipelines
- All tenant-scoped queries use findByTenant pattern

---
*Phase: 06-projects-and-observability*
*Completed: 2026-03-19*
