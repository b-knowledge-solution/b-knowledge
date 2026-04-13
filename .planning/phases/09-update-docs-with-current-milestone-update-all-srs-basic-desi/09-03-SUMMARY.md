---
phase: 09-update-docs-with-current-milestone-update-all-srs-basic-desi
plan: 03
subsystem: auth
tags: [docs, auth, permissions, casl, registry, azure-ad]
requires: []
provides:
  - Updated auth detail-design docs that describe the registry-backed permission system
  - Current Azure AD role/default-role documentation aligned to the live role set
  - Comprehensive auth reference with `/api/permissions/*` contracts and compatibility exceptions
affects: [detail-design, auth, permission-maintainers, docs]
tech-stack:
  added: []
  patterns: [code-anchored auth docs, registry-first permission documentation, compatibility-exception documentation]
key-files:
  created: [.planning/phases/09-update-docs-with-current-milestone-update-all-srs-basic-desi/09-03-SUMMARY.md]
  modified:
    - docs/detail-design/auth/overview.md
    - docs/detail-design/auth/azure-ad-flow.md
    - docs/detail-design/auth/rbac-abac.md
    - docs/detail-design/auth/rbac-abac-comprehensive.md
key-decisions:
  - "Documented `rbac.ts` only as a compatibility surface and centered all extension guidance on the registry, sync, CASL, and `/api/permissions/*` contracts."
  - "Included the exact compatibility-exception categories from 09-RESEARCH instead of claiming the migration is fully complete."
patterns-established:
  - "Auth detail docs should point maintainers to code anchors and the permission-maintenance-guide path rather than restating a static permission table."
  - "Current auth docs use the live role vocabulary: `super-admin`, `admin`, `leader`, `user`."
requirements-completed: [DOC9-01, DOC9-03]
duration: 4min
completed: 2026-04-12
---

# Phase 09 Plan 03: Auth Detail Design Summary

**Auth detail-design pages now describe the registry-sync-CASL permission stack, live Azure AD role handling, and the remaining legacy compatibility boundaries**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-12T02:55:00Z
- **Completed:** 2026-04-12T02:59:18Z
- **Tasks:** 4
- **Files modified:** 5

## Accomplishments

- Replaced stale `requireRole` and static-RBAC framing in the auth overview with the current session → registry/catalog → ability → middleware/frontend flow.
- Updated the Azure AD design page to use the live role set and default-role behavior centered on `user`.
- Rewrote the concise and comprehensive auth authorization pages around the backend registry, sync, CASL builder, `/api/permissions/*` APIs, FE providers, admin UI, and compatibility exceptions.

## Task Commits

Atomic task commits landed for the doc rewrites, with Task 1 split across two commits because parallel-agent index locks interrupted the first staging pass:

1. **Task 1: Correct the auth overview and Azure AD flow pages for the current permission-era role model** - `7321670`, `6044414` (docs)
2. **Task 2: Rewrite the concise auth authorization design page** - `9d8712a` (docs)
3. **Task 3: Rewrite the comprehensive auth reference with current contracts and compatibility exceptions** - `9524c4e` (docs)
4. **Task 4: Prove the auth detail docs now anchor on the current permission system** - verification completed with the required `rg` checks; no additional surviving content diff was needed beyond the committed rewrites

## Files Created/Modified

- `docs/detail-design/auth/overview.md` - High-level auth entry page updated to the current permission architecture and maintainer-guide path.
- `docs/detail-design/auth/azure-ad-flow.md` - Azure AD provisioning and role/default-role wording aligned with the live role model.
- `docs/detail-design/auth/rbac-abac.md` - Concise registry-first authorization overview with FE/BE consumption guidance.
- `docs/detail-design/auth/rbac-abac-comprehensive.md` - Full current-state reference for APIs, providers, admin surfaces, and compatibility debt.
- `.planning/phases/09-update-docs-with-current-milestone-update-all-srs-basic-desi/09-03-SUMMARY.md` - Execution summary for this plan.

## Decisions Made

- Documented the implemented permission system as a lifecycle across registry, sync, DB tables, middleware, FE providers, and admin UI instead of preserving a static RBAC narrative.
- Kept compatibility debt explicit by listing the remaining `manage_users`, `manage_knowledge_base`, `manage_system`, `view_system_tools`, and `requireRole(...)` exception categories called out in research.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `docs:build` could not complete because the local docs workspace has an `esbuild` host/binary mismatch (`Host version "0.21.5" does not match binary version "0.27.2"`). The failure happened before content-level validation, so the authored docs were verified with the plan’s `rg` checks instead.
- Parallel execution caused intermittent `.git/index.lock` contention while staging files. The work was completed by retrying Git operations serially.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The auth detail-design section is now aligned with the current permission system and ready to be linked from the maintainer guide and adjacent docs work in this phase.
- The docs workspace still needs its local `esbuild` installation mismatch resolved before VitePress build verification can be trusted again.
