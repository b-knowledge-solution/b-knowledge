---
phase: 05
slug: advanced-retrieval
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-19
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (BE) + vite build (FE) |
| **Config file** | `be/vitest.config.ts`, `fe/vite.config.ts` |
| **Quick run command** | `npm run test -w be -- --run` |
| **Full suite command** | `npm run build && npm run test -w be` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run task-specific `<automated>` command from plan
- **After every plan wave:** Run `npm run build && npm run test -w be`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-T1 | 01 | 1 | RETR-01,02 | unit | `npm run test -w be -- --run be/tests/rag/language-detect.test.ts be/tests/rag/graphrag-indexing.test.ts` | Wave 0 | pending |
| 05-01-T2 | 01 | 1 | RETR-01,02 | build | `npm run build -w be` | N/A | pending |
| 05-02-T1 | 02 | 1 | RETR-04,05,07 | unit | `npm run test -w be -- --run be/tests/rag/deep-research-budget.test.ts` | Wave 0 | pending |
| 05-02-T2 | 02 | 1 | RETR-06 | unit | `npm run test -w be -- --run be/tests/rag/cross-dataset-search.test.ts` | Wave 0 | pending |
| 05-03-T1 | 03 | 2 | RETR-03,06 | build | `npm run build -w be` | N/A | pending |
| 05-03-T2 | 03 | 2 | RETR-04,05,07 | build | `npm run build -w be` | N/A | pending |
| 05-03-T3 | 03 | 2 | RETR-03,04,05 | unit | `npm run test -w be -- --run be/tests/rag/graphrag-retrieval.test.ts be/tests/rag/deep-research.test.ts` | Wave 0 | pending |
| 05-04-T1 | 04 | 3 | RETR-01,02 | build | `npm run build -w fe` | N/A | pending |
| 05-04-T2 | 04 | 3 | RETR-03..07 | build | `npm run build -w fe` | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Test files created by plan tasks (TDD tasks create their own test files):

- [ ] `be/tests/rag/language-detect.test.ts` -- Plan 01 Task 1 creates (RETR language detection)
- [ ] `be/tests/rag/graphrag-indexing.test.ts` -- Plan 01 Task 1 creates (RETR-01, RETR-02 config propagation)
- [ ] `be/tests/rag/deep-research-budget.test.ts` -- Plan 02 Task 1 creates (RETR-07 budget tracking)
- [ ] `be/tests/rag/cross-dataset-search.test.ts` -- Plan 02 Task 2 creates (RETR-06 ABAC search)
- [ ] `be/tests/rag/graphrag-retrieval.test.ts` -- Plan 03 Task 3 creates (RETR-03 hybrid retrieval)
- [ ] `be/tests/rag/deep-research.test.ts` -- Plan 03 Task 3 creates (RETR-04, RETR-05 recursion)
- [ ] Framework install: `npm install franc -w be` -- language detection library (Plan 01 Task 1)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GraphRAG indexing completes and shows entity counts | RETR-01,02 | Requires dataset parse + graph build | Enable KG on dataset, parse document, verify KnowledgeGraphTab shows counts |
| Graph+vector hybrid answer cites relationships | RETR-03 | Requires chat with KG-enabled assistant | Ask multi-hop question, verify graph-augmented answer with entity citations |
| Deep Research streams intermediate results | RETR-04,05 | Requires SSE stream observation | Enable Deep Research on assistant, ask complex question, verify progressive streaming |
| Budget cap produces partial answer with disclaimer | RETR-07 | Requires triggering budget limit | Set low token budget, ask complex question, verify partial answer with disclaimer |
| Cross-dataset search respects ABAC | RETR-06 | Requires multi-KB ABAC setup | Search across KBs with ABAC rules, verify restricted content not returned |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (test files created by TDD tasks)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
