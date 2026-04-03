---
phase: 03
slug: refactor-project-feature-separate-project-creation-category-management-documents-standard-code-and-versioned-datasets
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (BE), vitest + jsdom (FE) |
| **Config file** | `be/vitest.config.ts`, `fe/vitest.config.ts` |
| **Quick run command** | `npm run test -w be -- --reporter=verbose` / `npm run test -w fe -- --reporter=verbose` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~60 seconds (BE ~30s, FE ~30s) |

---

## Sampling Rate

- **After every task commit:** Run relevant workspace tests
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | TBD | TBD | TBD | TBD | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*To be populated after plans are created.*

---

## Wave 0 Requirements

- Existing test infrastructure covers BE (vitest) and FE (vitest + jsdom)
- No new test framework needed

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 3-tab layout renders correctly | D-01/D-05 | Visual layout verification | Open project detail page, verify Documents/Standard/Code tabs visible |
| Settings sidebar opens/closes | D-05 | Interactive behavior | Click gear icon, verify sidebar opens with project settings |
| Category creation triggers dataset | D-02 | Integration with RAG service | Create Standard category, verify dataset appears in datasets list |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
