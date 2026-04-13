---
phase: 5
slug: admin-ui-rewrite
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-08
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `5-RESEARCH.md` §"Validation Architecture" (lines 373–447).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x + @testing-library/react + jsdom |
| **Config file** | `fe/vitest.config.ts` (extends `fe/vitest.shared.ts`) |
| **Quick run command** | `cd fe && npm run test:run:unit` |
| **Full suite command** | `cd fe && npm run test:run` (includes UI/jsdom) |
| **Coverage command** | `cd fe && npm run test:coverage` |
| **Build check** | `cd fe && npm run build` |
| **Lint check** | `cd fe && npm run lint` |
| **Estimated runtime** | ~30–60 seconds (unit only); ~2–3 min full |

---

## Sampling Rate

- **After every task commit:** `cd fe && npm run build && npm run lint && npm run test:run:unit`
- **After every plan wave:** `cd fe && npm run test:run` (includes UI/jsdom suite)
- **Before `/gsd:verify-work 5`:** Full suite green + `npm run test:coverage` showing **≥85%** on `src/features/permissions/**` and `src/lib/permissions.tsx`
- **Max feedback latency:** 60 seconds for the per-task sampler

---

## Per-Task Verification Map

| Req / Decision | Behavior | Plan | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|---|
| TS12 / D-01 | Matrix renders features from `PERMISSION_KEYS` grouping | 5.1 | unit (component) | `npm run test:run:unit -- PermissionMatrix` | ❌ Wave 0 → 5.1 | ⬜ pending |
| TS12 / D-02 | Dirty-state: toggle → "Save (N)" → click → one PUT per dirty role | 5.1 | unit (component + mocked api) | `npm run test:run:unit -- PermissionMatrix` | ❌ Wave 0 → 5.1 | ⬜ pending |
| TS12 / D-02 | Cancel clears dirty state without mutation | 5.1 | unit | same file | ❌ Wave 0 → 5.1 | ⬜ pending |
| TS12 / D-03 | `/iam/users/:id?tab=permissions` deep-links into override editor | 5.2 | unit | `npm run test:run:unit -- UserDetailPage` | ❌ Wave 0 → 5.2 | ⬜ pending |
| TS12 / D-04 | Add allow override → POST `{effect:'allow'}`; delete row → DELETE | 5.2 | unit | `npm run test:run:unit -- OverrideEditor` | ❌ Wave 0 → 5.2 | ⬜ pending |
| TS12 / D-05 | Effective panel merges role + overrides + grants client-side | 5.2 | unit | same as D-04 | ❌ Wave 0 → 5.2 | ⬜ pending |
| TS12 / D-06 | Picker filters by chip (users/teams/roles) and search query | 5.3 | unit | `npm run test:run:unit -- PrincipalPicker` | ❌ Wave 0 → 5.3 | ⬜ pending |
| TS12 / D-07 | Inline existing grants render above add form; delete works | 5.3 | unit | `npm run test:run:unit -- ResourceGrantEditor` | ❌ Wave 0 → 5.3 | ⬜ pending |
| TS12 / D-08 | Modal scope toggle switches `resource_type` between `KnowledgeBase`/`DocumentCategory` | 5.3 | unit | same as D-07 | ❌ Wave 0 → 5.3 | ⬜ pending |
| TS12 / D-09 (R-10) | Successful mutation fires `globalMessage.success` with session-refresh notice | 5.3 / 5.1 / 5.2 | unit (sonner spy) | `npm run test:run:unit -- ResourceGrantEditor` (and matrix/override files) | ❌ Wave 0 | ⬜ pending |
| TS12 / D-11 (P5.6) | Effective Access page renders single-feature `whoCanDo` view + user drill-down | 5.6 | unit | `npm run test:run:unit -- EffectiveAccessPage` | ❌ Wave 0 → 5.6 | ⬜ pending |
| TS14 | `whoCanDo` API client called with correct query params | 5.0b | unit | `npm run test:run:unit -- permissionsApi` | ❌ Wave 0 → 5.0b | ⬜ pending |
| TS15 | `useHasPermission` hook | — | unit | `npm run test:run:unit -- permissions` | ✅ `fe/tests/lib/permissions.test.tsx` (Phase 4) | ✅ green |
| TS15 | `<Can>` rendering with mocked rules | — | unit | `npm run test:run:unit -- ability` | ✅ `fe/tests/lib/ability.test.tsx` (verify in 5.5) | ⬜ verify |
| TS12 | i18n: new keys present in en/vi/ja | 5.1/5.2/5.3/5.4/5.6 | static | `cd fe && npm run build` + grep | ✅ build pipeline | ⬜ pending |
| TS12 | Dark mode: every new surface has `dark:` variants | 5.4 | manual | screenshot UAT | — | ⬜ pending |
| CLAUDE.md | No `user.role === '<literal>'` or `isAdmin` props | all | static | `cd fe && npm run lint` | ✅ Phase 4.5 ESLint rule | ⬜ green |
| CLAUDE.md | No bare permission key strings — all via `PERMISSION_KEYS.X` | all | static | `cd fe && npm run build` (TS) + grep | ✅ compile-time | ⬜ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

The following test files must exist (as scaffolds, even with `it.todo`) before Wave 1 begins, so per-task verifies have a target:

- [ ] `fe/tests/features/permissions/permissionsApi.test.ts` — created in 5.0b
- [ ] `fe/tests/features/permissions/PermissionMatrix.test.tsx` — created in 5.1
- [ ] `fe/tests/features/permissions/OverrideEditor.test.tsx` — created in 5.2
- [ ] `fe/tests/features/permissions/PrincipalPicker.test.tsx` — created in 5.3
- [ ] `fe/tests/features/permissions/ResourceGrantEditor.test.tsx` — created in 5.3
- [ ] `fe/tests/features/permissions/EffectiveAccessPage.test.tsx` — created in 5.6
- [ ] `fe/tests/features/users/UserDetailPage.test.tsx` — created in 5.2
- [ ] `fe/vitest.config.ts` — coverage thresholds added in 5.5 for `src/features/permissions/**` ≥ 85%
- [ ] Manual UAT checklist `fe/tests/uat/phase-5-admin-ui.md` — created in 5.4

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| Dark mode visual parity on matrix, override editor, grant modal, effective access page | TS12 | Visual fidelity not assertable in jsdom | Toggle theme via app settings; verify no white-on-white or contrast issues. Screenshots in `5.4-SUMMARY.md`. |
| i18n string completeness for vi + ja | TS12 | Translation correctness needs human review | Switch locale to vi then ja; walk every new surface; capture screenshots. |
| End-to-end admin flow: assign role permission via matrix → verify in DB → log out as that role's user → confirm new permission active | TS12 acceptance test | Cross-system, requires Docker BE up | Per ROADMAP §"Verification" line 1: "Admin assigns a permission to a role via the matrix UI → page reloads, permission is reflected" |
| End-to-end admin flow: grant → override → team grant cascade | TS12 acceptance test | Cross-system | Per ROADMAP §"Verification" line 2: "Admin can grant a feature-level permission to a role, override it for a user, and grant a category to a team — all from the UI" |
| R-10 toast wording is clear to non-technical admins | D-09 | Subjective | Show toast to a non-technical reviewer; confirm comprehension |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every plan has at least one Vitest target)
- [x] Wave 0 covers all MISSING references (test files scaffolded in their owning plan)
- [x] No watch-mode flags (`test:run:unit` is non-watch)
- [x] Feedback latency < 60s for per-task sampler
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-08 (derived from RESEARCH.md §Validation Architecture)
