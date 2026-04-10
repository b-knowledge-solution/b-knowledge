---
phase: 08-fe-admin-routing-for-restricted-first-login-nav-and-admin-la
plan: 08-04
subsystem: ui
tags: [react, vitest, admin-routing, sidebar, auth]
requires:
  - phase: 08-01
    provides: Canonical /admin route contracts and split authenticated shells
  - phase: 08-02
    provides: Admin-prefixed data-studio and IAM route consumers
  - phase: 08-03
    provides: Admin-prefixed agent-studio route consumers and pseudo-id coverage
provides:
  - App-level regression coverage for /admin home routing, hidden admin routes, and removed legacy admin URLs
  - Explicit AdminRoute role-gate coverage for allowed admin-shell roles and denied user roles
  - Sidebar shell contract coverage for user-nav restriction and Administrator-before-Logout ordering
affects: [frontend-routing, auth-guarding, sidebar-navigation, regression-harness]
tech-stack:
  added: []
  patterns: [App router harness with mocked lazy pages, explicit role-gate regression tests, sidebar source-contract assertions]
key-files:
  created:
    - fe/tests/app/AdminRouting.test.tsx
    - fe/tests/layouts/SidebarAdminShell.test.tsx
    - fe/tests/features/auth/AdminRoute.test.tsx
  modified: []
key-decisions:
  - "Kept the App router regression at the real `App.tsx` boundary, but mocked lazy page modules and shared shells so the test targets route selection rather than page rendering."
  - "Verified the sidebar contract through the real nav registry and `Sidebar.tsx` source order after repeated jsdom imports of the actual Sidebar component stalled the UI runner."
  - "Recorded the repo-wide FE verification result without touching `.planning/STATE.md` or `.planning/ROADMAP.md`, per user instruction."
patterns-established:
  - "Route regression files in `fe/tests/app/` can exercise `App.tsx` safely by mocking Providers, shells, and lazy pages while leaving the route tree intact."
  - "When the repo's UI runner deadlocks on a shell component import, a source-contract fallback can preserve the phase invariant while documenting the harness gap explicitly."
requirements-completed: [AR8-01, AR8-02, AR8-03]
duration: 1h20m
completed: 2026-04-10
---

# Phase 08 Plan 04: Admin routing regression harness Summary

**Regression coverage for the final `/admin` contract, explicit admin-shell gating, and user-vs-admin sidebar separation**

## Performance

- **Duration:** 1h20m
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `fe/tests/app/AdminRouting.test.tsx` to prove `/admin` resolves into the admin shell, hidden routes like `/admin/code-graph/:kbId` and `/admin/agent-studio/agents/new?mode=chat` still resolve, and removed legacy admin URLs fall through to `/404`.
- Added `fe/tests/features/auth/AdminRoute.test.tsx` to lock `/admin` access to `leader`, `admin`, and `super-admin`, with `user` redirected to `/403`.
- Added `fe/tests/layouts/SidebarAdminShell.test.tsx` to lock the user-shell nav to Chat/Search and keep the `Administrator` dropdown action before `Logout`.

## Task Commits

1. **Task 1 RED: add failing admin routing regression harness** - `0033a7a` (`test`)
2. **Task 1 GREEN: verify admin app routing contract** - `8c68165` (`test`)
3. **Task 2: lock admin shell sidebar and route guard rules** - `148cf5a` (`test`)

## Verification

- `timeout 60s npm run test:run:ui -w fe -- tests/app/AdminRouting.test.tsx tests/features/auth/AdminRoute.test.tsx --reporter=dot` ✅
- `timeout 60s npx vitest run -c fe/vite.config.ts fe/tests/layouts/SidebarAdminShell.test.tsx --environment node --reporter=dot --coverage=false` ✅
- `npm run build -w fe` ✅
- `timeout 180s npm run test:run -w fe` ⚠️ failed in a pre-existing unrelated unit test: `fe/tests/features/permissions/PrincipalPicker.test.tsx` still expects `UserRole.MEMBER`, but the current role list no longer includes it

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stabilized the App router harness around mocked shells and lazy pages**
- **Found during:** Task 1
- **Issue:** A naive `App.tsx` regression test stalled under the FE UI runner because the full lazy route tree and shared shell surface were too broad for this harness.
- **Fix:** Mocked `Providers`, `MainLayout`, route guards, and the targeted lazy pages so the suite exercises the real route tree while avoiding unrelated rendering work.
- **Files modified:** `fe/tests/app/AdminRouting.test.tsx`
- **Verification:** `timeout 60s npm run test:run:ui -w fe -- tests/app/AdminRouting.test.tsx --reporter=dot`
- **Committed in:** `8c68165`

**2. [Rule 3 - Blocking] Switched the sidebar regression from a jsdom render harness to a source-contract harness**
- **Found during:** Task 2
- **Issue:** Importing the real `Sidebar.tsx` module repeatedly stalled the repo's UI runner even after replacing the dropdown, auth, settings, nav, asset, and child-component dependencies with mocks.
- **Fix:** Reframed `SidebarAdminShell.test.tsx` to assert the real `USER_SIDEBAR_NAV`, `canAccessAdminShell()`, and the `Sidebar.tsx` dropdown source order directly, then verified it with Vite's node runner instead of the jsdom harness.
- **Files modified:** `fe/tests/layouts/SidebarAdminShell.test.tsx`
- **Verification:** `timeout 60s npx vitest run -c fe/vite.config.ts fe/tests/layouts/SidebarAdminShell.test.tsx --environment node --reporter=dot --coverage=false`
- **Committed in:** `148cf5a`

## Issues Encountered

- The FE jsdom harness still deadlocks when this plan imports the real `Sidebar.tsx` component directly. The regression is still covered, but via source-contract assertions instead of a mounted sidebar render.
- The repo-wide FE test run remains blocked by a pre-existing failure in `fe/tests/features/permissions/PrincipalPicker.test.tsx`, where the test still asserts `UserRole.MEMBER`.

## Known Stubs

None.

## Threat Flags

None.

## Notes

- Per user instruction, this execution did **not** update `.planning/STATE.md` or `.planning/ROADMAP.md`.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/08-fe-admin-routing-for-restricted-first-login-nav-and-admin-la/08-04-SUMMARY.md`
- Verified task commits exist in git history: `0033a7a`, `8c68165`, `148cf5a`
