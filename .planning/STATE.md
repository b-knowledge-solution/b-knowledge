# Project State

> Loaded by every GSD command. Keeps cross-session context lean and current.
> Updated by `/gsd:transition`, `/gsd:complete-milestone`, and other workflow commands.

## Project

**Name:** B-Knowledge — Permission System Overhaul
**Type:** Brownfield extension of an existing monorepo
**Primary directory:** `/mnt/d/Project/b-solution/b-knowledge`
**Initialized:** 2026-04-07

## Current Milestone

**M1 — Permission System Overhaul**
Consolidate the two coexisting authorization systems (static `rbac.ts` + CASL `ability.service.ts`) into a single CASL engine fed from a DB-backed permission registry, with feature-level coverage across all 22 BE modules and resource-grant scoping for KnowledgeBase + DocumentCategory.

**Status:** Initialized — research, requirements, and roadmap complete. Ready for `/gsd:plan-phase 1`.

## Active Phase

**None.** Phase 1 verified and complete. Next action: `/gsd:plan-phase 2` (Ability Engine + Regression Snapshots).

## Phase Pipeline

| # | Name | Status | Plans | Depends on |
|---|---|---|---|---|
| 1 | Schema, Registry, Boot Sync | ✓ DONE (verified PASS, 5/5) | 6 (P1.0–P1.5) | — |
| 2 | Ability Engine + Regression Snapshots | Pending | 5 | P1 |
| 3 | Middleware Cutover | Pending | — | P2 |
| 4 | FE Catalog + `<Can>` Codemod | Pending | — | P3 |
| 5 | Admin UI Rewrite | Pending | — | P4 (partial) |
| 6 | Legacy Cleanup + OpenSearch Integration | Pending | — | P3 |
| 7 | Should-Haves (SH1, SH2) | Optional | — | P6 |

## Phase 1 Outcome

- **34/34 permissions tests passing** (5 suites: migrations, backfill, registry, sync, role-seed)
- **81 permissions** registered across 21 BE modules
- **209 day-one role_permissions rows** seeded (super-admin 80, admin 80, leader 46, user 3)
- **Zero user-visible behavior change** — no routes, middleware, services, FE, or `rbac.ts` touched
- Boot sync wired at `be/src/app/index.ts:168` between migrations and root-user bootstrap, fail-safe via try/catch
- See `.planning/phase-01-schema-registry-boot-sync/VERIFICATION.md` for full evidence

### Carry-forward IOUs (from Phase 1 verification)

1. **129 pre-existing BE test failures** — unrelated to Phase 1, but worth a dedicated cleanup phase. Phase 1 added zero new failures.
2. **sync.test.ts typed-cast hack** — temporarily reassigns `ModelFactory.permission`'s `knex` field for scratch-DB isolation. The clean fix is a per-test ModelFactory instance; deferred.
3. **NULL-distinct workaround in P1.5 seed** — relies on app-layer pre-filter. Postgres 15+ `NULLS NOT DISTINCT` could simplify in a future migration.
4. **Snapshot baselining** — `role-seed.test.ts` uses `toMatchSnapshot()` which becomes a tripwire whenever the registry changes; intentional but worth documenting.
5. **Boot sync failure mode** — currently logs and continues. After Phase 3 cutover (when CASL becomes the active auth path), revisit and consider making sync failures fatal.
6. **`subject` field semantics** — every `.permissions.ts` file declares a subject string; Phase 2 must align these with CASL Subjects type and reconcile FE/BE drift (Subjects in `fe/src/lib/ability.tsx` still has legacy `Project`).

## Configuration

- **Mode:** YOLO (auto-approve)
- **Granularity:** standard (5–8 phases, 3–5 plans each)
- **Parallelization:** enabled
- **Commit docs:** yes
- **Model profile:** quality (Opus for research/roadmap, Sonnet for others)
- **Workflow agents:** research ✓ · plan-check ✓ · verifier ✓ · nyquist-validation ✓ · auto-advance ✓

## Locked Decisions (from questioning + research)

