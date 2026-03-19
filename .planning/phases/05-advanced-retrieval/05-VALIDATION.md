---
phase: 05
slug: advanced-retrieval
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (BE) + pytest (advance-rag) |
| **Config file** | `be/vitest.config.ts`, `advance-rag/pyproject.toml` |
| **Quick run command** | `npm run build -w be` |
| **Full suite command** | `npm run build && npm run test -w be` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build -w be` or `npm run build -w fe`
- **After every plan wave:** Run `npm run build && npm run test -w be`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-T1 | 01 | 1 | RETR-01,02 | build | `npm run build -w be` | N/A | ⬜ pending |
| 05-02-T1 | 02 | 2 | RETR-03 | build | `npm run build -w be` | N/A | ⬜ pending |
| 05-03-T1 | 03 | 2 | RETR-04,05 | build | `npm run build -w be` | N/A | ⬜ pending |
| 05-04-T1 | 04 | 3 | RETR-06,07 | build | `npm run build -w be` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No Wave 0 test scaffolds needed — this is a wiring phase that integrates existing Python implementations with the TypeScript backend.*

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
