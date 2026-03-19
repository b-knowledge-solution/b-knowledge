---
phase: 06-projects-and-observability
plan: 02
subsystem: api
tags: [express, knex, zod, rbac, audit, cross-project]

# Dependency graph
requires:
  - phase: 06-projects-and-observability
    provides: "DB foundation with tenant_id on projects, project_permissions, project_datasets tables"
provides:
  - "Member management API (GET/POST/DELETE /:id/members)"
  - "Dataset binding API (POST /:id/datasets/bind, DELETE /:id/datasets/:datasetId/unbind)"
  - "Cross-project dataset resolver (GET /cross-project-datasets)"
  - "Project activity feed (GET /:id/activity)"
affects: [06-03, 06-04, 06-05]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Single INSERT ON CONFLICT DO NOTHING for batch dataset binding", "Cross-project JOIN resolver for dataset resolution"]

key-files:
  created: []
  modified:
    - "be/src/modules/projects/services/projects.service.ts"
    - "be/src/modules/projects/controllers/projects.controller.ts"
    - "be/src/modules/projects/routes/projects.routes.ts"
    - "be/src/modules/projects/schemas/projects.schemas.ts"

key-decisions:
  - "Cross-project-datasets route placed before /:id to avoid Express param collision"
  - "bindDatasets uses single INSERT ON CONFLICT DO NOTHING for N+1 avoidance"
  - "removeMember rejects removing project creator to prevent orphaned projects"
  - "addMember validates user exists in same tenant via user_tenant JOIN"

patterns-established:
  - "Batch INSERT with ON CONFLICT DO NOTHING for idempotent multi-record binding"
  - "Cross-project resolver as single JOIN query pattern for PROJ-04"

requirements-completed: [PROJ-02, PROJ-03, PROJ-04]

# Metrics
duration: 4min
completed: 2026-03-19
---

# Phase 6 Plan 02: Project Member, Dataset Binding, Cross-Project Resolver, and Activity Feed APIs

**Member CRUD, batch dataset binding with ON CONFLICT DO NOTHING, single-query cross-project dataset resolver, and paginated project activity feed**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-19T11:06:01Z
- **Completed:** 2026-03-19T11:10:01Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Six new service methods: getProjectMembers, addMember, removeMember, bindDatasets, unbindDataset, resolveProjectDatasets, getProjectActivity
- Eight new routes with proper auth middleware (requireRole for mutations, requireAbility for reads)
- Cross-project dataset resolution in a single JOIN query (no N+1)
- Batch dataset binding using INSERT ON CONFLICT DO NOTHING

## Task Commits

Each task was committed atomically:

1. **Task 1: Project member management + dataset binding service methods** - `e4863a9` (feat)
2. **Task 2: Wire member, dataset binding, activity, and cross-project routes** - `598bbfd` (feat)

## Files Created/Modified
- `be/src/modules/projects/services/projects.service.ts` - Added 6 service methods for members, datasets, resolver, activity
- `be/src/modules/projects/controllers/projects.controller.ts` - Added 7 controller methods for new endpoints
- `be/src/modules/projects/routes/projects.routes.ts` - Added 8 new route definitions with auth middleware
- `be/src/modules/projects/schemas/projects.schemas.ts` - Added addMemberSchema, bindDatasetsSchema, activityQuerySchema

## Decisions Made
- Cross-project-datasets route placed before /:id routes to avoid Express treating "cross-project-datasets" as a UUID param
- bindDatasets uses single INSERT with ON CONFLICT DO NOTHING to batch-insert without N+1 queries
- removeMember checks project.created_by to prevent removing the project creator
- addMember validates user exists in same tenant via user_tenant JOIN before granting access
- Activity feed includes both direct project actions and actions on bound datasets

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Moved /cross-project-datasets route before /:id**
- **Found during:** Task 2 (Route wiring)
- **Issue:** Plan listed GET /cross-project-datasets as a standard route, but Express would match it as /:id param
- **Fix:** Placed the route definition before /:id CRUD routes
- **Files modified:** be/src/modules/projects/routes/projects.routes.ts
- **Verification:** Build passes, route ordering correct
- **Committed in:** 598bbfd (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Route ordering fix was necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All member, dataset binding, cross-project, and activity APIs ready for FE consumption
- Routes use requireRole('admin', 'leader') for mutation endpoints as specified

---
*Phase: 06-projects-and-observability*
*Completed: 2026-03-19*
