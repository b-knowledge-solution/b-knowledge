# Phase 6: Legacy Cleanup + OpenSearch Integration — Context

**Gathered:** 2026-04-09
**Status:** Ready for planning
**Depends on:** Phase 3 (V2 ability engine live), Phase 4 (FE already clean of `'member'`/`'superadmin'`), Phase 5 (admin UI for grants shipped)

<domain>
## Phase Boundary

Two independent cleanup/integration workstreams that share a milestone slot:

1. **Legacy role alias removal** — Purge `'superadmin'` and `'member'` string aliases from BE code, DB data, seeds, column defaults, and add a CI guard to prevent regressions. Net-zero user-visible behavior change.
2. **RAG grant enforcement (Strategy A)** — Teach `buildOpenSearchAbacFilters` to emit a `terms { dataset_id: [...] }` clause derived from the user's `resource_grants` rows (KB + DocumentCategory), so that RAG search results respect explicit grants. Behavior change is additive — users with grants see more, users without grants see identically to today.

**In scope:**
- P6.1 DB migration: UPDATE legacy role values, flip `users.role` default `'member'` → `'user'`, update `00_sample_users.ts` seed.
- P6.2 Exhaustive BE code alias removal across **all 7+ sites** found by grep (not just the 3 listed in ROADMAP), plus a new `npm run check:legacy-roles` CI grep script.
- P6.3 OpenSearch grant filter extension in `be/src/shared/services/ability.service.ts#buildOpenSearchAbacFilters`, honoring KB + DocumentCategory grants and `expires_at` enforcement.
- P6.4 Integration test covering parity (zero-grant user) + positive grant (category grant → filtered results) + no-access (no-grants user on private KB).
- P6.5 **REPURPOSED** — ADMIN_ROLES shim audit: document every usage, add an ADR-style note explaining intentional preservation until milestone 2. No code rewrites.

**Out of scope (deferred or other phases):**
- Strategy B (chunk-level scoping, chunk schema changes) — explicitly deferred by roadmap.
- Cross-language constants for chunk fields (R-3) — only applies if Strategy B is ever adopted.
- `expires_at` UI for admins to set grant expiration → Phase 7 SH2 (now UI-only since enforcement moved into P6.3).
- Catalog version hash / FE hot-reload → Phase 7 SH1.
- Full ADMIN_ROLES → `useHasPermission` migration → deferred to milestone 2.
- Any FE changes beyond the CI grep script (FE was purged in Phase 4).

</domain>

<decisions>
## Implementation Decisions

### P6.1 — Legacy Alias DB Migration

- **D-01: Single atomic migration — pre-check + UPDATE + DEFAULT flip in one file.**
  - Step 1: `SELECT COUNT(*) FROM users WHERE role NOT IN ('user','member','admin','super-admin','superadmin','leader')` — if > 0, **abort** with a descriptive error listing the offending values. Prevents silently migrating into an inconsistent state.
  - Step 2: `UPDATE users SET role='user' WHERE role='member'`
  - Step 3: `UPDATE users SET role='super-admin' WHERE role='superadmin'`
  - Step 4: `ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user'`
  - UPDATEs are naturally idempotent (WHERE clause matches 0 rows on re-run).

- **D-02: Seeds updated in the same plan boundary (P6.1).**
  - `be/src/shared/db/seeds/00_sample_users.ts:295` — `role: 'member'` → `role: 'user'`.
  - Seeds and migration default flip land together for conceptual atomicity, even though they touch different files.

- **D-03: Down migration restores column default only.**
  - `ALTER TABLE users ALTER COLUMN role SET DEFAULT 'member'` — revert the default.
  - Intentionally does **not** reverse the UPDATEs. The role rename is one-way data; reversing would require a backup column and future cleanup. The Phase 3 `USE_ABILITY_ENGINE_V2=false` feature flag is the real safety net for behavior rollback, not a DB-level undo.

### P6.2 — Code Alias Removal

