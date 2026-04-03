---
phase: 8
slug: frontend-rename
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (FE), TypeScript compiler (tsc) |
| **Config file** | `fe/vitest.config.ts` |
| **Quick run command** | `npm run build -w fe` |
| **Full suite command** | `npm run build -w fe && npm run lint -w fe` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build -w fe`
- **After every plan wave:** Run `npm run build -w fe && npm run lint -w fe`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Populated during planning.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework needed — validation via build success and grep verification.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Knowledge Base" visible in all UI | REN-01 | Visual verification | Navigate all pages, check nav/breadcrumbs/titles in en, vi, ja |
| URL path uses /knowledge-base/ | REN-04 | Browser verification | Click through app, verify URL bar shows /data-studio/knowledge-base/ |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
