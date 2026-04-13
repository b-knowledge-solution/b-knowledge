---
phase: 08-fe-admin-routing-for-restricted-first-login-nav-and-admin-la
plan: 08-02
subsystem: ui
tags: [react, react-router, vitest, admin-routing, iam]
requires:
  - phase: 08-01
    provides: Canonical /admin route contracts and split admin shell routing
provides:
  - Data Studio and hidden code-graph pages emit shared /admin route builders instead of legacy paths
  - IAM drill-down helpers and row navigation emit /admin/iam user-detail links
  - Targeted route tests encode the new admin-prefixed contract for IAM deep links
affects: [frontend-routing, data-studio, knowledge-base, code-graph, iam]
tech-stack:
  added: []
  patterns: [shared admin path builders, admin-prefixed deep links, targeted route regression tests]
key-files:
  created: []
  modified:
    - fe/src/app/adminRoutes.ts
    - fe/src/features/knowledge-base/components/CodeTabRedesigned.tsx
    - fe/src/features/knowledge-base/components/DocumentListPanel.tsx
    - fe/src/features/knowledge-base/pages/KnowledgeBaseListPage.tsx
    - fe/src/features/knowledge-base/pages/KnowledgeBaseDetailPage.tsx
    - fe/src/features/code-graph/pages/CodeGraphPage.tsx
    - fe/src/features/datasets/components/DatasetCard.tsx
    - fe/src/features/datasets/components/DocumentTable.tsx
    - fe/src/features/datasets/pages/DatasetDetailPage.tsx
    - fe/src/features/datasets/pages/ChunkDetailPage.tsx
    - fe/src/features/users/pages/UserDetailPage.tsx
    - fe/src/features/users/components/RoleManagementTable.tsx
    - fe/src/features/permissions/pages/EffectiveAccessPage.tsx
    - fe/tests/features/users/UserDetailPage.test.tsx
    - fe/tests/features/permissions/EffectiveAccessPage.test.tsx
key-decisions:
  - "Extended adminRoutes.ts with dataset, chunk, and IAM user-detail builders instead of duplicating inline admin strings in page consumers."
  - "Kept the hidden code-graph back navigation inside /admin by linking back to the admin knowledge-base detail builder."
  - "Verified the IAM regression with split harnesses: UserDetailPage in jsdom and EffectiveAccessPage helper logic in the node runner."
patterns-established:
  - "Page-level admin navigation should consume shared builders from fe/src/app/adminRoutes.ts rather than interpolating /admin strings inline."
  - "IAM deep links to the permissions tab should flow through buildAdminUserDetailPath(..., 'permissions')."
requirements-completed: [AR8-02, AR8-03]
duration: 33m
completed: 2026-04-10
---

# Phase 08 Plan 02: Admin route consumers and IAM deep-link migration Summary

**Data Studio, hidden code-graph, and IAM drill-down pages now emit the shared `/admin/...` route contract instead of removed legacy admin URLs**

## Performance

- **Duration:** 33m
- **Started:** 2026-04-10T09:00:00Z
- **Completed:** 2026-04-10T09:33:00Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- Migrated Knowledge Base, dataset, chunk-detail, and hidden code-graph navigation onto the shared admin route builders from `fe/src/app/adminRoutes.ts`.
- Kept the hidden code-graph flow inside `/admin` by changing both the entry point and the back navigation target.
- Moved IAM user-detail drill-downs to `/admin/iam/users/:id?tab=permissions` and updated the targeted regression tests to lock in that contract.

## Task Commits

1. **Task 1: Move Data Studio and hidden code-graph consumers to admin path builders** - `95d65b9` (`feat`)
2. **Task 2 RED: add failing admin IAM route expectations** - `5535dd1` (`test`)
3. **Task 2 GREEN: move IAM deep links to `/admin/iam/...`** - `f5374de` (`feat`)

## Files Created/Modified