- **D-04: Exhaustive BE sweep — fix all occurrences, not just ROADMAP list.**
  - ROADMAP calls out 3 sites; `grep -rn "UserRole.SUPERADMIN" be/src` finds **7+**. Anything less fails the phase's own verification grep.
  - Known sites to fix (non-exhaustive — planner must re-grep):
    - `be/src/modules/chat/services/chat-assistant.service.ts:127, 257`
    - `be/src/modules/knowledge-base/services/knowledge-base.service.ts:29`
    - `be/src/modules/rag/services/rag.service.ts:318`
    - `be/src/modules/search/services/search.service.ts:191, 316`
    - `be/src/modules/sync/controllers/sync.controller.ts:71`
    - `be/tests/{projects,chat,search}/**` fixtures and assertions
  - Delete `UserRole.SUPERADMIN` and `UserRole.MEMBER` from `be/src/shared/constants/roles.ts`. Leave `TeamRole.MEMBER` alone (different domain, roadmap-confirmed).
  - **Mechanical rewrite rule:** `UserRole.SUPERADMIN` → `UserRole.SUPER_ADMIN` (or whatever the canonical new enum key is — planner should verify against current `roles.ts`). `UserRole.MEMBER` → `UserRole.USER`.

- **D-05: CI grep script (not ESLint) as the regression guard.**
  - Add `scripts/check-legacy-roles.sh` (or equivalent npm script `npm run check:legacy-roles`).
  - Runs `grep -rn "'superadmin'\|'member'" be/src fe/src advance-rag` with an exclude list for `TeamRole` references.
  - Wired into the existing `npm run lint` meta-task and/or CI workflow so every PR gates on it.
  - **Why not ESLint:** grep catches Python + SQL + new file types; ESLint wouldn't. Phase 4's existing `<Can>` ESLint rule already covers role-string comparisons in FE, so no duplication.

### P6.3 — OpenSearch Grant Filter (Strategy A)

- **D-06: Zero-grant users get role-default behavior only (no filter clause emitted).**
  - When `resource_grants` walk returns an empty dataset_id set, `buildOpenSearchAbacFilters` does **not** add a grant clause. User sees exactly what they see today.
  - This is the parity acceptance test: "User with no grants beyond role default → identical results to pre-P6.3."

- **D-07: Both KB grants and DocumentCategory grants resolve to a flat `dataset_id` set.**
  - KB grant (`resource_type='knowledge_base'`) → include that KB's datasets directly.
  - DocumentCategory grant (`resource_type='document_category'`) → resolve to all datasets in the category via JOIN (or pre-computed map — planner to decide based on query cost).
  - Union both into one `terms { dataset_id: [...] }` clause emitted as a single OpenSearch filter.
  - **Why flat set:** chunk schema changes are explicitly out of scope, so the only dimension we can filter on is `dataset_id`. Separate `category_id` clauses would require adding `category_id` to chunk documents — that's Strategy B territory.

- **D-08: Filter composition — `tenant AND (role_base OR grants)`.**
  - The mandatory tenant filter from `buildAccessFilters()` stays as the first clause — **security invariant**, grants cannot punch through tenant isolation.
  - Within the tenant, the role-base clause OR'd with the grant clause. Grants expand access; they never shrink it.
  - If user has role defaults AND grants, they see the union. If user has only role defaults (D-06), grant clause is absent.