| Topic | Decision |
|---|---|
| Engine | Single CASL engine fed from DB catalog (kill static `rbac.ts`) |
| Permission model | RBAC + per-user allow + deny overrides |
| Resource grants (this milestone) | KnowledgeBase + DocumentCategory; per-Document next milestone |
| Resource grant table | Rename + extend existing `knowledge_base_entity_permissions` → `resource_grants` |
| `manage` action | Derived only — registry has view/create/edit/delete |
| KB → Category cascade | Cascade for `read`; independent for write actions |
| OpenSearch integration | Strategy A — translate grants → `dataset_id` IN-list; no chunk schema changes |
| Super-admin tenant scope | Stays cross-tenant `manage all` |
| Catalog delivery | Runtime fetch via `GET /api/permissions/catalog` |
| FE rollout | Codemod-assisted migration from `isAdmin` prop drilling → `<Can>` |
| Legacy aliases | Remove `superadmin` (no hyphen) and `member` from code + DB default |
| Schema changes | All via Knex migrations |

## Key Artifacts

- `.planning/PROJECT.md` — context, core value, evolution rules
- `.planning/REQUIREMENTS.md` — TS1–TS15 + SH1–SH4 + acceptance test matrix
- `.planning/ROADMAP.md` — 7 phases, plans, dependency DAG, risk mapping
- `.planning/config.json` — workflow preferences
- `.planning/codebase/` — codebase map (7 docs)
- `.planning/research/` — investigation outputs (7 docs)

## Git State

### Initialization
| Commit | What |
|---|---|
| `8666102` | docs: initialize permission-system overhaul project (PROJECT.md) |
| `cc0b9e8` | chore: add project config (config.json) |
| `a9dc8a0` | docs: add permission overhaul research |
| `7a28e93` | docs: add permission overhaul requirements |
| `62be50a` | docs: add permission overhaul roadmap |
| `b749d35` | docs: initialize project state |

### Phase 1 (planning)
| Commit | What |
|---|---|
| `e614355` | docs(phase-1): add research |
| `17c98fe` | docs(phase-1): amend schema decisions from research |
| `ec741b6` | docs(phase-1): add plan |
| `f243c5d` | docs(phase-1): apply plan-checker fixes |
| `0c13666` | docs(phase-1): amend PLAN.md schema (subject col, tenant_id, effect in unique) |

### Phase 1 (execution)
| Commit | What |
|---|---|
| `f2f8cfb` | chore(tests): scaffold be/tests/permissions/ + scratch-DB helper for Phase 1 |
| `06faab0` | chore(test): register tsx ESM loader for vitest forks so Knex can load .ts migrations |
| `b4cdf6c` | feat(db): add permission tables and rename entity_permissions → resource_grants |
| `53c069a` | fix(test): repair P1.1 migration test fixtures and roundTrip helper |
| `cae200b` | feat(db): backfill tenant_id and actions on resource_grants |
| `6727911` | feat(permissions): scaffold per-module permission registry for all 21 BE modules |
| `9c71d24` | feat(permissions): add Permission/RolePermission models and boot-time catalog sync |
| `6be5e68` | feat(permissions): seed day-one role permissions from legacy ROLE_PERMISSIONS map |
| `1cd4806` | docs(phase-1): verification — PASS, 5/5 requirements met |

## Key Risks (top 5 — full list in research/RISKS.md)

| ID | Risk | Mitigated in |
|---|---|---|
| R-1 | Static `rbac.ts` shim cutover may cause 401s mid-deploy | Phase 3 (with Phase 2 regression snapshots as safety net) |
| R-2 | Redis ability cache must be invalidated globally on rollout | Phase 2 (cache prefix bump) + Phase 3 cutover |
| R-5 | `document_categories` has no `tenant_id` — naive grants force 3-table join | Phase 1 (denormalize at insert) |
| R-7 | FE has ~50 sites of `isAdmin` prop drilling, type drift between BE/FE Subjects | Phase 4 (codemod) |
| R-8 | Mixed-mode auth in `users.routes.ts` (uses both `requirePermission` and `requireAbility`) | Phase 3 (normalize to canonical form) |

## Next Action

Run `/gsd:plan-phase 1` to plan the foundation phase (schema, registry, boot sync).

---
*Last updated: 2026-04-07 after roadmap completion.*
