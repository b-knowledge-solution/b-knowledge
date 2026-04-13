# Phase 4: FE Catalog + `<Can>` Codemod — Context

**Gathered:** 2026-04-08
**Status:** Ready for planning
**Depends on:** Phase 3 (catalog endpoint `GET /api/permissions/catalog` live)

<domain>
## Phase Boundary

Migrate every frontend authorization check from raw role-string comparisons (`user.role === 'admin'`, `'leader'`, `'member'`, `'superadmin'`) and `isAdmin` props to catalog-driven primitives (`<Can>` or `useHasPermission(key)`). Align the CASL `Subjects` union to the new BE entity model. Add an ESLint rule to prevent regressions. **Zero visible behavior change.**

Scope: ~55 occurrences across 12 files in `fe/src/`. Out of scope: admin UI rewrite (Phase 5), backend changes (already done in Phases 1-3).

</domain>

<decisions>
## Implementation Decisions

### Primitive Strategy
- **D-01: Both `<Can>` and `useHasPermission(key)` coexist with a documented rule.**
  - `<Can I="action" a="Subject">` for typed subject-level checks — especially when CASL conditions matter (per-tenant, per-owner, per-instance reasoning).
  - `useHasPermission('feature.action')` for flat catalog-key gates with no subject instance reasoning.
  - Decision tree to be added to `fe/CLAUDE.md` so future contributors know which to reach for.

### Codemod Behavior
- **D-02: Conservative codemod + per-file commits.**
  - Codemod (`scripts/codemod-permissions.mjs`) only rewrites mechanical 1:1 patterns: `isAdmin` props, bare `user.role === 'admin'` boolean checks, simple ternaries.
  - Anything embedded in complex expressions, conditional JSX with side effects, or query-enable/sort/filter logic gets a `// TODO(perm-codemod): review` comment instead of being auto-rewritten.
  - **One commit per migrated file** so each diff is independently reviewable and revertable. The 12 files become ~12 commits in this phase.
  - The codemod ships with before/after fixture tests so it remains a repeatable enforcement tool, not throwaway scaffolding (paired with the P4.5 ESLint rule).

### Subjects Type Migration
- **D-03: Atomic single-commit Subjects union swap.**
  - One commit drops legacy `Project`, adds `KnowledgeBase`, `Agent`, `Memory`, `DocumentCategory` to the `Subjects` union in `fe/src/lib/ability.tsx`.
  - TypeScript compile errors become the migration checklist — every site that referenced `Project` must be fixed in the same commit (or its follow-on per-file commits from D-02).
  - **No transition window** where both old and new are valid — that prevents new code from being merged against the deprecated subject during the migration.

### Catalog Source (REVISED 2026-04-08 after research finding)
- **D-04 (REVISED): Snapshot-only — no runtime catalog fetch in Phase 4.**
  - **Why revised:** Research found that `GET /api/permissions/catalog` is gated by `permissions.view`, which Phase 3 seeded only to `admin` and `super-admin`. A boot-time fetch would 403 for every non-admin user, locking them out of the app shell. The original D-04 ("block render until catalog loads") is therefore unsafe.
  - **New approach:** The BE produces `permissions-catalog.json` via a script (or the existing seed exporter); the file is checked in at `fe/src/generated/permissions-catalog.json`. The build-time generator from D-05 reads this snapshot and produces `permission-keys.ts`. **There is no runtime fetch in Phase 4.**
  - **Loading model:** Trivial — the catalog is a static import. No provider blocking, no retry UI, no failure path. The existing `AbilityProvider` (which fetches `/api/auth/abilities`) is unchanged; only the catalog primitive is added alongside it as a pure compile-time artifact.
  - **Honors TS10's intent** (the FE has the catalog) without violating the zero-behavior-change criterion or breaking non-admin login.
  - **Phase 7 (SH1 hot-reload) reintroduces a runtime fetch** with proper auth scoping, at which point the `permissions.view` gating must also be widened or a public `permissions.catalog.read` seed added. That's Phase 7's problem, not Phase 4's.
  - **Catalog freshness in dev/CI:** the BE script that emits the snapshot must be runnable independently (`npm run permissions:export-catalog` or similar — planner to spec). Snapshot is regenerated whenever the BE registry changes; the file is git-tracked so PRs surface drift.

