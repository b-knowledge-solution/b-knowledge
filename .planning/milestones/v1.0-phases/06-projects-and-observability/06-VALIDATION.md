---
phase: 06
slug: projects-and-observability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (BE) + vite build (FE) |
| **Config file** | `be/vitest.config.ts`, `fe/vite.config.ts` |
| **Quick run command** | `npm run build -w be` |
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
| 06-01-T1 | 01 | 1 | PROJ-01 | build | `npm run build -w be` | N/A | ⬜ pending |
| 06-02-T1 | 02 | 2 | PROJ-02,03 | build | `npm run build -w be` | N/A | ⬜ pending |
| 06-03-T1 | 03 | 2 | PROJ-04 | build | `npm run build -w be` | N/A | ⬜ pending |
| 06-04-T1 | 04 | 3 | OBSV-01 | build | `npm run build -w be` | N/A | ⬜ pending |
| 06-05-T1 | 05 | 3 | OBSV-02,03 | build | `npm run build -w be` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. Test files created inline by TDD tasks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Project CRUD in Data Studio | PROJ-01 | Visual UI verification | Create project, verify in list, update name, delete |
| Dataset binding + member management | PROJ-02,03 | Multi-step UI interaction | Bind dataset, add member, verify access scoping |
| Cross-project search | PROJ-04 | Requires multi-project setup | Join 2 projects, search, verify results from both |
| Query analytics dashboard | OBSV-01 | Visual chart verification | Run queries, view dashboard, verify metrics match |
| Feedback quality dashboard | OBSV-02,03 | Feedback + chart verification | Submit feedback, view quality dashboard, verify aggregation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
