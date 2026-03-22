---
phase: 1
slug: migrate-agent-features-from-ragflow-to-b-knowledge
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 1 — Validation Strategy

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
| *Populated after planning* | | | | | | | |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `be/tests/agent/` — test directory for agent module
- [ ] `fe/tests/features/agent/` — test directory for agent feature
- [ ] `advance-rag/tests/test_agent_executor.py` — stubs for agent execution tests

*Existing test infrastructure covers framework setup — only new test directories needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Canvas drag-and-drop node placement | Visual UX | ReactFlow canvas interactions can't be unit tested | Open canvas, drag a node from palette, verify placement and connection |
| Debug panel step-by-step execution | Visual UX | Real-time node highlighting requires visual inspection | Run agent in debug mode, step through, verify node highlighting |
| Dark mode canvas rendering | Visual UX | Color contrast on canvas nodes needs visual check | Toggle dark mode, verify all node types are readable |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
