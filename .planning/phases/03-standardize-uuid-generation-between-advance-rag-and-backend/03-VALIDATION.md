---
phase: 3
slug: standardize-uuid-generation-between-advance-rag-and-backend
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (advance-rag) / vitest (be) |
| **Config file** | `advance-rag/pyproject.toml` / `be/vitest.config.ts` |
| **Quick run command** | `cd advance-rag && python -m pytest tests/ -x -q` / `cd be && npx vitest run` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command for affected workspace
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | UUID-STD | unit | `cd advance-rag && python -m pytest tests/ -x -q -k uuid` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | UUID-STD | grep | `grep -r "uuid1" advance-rag/ --include="*.py"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `advance-rag/tests/test_uuid_standardization.py` — verify get_uuid() produces UUID4 hex format
- [ ] Existing test infrastructure covers both workspaces

*Existing infrastructure covers most phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Existing data compatibility | UUID-STD | Cannot auto-verify production data | Confirm existing 32-char hex IDs remain valid after UUID4 switch |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
