---
phase: 08-fe-admin-routing-for-restricted-first-login-nav-and-admin-la
plan: 08-03
subsystem: ui
tags: [react, react-router, vitest, admin-routing, agent-studio]
requires: [08-01]
provides:
  - Admin-prefixed Agent Studio and memory route producers across create, detail, and back-navigation flows
  - Regression coverage for `/admin/agent-studio/agents/new?mode=chat|search` pseudo-id create entries
affects: [frontend-routing, agent-studio, memory]
tech-stack:
  added: []
  patterns: [shared admin route builders, route-focused UI regression tests]
key-files:
  created:
    - fe/tests/features/agent/AdminAgentEntryLinks.test.tsx
  modified:
    - fe/src/features/chat/components/CreateChatAssistantDialog.tsx
    - fe/src/features/search/components/CreateSearchAppDialog.tsx
    - fe/src/features/agents/components/AgentToolbar.tsx
    - fe/src/features/agents/components/AgentCard.tsx
    - fe/src/features/agents/pages/AgentListPage.tsx
    - fe/src/features/memory/pages/MemoryDetailPage.tsx
    - fe/tests/features/agent/AgentToolbar.test.tsx
    - fe/tests/features/agent/AgentCard.test.tsx
    - fe/tests/features/agent/AgentListPage.test.tsx
    - fe/tests/features/memory/MemoryDetailPage.test.tsx
key-decisions:
  - "Agent creation entry points now build admin canvas URLs through `buildAdminAgentCanvasPath()` and keep `new` in the `:id` segment."
  - "Agent detail/back navigation and memory back navigation now route exclusively through the shared admin contract from 08-01."
  - "Route-focused tests assert literal `/admin/agent-studio/...` outputs so prefix regressions are caught directly."
patterns-established:
  - "Pseudo-id create links are protected by a dedicated regression test instead of being covered only indirectly through page tests."
requirements-completed: [AR8-02, AR8-03]
duration: 40m
completed: 2026-04-10
---

# Phase 08 Plan 03: Agent Studio and memory admin route migration Summary

**Admin-prefixed Agent Studio and memory routing, with direct regression coverage for the `new` pseudo-id create flow**

## Performance

- **Duration:** 40m
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Migrated the chat assistant and search app "Create as Agent Workflow" entry points to the shared admin route builders so they now emit `/admin/agent-studio/agents/new?mode=chat|search`.
- Repointed Agent Studio detail, back, and list-driven navigation to `/admin/agent-studio/agents/...`, and repointed memory detail back navigation to `/admin/agent-studio/memory`.
- Updated the owned agent navigation tests and added `fe/tests/features/agent/AdminAgentEntryLinks.test.tsx` to directly lock the hidden `new` pseudo-id contract.

## Task Commits

1. **Task 1: Move Agent Studio and memory route producers to admin path builders** - `8b2ef69` (`feat`)
2. **Task 2: Update agent/memory navigation tests and add pseudo-id create-link coverage** - `7343f0c` (`test`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected stale test mocks that no longer matched the page imports**
- **Found during:** Task 2
- **Issue:** Owned route tests still mocked `@/app/App` for `globalMessage`, while the pages import `@/lib/globalMessage`, and the list-page test needed hoisted spies for Vitest's module-mock evaluation.
- **Fix:** Repointed the affected tests to `@/lib/globalMessage`, moved route-test spies into `vi.hoisted(...)`, and added a route-focused template navigation assertion for the list page.
- **Files modified:** `fe/tests/features/agent/AgentListPage.test.tsx`, `fe/tests/features/memory/MemoryDetailPage.test.tsx`
- **Commit:** `7343f0c`

### Deferred Issues

**1. `fe/tests/features/memory/MemoryDetailPage.test.tsx` still hangs under the repo's UI test harness**
- **Found during:** Task 2 verification
- **Issue:** The memory detail test file reaches the Vitest runner but never reports collected tests before timing out, even after reducing the file to route-focused mocks and aligning mocked imports with the component.
- **Impact:** Agent route tests and the new pseudo-id regression pass, but the plan's full targeted UI command remains blocked by this memory-suite harness issue.
- **Follow-up needed:** Investigate why importing `MemoryDetailPage` under `vitest.ui.config.ts` stalls test collection in this repo.

## Verification

- `npm run build -w fe` ✅
- `rg -n '/agent-studio/' fe/src/features/chat/components/CreateChatAssistantDialog.tsx fe/src/features/search/components/CreateSearchAppDialog.tsx fe/src/features/agents fe/src/features/memory/pages/MemoryDetailPage.tsx` ✅ no matches
- `timeout 30s npm run test:run:ui -w fe -- tests/features/agent/AgentToolbar.test.tsx --reporter=dot` ✅
- `timeout 30s npm run test:run:ui -w fe -- tests/features/agent/AgentCard.test.tsx --reporter=dot` ✅
- `timeout 30s npm run test:run:ui -w fe -- tests/features/agent/AgentListPage.test.tsx --reporter=dot` ✅
- `timeout 30s npm run test:run:ui -w fe -- tests/features/agent/AdminAgentEntryLinks.test.tsx --reporter=dot` ✅
- `timeout 30s npm run test:run:ui -w fe -- tests/features/memory/MemoryDetailPage.test.tsx --reporter=dot` ⚠️ timed out during suite startup

## Threat Flags

None.

## Notes

- Per user instruction, this execution did **not** update `.planning/STATE.md` or `.planning/ROADMAP.md`.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/08-fe-admin-routing-for-restricted-first-login-nav-and-admin-la/08-03-SUMMARY.md`
- Verified task commits exist in git history: `8b2ef69`, `7343f0c`
