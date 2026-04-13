# Phase 4: FE Catalog + `<Can>` Codemod — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 4-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 04-fe-catalog-can-codemod
**Areas discussed:** Catalog vs CASL coexistence, Codemod aggressiveness & review, Subjects type migration, Catalog loading & key naming

---

## Catalog vs CASL coexistence

| Option | Description | Selected |
|--------|-------------|----------|
| Both, with a documented rule | `<Can>` for typed subject-level checks; `useHasPermission(key)` for flat catalog-key gates. Document decision tree in `fe/CLAUDE.md`. | ✓ |
| `useHasPermission` only — deprecate `<Can>` | Catalog keys as sole source of truth; codemod rewrites all `<Can>` usages too. | |
| `<Can>` only — wrap catalog under it | `useHasPermission` becomes thin internal helper; catalog keys mapped to action+subject. | |
| Both, no formal rule — pick per-site | Developers choose case-by-case; fastest but inconsistent. | |

**User's choice:** Both, with a documented rule
**Notes:** Plays to each tool's strength. `<Can>` keeps CASL's subject conditions; `useHasPermission` is the natural fit for flat catalog rows. The decision tree in `fe/CLAUDE.md` is the cost.

---

## Codemod aggressiveness & review

| Option | Description | Selected |
|--------|-------------|----------|
| Conservative + per-file commits | Mechanical 1:1 only; ambiguous sites get `// TODO(perm-codemod): review` comments; one commit per file. | ✓ |
| Aggressive + single PR | Codemod rewrites everything pattern-matchable; one big PR. | |
| Conservative + single PR | Mechanical-only but bundled into one PR. | |
| Aggressive + per-file commits | Maximum rewrites split per file. | |

**User's choice:** Conservative + per-file commits
**Notes:** The dangerous sites are the embedded ones (`teamQueries.ts:292`, `StandardTabRedesigned.tsx:371`) where role checks live inside conditional JSX with side effects. Conservative + TODO surfaces those for human review without burying wrong rewrites in a 55-site diff. Per-file commits make each independently revertable.

---

## Subjects type migration

| Option | Description | Selected |
|--------|-------------|----------|
| Atomic — single commit, TS-guided fixes | Drop `Project`, add new subjects in one commit; TS errors become the migration checklist. | ✓ |
| Additive first, remove `Project` later | Two-commit safer-merge approach with a transition window. | |
| Loose `string` Subjects during transition | Widen Subjects to `string`, run codemod, re-narrow. | |

**User's choice:** Atomic — single commit, TS-guided fixes
**Notes:** Turns the type system into a safety net. No transition window means no risk of new code being merged against the deprecated `Project` subject during migration. The codemod handles bulk; TS errors catch the rest.

---

## Catalog boot fetch behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Block render until catalog loads | App shell renders, gated content waits for catalog. Consistent with existing `AbilityProvider`. | ✓ |
| Deny-by-default until ready | Render immediately, gates flip when catalog arrives. Causes UI flicker. | |
| Cached hydrate from localStorage | Fastest perceived boot; risks briefly showing stale gates. | |

**User's choice:** Block render until catalog loads
**Notes:** Matches existing app loading model. Deny-by-default would violate the "zero visible behavior change" acceptance criterion (UI would flicker as gates resolve).

---

## Catalog key naming

| Option | Description | Selected |
|--------|-------------|----------|
| Generated TS const file at build time | `fe/src/constants/permission-keys.ts` generated from live catalog; `useHasPermission(PERMISSION_KEYS.DATASET_CREATE)`. | ✓ |
| Plain strings + ESLint rule | `useHasPermission('dataset.create')`; ESLint validates against catalog. | |
| Runtime enum from catalog response | No static typing; typos surface at runtime. | |

**User's choice:** Generated TS const file at build time
**Notes:** Matches the project-wide no-hardcoded-strings rule (CLAUDE.md). Strongest typo guardrail — TS error + autocomplete + refactor-safe. Triggered the D-06 sequencing constraint (generator must run before codemod).

---

## Claude's Discretion

User explicitly left these to Claude during planning:
- ESLint rule mechanics for P4.5 (package, location, error message)
- Catalog provider file structure (single file vs. split provider/hook/generator)
- Codemod fixture test framework (vitest is FE convention)
- `PERMISSION_KEYS` constant naming convention (match existing FE constants style)

## Deferred Ideas

- End-user "what can I do?" self-service page — Phase 7+
- Catalog hot-reload via Socket.IO — Phase 7 (SH1)
- Removing legacy `roles.ts` constants — Phase 6
- Migrating non-CASL imperative role checks outside FE gating — out of scope
