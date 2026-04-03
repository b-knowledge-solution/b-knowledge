---
phase: 01
slug: migrate-latest-ragflow-upstream-to-b-knowledge
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (BE/FE) + pytest 7.x (advance-rag) |
| **Config file** | `be/jest.config.ts`, `fe/vitest.config.ts`, `advance-rag/pyproject.toml` |
| **Quick run command** | `npm run test --workspace=be -- --passWithNoTests` |
| **Full suite command** | `npm test && cd advance-rag && python -m pytest tests/` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test --workspace=be -- --passWithNoTests`
- **After every plan wave:** Run `npm test && cd advance-rag && python -m pytest tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | Safe copy pure dirs | build | `npm run build` | ✅ | ⬜ pending |
| 01-02-01 | 02 | 2 | Manual merge modified files | build+test | `cd advance-rag && python -m pytest tests/` | ✅ | ⬜ pending |
| 01-03-01 | 03 | 3 | Integration layer updates | build | `npm run build` | ✅ | ⬜ pending |
| 01-04-01 | 04 | 3 | Feature porting (TS) | unit | `npm test --workspace=be` | ✅ | ⬜ pending |
| 01-05-01 | 05 | 4 | Validation & patch doc | full | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Patch note completeness | D-12 | Document content review | Verify patches/ragflow-port-v*-df2cc32.md follows format of existing patch note |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
