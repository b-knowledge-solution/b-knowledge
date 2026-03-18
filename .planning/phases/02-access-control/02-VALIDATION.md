---
phase: 02
slug: access-control
status: active
nyquist_compliant: true
wave_0_complete: true
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

## Wave 0 Test Scaffolds

Plan 02-00 creates these test files (all using `it.todo()` so they track but do not block):

- [x] `be/tests/shared/services/ability.service.test.ts` -- covers ACCS-01, ACCS-02, ACCS-03, ACCS-04 (ability builder logic)
- [x] `be/tests/shared/middleware/tenant.middleware.test.ts` -- covers tenant extraction and validation
- [x] `be/tests/shared/middleware/auth.middleware.test.ts` -- covers CASL integration in auth middleware

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-00-01 | 00 | 0 | ACCS-01..04 | scaffold | `npx vitest run be/tests/shared/ --reporter=verbose` | Created by 00 | pending |
| 02-01-01 | 01 | 1 | ACCS-01 | integration | `npm run build -w be` | N/A (build check) | pending |
| 02-02-01 | 02 | 2 | ACCS-01,02 | integration | `npm run build -w be` | N/A (build check) | pending |
| 02-03-01 | 03 | 3 | ACCS-03,04 | integration | `npm run build -w be` | N/A (build check) | pending |
| 02-04-01 | 04 | 3 | ACCS-02 | integration | `npm run build -w fe` | N/A (build check) | pending |
| 02-05-01 | 05 | 4 | ACCS-02,03,04 | visual | checkpoint:human-verify | N/A | pending |
| 02-06-01 | 06 | 4 | ACCS-02,05,06 | integration | `npm run build` | N/A (build check) | pending |

*Status: pending · green · red · flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-org data isolation via direct API | ACCS-01 | Requires 2 authenticated sessions | Login as Org A user, attempt API call to Org B resource, verify 403 |
| ABAC filtering in chat citations | ACCS-03 | Requires chat flow with restricted docs | Upload restricted doc, chat as unauthorized user, verify doc not cited |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution
</content>
</invoke>