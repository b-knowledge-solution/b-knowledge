---
phase: 08-fe-admin-routing-for-restricted-first-login-nav-and-admin-la
plan: 08-01
subsystem: ui
tags: [react, react-router, vitest, i18n, admin-shell]
requires: []
provides:
  - Canonical `/admin/...` route contracts and path builders for admin shell navigation
  - Split user/admin sidebar registries with hidden admin permission coverage
  - Explicit role-gated admin shell routing and administrator dropdown entry
affects: [frontend-routing, sidebar-navigation, admin-access]
tech-stack:
  added: []
  patterns: [declarative route contracts, shell-specific nav injection, explicit admin role gate]
key-files:
  created:
    - fe/src/app/adminRoutes.ts
    - fe/tests/app/routeConfig.test.ts
  modified:
    - fe/src/app/App.tsx
    - fe/src/app/routeConfig.ts
    - fe/src/layouts/MainLayout.tsx
    - fe/src/layouts/Sidebar.tsx
    - fe/src/layouts/sidebarNav.ts
    - fe/src/features/auth/components/AdminRoute.tsx
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/vi.json
    - fe/src/i18n/locales/ja.json
    - fe/vitest.shared.ts
key-decisions:
  - "Kept one shared authenticated layout and injected shell-specific nav registries rather than forking layout components."
  - "Generated nested `/admin` child routes from absolute admin route contracts via `toAdminChildPath()` to keep App routing aligned with the shared contract file."
  - "Centralized admin-shell eligibility in `canAccessAdminShell()` so the route gate and dropdown entry use the same explicit role set."
patterns-established:
  - "Admin route contracts live in `fe/src/app/adminRoutes.ts` and are consumed by routing, metadata, and sidebar registries."
  - "Authenticated shells receive nav data as props instead of inferring shell mode from mixed pathname/nav state."
requirements-completed: [AR8-01, AR8-02, AR8-03]
duration: 15m
completed: 2026-04-10
---

# Phase 08 Plan 01: FE admin shell contracts and split authenticated routing Summary

**`/admin` route contracts, split user/admin shells, and explicit admin-entry gating for the shared frontend layout**

## Performance

- **Duration:** 15m
- **Started:** 2026-04-10T08:51:02Z
- **Completed:** 2026-04-10T09:06:24Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Added `fe/src/app/adminRoutes.ts` as the single source of truth for visible and hidden `/admin/...` routes, including the admin home path, code-graph helper, and agent canvas dynamic builder.
- Split sidebar registration into `USER_SIDEBAR_NAV` and `ADMIN_SIDEBAR_NAV`, with explicit permission coverage for hidden `/admin/code-graph/:kbId`.
- Rebuilt the authenticated router into a standard user shell and a role-gated admin shell, and added the localized `Administrator` dropdown shortcut ahead of logout.

## Task Commits

1. **Task 1 RED: add failing admin route metadata regression** - `2a9adc5` (`test`)
2. **Task 1 GREEN: add admin route contracts and nav registries** - `7b25efa` (`feat`)
3. **Task 2: split authenticated user and admin shells** - `fad938e` (`feat`)

## Files Created/Modified

- `fe/src/app/adminRoutes.ts` - Canonical admin path constants, builders, and nested-route helper.
- `fe/src/app/routeConfig.ts` - `/admin` metadata registry and dynamic route matching for hidden and detail admin pages.
- `fe/src/layouts/sidebarNav.ts` - Separate user/admin nav registries plus hidden route permission coverage.
- `fe/src/app/App.tsx` - Split protected route tree into user and admin shells under one auth boundary.
- `fe/src/layouts/MainLayout.tsx` - Shared shell that accepts injected nav entries.
- `fe/src/layouts/Sidebar.tsx` - Shell-aware sidebar and admin dropdown entry.
- `fe/src/features/auth/components/AdminRoute.tsx` - Explicit role gate for `/admin`.
- `fe/tests/app/routeConfig.test.ts` - Regression coverage for `/admin` dynamic and hidden route metadata.
- `fe/vitest.shared.ts` - Unit-test allowlist update so the new route test is discoverable.

## Decisions Made

- Reused the existing shell primitives (`MainLayout`, `Sidebar`, `Header`, `BroadcastBanner`) and separated shells by injected nav contracts rather than introducing a second layout implementation.
- Used the explicit role set `leader | admin | super-admin` only at the admin-shell boundary and administrator shortcut, keeping role-string logic centralized.
- Removed non-prefixed admin route declarations from active FE route registration instead of preserving compatibility aliases in this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registered the new route-config test in the FE unit-test allowlist**
- **Found during:** Task 1 (Define `/admin` route contracts and split the nav/metadata registries)
- **Issue:** `vitest.unit.config.ts` resolves tests from the hardcoded `unitTestFiles` list, so the new `tests/app/routeConfig.test.ts` file was ignored and the TDD RED step could not run.
- **Fix:** Added `tests/app/routeConfig.test.ts` to `fe/vitest.shared.ts`.
- **Files modified:** `fe/vitest.shared.ts`
- **Verification:** `npm run test:run:unit -w fe -- tests/app/routeConfig.test.ts --reporter=dot`
- **Committed in:** `2a9adc5`

**2. [Rule 3 - Blocking] Normalized the plan’s unit-test command to the workspace-relative test path**
- **Found during:** Task 1 verification
- **Issue:** The plan specified `npm run test:run:unit -w fe -- fe/tests/app/routeConfig.test.ts --reporter=dot`, but `npm -w fe` executes inside `fe/`, so the `fe/tests/...` filter points at a non-existent path.
- **Fix:** Ran the workspace-correct equivalent `npm run test:run:unit -w fe -- tests/app/routeConfig.test.ts --reporter=dot`.
- **Files modified:** None
- **Verification:** `npm run test:run:unit -w fe -- tests/app/routeConfig.test.ts --reporter=dot`
- **Committed in:** N/A (verification-only deviation)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both deviations were harness-level corrections required to execute the planned TDD and verification steps. No product scope changed.

## Issues Encountered

- `tsc` flagged strict indexed-access returns in `getRouteMetadata()` after the metadata registry rewrite. Fixed by making the matched route-config lookups non-null in the resolved branches.
- The FE build emitted pre-existing asset-resolution and chunk-size warnings during Vite bundling, but it completed successfully and they were outside this plan’s routing scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The `/admin` routing contract is now centralized, so follow-up plans can migrate page-level links and tests onto the shared helpers instead of duplicating path strings.
- Admin-shell access is centralized behind one helper, which gives later verification plans a single target for regression coverage.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/08-fe-admin-routing-for-restricted-first-login-nav-and-admin-la/08-01-SUMMARY.md`
- Verified task commits exist in git history: `2a9adc5`, `7b25efa`, `fad938e`