### Catalog Key Naming
- **D-05: Generated TS const file at build time.**
  - A generator script produces `fe/src/constants/permission-keys.ts` from the live catalog (run as part of build, or as a script the codemod invokes before sweep).
  - All call sites use `useHasPermission(PERMISSION_KEYS.DATASET_CREATE)` — never bare strings.
  - Honors the project-wide no-hardcoded-strings rule from root `CLAUDE.md`.
  - Strongest typo guardrail: typos surface at edit time (TS error + no autocomplete), not at lint or runtime.

### Sequencing Constraint (consequence of D-02 + D-05 + D-04 revised)
- **D-06: Snapshot → generator → codemod, in that order.**
  - **Step 1:** BE exports `permissions-catalog.json` (one-time script during Phase 4; later runs whenever the BE registry changes).
  - **Step 2:** Generator reads the snapshot and emits `fe/src/constants/permission-keys.ts`.
  - **Step 3:** Codemod imports from `PERMISSION_KEYS` and rewrites call sites to reference those constants.
  - **Planner must NOT parallelize the snapshot export with codemod runs.** The codemod script can be *written* in parallel with the generator and snapshot export (Wave 1), but it cannot *execute against the codebase* until both upstream artifacts exist (Wave 2+).
  - The codemod must also explicitly skip the 3 dangerous site classes (see "Codemod Skip List" in research).

### Codemod Skip List (must be explicit in P4.3)
- **`fe/src/features/teams/api/teamQueries.ts`** — role checks here drive query `enabled:` flags, not UI gates. Touching them changes data fetching behavior.
- **`fe/src/features/knowledge-base/components/KnowledgeBaseMemberList.tsx` (lines ~139-142)** — switch-case for badge rendering, not authorization.
- **`fe/src/features/guideline/`** — uses ordinal role comparison; deferred to Phase 6 cleanup. Out of Phase 4 scope.
- **Codemod glob restriction:** `**/*.{ts,tsx}` only. Never `.json`, `.md`, or i18n files.

### Claude's Discretion
- ESLint rule mechanics for P4.5 (which rule package, where it lives, error message wording).
- Exact file structure for the catalog provider (single file vs. provider + hook + generator separation).
- Test framework choice for codemod fixtures (vitest is the FE convention per fe/CLAUDE.md).
- Naming convention for `PERMISSION_KEYS` constants (SCREAMING_SNAKE vs other) — pick the one that matches existing FE constants.

