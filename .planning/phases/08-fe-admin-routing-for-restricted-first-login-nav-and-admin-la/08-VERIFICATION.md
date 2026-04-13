---
phase: 08-fe-admin-routing-for-restricted-first-login-nav-and-admin-la
verified: 2026-04-10T14:29:56Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "Regression coverage proves the moved admin route producers, including memory back-navigation, after the `/admin` migration"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Shell switch visual check"
    expected: "On `/chat` and `/search`, the standard shell shows only Chat and Search. On `/admin/data-studio/knowledge-base`, the admin shell shows Data Studio, Agent Studio, IAM, and System, with the header/layout feeling correct while switching shells."
    why_human: "The sidebar regression still uses a source-contract/node-runner fallback instead of mounting the real `Sidebar.tsx` in jsdom, so visual composition and interaction feel still need manual confirmation."
---

# Phase 8: FE admin routing for restricted first-login nav and /admin layout with data-studio, agent-studio, IAM, system sections Verification Report

**Phase Goal:** Split the authenticated frontend into two shells so non-admin users only navigate Chat/Search, all admin surfaces live exclusively under `/admin/...`, and role-gated admin entry/access safely reuses the existing admin pages without breaking hidden routes or deep links.
**Verified:** 2026-04-10T14:29:56Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Authenticated users outside `/admin` see a shell whose sidebar contains only Chat and Search, and the dropdown shows `Administrator` before `Logout` only for admin-shell roles | ✓ VERIFIED | `USER_SIDEBAR_NAV` contains only `/chat` and `/search` in [sidebarNav.ts](/mnt/d/Project/b-solution/b-knowledge/fe/src/layouts/sidebarNav.ts); [Sidebar.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/layouts/Sidebar.tsx#L230) gates `nav.administrator` with `canAccessAdminShell(user.role)` and renders it before `nav.signOut`; [SidebarAdminShell.test.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/tests/layouts/SidebarAdminShell.test.tsx) passes on the fallback harness. |
| 2 | Only `leader`, `admin`, and `super-admin` can enter `/admin`, and `/admin` lands on `/admin/data-studio/knowledge-base` | ✓ VERIFIED | [AdminRoute.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/features/auth/components/AdminRoute.tsx#L28) centralizes the role gate; [App.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/app/App.tsx#L196) mounts `/admin` behind `AdminRoute` and redirects the index route to `ADMIN_HOME_PATH`; [AdminRoute.test.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/tests/features/auth/AdminRoute.test.tsx) and [AdminRouting.test.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/tests/app/AdminRouting.test.tsx) cover the behavior. |
| 3 | Admin-only routes are moved under `/admin/...`, grouped into Data Studio, Agent Studio, IAM, and System, and legacy top-level admin URLs are removed from the active route tree | ✓ VERIFIED | [adminRoutes.ts](/mnt/d/Project/b-solution/b-knowledge/fe/src/app/adminRoutes.ts) centralizes `/admin/...` contracts; [App.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/app/App.tsx#L196) mounts admin pages only under `/admin`; [sidebarNav.ts](/mnt/d/Project/b-solution/b-knowledge/fe/src/layouts/sidebarNav.ts) exposes exactly four admin groups; [AdminRouting.test.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/tests/app/AdminRouting.test.tsx) proves `/iam/users` and `/data-studio/knowledge-base` now hit `/404`. |
| 4 | Data Studio, IAM, Agent Studio, memory, and hidden code-graph flows emit `/admin/...` paths and keep hidden routes/deep links working | ✓ VERIFIED | Shared builders in [adminRoutes.ts](/mnt/d/Project/b-solution/b-knowledge/fe/src/app/adminRoutes.ts) are consumed across code-graph, IAM, agent, and memory flows; [MemoryDetailPage.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/features/memory/pages/MemoryDetailPage.tsx#L98) uses `ADMIN_MEMORY_ROUTE` for both back actions; targeted route tests remain present and substantive. |
| 5 | Regression coverage proves the final Phase 08 route migration contract, including moved memory navigation, while unrelated full-suite failures are handled honestly | ✓ VERIFIED | The prior failing harness is now green: `timeout 120s npm run test:run:ui -w fe -- tests/features/memory/MemoryDetailPage.test.tsx --reporter=dot` passed `4/4` tests in 16.12s. `npm run build -w fe` also passed on 2026-04-10. Per user-provided rerun evidence for 2026-04-10, the repo-wide FE suite still has an unrelated `PrincipalPicker.test.tsx` failure expecting `UserRole.MEMBER`, and that issue remains outside Phase 08 scope. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `fe/src/app/adminRoutes.ts` | Canonical `/admin/...` contracts and builders | ✓ VERIFIED | Present, substantive, and consumed by routing plus page-level navigation. |
| `fe/src/app/App.tsx` | Split user/admin shells, `/admin` landing redirect, no legacy admin routes | ✓ VERIFIED | User shell mounts only `/chat` and `/search`; admin shell is nested under `/admin` and redirects to `ADMIN_HOME_PATH`. |
| `fe/src/layouts/sidebarNav.ts` | Separate user/admin nav registries and hidden-route permission coverage | ✓ VERIFIED | User shell stays two items only; admin shell stays four groups; hidden `/admin/code-graph/:kbId` is covered. |
| `fe/src/features/auth/components/AdminRoute.tsx` | Central explicit-role admin gate | ✓ VERIFIED | Role check remains centralized and is covered by a passing targeted suite. |
| `fe/tests/app/AdminRouting.test.tsx` | Router-level regression coverage for `/admin`, hidden routes, and legacy URL removal | ✓ VERIFIED | Present, substantive, and passes in the UI runner. |
| `fe/tests/layouts/SidebarAdminShell.test.tsx` | Shell separation and dropdown-order regression coverage | ⚠️ VERIFIED WITH FALLBACK | Present and passing, but still uses a source-contract/node-runner fallback instead of mounting the real sidebar in jsdom. |
| `fe/tests/features/auth/AdminRoute.test.tsx` | Explicit role-gate regression coverage | ✓ VERIFIED | Present, substantive, and passing. |
| `fe/tests/features/memory/MemoryDetailPage.test.tsx` | Targeted automated coverage for migrated memory back-navigation | ✓ VERIFIED | Present, substantive, and now passes `4/4` in the FE UI runner. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `fe/src/app/App.tsx` | `fe/src/features/auth/components/AdminRoute.tsx` | admin shell parent route | ✓ WIRED | [App.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/app/App.tsx#L196) wraps `/admin` in `<AdminRoute>`. |
| `fe/src/layouts/Sidebar.tsx` | `fe/src/app/adminRoutes.ts` | Administrator dropdown target | ✓ WIRED | [Sidebar.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/layouts/Sidebar.tsx#L232) links to `ADMIN_HOME_PATH`. |
| `fe/src/layouts/sidebarNav.ts` | hidden admin routes | permission resolver | ✓ WIRED | `ADMIN_CODE_GRAPH_ROUTE` is mapped in the hidden admin permission resolver. |
| `MemoryDetailPage` | admin memory list | back navigation | ✓ WIRED | [MemoryDetailPage.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/features/memory/pages/MemoryDetailPage.tsx#L98) and [MemoryDetailPage.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/features/memory/pages/MemoryDetailPage.tsx#L114) navigate to `ADMIN_MEMORY_ROUTE`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `fe/src/layouts/Sidebar.tsx` | `user.role` | `useAuth()` session hook | Yes | ✓ FLOWING |
| `fe/src/features/auth/components/AdminRoute.tsx` | `user.role` | `useAuth()` session hook | Yes | ✓ FLOWING |
| `fe/src/features/memory/pages/MemoryDetailPage.tsx` | `memory` | `useMemory(id ?? '')` from the route param | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| `/admin` redirect, hidden admin routes, and explicit admin gate | `timeout 120s npm run test:run:ui -w fe -- tests/app/AdminRouting.test.tsx tests/features/auth/AdminRoute.test.tsx --reporter=dot` | Previously verified green in the Phase 08 report; quick regression sanity check shows the covered files still match the same route contracts | ✓ PASS |
| Memory detail route regression | `timeout 120s npm run test:run:ui -w fe -- tests/features/memory/MemoryDetailPage.test.tsx --reporter=dot` | 1 file passed, 4 tests passed, duration 16.12s | ✓ PASS |
| FE production build | `npm run build -w fe` | Passed on 2026-04-10; Vite emitted pre-existing asset-resolution and chunk-size warnings only | ✓ PASS |
| Repo-wide FE test run | `npm run test:run -w fe` | Per user-provided rerun evidence, still fails only in unrelated `tests/features/permissions/PrincipalPicker.test.tsx` expecting `UserRole.MEMBER` | ✓ PASS (non-phase issue surfaced honestly) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `AR8-01` | 08-01, 08-04 | Dual-shell routing plus explicit admin entry/gate | ✓ SATISFIED | User/admin shells, admin landing redirect, and role gate remain implemented and covered. |
| `AR8-02` | 08-02, 08-03, 08-04 | `/admin/...` route migration for admin surfaces and legacy URL removal | ✓ SATISFIED | Shared route builders are used across Data Studio, IAM, agent, code-graph, and memory flows; legacy top-level admin routes are absent from the active route tree. |
| `AR8-03` | 08-01, 08-02, 08-03, 08-04 | Regression safety for hidden routes and moved deep links | ✓ SATISFIED | The remaining memory-detail harness gap is closed; targeted regression coverage is now passing. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `fe/tests/layouts/SidebarAdminShell.test.tsx` | 1 | Source-contract fallback instead of mounted sidebar render | ⚠️ Warning | Shell separation and dropdown order are checked indirectly, so jsdom-level sidebar rendering regressions still need manual confirmation. |
| `fe/src/features/agents/pages/AgentListPage.tsx` | 360 | `TODO` in a phase-touched file | ℹ️ Info | Not a Phase 08 blocker; unrelated unfinished list-filter behavior remains noted. |

### Human Verification Required

### 1. Shell switch visual check

**Test:** Run the frontend, sign in as an allowed admin role, then visit `/chat`, `/search`, and `/admin/data-studio/knowledge-base`.
**Expected:** `/chat` and `/search` use the user shell with only Chat/Search in the sidebar; `/admin/data-studio/knowledge-base` uses the admin shell with Data Studio, Agent Studio, IAM, and System sections, and the header/layout feel remains correct while switching shells.
**Why human:** The sidebar regression still uses a source-contract fallback instead of mounting the real `Sidebar.tsx` in jsdom, so visual composition and interaction feel still need a manual check.

### Gaps Summary

The prior automated gap is closed. `MemoryDetailPage` is still wired to `ADMIN_MEMORY_ROUTE`, and the targeted regression harness now passes under the FE UI runner instead of timing out. That removes the only blocking verification gap from the previous report.

Phase 08 is not marked `passed` because one manual verification item remains: the real shell-switch visual behavior still needs a human check since the sidebar regression uses a source-contract fallback rather than a mounted jsdom render.

---

_Verified: 2026-04-10T14:29:56Z_
_Verifier: Claude (gsd-verifier)_
