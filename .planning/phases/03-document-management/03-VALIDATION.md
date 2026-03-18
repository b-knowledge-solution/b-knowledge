---
phase: 03
slug: document-management
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 03-00-01 | 00 | 0 | DOCM-01..06 | scaffold | `npx vitest run be/tests/modules/rag/ --reporter=verbose` | Created by 00 | ⬜ pending |
| 03-01-01 | 01 | 1 | DOCM-01, DOCM-03 | integration | `npm run build -w be` | N/A (build check) | ⬜ pending |
| 03-02-01 | 02 | 2 | DOCM-02 | integration | `npm run build -w be` | N/A (build check) | ⬜ pending |
| 03-03-01 | 03 | 2 | DOCM-04, DOCM-05, DOCM-06 | integration | `npm run build -w be` | N/A (build check) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `be/tests/modules/rag/version-history.test.ts` — covers DOCM-01, DOCM-02, DOCM-03
- [ ] `be/tests/modules/rag/metadata-tagging.test.ts` — covers DOCM-04, DOCM-05, DOCM-06

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chunk detail split view renders correctly | DOCM-01 | Visual layout verification | Navigate to dataset > document > verify split view with preview left, chunks right |
| Chat citation drawer opens with highlight | DOCM-02 | SSE + citation interaction | Chat with assistant, click citation fig., verify drawer with highlighted content |
| Bulk tag edit across multiple documents | DOCM-06 | Multi-select + dialog interaction | Select 3+ documents, click Edit Tags, add tag, verify applied to all |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