- **D-09: `expires_at` enforcement lands in P6.3.**
  - The grant walk SQL includes `WHERE (expires_at IS NULL OR expires_at > NOW())`.
  - Expired grants are silently skipped (no error, no warning — they're just not in the set).
  - **Scope impact:** Phase 7 SH2 shrinks to "admin UI for setting/editing expires_at" since enforcement is no longer needed there.

### P6.4 — Integration Test

- **D-10: Three-case acceptance test suite.**
  - Case 1 (parity): user with no grants, queries a KB they already have role access to → result set identical to pre-P6.3 baseline.
  - Case 2 (positive grant): user has category grant on KB X, queries → results filter to KB X's chunks only.
  - Case 3 (no access): user has zero grants AND no role access to private KB Y, queries → zero chunks returned from KB Y.
  - **Claude's Discretion:** Test infra choice (real OS via docker-compose.test vs mocked OS client vs seeded fixture in dev OS) is a planner decision. Prefer whichever matches existing test patterns in `be/tests/search/` or `be/tests/rag/`.

### P6.5 — ADMIN_ROLES Shim Audit (REPURPOSED)

- **D-11: P6.5 is now an R-9 documentation pass, not a shim drop.**
  - ROADMAP's original P6.5 ("drop dual-write to `knowledge_base_entity_permissions`") is stale — that table was already renamed to `resource_grants` in Phase 1 migration `20260407052129`. There is no dual-write to drop.
  - Repurpose P6.5 to: grep every `ADMIN_ROLES` usage in `be/src`, add a one-line rationale comment at each site (e.g. `// ADMIN_ROLES preserved per R-9 — tenant-level metadata gate, not a feature check`), and write `.planning/codebase/ADMIN_ROLES-preservation.md` (or equivalent ADR-style note) explaining the intentional deferral until milestone 2.
  - **No code rewrites.** This is pure documentation. R-9 itself stays deferred.

### Claude's Discretion

The following are explicitly left to the planner/executor:
- Exact naming of the CI grep script and its npm script entry
- P6.4 test harness choice (real OS / mocked / seeded fixture)
- Whether P6.3's grant walk SQL lives in the ability service or a new model method
- Whether P6.5 comment-insertion is automated via a codemod or done manually (likely manual — few sites)
- Commit granularity within P6.2 (one per module vs one per file)

### Folded Todos

None — `todo match-phase 6` returned zero matches.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### ROADMAP + Requirements
- `.planning/ROADMAP.md` §"Phase 6: Legacy Cleanup + OpenSearch Integration" — plan skeleton (note: P6.5 is stale, see D-11)
- `.planning/REQUIREMENTS.md` — TS9, TS13 (RAG grant enforcement requirements)
- `.planning/PROJECT.md` — milestone M1 vision
- `.planning/STATE.md` — current project state (note: also stale, still says Phase 3 active)

### Prior Phase Contexts (for consistency)
- `.planning/phase-01-schema-registry-boot-sync/1-CONTEXT.md` — `resource_grants` schema, `actions[]` column, boot guardrail
- `.planning/phase-02-ability-engine-regression-snapshots/2-CONTEXT.md` — `buildOpenSearchAbacFilters` location and contract
- `.planning/phase-04-fe-catalog-can-codemod/4-CONTEXT.md` — FE already clean of legacy role strings (D-02 codemod, D-04 snapshot strategy)
- `.planning/phase-05-admin-ui-rewrite/5-CONTEXT.md` — grant management UI shipped; admin UI is the producer of the grants P6.3 consumes

### Key BE Source Files (for grep/analysis, not authority)
- `be/src/shared/services/ability.service.ts` — `buildOpenSearchAbacFilters` extension point for P6.3
- `be/src/shared/constants/roles.ts` — `UserRole` enum; delete `SUPERADMIN` + `MEMBER` entries here
- `be/src/shared/db/migrations/20260407052129_phase1_rename_entity_permissions_to_resource_grants.ts` — evidence that the dual-write table P6.5 originally targeted no longer exists
- `be/src/shared/db/migrations/20260312000000_initial_schema.ts:93` — current `users.role` default `'member'` (flipped in P6.1)
- `be/src/shared/db/seeds/00_sample_users.ts:295` — seed role `'member'` (updated in P6.1)

### External Specs / Docs
- None explicitly referenced by the user during discussion. If `MIGRATION_PLAN.md` exists at repo root, the planner should check it since ROADMAP mentions it — but its contents were not validated during this discussion.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`buildOpenSearchAbacFilters`** (ability service) — single extension point for P6.3. Already OR-composes clauses within the tenant filter, so D-08 fits the existing shape.
- **`buildAccessFilters`** — produces the mandatory tenant filter clause that must remain first (D-08).
- **`ResourceGrantModel`** (from Phase 1) — already has actions[] semantics; extend with a `findByGranteeWithExpiryCheck` method or similar for P6.3's walk.
- **Phase 4 ESLint rule** — already flags role-string comparisons in FE. P6.2's CI grep script complements, doesn't duplicate.
- **Phase 1 boot guardrail** in `be/src/app/index.ts:203-216` — demonstrates the "fail fast on DB invariant" pattern that P6.1's pre-check should mirror.

### Established Patterns
- **Migration idempotency** — existing migrations in `be/src/shared/db/migrations/` use `IF EXISTS`, `IF NOT EXISTS`, and `WHERE` guards. P6.1 follows this convention.
- **Singleton services + factory-pattern models** — P6.3 should extend existing `ability.service.ts` singleton, not introduce a new service.
- **Zod validation at the boundary** — not directly relevant to P6 (no new mutating routes), but any new endpoints should follow.

### Integration Points
- **`buildOpenSearchAbacFilters`** call sites (consumers of the extended filter) — planner should trace every caller via `code-review-graph get_impact_radius` to confirm no regressions.
- **`rbac.ts` shim** (thin generated shim from Phase 3) — should be untouched by Phase 6 unless grep finds `'member'`/`'superadmin'` there.
- **`UserRole` consumers** across the 7+ BE modules — each needs a careful rewrite, not a blind sed.

</code_context>

<specifics>
## Specific Ideas

- **"Exhaustive, not list-driven"** — the user explicitly chose to treat the ROADMAP file list as a starting point, not a ceiling. P6.2 must re-grep as its first step and fix whatever it finds.
- **"CI grep, not ESLint"** — preference for the simpler, language-agnostic guardrail.
- **"Zero behavior change for the majority"** — this phrase shapes D-06 and the P6.4 parity test. Users without grants must see identical results.
- **"Grants expand, never shrink"** — D-08 composition rule; grants are never intersected with role defaults.
- **"Phase 3 V2 flag is the real rollback"** — D-03 rationale for not reversing the UPDATE in the down migration.

</specifics>

<deferred>
## Deferred Ideas

- **Phase 7 SH2 scope reduction** — `expires_at` enforcement now happens in P6.3 (D-09). Phase 7 SH2 is left with only the admin UI for setting/editing expiration. **Action for Phase 7 planner:** re-scope SH2 in the ROADMAP before planning.
- **ROADMAP refresh** — Two staleness issues surfaced: (1) P6.2 file list is incomplete (3 sites listed, 7+ exist), (2) P6.5 references `knowledge_base_entity_permissions` which has been renamed. ROADMAP should be updated after Phase 6 completes, but **not during** this discussion — out of scope for discuss-phase.
- **STATE.md is stale** — still says Phase 3 is active when Phases 4 and 5 have shipped. Should be refreshed by plan-phase or execute-phase, not here.
- **R-9 ADMIN_ROLES full migration** — intentionally deferred to milestone 2. P6.5 only documents intent; actual `useHasPermission` conversion waits.
- **Strategy B (chunk-level scoping)** — explicitly out of scope. If adopted in a future milestone, R-3 cross-language constants apply.
- **FE catalog version hash / hot-reload** — Phase 7 SH1.
- **ADMIN_ROLES audit producing surprises** — if P6.5 discovers that some `ADMIN_ROLES` uses are actually bugs (e.g. should be a permission check, not a role gate), those become backlog items for milestone 2, not in-phase fixes.

### Reviewed Todos (not folded)

None — no todos matched this phase.

</deferred>

---

*Phase: 06-legacy-cleanup-opensearch-integration*
*Context gathered: 2026-04-09*