- `fe/src/app/adminRoutes.ts` - Added shared dataset, chunk-detail, and IAM user-detail builders used by downstream consumers.
- `fe/src/features/knowledge-base/components/CodeTabRedesigned.tsx` - Switched the full-graph button to the hidden admin code-graph path.
- `fe/src/features/knowledge-base/components/DocumentListPanel.tsx` - Switched KB document chunk drill-downs to the admin dataset chunk builder.
- `fe/src/features/knowledge-base/pages/KnowledgeBaseListPage.tsx` and `fe/src/features/knowledge-base/pages/KnowledgeBaseDetailPage.tsx` - Moved list/detail/back/delete flows to admin knowledge-base routes.
- `fe/src/features/code-graph/pages/CodeGraphPage.tsx` - Changed the back link to return to the admin knowledge-base detail flow.
- `fe/src/features/datasets/components/DatasetCard.tsx`, `fe/src/features/datasets/components/DocumentTable.tsx`, `fe/src/features/datasets/pages/DatasetDetailPage.tsx`, and `fe/src/features/datasets/pages/ChunkDetailPage.tsx` - Moved dataset detail, dataset back, and chunk drill-down navigation to admin route builders.
- `fe/src/features/users/pages/UserDetailPage.tsx`, `fe/src/features/users/components/RoleManagementTable.tsx`, and `fe/src/features/permissions/pages/EffectiveAccessPage.tsx` - Replaced legacy IAM links with the shared admin user-detail builder.
- `fe/tests/features/users/UserDetailPage.test.tsx` and `fe/tests/features/permissions/EffectiveAccessPage.test.tsx` - Updated the targeted tests to assert the `/admin/iam/...` route shape.

## Decisions Made

- Added the missing shared route builders in `adminRoutes.ts` as a correctness fix because the Phase 8 downstream consumer contract already depended on them.
- Kept the IAM regression coverage narrow instead of expanding the suite: `UserDetailPage` still verifies `?tab=permissions`, and `EffectiveAccessPage` still verifies the exported helper contract.
- Left unrelated legacy admin path references outside the plan-owned files untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added the missing dataset/chunk/IAM builders to `adminRoutes.ts`**
- **Found during:** Task 1
- **Issue:** `08-01` had not exported `buildAdminDatasetPath`, `buildAdminDatasetChunkPath`, or `buildAdminUserDetailPath`, so the Phase 8 consumer plan could not use a single shared route contract.
- **Fix:** Added the three builders and migrated the affected page consumers onto them.
- **Files modified:** `fe/src/app/adminRoutes.ts`
- **Verification:** `npm run build -w fe`
- **Committed in:** `95d65b9`

**2. [Rule 3 - Blocking] Adjusted verification to the FE test harness reality**
- **Found during:** Task 2
- **Issue:** The plan's workspace command used `fe/tests/...` filters that do not resolve under `npm -w fe`, and `EffectiveAccessPage.test.tsx` still hangs under the jsdom runner because it is intentionally kept as a node-env pure-helper test.
- **Fix:** Ran the targeted tests with workspace-relative paths, verified `UserDetailPage.test.tsx` in the UI harness, and verified `EffectiveAccessPage.test.tsx` in the unit harness.
- **Files modified:** None
- **Verification:** `npm run test:run:ui -w fe -- tests/features/users/UserDetailPage.test.tsx --reporter=dot`; `npm run test:run:unit -w fe -- tests/features/permissions/EffectiveAccessPage.test.tsx --reporter=dot`
- **Committed in:** N/A

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both deviations were required to keep the route contract centralized and to verify the intended behaviors with the repo's existing FE test harness constraints.

## Issues Encountered

- `EffectiveAccessPage.test.tsx` still hangs under `vitest.ui.config.ts`, so the helper regression had to stay in the unit runner even though the plan's generic verification command referenced the UI runner.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `08-03` can reuse the same `adminRoutes.ts` builder pattern for the remaining Agent Studio and memory route consumers.
- The targeted IAM tests now lock the admin-prefixed deep-link contract, which reduces drift risk for later route migrations.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/08-fe-admin-routing-for-restricted-first-login-nav-and-admin-la/08-02-SUMMARY.md`
- Verified task commits exist in git history: `95d65b9`, `5535dd1`, `f5374de`
