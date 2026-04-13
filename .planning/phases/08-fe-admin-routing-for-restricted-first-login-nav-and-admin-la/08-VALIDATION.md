---
phase: 08
slug: fe-admin-routing-for-restricted-first-login-nav-and-admin-la
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-10
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` 3.x (`jsdom` UI + `node` unit) |
| **Config file** | `fe/vitest.ui.config.ts`, `fe/vitest.unit.config.ts` |
| **Quick run command** | `npm run test:run:ui -w fe -- --reporter=dot` |
| **Full suite command** | `npm run test:run -w fe` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:run:ui -w fe -- --reporter=dot` on the touched route/nav test files, or `npm run test:run:unit -w fe -- fe/tests/app/routeConfig.test.ts --reporter=dot` for route-metadata-only changes.
- **After every plan wave:** Run `npm run test:run -w fe`
- **Before `/gsd-verify-work`:** `npm run build -w fe` and `npm run test:run -w fe` must both be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 08-01 | 1 | AR8-01 | T-08-02 / T-08-03 | `/admin` metadata resolves correctly for visible, dynamic, and hidden admin routes | unit | `npm run test:run:unit -w fe -- fe/tests/app/routeConfig.test.ts --reporter=dot` | ❌ W0 | ⬜ pending |
| 08-01-02 | 08-01 | 1 | AR8-01 | T-08-01 | Only `leader`, `admin`, and `super-admin` can enter the `/admin` shell and see the dropdown entry | UI | `npm run test:run:ui -w fe -- fe/tests/layouts/SidebarAdminShell.test.tsx fe/tests/features/auth/AdminRoute.test.tsx --reporter=dot` | ❌ W0 | ⬜ pending |
| 08-02-01 | 08-02 | 2 | AR8-02 | T-08-05 / T-08-06 | Data Studio and code-graph links emit only `/admin/...` URLs and code-graph back navigation stays in admin | UI | `npm run test:run:ui -w fe -- fe/tests/app/AdminRouting.test.tsx --reporter=dot` | ❌ W0 | ⬜ pending |
| 08-02-02 | 08-02 | 2 | AR8-02 | T-08-07 | IAM drill-downs use only `/admin/iam/...` paths and preserve `?tab=permissions` | UI | `npm run test:run:ui -w fe -- fe/tests/features/users/UserDetailPage.test.tsx fe/tests/features/permissions/EffectiveAccessPage.test.tsx --reporter=dot` | ✅ | ⬜ pending |
| 08-03-01 | 08-03 | 2 | AR8-02 | T-08-09 / T-08-10 | Agent Studio and memory links emit only `/admin/agent-studio/...` paths | UI | `npm run test:run:ui -w fe -- fe/tests/features/agent/AgentToolbar.test.tsx fe/tests/features/agent/AgentCard.test.tsx fe/tests/features/agent/AgentListPage.test.tsx fe/tests/features/memory/MemoryDetailPage.test.tsx --reporter=dot` | ✅ | ⬜ pending |
| 08-03-02 | 08-03 | 2 | AR8-03 | T-08-08 | `new` stays the `:id` pseudo-id for `/admin/agent-studio/agents/new?mode=chat|search` | UI | `npm run test:run:ui -w fe -- fe/tests/features/agent/AdminAgentEntryLinks.test.tsx --reporter=dot` | ❌ W0 | ⬜ pending |
| 08-04-01 | 08-04 | 3 | AR8-01 | T-08-11 | `/admin` redirects correctly, hidden admin routes resolve, and removed legacy admin URLs end at `/404` | UI | `npm run test:run:ui -w fe -- fe/tests/app/AdminRouting.test.tsx --reporter=dot` | ❌ W0 | ⬜ pending |
| 08-04-02 | 08-04 | 3 | AR8-03 | T-08-12 / T-08-13 | Sidebar ordering and explicit-role admin gating cannot regress | UI | `npm run test:run:ui -w fe -- fe/tests/layouts/SidebarAdminShell.test.tsx fe/tests/features/auth/AdminRoute.test.tsx --reporter=dot` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `fe/tests/app/routeConfig.test.ts` — route metadata coverage for `/admin/data-studio/*`, `/admin/code-graph/:kbId`, and `/admin/agent-studio/agents/new`
- [ ] `fe/tests/app/AdminRouting.test.tsx` — shell redirect, hidden route, and legacy-404 regression harness
- [ ] `fe/tests/layouts/SidebarAdminShell.test.tsx` — shell-specific nav visibility and Administrator ordering
- [ ] `fe/tests/features/auth/AdminRoute.test.tsx` — explicit-role admin gate coverage
- [ ] `fe/tests/features/agent/AdminAgentEntryLinks.test.tsx` — `new` pseudo-id route regression

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidebar and header feel correct when switching between `/chat` and `/admin/data-studio/knowledge-base` | AR8-01 | The phase changes layout composition and menu grouping; visual confirmation catches spacing/title regressions that jsdom does not | Run `npm run dev:fe`, sign in as an allowed admin role, visit `/chat`, `/search`, and `/admin/data-studio/knowledge-base`, then confirm the standard shell shows only Chat/Search while the admin shell shows Data Studio, Agent Studio, IAM, and System |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
