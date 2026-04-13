---
phase: 4
phase_slug: fe-catalog-can-codemod
date: 2026-04-08
---

# Phase 4 Validation Strategy

This document satisfies Nyquist Dimension 8 (validation requirements are named,
testable, and traceable to a plan). It extracts the validation architecture
discussed in `4-RESEARCH.md` into a gated artifact.

## Testing Pyramid

| Layer | Tooling | Scope |
|-------|---------|-------|
| Unit — hook logic | Vitest + `@testing-library/react-hooks` in jsdom | `useHasPermission` returns booleans from a synthetic CASL ability (Plan 4.1 T3) |
| Unit — transform | Vitest (pure Node) driving `transformSource(src, filename)` from in-memory ts-morph project | Codemod fixture suite (Plan 4.3 T1) |
| Build-time — catalog generation | Node assertion script inside `permissions:export-catalog` / `permissions:generate-keys` npm scripts | Deterministic snapshot and typed const file (Plan 4.1 T1/T2) |
| Build-time — TypeScript | `tsc --noEmit` on the FE workspace | Subjects union (Plan 4.2 T1) and `PermissionKey`-typed call sites (Plan 4.1 T3) |
| Static — ESLint | `no-restricted-syntax` AST selectors | Future `user.role === '<literal>'` and `isAdmin` prop introductions blocked (Plan 4.5 T3) |
| Integration — Vite build | `cd fe && npm run build` | Sweep did not break imports, prop contracts, or JSX (Plans 4.2/4.4/4.5) |
| Grep regression — literal audit | Shell grep inside verification steps | No unexpected legacy patterns remain outside the allowlist (Plans 4.4, 4.5) |

## Validation Requirements (Nyquist Dimension 8)

Each row is a distinct, testable check traceable to one or more plans. Test
commands are pinned to avoid "executor figures it out" ambiguity.

| ID   | Validates                                                                 | Test Type            | Owning Plan |
|------|---------------------------------------------------------------------------|----------------------|-------------|
| V-01 | `useHasPermission(key)` returns `true` when the CASL ability contains a matching `(action, subject)` rule | Vitest unit          | 4.1 T3 |
| V-02 | `useHasPermission(key)` returns `false` for unknown keys, empty ability, and non-matching rules, with a `console.warn` on unknown keys | Vitest unit          | 4.1 T3 |
| V-03 | Passing a non-catalog string literal to `useHasPermission` is a TypeScript error (compile-time enforcement, not just runtime) | `tsc --noEmit` run ahead of the test suite — verified via a `// @ts-expect-error` line in `permissions.test.tsx` | 4.1 T3 |
| V-04 | BE exporter produces a deterministic, sorted `permissions-catalog.json` with > 50 entries, all keys matching `[a-z0-9._-]+`, no duplicates | Node assertion inside `permissions:export-catalog` verify command | 4.1 T1 |
| V-05 | FE generator produces `PERMISSION_KEYS` const object + `PermissionKey` type alias; idempotent across re-runs; `tsc --noEmit` on the generated file exits 0 | Node assertion + `tsc --noEmit` | 4.1 T2 |
| V-06 | ts-morph codemod transforms 7 fixture inputs into their expected outputs, including: `isAdmin` prop removal, `user.role` const rewrite, import insertion, TODO on ambiguous query-enable, TODO on switch-case, idempotent no-op on already-migrated file, no duplicate import on existing import, and **multi-role OR-chain left untouched with a TODO marker** (new fixture 08) | Vitest fixture-driven | 4.3 T1 |
| V-07 | FE Subjects union contains `KnowledgeBase \| Agent \| Memory \| DocumentCategory`, does NOT contain `Project`, and `cd fe && npm run build` exits 0 | grep + build       | 4.2 T1 |
| V-08 | ESLint `no-restricted-syntax` rule rejects `user.role === '<literal>'` and `isAdmin` JSX attributes introduced in a temp file under `fe/src/`, AND accepts the existing (allowlisted) auth/roles/guideline/userQueries files | Temp-file lint test + existing codebase lint | 4.5 T3 |
| V-09 | Final phase-level grep assertion: `grep -rn "user\.role ===" fe/src/` AND `grep -rn "user?\.role ===" fe/src/` return only matches inside the allowlist (`features/auth/`, `constants/roles.ts`, `features/guideline/`, `features/users/api/userQueries.ts`); `grep -rn "isAdmin" fe/src/features/` returns only matches in `features/guideline/` (or empty). Two separate plain greps are used — NOT the erroneous `\?\?` ERE from iteration 1. | Bash assertion       | 4.4 T1/T2, 4.5 T3 |
| V-10 | `cd fe && npm run test:run` exits 0 after the full sweep (pre-existing suite still green) | Vitest full run      | 4.4 T2, 4.5 T3 |

## Allowlist (scope boundary)

Files intentionally left using role-literal comparisons in Phase 4:

- `fe/src/features/auth/**` — session bookkeeping, not permission gating (Phase 5+ may revisit `RoleRoute.tsx`)
- `fe/src/constants/roles.ts` — source of truth for role constants (Phase 6 cleanup)
- `fe/src/features/guideline/**` — metadata schemas and hierarchy maps, not permission gates (Phase 6 cleanup)
- `fe/src/features/users/api/userQueries.ts` — `RoleFilter` type + filter state comparisons (non-literal RHS)
- `fe/src/features/users/types/**`, `fe/src/features/users/components/EditRoleDialog.tsx` — type-literal unions, not runtime checks

These paths are listed verbatim in the ESLint `ignores` array (Plan 4.5 T3).

## Out-of-scope assertions (intentional, deferred)

- Runtime catalog fetch correctness — deferred to Phase 7 (SH1 hot-reload). Phase 4 D-04 was revised to snapshot-only.
- `teamQueries.ts:292` role comparison in query `enabled:` logic — left in codemod skip list; Phase 5 may revisit.
- `KnowledgeBaseMemberList.tsx` switch-case on role — left in codemod skip list; Phase 5 entity-permission modal rewrite supersedes it.
