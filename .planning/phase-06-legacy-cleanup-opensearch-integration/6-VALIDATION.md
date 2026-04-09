---
phase: 6
slug: legacy-cleanup-opensearch-integration
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-09
updated: 2026-04-09
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from RESEARCH.md §12 (Validation Architecture) and CONTEXT.md amendments A-1..A-5.
> Task IDs filled in after plans 6.1–6.5 were written.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (BE unit + integration) — per `be/vitest.config.ts` |
| **Config file** | `be/vitest.config.ts` |
| **Quick run command** | `cd be && npm run test -- --run <changed test file>` |
| **Full suite command** | `cd be && npm run test -- --run` |
| **Estimated runtime** | ~60–120 seconds (planner should verify against current suite baseline) |
| **Scratch-DB helper** | `withScratchDb` + `withScratchDbStoppingBefore` (`be/tests/permissions/_helpers.ts`) |

---

## Sampling Rate

- **After every task commit:** Run vitest on the changed test file only (`npm run test -- --run <file>`)
- **After every plan wave:** Run the full BE vitest suite
- **Before `/gsd:verify-work`:** Full suite must be green + `npm run check:legacy-roles` (new in 6.2.3) must exit 0 + `npm run build` clean
- **Max feedback latency:** 30 seconds for per-task quick run

---

## Per-Task Verification Map

| Task ID | Requirement | Behavior | Test Type | Automated Command |
|---------|-------------|----------|-----------|-------------------|
| 6.1.1 | TS13 | Migration file exists with pre-check + conditional UPDATEs + no-op down | build + grep | `cd be && npm run build` + grep assertions in plan |
| 6.1.2 | TS13 | Pre-check aborts on unknown role; UPDATEs rewrite legacy values; idempotent on re-run | integration | `cd be && npm run test -- --run tests/permissions/legacy-role-cleanup.test.ts` |
| 6.2.1 | TS13 | 7 production sites + 4 test fixtures mechanically rewritten to `UserRole.SUPER_ADMIN` / `'super-admin'` | build + grep | `cd be && npm run build` + `grep -rn "UserRole\\.SUPERADMIN" be/src be/tests` returns 0 |
| 6.2.2 | TS13 | `UserRole` enum trimmed to 4 canonical keys; `TeamRole.MEMBER` preserved | build + unit | `cd be && npm run build && npm run test -- --run tests/permissions/` |
| 6.2.3 | TS13 | `scripts/check-legacy-roles.sh` + `npm run check:legacy-roles` exit 0 on clean repo, non-zero on regression | grep + script exit | `npm run check:legacy-roles` |
| 6.3.1 | TS9 | `findDatasetIdsByCategoryIds` / `findDatasetIdsByKnowledgeBaseIds` exist on `DocumentCategoryModel` with JSDoc and SQL filtering deleted versions | build + grep | `cd be && npm run build` + grep assertions |
| 6.3.2 | TS9, TS13 | `resolveGrantedDatasetsForUser` helper exists; `buildOpenSearchAbacFilters` deleted | build + grep | `cd be && npm run build` + `grep -rn "buildOpenSearchAbacFilters" be/src` returns 0 |
| 6.3.3 | TS9 | `chat-conversation.service.ts` wires the helper into `allKbIds` expansion; dead import removed | build + existing chat tests | `cd be && npm run build && npm run test -- --run tests/chat/` |
| 6.4.1 | TS9, TS13 | Tier A unit tests: zero-grant parity, KB-only, category-only, union, soft-cap truncation, dead-code documentation | unit | `cd be && npm run test -- --run tests/shared/services/ability.service.test.ts` |
| 6.4.2 | TS9 | Tier B scratch-DB integration tests: no-grants, live KB grant, versioned category grant, expired grant (D-09), deleted version, overlapping union | integration | `cd be && npm run test -- --run tests/permissions/grant-dataset-resolution.test.ts` |
| 6.5.1 | TS13 (R-9) | 3 active ADMIN_ROLES sites carry rationale comments; no code logic change | build + grep | `cd be && npm run build` + `grep -c "ADMIN_ROLES preserved per R-9" be/src/shared/config/rbac.ts be/src/shared/middleware/auth.middleware.ts` ≥ 3 |
| 6.5.2 | TS13 (R-9) | ADR-style preservation note exists with 3 active sites + milestone 2 plan | file + grep | `test -f .planning/codebase/ADMIN_ROLES-preservation.md && grep -c "R-9" .planning/codebase/ADMIN_ROLES-preservation.md` ≥ 3 |

*Status tracking: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — filled during execution*

---

## Wave 0 Requirements

Wave 0 gaps are NOT separately scheduled — they are absorbed into Wave 1/2 task scaffolding:

- [x] `scripts/check-legacy-roles.sh` — created by Task 6.2.3 (Wave 2)
- [x] `be/tests/permissions/legacy-role-cleanup.test.ts` — created by Task 6.1.2 (Wave 1)
- [x] `be/tests/permissions/grant-dataset-resolution.test.ts` — created by Task 6.4.2 (Wave 3)
- [x] `be/tests/shared/services/ability.service.test.ts` — extended by Task 6.4.1 (Wave 3) replacing existing `it.todo()` placeholders
- [x] `withScratchDb` helper — already present in `be/tests/permissions/_helpers.ts`, used directly

**Rationale:** Phase 6 has no test-scaffolding dependency cycles — each Wave 1/2 task that introduces a new behavior also ships the test file covering it, so an explicit Wave 0 pass is unnecessary. Every task in the Per-Task Verification Map has an `<automated>` command embedded in its plan's `<verify>` block.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none) | — | All phase behaviors have automated verification via vitest + grep | — |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (scratch-DB helper, CI grep script, test stubs)
- [x] No watch-mode flags (`--watch` forbidden in per-task verify commands)
- [x] Feedback latency < 30s for quick run
- [x] `nyquist_compliant: true` set in frontmatter after planner filled the task map

**Approval:** approved — planner filled Task ID column and every row has an automated command.
