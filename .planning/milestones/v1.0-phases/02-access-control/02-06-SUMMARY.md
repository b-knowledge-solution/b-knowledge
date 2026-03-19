---
phase: 02-access-control
plan: 06
subsystem: auth
tags: [casl, audit, abac, tenant-isolation, rbac, express-middleware]

# Dependency graph
requires:
  - phase: 02-access-control/02-03
    provides: tenant middleware, CASL ability service, requireAbility middleware
provides:
  - Extended audit service with 9 new action types and 4 new resource types
  - Tenant-scoped audit log queries with org isolation
  - CASL-guarded PUT /api/users/:id/role endpoint
  - ABAC-enforced project routes with tenant isolation
  - Frontend audit badges for access control events
affects: [03-rag-pipeline, 04-graphrag, 05-deep-research]

# Tech tracking
tech-stack:
  added: []
  patterns: [tenant-scoped audit logging, CASL ability guards on routes, audit controller tenant enforcement]

key-files:
  created: []
  modified:
    - be/src/modules/audit/services/audit.service.ts
    - be/src/modules/audit/controllers/audit.controller.ts
    - be/src/shared/models/types.ts
    - be/src/modules/users/routes/users.routes.ts
    - be/src/modules/users/controllers/users.controller.ts
    - be/src/modules/users/services/user.service.ts
    - fe/src/features/audit/components/AuditActionBadge.tsx
    - fe/src/features/audit/pages/AuditLogPage.tsx
    - be/src/modules/projects/routes/projects.routes.ts
    - be/src/modules/projects/services/projects.service.ts

key-decisions:
  - "Super-admin sees all orgs' logs (optional tenantId filter); admin forced to own org only"
  - "invalidateAllAbilities on role change (simpler than per-session invalidation, acceptable latency)"
  - "Existing users route /:id/role upgraded with requireTenant + requireAbility instead of requirePermission"

patterns-established:
  - "Audit tenantId: all audit log calls should include tenantId for org-scoped filtering"
  - "Project route ABAC: all project routes use requireAuth + requireTenant + requireAbility chain"

requirements-completed: [ACCS-02, ACCS-05, ACCS-06]

# Metrics
duration: 13min
completed: 2026-03-18
---

# Phase 2 Plan 6: Audit Events, Role API, and Project ABAC Summary

**Extended audit trail with 9 access control event types, tenant-scoped visibility, CASL-guarded role management API, and ABAC-enforced project routes**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-18T13:54:01Z
- **Completed:** 2026-03-18T14:07:00Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Audit service extended with 9 new action types (view_document, search_query, chat_answer, create/update/delete_policy, login, logout, access_denied) and 4 resource types (policy, search, chat, org)
- All audit entries now carry tenant_id for org-scoped filtering; controller enforces super-admin vs admin visibility
- PUT /api/users/:id/role upgraded with requireTenant + requireAbility('manage', 'User') + ability cache invalidation
- All project routes (CRUD, permissions, datasets, categories, versions, chats, searches, sync configs, entity permissions) enforce requireTenant + requireAbility
- Frontend AuditLogPage guarded by CASL ability.can('read', 'AuditLog') instead of hardcoded role check

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend audit service with new events and tenant_id scoping** - `e34e24b` (feat)
2. **Task 2: Add CASL ability and tenant middleware to role endpoint** - `0e43ecf` (feat)
3. **Task 3: Update audit badges, CASL guard on audit page, and project ABAC** - `8f29820` (feat)

## Files Created/Modified
- `be/src/modules/audit/services/audit.service.ts` - 9 new actions, 4 resource types, tenantId in params and log(), tenant filtering in getLogs()
- `be/src/modules/audit/controllers/audit.controller.ts` - Tenant-scoped query enforcement (super-admin vs admin)
- `be/src/shared/models/types.ts` - Added tenant_id field to AuditLog interface
- `be/src/modules/users/routes/users.routes.ts` - Added requireTenant + requireAbility to /:id/role route
- `be/src/modules/users/controllers/users.controller.ts` - Pass tenantId to service layer
- `be/src/modules/users/services/user.service.ts` - invalidateAllAbilities on role change, tenantId in audit
- `fe/src/features/audit/components/AuditActionBadge.tsx` - 7 new action badges + 7 new resource type labels
- `fe/src/features/audit/pages/AuditLogPage.tsx` - CASL ability guard replacing role check
- `be/src/modules/projects/routes/projects.routes.ts` - requireTenant + requireAbility on all routes
- `be/src/modules/projects/services/projects.service.ts` - tenantId parameter for audit logging

## Decisions Made
- Super-admin can optionally filter audit logs by org via query param; non-super-admin users are forced to their own org's logs
- Used invalidateAllAbilities() on role change rather than per-session invalidation (simpler, all sessions refresh on next request)
- Upgraded existing /:id/role route with CASL middleware chain instead of creating a new endpoint

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed unused import causing build failure**
- **Found during:** Task 3 (Frontend build)
- **Issue:** Removing useAuth import from AuditLogPage left unused import; also RoleManagementTable import in UserManagementPage was unused
- **Fix:** Removed unused imports to satisfy strict TypeScript
- **Files modified:** fe/src/features/audit/pages/AuditLogPage.tsx, fe/src/features/users/pages/UserManagementPage.tsx
- **Verification:** npm run build exits 0
- **Committed in:** 8f29820 (Task 3 commit)

**2. [Rule 1 - Bug] Fixed exactOptionalPropertyTypes incompatibility**
- **Found during:** Task 2 (Backend build)
- **Issue:** getTenantId returns `string | null` but actor.tenantId was typed as `string | undefined`, incompatible with exactOptionalPropertyTypes
- **Fix:** Updated service method signature to accept `string | undefined` explicitly
- **Files modified:** be/src/modules/users/services/user.service.ts
- **Verification:** npm run build -w be exits 0
- **Committed in:** 0e43ecf (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for build correctness. No scope creep.

## Issues Encountered
- Task 2 plan expected the PUT /:id/role endpoint to not exist, but it was already implemented. Adapted by upgrading existing middleware chain with CASL/tenant middleware instead of creating from scratch.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All access control requirements (ACCS-02, ACCS-05, ACCS-06) complete
- Audit logging foundation ready for future phases to call with tenantId
- Project routes fully ABAC-protected for multi-tenant deployment

---
*Phase: 02-access-control*
*Completed: 2026-03-18*
