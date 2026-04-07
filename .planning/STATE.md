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

**None yet.** Next action: `/gsd:plan-phase 1` (Schema, Registry, Boot Sync).

## Phase Pipeline

| # | Name | Status | Plans | Depends on |
|---|---|---|---|---|
| 1 | Schema, Registry, Boot Sync | Pending | 5 | — |
| 2 | Ability Engine + Regression Snapshots | Pending | 5 | P1 |
| 3 | Middleware Cutover | Pending | — | P2 |
| 4 | FE Catalog + `<Can>` Codemod | Pending | — | P3 |
| 5 | Admin UI Rewrite | Pending | — | P4 (partial) |
| 6 | Legacy Cleanup + OpenSearch Integration | Pending | — | P3 |
| 7 | Should-Haves (SH1, SH2) | Optional | — | P6 |

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

## Git State at Initialization

| Commit | What |
|---|---|
| `8666102` | docs: initialize permission-system overhaul project (PROJECT.md) |
| `cc0b9e8` | chore: add project config (config.json) |
| `a9dc8a0` | docs: add permission overhaul research |
| `7a28e93` | docs: add permission overhaul requirements |
| `62be50a` | docs: add permission overhaul roadmap |
| (this commit) | docs: initialize project state |

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