### Folded Todos
None — no pending todos matched Phase 4 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` §"Phase 4: FE Catalog + `<Can>` Codemod" — phase goal, plans P4.1–P4.5, parallelization, verification criteria
- `.planning/REQUIREMENTS.md` — TS10 (FE catalog + gates), TS11 (FE codemod sweep), R-4 (FE constants rule violation)
- `.planning/PROJECT.md` — vision and principles

### Existing Frontend Authorization
- `fe/src/lib/ability.tsx` — current CASL provider, `<Can>` re-export, `useAppAbility()` hook, the `Subjects` union being modified
- `fe/CLAUDE.md` — frontend conventions (API layer split, no manual memoization, hook placement rules, i18n requirement)
- `fe/src/constants/roles.ts` — current role constants (still in use during transition; reviewed but not deleted in this phase)

### Project-Wide Coding Standards
- `CLAUDE.md` §"No Hardcoded String Literals in Comparisons" — drives D-05 (generated const file)
- `CLAUDE.md` §"Documentation Comments (Mandatory)" — JSDoc requirements for new exports

### Phase 3 Output (catalog endpoint)
- `.planning/phase-03-middleware-cutover/PLAN.md` — defines the catalog endpoint shape that Phase 4 consumes; researcher must read the endpoint contract section
- `.planning/phase-03-middleware-cutover/3-RESEARCH.md` — background on the BE permission registry whose keys flow into the FE catalog

### Codemod Sites (from roadmap research, ~50 sites / 12 files)
- `fe/src/features/datasets/components/DocumentTable.tsx` — 10 occurrences (highest concentration)
- `fe/src/features/knowledge-base/components/StandardTabRedesigned.tsx` — line 371 area
- `fe/src/features/teams/api/teamQueries.ts` — line 292 area (raw role strings in query logic)
- `fe/src/layouts/Sidebar.tsx`, `fe/src/layouts/sidebarNav.ts` — nav gating
- `fe/src/app/App.tsx`, `fe/src/app/routeConfig.ts` — route guards
- `fe/src/features/auth/components/AdminRoute.tsx` — route guard component
- Researcher should produce the complete authoritative list via grep — the above is the spot-check set.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`fe/src/lib/ability.tsx`** — CASL provider already wired. Phase 4 extends it (new Subjects, parallel catalog fetch) rather than replacing it.
- **`Can` re-export from `@casl/react`** — `createContextualCan(AbilityContext.Consumer)`. Already typed against `AppAbility`. New code uses this directly.
- **`useAuth` from `@/features/auth`** — provides session; `AbilityProvider` already subscribes to it. Catalog fetch should hook into the same lifecycle.
- **TanStack Query** — established data-fetching pattern. Catalog fetch should be a query hook in `lib/permissionsQueries.ts` (per fe/CLAUDE.md naming: `<domain>Api.ts` + `<domain>Queries.ts`, NOT `*Service.ts`).

### Established Patterns
- **No manual memoization** — React Compiler handles it. Don't add `useMemo`/`useCallback` to the new provider/hook.
- **`hooks/` for UI hooks; `useQuery`/`useMutation` go in `api/<domain>Queries.ts`** — `useHasPermission` is a UI hook (it consumes context, not a query directly), so it lives in `lib/` next to `ability.tsx`. The catalog fetch query lives in an api layer.
- **Constants files** — `fe/src/constants/` holds shared constants; `permission-keys.ts` (generated) goes here.
- **i18n triple** — every new user-facing string needs `en` + `vi` + `ja`. Phase 4 should produce zero new strings (it's a behavior-preserving migration), but the retry UI from D-04 may need a translation key.

### Integration Points
- **App root** (`fe/src/app/App.tsx`) — where `AbilityProvider` is mounted. Catalog provider mounts here too (or is folded into the existing provider).
- **Build pipeline** — D-05 generator needs a hook into the build (vite plugin? prebuild script? researcher to recommend). The dev server also needs to run it on first start.
- **ESLint config** (P4.5) — extend existing config to ban `user.role ===` comparisons outside `fe/src/features/auth/` and `fe/src/constants/roles.ts`.

</code_context>

<specifics>
## Specific Ideas

- The codebase **already uses CASL** — Phase 4 is not introducing it, it's adding catalog awareness on top. The mental model for the planner: "augment the existing CASL setup with a parallel catalog primitive, then sweep the role-string comparisons that predate CASL."
- The user explicitly wants per-file review of the codemod output (roadmap: "Per-file codemod diffs reviewed by user"). D-02 honors this by structuring the work as per-file commits instead of one big PR.
- The user values the no-hardcoded-strings rule strongly enough that it has its own CLAUDE.md memory entry — D-05 (generated const file) is the only choice consistent with that.

</specifics>

<deferred>
## Deferred Ideas

- **Permission UI for end-users** ("what can I do?" self-service page) — belongs in Phase 7 or beyond, not Phase 4.
- **Catalog hot-reload via Socket.IO** — versioning/refresh is explicitly Phase 7 (SH1).
- **Removing legacy `roles.ts` constants** — Phase 6 (Legacy Cleanup). Phase 4 leaves them in place because the auth module still references them.
- **Migrating non-CASL imperative checks (e.g., backend abilities-driven feature flags)** — out of scope; this phase is about the FE gating layer only.

</deferred>

---

*Phase: 04-fe-catalog-can-codemod*
*Context gathered: 2026-04-08*
