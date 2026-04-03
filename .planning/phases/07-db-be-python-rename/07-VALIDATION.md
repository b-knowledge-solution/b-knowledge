---
phase: 7
slug: db-be-python-rename
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (BE), TypeScript compiler (tsc) |
| **Config file** | `be/jest.config.ts` |
| **Quick run command** | `npm run build -w be` |
| **Full suite command** | `npm run build -w be && npm run test -w be` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build -w be`
- **After every plan wave:** Run `npm run build -w be && npm run test -w be`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | REN-02 | build | `npx tsc --noEmit --project be/tsconfig.json` | ✅ | ⬜ pending |
| 07-01-02 | 01 | 1 | REN-05 | grep | `grep -r ragflow_doc_meta_ advance-rag/ \| wc -l` | ✅ | ⬜ pending |
| 07-02-01 | 02 | 2 | REN-03 | dir | `test -d be/src/modules/knowledge-base && test ! -d be/src/modules/projects` | ✅ | ⬜ pending |
| 07-03-01 | 03 | 3 | REN-03 | grep | `! grep -q "'Project'" be/src/shared/services/ability.service.ts` | ✅ | ⬜ pending |
| 07-03-02 | 03 | 3 | REN-03 | build | `npm run build -w be` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework or stubs needed — validation is via build success and grep verification.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| App starts after migration | REN-02 | Requires running DB + app | Run migration, start BE server, check health endpoint |
| API routes respond at new paths | REN-03 | Requires running server | `curl /api/knowledge-base` returns 200 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
