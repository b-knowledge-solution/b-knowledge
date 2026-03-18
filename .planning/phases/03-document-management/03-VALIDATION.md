---
phase: 03
slug: document-management
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-18
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (BE) + Playwright (E2E) |
| **Config file** | `be/vitest.config.ts`, `fe/playwright.config.ts` |
| **Quick run command** | `npm run test -w be` |
| **Full suite command** | `npm run test && npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build -w be` or `npm run build -w fe`
- **After every plan wave:** Run `npm run test && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-00-01 | 00 | 0 | DOCM-01..06 | scaffold | `npx vitest run be/tests/rag/version-history.test.ts be/tests/rag/metadata-tagging.test.ts --reporter=verbose` | Created by 00 | pending |
| 03-01-01 | 01 | 1 | DOCM-01, DOCM-03 | unit | `npm run build -w be && npx vitest run be/tests/rag/version-history.test.ts --reporter=verbose` | Created by 00, updated by 01 | pending |
| 03-01-02 | 01 | 1 | DOCM-01, DOCM-03 | unit | `npm run build -w be && npx vitest run be/tests/rag/version-history.test.ts --reporter=verbose` | Created by 00, updated by 01 | pending |
| 03-02-01 | 02 | 2 | DOCM-01, DOCM-03 | build | `npm run build -w fe` | N/A (build check) | pending |
| 03-02-02 | 02 | 2 | DOCM-01, DOCM-03 | build | `npm run build -w fe` | N/A (build check) | pending |
| 03-03-01 | 03 | 2 | DOCM-02 | unit | `npm run build -w be && npx vitest run be/tests/rag/version-history.test.ts --reporter=verbose` | Created by 00, updated by 03 | pending |
| 03-03-02 | 03 | 2 | DOCM-02 | build | `npm run build -w fe` | N/A (build check) | pending |
| 03-04-01 | 04 | 2 | DOCM-04, DOCM-06 | unit | `npm run build -w be && npx vitest run be/tests/rag/metadata-tagging.test.ts --reporter=verbose` | Created by 00, updated by 04 | pending |
| 03-04-02 | 04 | 2 | DOCM-05 | build | `npm run build -w be` | N/A (build check) | pending |
| 03-05-01 | 05 | 3 | DOCM-04, DOCM-05, DOCM-06 | build | `npm run build -w fe` | N/A (build check) | pending |
| 03-05-02 | 05 | 3 | DOCM-04, DOCM-05, DOCM-06 | build | `npm run build -w fe` | N/A (build check) | pending |

*Status: pending | green | red | flaky*

---

## Wave 0 Requirements

- [x] `be/tests/rag/version-history.test.ts` — covers DOCM-01, DOCM-02, DOCM-03
- [x] `be/tests/rag/metadata-tagging.test.ts` — covers DOCM-04, DOCM-05, DOCM-06

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chunk detail split view renders correctly | DOCM-02 | Visual layout verification | Navigate to dataset > document > verify split view with preview left, chunks right |
| Chat citation drawer opens with highlight | DOCM-02 | SSE + citation interaction | Chat with assistant, click citation fig., verify drawer with highlighted content |
| Bulk tag edit across multiple documents | DOCM-06 | Multi-select + dialog interaction | Select 3+ documents, click Edit Tags, add tag, verify applied to all |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
