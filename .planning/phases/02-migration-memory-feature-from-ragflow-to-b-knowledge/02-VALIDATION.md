---
phase: 2
slug: migration-memory-feature-from-ragflow-to-b-knowledge
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (BE + FE), pytest 7.x (advance-rag), Playwright (E2E) |
| **Config file** | `be/vitest.config.ts`, `fe/vitest.config.ts`, `advance-rag/pyproject.toml` |
| **Quick run command** | `npm run test --workspace=be -- --run` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test --workspace=be -- --run`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | MEM-SCHEMA | unit | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | MEM-FE-TYPES | unit | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | MEM-CRUD-API | unit | `npm run test --workspace=be -- --run` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | MEM-MESSAGES | unit | `npm run test --workspace=be -- --run` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | MEM-LIST-UI | unit | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | MEM-SIDEBAR-NAV | unit | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 3 | MEM-EXTRACTION | unit | `npm run test --workspace=be -- --run` | ❌ W0 | ⬜ pending |
| 02-04-02 | 04 | 3 | MEM-CHAT-INTEGRATION | unit | `npm run test --workspace=be -- --run` | ❌ W0 | ⬜ pending |
| 02-05-01 | 05 | 3 | MEM-DETAIL-UI | unit | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-05-02 | 05 | 3 | MEM-IMPORT | unit | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-06-01 | 06 | 4 | MEM-AGENT-INTEGRATION | unit | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-06-02 | 06 | 4 | MEM-IMPORT | unit | `npm run test --workspace=be -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `be/tests/memory/` — test directory for memory module
- [ ] `be/tests/memory/memory.service.test.ts` — service test stubs
- [ ] `be/tests/memory/memory-message.service.test.ts` — message service stubs
- [ ] `be/tests/memory/memory-extraction.service.test.ts` — extraction test stubs
- [ ] `fe/tests/features/memory/` — test directory for memory feature
- [ ] `advance-rag/tests/test_memory_handlers.py` — Python memory handler stubs

*Existing test infrastructure covers framework setup — only new test directories needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Memory message browser table rendering | MEM-DETAIL-UI | Complex table with search/filter interactions | Open memory detail, verify message table loads, search, filter by type |
| Chat assistant memory injection | MEM-CHAT-INTEGRATION | Requires running LLM + chat pipeline | Start chat with memory-linked assistant, verify memories appear in context |
| Import history dialog | MEM-IMPORT | Requires existing chat conversations | Open import dialog, select conversations, verify import completes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
