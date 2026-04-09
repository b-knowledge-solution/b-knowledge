---
phase: 6
slug: legacy-cleanup-opensearch-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from RESEARCH.md §12 (Validation Architecture) and CONTEXT.md amendments A-1..A-5.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (BE unit + integration) — per `be/vitest.config.ts` |
| **Config file** | `be/vitest.config.ts` |
| **Quick run command** | `cd be && npm run test -- --run <changed test file>` |
| **Full suite command** | `cd be && npm run test -- --run` |
| **Estimated runtime** | ~60–120 seconds (planner should verify against current suite baseline) |
| **Scratch-DB helper** | `withScratchDb` (existing pattern in `be/tests/` — researcher §6) |

---

## Sampling Rate

- **After every task commit:** Run vitest on the changed test file only (`npm run test -- --run <file>`)
- **After every plan wave:** Run the full BE vitest suite
- **Before `/gsd:verify-work`:** Full suite must be green + `npm run check:legacy-roles` (new in P6.2) must exit 0 + `npm run build` clean
- **Max feedback latency:** 30 seconds for per-task quick run

---

## Per-Task Verification Map

> Plans/tasks don't exist yet — this table is a placeholder structure the planner fills in.
> Each requirement below MUST map to at least one automated verification.

| Requirement | Behavior | Test Type | Expected Automated Command |
|-------------|----------|-----------|----------------------------|
| TS9 | Legacy `'superadmin'` / `'member'` strings absent from be/src code | grep | `npm run check:legacy-roles` (exit 0) |
| TS9 | `UserRole.SUPERADMIN` / `UserRole.MEMBER` enum keys deleted from `roles.ts` | unit | vitest assertion on imported enum |
| TS9 | P6.1 migration aborts on unknown role values (pre-check) | integration | scratch-DB test: seed bad role, expect migration to throw |
| TS9 | P6.1 migration idempotent — re-running leaves DB unchanged | integration | scratch-DB test: run twice, diff row states |
| TS13 | `resolveGrantedDatasetsForUser` returns empty array for zero-grant user | unit | vitest, mocked ResourceGrantModel |
| TS13 | `resolveGrantedDatasetsForUser` unions KB + DocCat grants into flat set | unit | vitest, mocked model with both grant types |
| TS13 | `resolveGrantedDatasetsForUser` filters expired grants (expires_at < now) | integration | withScratchDb: seed expired grant, assert excluded |
| TS13 | Parity — chat-conversation kbIds expansion unchanged when user has zero grants | integration | withScratchDb + mocked retrieval client, assert kbIds pre/post identical |
| TS13 | Positive — user with category grant sees granted KB's dataset IDs in expanded kbIds | integration | withScratchDb + mocked retrieval client, assert dataset IDs present |
| TS13 | No-access — user with zero grants + no role access to private KB → kbIds does not include that KB | integration | withScratchDb + mocked retrieval client, negative assertion |
| TS13 | `buildOpenSearchAbacFilters` function deleted | grep | `grep -c "buildOpenSearchAbacFilters" be/src` returns 0 |
| (P6.5) | ADMIN_ROLES audit — 3 active sites have rationale comment | grep | `grep -B1 "ADMIN_ROLES" be/src/shared/rbac.ts be/src/shared/middleware/auth.middleware.ts` shows comment line above each |

*Status tracking: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — planner fills task IDs once plans exist*

---

## Wave 0 Requirements

Planner must confirm or create, before Wave 1:

- [ ] `be/tests/permissions/resource-grant.test.ts` — if not present, stub for P6.3 unit tests on the new helper
- [ ] `be/tests/shared/services/ability.service.test.ts` — verify `buildOpenSearchAbacFilters` removal doesn't break existing tests (researcher §6 flagged 6 test mocks)
- [ ] `be/tests/db/migrations/phase6-legacy-role-cleanup.test.ts` — stub for migration integration tests using `withScratchDb`
- [ ] `scripts/check-legacy-roles.sh` — CI grep script + `npm run check:legacy-roles` npm script entry (P6.2)
- [ ] Confirm `withScratchDb` helper location and shape — researcher recommends it as the P6.4 harness; if it's not already used by permission tests, Wave 0 task should verify it covers `resource_grants` seeding

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none) | — | All phase behaviors have automated verification via vitest + grep | — |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify commands or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (scratch-DB helper, CI grep script, test stubs)
- [ ] No watch-mode flags (`--watch` forbidden in per-task verify commands)
- [ ] Feedback latency < 30s for quick run
- [ ] `nyquist_compliant: true` set in frontmatter after planner fills the task map

**Approval:** pending — planner must fill the task ID column in §Per-Task Verification Map
