---
phase: 7
slug: should-haves-versioning-expires-at
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-09
updated: 2026-04-09
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `7-RESEARCH.md` §Validation Architecture and the approved 7.0–7.3 plans.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Backend: Vitest; Frontend: Vitest unit + UI |
| **Config file** | `be/vitest.config.ts`, `fe/vitest.unit.config.ts`, `fe/vitest.ui.config.ts` |
| **Quick run command** | `npm test -w be -- --run <be-test-file> --reporter=dot` or `npm run test:run:ui -w fe -- --reporter=dot <fe-test-file>` |
| **Full suite command** | `npm test -w be -- --run tests/permissions tests/shared/services/ability.service.test.ts --reporter=dot` and `npm run test:run:unit -w fe -- --reporter=dot tests/features/permissions/permissionsApi.test.ts && npm run test:run:ui -w fe -- --reporter=dot tests/lib/permissions.test.tsx tests/features/permissions/permissionsCatalogRefresh.test.tsx` |
| **Estimated runtime** | ~30-90 seconds targeted, ~2-4 minutes phase gate |

---

## Sampling Rate

- **After every task commit:** Run the task’s targeted BE or FE command only
- **After every plan wave:** Run the relevant wave-level targeted suite
- **Before `/gsd-verify-work`:** Phase 7 targeted BE + FE commands must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 7.0.1 | 7.0 | 0 | SH1 | T-07-0-01 / T-07-0-04 | Backend SH1 regression file exists and executes before backend versioning work begins | unit/integration | `npm test -w be -- --run tests/permissions/catalog-versioning.test.ts --reporter=dot` | ✅ after 7.0 | ⬜ pending |
| 7.0.2 | 7.0 | 0 | SH1 | T-07-0-02 / T-07-0-03 | FE SH1 refresh harness exists and targeted unit/UI commands execute before FE refresh work begins | unit + UI | `npm run test:run:unit -w fe -- --reporter=dot tests/features/permissions/permissionsApi.test.ts` and `npm run test:run:ui -w fe -- --reporter=dot tests/lib/permissions.test.tsx tests/features/permissions/permissionsCatalogRefresh.test.tsx` | ✅ after 7.0 | ⬜ pending |
| 7.1.1 | 7.1 | 1 | SH1 | T-07-1-01 / T-07-1-04 | Catalog read stays gated and returns deterministic `version` with metadata only | unit/integration | `npm test -w be -- --run tests/permissions/catalog-versioning.test.ts --reporter=dot` | ✅ via 7.0 | ⬜ pending |
| 7.1.2 | 7.1 | 1 | SH1 | T-07-1-02 / T-07-1-03 | Only successful permission mutations emit the canonical catalog-update event | unit/integration | `npm test -w be -- --run tests/permissions/catalog-versioning.test.ts --reporter=dot` | ✅ via 7.0 | ⬜ pending |
| 7.2.1 | 7.2 | 1 | SH2 | T-07-2-01 / T-07-2-03 | Expired grants and overrides vanish on the next ability rebuild via model-layer SQL filtering | unit/integration | `npm test -w be -- --run tests/shared/services/ability.service.test.ts tests/permissions/tenant-isolation.test.ts --reporter=dot` | ✅ | ⬜ pending |
| 7.2.2 | 7.2 | 1 | SH2 | T-07-2-02 / T-07-2-04 | Expired grants do not expand into dataset IDs and no cron/sweeper branch is introduced | integration | `npm test -w be -- --run tests/permissions/grant-dataset-resolution.test.ts --reporter=dot` | ✅ | ⬜ pending |
| 7.3.1 | 7.3 | 2 | SH1 | T-07-3-01 / T-07-3-04 | Runtime provider hydrates from versioned catalog and remains fail-closed on unknown keys | UI | `npm run test:run:ui -w fe -- --reporter=dot tests/lib/permissions.test.tsx tests/features/permissions/permissionsCatalogRefresh.test.tsx` | ✅ via 7.0 | ⬜ pending |
| 7.3.2 | 7.3 | 2 | SH1 | T-07-3-02 / T-07-3-03 | Authenticated socket invalidation is the fast path and bounded polling fallback reuses the same endpoint | unit + UI | `npm run test:run:unit -w fe -- --reporter=dot tests/features/permissions/permissionsApi.test.ts && npm run test:run:ui -w fe -- --reporter=dot tests/lib/permissions.test.tsx tests/features/permissions/permissionsCatalogRefresh.test.tsx` | ✅ via 7.0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Execute `7.0-PLAN.md` before any SH1 implementation work
- [ ] `be/tests/permissions/catalog-versioning.test.ts` — backend SH1 coverage scaffold for deterministic versioning and mutation-origin emits
- [ ] `fe/tests/features/permissions/permissionsCatalogRefresh.test.tsx` — silent runtime refresh scaffold for socket + polling fallback
- [ ] Extend `fe/tests/lib/permissions.test.tsx` — provider-backed runtime catalog assertions replace snapshot-only assumptions
- [ ] Extend `fe/tests/features/permissions/permissionsApi.test.ts` — FE API contract coverage for `{ version, permissions }`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Connected authenticated tab receives a server-driven catalog change and updates without a visible prompt | SH1 | End-to-end socket + provider behavior crosses BE emit, auth, socket lifecycle, and FE cache invalidation | 1. Log in with a permissions-admin-capable account. 2. Open a page that mounts the permission provider. 3. In a second session, perform a role/override/grant mutation. 4. Confirm the first tab updates catalog-backed behavior without a hard reload, toast, or modal. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands or explicit Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing test references
- [x] No watch-mode flags
- [x] Feedback latency < 90s for targeted runs
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved — validation strategy present and aligned to plans 7.0–7.3.
