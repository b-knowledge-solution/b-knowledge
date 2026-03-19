---
phase: 02-access-control
plan: 02
subsystem: auth
tags: [casl, abac, rbac, valkey, redis, multi-org, tenant]

requires:
  - phase: 02-access-control/01
    provides: access control schema with user_tenant table and platform_policies table
provides:
  - CASL ability builder with 4-role hierarchy (super-admin, admin, leader, user)
  - Valkey-cached abilities keyed by session ID
  - Tenant extraction middleware (requireTenant, getTenantId)
  - requireAbility middleware for CASL-based route protection
  - GET /api/auth/abilities endpoint for frontend AbilityProvider
  - GET /api/auth/orgs endpoint for org membership listing
  - POST /api/auth/switch-org endpoint for org context switching
affects: [02-access-control/03, 02-access-control/04, 02-access-control/05, 02-access-control/06]

tech-stack:
  added: ["@casl/ability@6.8.0"]
  patterns: [CASL MongoAbility for ABAC, Valkey session-keyed cache, tenant middleware pattern]

key-files:
  created:
    - be/src/shared/services/ability.service.ts
    - be/src/shared/middleware/tenant.middleware.ts
  modified:
    - be/src/shared/config/rbac.ts
    - be/src/shared/models/types.ts
    - be/src/shared/middleware/auth.middleware.ts
    - be/src/shared/types/express.d.ts
    - be/src/modules/auth/auth.controller.ts
    - be/src/modules/auth/auth.routes.ts

key-decisions:
  - "Raw Knex queries for user_tenant operations instead of dedicated model -- table is a bridging junction, not a domain entity"
  - "Ability wired in AuthController (not AuthService) since session context is only available in the request"
  - "ABAC policy conditions use 'as any' cast for CASL type compatibility with exactOptionalPropertyTypes"

patterns-established:
  - "CASL ability building: buildAbilityFor() with role switch + ABAC policy overlay"
  - "Valkey ability caching: keyed by session ID with session-matching TTL"
  - "Tenant middleware: requireTenant extracts currentOrgId from session"
  - "requireAbility middleware: cache-first CASL check with on-demand rebuild"

requirements-completed: [ACCS-01, ACCS-02]

duration: 9min
completed: 2026-03-18
---

# Phase 2 Plan 2: CASL Ability Service and Auth Endpoints Summary

**CASL ability builder with 4-role hierarchy, Valkey session caching, tenant middleware, and auth API endpoints for abilities/orgs/org-switching**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-18T13:23:07Z
- **Completed:** 2026-03-18T13:32:18Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- CASL ability service with buildAbilityFor supporting super-admin, admin, leader, user roles plus ABAC policy overlay
- Valkey caching of serialized abilities with session-keyed storage and session-matching TTL
- Evolved rbac.ts with super-admin role, ROLE_HIERARCHY, and isAtLeastRole utility
- Tenant middleware for extracting org context from session
- requireAbility middleware for CASL-based route protection with cache-first pattern
- Three new auth endpoints: GET /abilities, GET /orgs, POST /switch-org
- Login flow wired to compute and cache abilities on both Azure AD and root login paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Install CASL and create ability service with Valkey caching** - `2a67673` (feat)
2. **Task 2: Create tenant middleware, wire ability into login, and add auth API endpoints** - `81cdf5d` (feat)

## Files Created/Modified
- `be/src/shared/services/ability.service.ts` - CASL ability builder, Valkey cache, ABAC policy overlay
- `be/src/shared/middleware/tenant.middleware.ts` - requireTenant and getTenantId for multi-org
- `be/src/shared/config/rbac.ts` - Evolved with super-admin, ROLE_HIERARCHY, isAtLeastRole
- `be/src/shared/models/types.ts` - Added is_superuser and current_org_id to User interface
- `be/src/shared/middleware/auth.middleware.ts` - Added requireAbility middleware
- `be/src/shared/types/express.d.ts` - Added currentOrgId to SessionData
- `be/src/modules/auth/auth.controller.ts` - Added wireAbilityOnLogin, getAbilities, getOrgs, switchOrg
- `be/src/modules/auth/auth.routes.ts` - Registered /abilities, /orgs, /switch-org routes
- `be/package.json` - Added @casl/ability dependency
- `package-lock.json` - Updated lockfile

## Decisions Made
- Used raw Knex queries for user_tenant operations rather than creating a dedicated model, since it's a simple junction table
- Wired ability computation in AuthController rather than AuthService, since session context (req.session, req.sessionID) is only available in the controller layer
- Used `as any` cast for CASL condition types to work with exactOptionalPropertyTypes strict mode

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed CASL conditions type compatibility with exactOptionalPropertyTypes**
- **Found during:** Task 1 (ability service creation)
- **Issue:** CASL's MongoAbility conditions types don't align with TypeScript's exactOptionalPropertyTypes
- **Fix:** Used `as any` cast on ABAC policy conditions parameter
- **Files modified:** be/src/shared/services/ability.service.ts
- **Committed in:** 2a67673

**2. [Rule 3 - Blocking] Fixed Redis scan cursor type mismatch**
- **Found during:** Task 1 (invalidateAllAbilities)
- **Issue:** Redis v5 client expects RedisArgument for scan cursor, returns number
- **Fix:** Used string cursor with type assertion for compatibility
- **Files modified:** be/src/shared/services/ability.service.ts
- **Committed in:** 2a67673

**3. [Rule 3 - Blocking] Fixed undefined vs null type mismatch in ability context**
- **Found during:** Task 2 (wiring ability into login)
- **Issue:** User interface optional fields can be undefined, but AbilityUserContext expected null
- **Fix:** Updated AbilityUserContext to accept undefined, added `?? null` coercions at call sites
- **Files modified:** be/src/shared/services/ability.service.ts, be/src/modules/auth/auth.controller.ts, be/src/shared/middleware/auth.middleware.ts
- **Committed in:** 81cdf5d

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All auto-fixes were necessary for TypeScript strict mode compliance. No scope creep.

## Issues Encountered
None beyond the type compatibility issues documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ability service ready for use by subsequent plans (middleware enforcement, frontend integration)
- Auth endpoints ready for frontend AbilityProvider and OrgSwitcher components
- All existing auth middleware (requireAuth, requireRole, requirePermission, requireOwnership) preserved for backward compatibility

---
*Phase: 02-access-control*
*Completed: 2026-03-18*
