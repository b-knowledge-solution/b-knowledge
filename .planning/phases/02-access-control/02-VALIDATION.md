---
phase: 02
slug: access-control
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (BE) + Playwright (E2E) |
| **Config file** | `be/vitest.config.ts`, `fe/playwright.config.ts` |
| **Quick run command** | `npm run test -w be` |
| **Full suite command** | `npm run test && cd fe && npx playwright test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -w be`
- **After every plan wave:** Run `npm run test && cd fe && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | ACCS-01 | integration | `npm run test -w be` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | ACCS-02 | integration + E2E | `npm run test -w be` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | ACCS-03 | integration + E2E | `npm run test -w be` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | ACCS-04 | integration | `npm run test -w be` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 2 | ACCS-05 | integration | `npm run test -w be` | ❌ W0 | ⬜ pending |
| 02-04-02 | 04 | 2 | ACCS-06 | integration + E2E | `npm run test -w be` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `be/tests/modules/access-control/` — test directory for ACCS-01 through ACCS-06
- [ ] `be/tests/modules/access-control/helpers/` — shared fixtures for multi-tenant test setup
- [ ] E2E auth fixtures for multi-org user creation

*Existing Playwright and Vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-org data isolation via direct API | ACCS-01 | Requires 2 authenticated sessions | Login as Org A user, attempt API call to Org B resource, verify 403 |
| ABAC filtering in chat citations | ACCS-03 | Requires chat flow with restricted docs | Upload restricted doc, chat as unauthorized user, verify doc not cited |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
