---
phase: 1
slug: migration-stabilization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright ^1.57.0 (E2E), Vitest 2.1 (BE unit), Vitest 3.0 (FE unit) |
| **Config file** | none — Wave 0 creates playwright.config.ts |
| **Quick run command** | `npx playwright test --grep @smoke` |
| **Full suite command** | `npx playwright test` |
| **Estimated runtime** | ~60 seconds (E2E), ~10 seconds (unit) |

---

## Sampling Rate

- **After every task commit:** Run `npx playwright test --grep @smoke`
- **After every plan wave:** Run `npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | STAB-01 | E2E | `npx playwright test dataset` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | STAB-02 | E2E | `npx playwright test parse` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | STAB-05 | E2E | `npx playwright test parse` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | STAB-03 | E2E | `npx playwright test chunk` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 2 | STAB-04 | E2E | `npx playwright test search` | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 2 | CHAT-01 | E2E | `npx playwright test chat` | ❌ W0 | ⬜ pending |
| 01-04-02 | 04 | 2 | CHAT-02 | E2E | `npx playwright test search` | ❌ W0 | ⬜ pending |
| 01-04-03 | 04 | 2 | CHAT-03 | E2E | `npx playwright test feedback` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `fe/playwright.config.ts` — Playwright configuration with base URL, auth state
- [ ] `fe/e2e/fixtures/auth.ts` — Login fixture for authenticated test contexts
- [ ] `fe/e2e/helpers/wait-for-task.ts` — Poll document/task status until completion (handles async Redis queue)
- [ ] `fe/e2e/dataset.spec.ts` — Stubs for STAB-01 (dataset CRUD)
- [ ] `fe/e2e/parse.spec.ts` — Stubs for STAB-02, STAB-05 (parsing pipeline)
- [ ] `fe/e2e/chunk-search.spec.ts` — Stubs for STAB-03, STAB-04 (chunking + search)
- [ ] `fe/e2e/chat.spec.ts` — Stubs for CHAT-01 (chat streaming)
- [ ] `fe/e2e/search-app.spec.ts` — Stubs for CHAT-02 (search experience)
- [ ] `fe/e2e/feedback.spec.ts` — Stubs for CHAT-03 (answer feedback)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PDF visual chunk quality | STAB-02 | Requires human judgement on chunk boundary quality | Upload sample PDF, inspect chunk list for logical text segments |
| Citation accuracy | CHAT-01 | Requires human judgement on citation relevance | Chat with assistant, verify cited passages match answer content |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
