---
phase: 09-update-docs-with-current-milestone-update-all-srs-basic-desi
plan: 01
subsystem: docs
tags: [docs, srs, permissions, authentication, authorization, vitepress]
requires: []
provides:
  - Current-state SRS coverage for tenant roles, overrides, resource grants, and permission admin surfaces
  - Authentication SRS coverage for session-backed ability loading and organisation switching
  - Verification notes for stale wording removal in the two owned SRS pages
affects: [docs, srs, permissions, authentication, onboarding]
tech-stack:
  added: []
  patterns: [Code-verified SRS updates, auth-to-permission documentation, legacy wording removal]
key-files:
  created:
    - .planning/phases/09-update-docs-with-current-milestone-update-all-srs-basic-desi/09-01-SUMMARY.md
  modified:
    - docs/srs/core-platform/fr-user-team-management.md
    - docs/srs/core-platform/fr-authentication.md
key-decisions:
  - "Document the registry-backed permission model as the live source of truth instead of the legacy member/static-RBAC narrative."
  - "Explain authentication as the session and tenant context feeding permission evaluation rather than as an isolated login flow."
patterns-established:
  - "SRS pages for security-sensitive features should link to detailed auth docs instead of duplicating low-level implementation."
  - "Permission terminology in docs must reflect the active role set: super-admin, admin, leader, user."
requirements-completed: [DOC9-01, DOC9-03]
duration: 8min
completed: 2026-04-12
---

# Phase 09 Plan 01: SRS Permission Drift Summary

**User/team and authentication SRS pages now describe the registry-backed permission model, session-driven ability loading, and active-organisation switching instead of the legacy member/static-RBAC narrative**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-12T02:52:00Z
- **Completed:** 2026-04-12T03:00:49Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Rewrote the user/team SRS around the current tenant role set, DB-backed permission catalog, per-user overrides, resource grants, and `/api/permissions/` admin surfaces.
- Rewrote the authentication SRS to explain how authenticated sessions drive `/api/auth/abilities`, active-organisation switching, and the split between login, flat permission checks, and row-scoped CASL ability checks.
- Verified that the target stale wording is gone from the owned SRS files and recorded the remaining docs-build blocker.

## Task Commits

Each task was handled atomically within the shared worktree constraints:

1. **Task 1: Rewrite the SRS user/team permission model in place** - `eed402f` (`docs(09-01): update user and team permission srs`)
2. **Task 2: Add auth-to-permission integration to the authentication SRS** - `66ba172` (`docs(09-01): update authentication permission integration srs`)
3. **Task 3: Prove the SRS wording drift is corrected** - recorded in the summary artifact commit for this file

## Files Created/Modified

- `docs/srs/core-platform/fr-user-team-management.md` - Current permission-model requirements for roles, overrides, grants, tenant scope, and admin APIs.
- `docs/srs/core-platform/fr-authentication.md` - Current authentication requirements for session-backed organisation context and ability loading.
- `.planning/phases/09-update-docs-with-current-milestone-update-all-srs-basic-desi/09-01-SUMMARY.md` - Execution summary, verification notes, and deviations.

## Verification

- `rg -n "super-admin|admin|leader|user|role_permissions|user_permission_overrides|resource_grants|/api/permissions/" docs/srs/core-platform/fr-user-team-management.md`
  Result: required current permission terms are present.
- `rg -n "/api/auth/abilities|switch-org|permission|ability|detail-design/auth" docs/srs/core-platform/fr-authentication.md`
  Result: auth-to-permission flow, org switching, and detail-design links are present.
- `rg -n "Member \||\bMember\b|rbac.ts as|rbac.js as" docs/srs/core-platform/fr-user-team-management.md docs/srs/core-platform/fr-authentication.md`
  Result: no matches.

## Decisions Made

- Kept both pages at SRS requirement level and linked outward to detail-design docs for deeper flow references.
- Documented the current permission catalog and ability model as the live behavior without claiming unrelated cleanup work is complete.

## Deviations from Plan

### Concurrency adjustment

- **Found during:** Task 1 commit
- **Issue:** The shared branch advanced while Task 1 was in progress, and the broader user/team rewrite landed in `HEAD` through another concurrent docs commit before the task commit could be created.
- **Fix:** Re-read the file, applied a final owned correction, and created a dedicated Task 1 commit containing the last Task 1 deltas instead of reverting or overwriting concurrent work.
- **Files modified:** `docs/srs/core-platform/fr-user-team-management.md`
- **Verification:** Re-read current `HEAD`, confirmed the plan-required content remained present, then committed the final correction in `eed402f`.

### Verification blocker

- **Found during:** Task 3 verification
- **Issue:** `npm run docs:build` fails in `docs/` before rendering the site because the installed `esbuild` package expects version `0.21.5` while the binary in `docs/node_modules/esbuild/bin/esbuild` reports `0.27.2`.
- **Attempted fix:** Ran `npm rebuild esbuild` in `docs/`, including an escalated retry.
- **Outcome:** The rebuild still reports `Expected "0.21.5" but got "0.27.2"`, so the docs build remains blocked by a pre-existing dependency mismatch rather than these markdown edits.

## Issues Encountered

- Shared-branch concurrency affected Task 1 commit timing; the resolution was to preserve concurrent work and commit only the remaining owned delta.
- VitePress build verification is currently blocked by the local `esbuild` mismatch in `docs/node_modules`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The two SRS pages are aligned to the current permission milestone and ready to be used by the remaining Phase 9 documentation plans.
- Before any docs-build-based verification can pass reliably, the `docs/` workspace needs its `esbuild` package/binary versions repaired.

## Known Stubs

None.

## Threat Flags

None.
