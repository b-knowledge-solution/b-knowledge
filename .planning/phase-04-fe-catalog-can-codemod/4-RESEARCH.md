# Phase 4 Research: FE Catalog + `<Can>` Codemod

**Researched:** 2026-04-08
**Domain:** Frontend authorization migration (React 19 + CASL + TanStack Query + Vite)
**Confidence:** HIGH on catalog contract + inventory; MEDIUM on codemod tooling choice (either tool works)

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01** Both `<Can>` and `useHasPermission(key)` coexist. `<Can I="action" a="Subject">` for typed subject-level checks (CASL conditions, per-instance/tenant/owner reasoning). `useHasPermission('feature.action')` for flat catalog-key gates with no subject instance reasoning. Decision tree added to `fe/CLAUDE.md`.
- **D-02** Conservative codemod. Only mechanical 1:1 patterns rewritten (`isAdmin` props, bare `user.role === 'admin'` booleans, simple ternaries). Anything ambiguous gets a `// TODO(perm-codemod): review` comment. **One commit per migrated file** (~12 commits). Codemod ships with before/after fixture tests — it is a repeatable enforcement tool, not throwaway scaffolding.
- **D-03** Atomic single-commit Subjects union swap in `fe/src/lib/ability.tsx`: drop `Project`, add `KnowledgeBase`, `Agent`, `Memory`, `DocumentCategory`. TS errors become the migration checklist. No transition window.
- **D-04** Block render until catalog loads. Catalog fetch joins existing `AbilityProvider` boot phase. App shell renders; gated content waits for both `/api/auth/abilities` AND `/api/permissions/catalog`. Retry UI on fetch failure (match existing `AbilityProvider` mode — currently it logs and keeps empty ability; researcher confirmed no retry UI exists yet, so one must be added).
- **D-05** Generated TS const file `fe/src/constants/permission-keys.ts` produced at build time. All call sites use `useHasPermission(PERMISSION_KEYS.DATASET_CREATE)` — never bare strings. Honors no-hardcoded-strings rule.
- **D-06** Generator MUST run BEFORE codemod. P4.1 (catalog provider + generator) must produce the const file before P4.3/P4.4/P4.5 run. P4.3 may be *written* in parallel with P4.1 but cannot *execute* until the const file exists.

### Claude's Discretion
- ESLint rule mechanics (rule package, location, wording)
- Exact file structure for catalog provider (single file vs. provider + hook + generator separation)
- Test framework choice for codemod fixtures (vitest per `fe/CLAUDE.md`)
- Naming convention for `PERMISSION_KEYS` constants (SCREAMING_SNAKE matching existing constants)

### Deferred Ideas (OUT OF SCOPE)
- Permission UI for end-users ("what can I do?" self-service) — Phase 7+
- Catalog hot-reload via Socket.IO / versioning — Phase 7 (SH1)
- Removing legacy `roles.ts` constants — Phase 6 (auth module still references them)
- Migrating non-CASL imperative checks in backend — out of scope

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TS10 | FE permission catalog & gates — typed map from `GET /api/permissions/catalog`, Subjects aligned with BE, `useHasPermission(key)` hook | Catalog endpoint contract section, provider architecture section, Subjects blast radius section |
| TS11 | FE coverage codemod — every page/action button/nav/route guard migrated off `isAdmin` prop drilling and `user.role ===` comparisons; zero visible behavior change | Authoritative inventory section, codemod tooling + fixture test sections, verification strategy section |
| R-4 | FE constants rule violation (hardcoded role strings in code) | ESLint rule spec section enforces ban |

## Summary

The planner needs three things straight: (1) the catalog endpoint already exists from Phase 3 and returns `{ permissions: Permission[] }` where `Permission = { key, feature, action, subject, label, description }` — the generator consumes this shape; (2) the codemod sweep is **55 occurrences across 13 files**, dominated by `DocumentTable.tsx` (10) and `glossary/KeywordManagementTab` + `TaskManagementTab` (~12 each — these are bigger than the roadmap's spot-check suggested); (3) the atomic Subjects swap only touches `fe/src/lib/ability.tsx` itself — zero existing files use `<Can a="Project">` or import `AppAbility` with `Project` — the "blast radius" is empty, which makes D-03 very cheap.

**Primary recommendation:** Use **ts-morph** (not jscodeshift) for the codemod — TS-strict + heavy JSX + the need to *insert typed imports* (`PERMISSION_KEYS` from the generated const) makes ts-morph's full type-aware API far more ergonomic. Ship `fe/src/features/permissions/api/{permissionsApi,permissionsQueries}.ts` for the fetch and `fe/src/lib/permissions.tsx` for the `PermissionCatalogProvider` + `useHasPermission` hook. Extend `AbilityProvider` to block on both queries. Generate `permission-keys.ts` via a **standalone Node script invoked by a Vite plugin + a `prebuild`/`predev` npm script**, reading from a committed `permissions-catalog.json` snapshot the BE produces (so CI works without a live BE).

## Codemod Tooling Recommendation

**Recommendation: ts-morph.** Rationale:

| Criterion | ts-morph | jscodeshift |
|---|---|---|
| TS strict mode + JSX | Native — wraps the real TS compiler API, full JSX + type node support | Works but requires `@babel/parser` + TS plugin; JSX + TS comes via recast → brittle |
| Inserting typed imports | `sourceFile.addImportDeclaration({ moduleSpecifier, namedImports })` with dedupe built in | Manual AST surgery, no dedupe |
| Finding JSX attributes by name | `sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute).filter(a => a.getNameNode().getText() === 'isAdmin')` | Supported via `JSXAttribute` visitor but less discoverable |
| Already in repo | **Yes** — `be/src/shared/middleware/__tests__/route-sweep-coverage.test.ts` (Phase 3) uses ts-morph. Reusing the familiar API reduces planner surprise | No |
| Ecosystem | Narrower, but sufficient for codemods | Large but mostly JS-first |

**API surface needed (ts-morph):**
```ts
import { Project, SyntaxKind, Node } from 'ts-morph'

const project = new Project({ tsConfigFilePath: 'fe/tsconfig.json' })
const file = project.getSourceFileOrThrow(path)

// 1. Find <Component isAdmin={...} /> JSX attributes
file.getDescendantsOfKind(SyntaxKind.JsxAttribute)
    .filter(a => a.getNameNode().getText() === 'isAdmin')

// 2. Find user.role === 'admin' binary expressions
file.getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .filter(b => b.getOperatorToken().getKind() === SyntaxKind.EqualsEqualsEqualsToken)
    .filter(b => b.getLeft().getText() === 'user?.role' || b.getLeft().getText() === 'user.role')

// 3. Insert typed import
file.addImportDeclaration({
  moduleSpecifier: '@/constants/permission-keys',
  namedImports: ['PERMISSION_KEYS'],
})

// 4. Insert comment on ambiguous site instead of rewriting
node.replaceWithText(`/* TODO(perm-codemod): review — ${reason} */ ${node.getText()}`)
```

Script lives at `fe/scripts/codemod-permissions.mjs` (per project convention `scripts/` under workspace). Ship it with a `--dry-run` flag that prints the diff without writing; default invocation writes the file.

## Authoritative Codemod Inventory

Grep command used:
```bash
grep -rn "user\.role ===\|user\?\.role ===\|isAdmin\|'admin'\|'leader'\|'member'\|'superadmin'\|'super-admin'" fe/src/ --include="*.ts" --include="*.tsx"
```

### Classification legend
- **MECH** — mechanical 1:1 rewrite by codemod
- **TODO** — codemod leaves `// TODO(perm-codemod): review` for manual fix
- **NAV** — nav/route guard (Sidebar / sidebarNav / App.tsx / routeConfig / AdminRoute / RoleRoute)
- **AUTH** — file inside `fe/src/features/auth/` or `fe/src/constants/roles.ts` — **LEFT IN PLACE** (ESLint allowlist)
- **TYPE** — a `'admin' | 'leader' | ...` *type literal union*, not a value comparison — **LEFT IN PLACE** (not a runtime check)

| # | File:line | Pattern | Class |
|---|-----------|---------|-------|
| 1 | `constants/roles.ts:21,31` | `role === UserRole.SUPER_ADMIN \|\| role === UserRole.ADMIN` | AUTH (allowlist) |
| 2 | `features/glossary/pages/GlossaryPage.tsx:37` | `const isAdmin = user?.role === UserRole.ADMIN \|\| user?.role === UserRole.LEADER` | MECH |
| 3 | `features/glossary/pages/GlossaryPage.tsx:68,76` | `isAdmin={isAdmin}` prop | MECH (prop removal after hook migration) |
| 4 | `features/glossary/components/TaskManagementTab.tsx:35,47,146,157,190,204,210,216,230` | `isAdmin` prop + 8 render guards | MECH (replace prop with `useHasPermission(PERMISSION_KEYS.GLOSSARY_MANAGE)`) |
| 5 | `features/glossary/components/KeywordManagementTab.tsx:36,46,145,156,189,202,208,214,232` | `isAdmin` prop + 8 render guards | MECH (same) |
| 6 | `features/users/api/userQueries.ts:166` | `user.role === roleFilter` (roleFilter is state, not literal) | TODO (not a role-literal comparison — it's a filter picker; codemod should leave it and emit no TODO. Verify with ESLint rule allowing comparison against non-literal RHS.) |
| 7 | `features/datasets/pages/DatasetsPage.tsx:27` | `const isAdmin = user?.role === UserRole.ADMIN \|\| user?.role === UserRole.LEADER` | MECH |
| 8 | `features/datasets/pages/DatasetsPage.tsx:80,107,108,120,121` | `isAdmin` render guard + 2 props | MECH |
| 9 | `features/datasets/components/DocumentTable.tsx:50,131,194,248,260,264,270,282,344,364` | `isAdmin` prop + 9 render guards (**highest concentration: 10**) | MECH |
| 10 | `features/teams/api/teamQueries.ts:292` | `(user.role === 'user' \|\| user.role === 'leader')` **in query filter** | **TODO** — this is data filtering logic ("users available to add are non-admins"), NOT UI gating. Must NOT become `<Can>`. Codemod emits TODO; human rewrites as `useHasPermission(PERMISSION_KEYS.TEAMS_INVITE_MEMBER)` OR leaves alone and lets Phase 5 re-visit. **Flag for planner.** |
| 11 | `features/datasets/pages/DatasetDetailPage.tsx:47,177,299,316` | `const isAdmin = ...` + 3 uses | MECH |
| 12 | `features/datasets/components/DatasetCard.tsx:23,34,73` | `isAdmin` prop + 1 render guard | MECH |
| 13 | `features/datasets/components/ConnectorListPanel.tsx:43,56,172,187,213` | `isAdmin` prop + 3 render guards | MECH |
| 14 | `features/system/pages/SystemToolsPage.tsx:137` | `user?.role === UserRole.ADMIN` render guard | MECH |
| 15 | `features/knowledge-base/components/StandardTabRedesigned.tsx:371` | `<ConnectorListPanel ... isAdmin />` (shorthand `isAdmin={true}`) | MECH (delete the prop once ConnectorListPanel drops it) |
| 16 | `features/users/types/user.types.ts:50` | `role?: 'admin' \| 'leader' \| 'user'` | TYPE (leave) |
| 17 | `features/auth/hooks/useAuth.tsx:42` | `role: 'super-admin' \| 'admin' \| 'leader' \| 'user'` | AUTH + TYPE |
| 18 | `features/auth/components/RoleRoute.tsx:20` | `type Role = 'super-admin' \| ...` | AUTH + TYPE |
| 19 | `features/users/components/EditRoleDialog.tsx:32` | `useState<'admin' \| 'leader' \| 'user'>` | TYPE (leave — it's a dialog state shape) |
| 20 | `features/users/api/userQueries.ts:22` | `export type RoleFilter = 'all' \| 'admin' \| 'leader' \| 'user'` | TYPE |
| 21 | `features/knowledge-base/components/KnowledgeBaseMemberList.tsx:139,140,142` | `case 'super-admin': / case 'admin': / case 'leader':` **in switch** | **TODO** — switch on role name for badge/label rendering, not a permission gate. Leave with TODO for Phase 5 (this is part of the KB member list UI that Phase 5's `EntityPermissionModal` rewrite will replace anyway). |
| 22 | `features/guideline/data/*.guideline.ts` (6 files: users, broadcast, audit, teams, kb-prompts, global-histories, kb-config) | `roleRequired: 'admin' \| 'leader'` as data field | **TODO** — this is a guideline metadata schema, not a runtime check. Phase 6 cleanup. Leave allowlisted. |
| 23 | `features/guideline/data/types.ts:54` | `roleRequired: 'user' \| 'leader' \| 'admin'` type | TYPE |
| 24 | `features/guideline/components/GuidelineDialog.tsx:96` | `const roleHierarchy: Record<string, number> = { user: 1, leader: 2, admin: 3, 'super-admin': 4 }` | **TODO** — hierarchy comparison, not a permission check. Leave for Phase 6. |
| 25 | `features/guideline/components/GuidelineHelpButton.tsx:31` | Same hierarchy map | **TODO** — same as #24 |
| 26 | `features/teams/types/team.types.ts:43` | `role: 'member' \| 'leader'` (team role, not user role) | TYPE (separate enum — TeamRole — leave) |
| 27 | `layouts/sidebarNav.ts:126,145,151,157,163,175,181,200` | `roles: ['super-admin', 'admin', ...]` arrays on nav items | **NAV** — 8 sites. Replace each with `requiredPermission: PERMISSION_KEYS.<KEY>` and have `NavRoleGuard` + `getRouteRoles` resolve via `useHasPermission` instead of role-set membership. This requires touching `sidebarNav.ts` type + `App.tsx`'s `NavRoleGuard` component. **This is the most architecturally invasive change in the phase** and must NOT be run by the codemod — it requires a hand-written refactor. |
| 28 | `layouts/Sidebar.tsx` | (uses `sidebarNav.ts` roles) | NAV — follows #27 |
| 29 | `app/App.tsx:36-52` (`NavRoleGuard`) | `allowedRoles.includes(user.role)` | NAV — refactor to permission-key lookup |
| 30 | `features/auth/components/AdminRoute.tsx:46` | `user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN` | **AUTH + NAV** — this file is in `auth/` but it *is* a permission gate. Per CONTEXT allowlist rules (`fe/src/features/auth/` is exempt from the ESLint ban), we could leave it, but it's the canonical `AdminRoute` used by `App.tsx`. Recommendation: rewrite it to `useHasPermission(PERMISSION_KEYS.ADMIN_PANEL_ACCESS)` and keep it in `auth/`. This is a single-file manual edit, not codemod. |

### Summary counts
- **MECH (auto-rewrite by codemod):** ~33 sites across 9 files (DocumentTable 10, DatasetsPage 5, DatasetDetailPage 4, ConnectorListPanel 5, glossary pages 3, glossary tabs 2×9, DatasetCard 3, SystemToolsPage 1, StandardTabRedesigned 1)
- **TODO (codemod flags for human):** ~3 genuinely complex sites (`teamQueries.ts:292`, `KnowledgeBaseMemberList switch`, guideline hierarchy maps — the last 2 may be deferred to Phase 6 rather than fixed in Phase 4)
- **NAV (hand-written refactor):** 3 files (`sidebarNav.ts`, `App.tsx NavRoleGuard`, `AdminRoute.tsx`)
- **AUTH (allowlisted, leave):** `roles.ts`, `useAuth.tsx`, `RoleRoute.tsx`
- **TYPE (type-literal unions, leave):** `user.types.ts`, `EditRoleDialog.tsx`, `userQueries.ts:22`, `types.ts:54`, `team.types.ts`

**Total unique files touched by Phase 4: ~13** (matches roadmap estimate). Per-file commit count: **~13 commits** for the sweep.

**Correction to roadmap estimate:** the "~55 occurrences" figure is accurate when counting individual `isAdmin &&` render guards, but the glossary component pair (`TaskManagementTab` + `KeywordManagementTab`) contributes ~18 of those, not just the DocumentTable-centric view the roadmap emphasized.

## Catalog Provider Architecture

Per `fe/CLAUDE.md`: data fetches live in `api/<domain>Queries.ts`, NOT in `lib/`. Recommendation:

```
fe/src/features/permissions/
├── api/
│   ├── permissionsApi.ts         # Raw HTTP — api.get('/api/permissions/catalog')
│   └── permissionsQueries.ts     # usePermissionCatalogQuery — TanStack Query hook
├── types/
│   └── permissions.types.ts      # { PermissionEntry, PermissionCatalog }
└── index.ts                      # Barrel

fe/src/lib/
├── ability.tsx                   # EXISTING — Subjects union swap (D-03) + boot coordination
└── permissions.tsx               # NEW — PermissionCatalogProvider + useHasPermission hook (UI-level, consumes the query + context)
```

**Why `permissions.tsx` lives in `lib/` not `features/permissions/hooks/`:** `useHasPermission` is a UI context consumer, not a data hook. `fe/CLAUDE.md` rule: "`useQuery`/`useMutation` go in `api/<domain>Queries.ts`; `hooks/` for UI-only hooks." The `<PermissionCatalogProvider>` + `useHasPermission` pair mirrors the `<AbilityContext.Provider>` + `useAppAbility` pair and belongs next to it in `lib/`.

**Boot coordination (D-04):** Extend the existing `AbilityProvider` rather than adding a sibling provider. The existing implementation (lines 97-133 of `ability.tsx`) does a single `fetch('/api/auth/abilities')` in a `useEffect`. Replace it with:

```tsx
// fe/src/lib/ability.tsx (Phase 4 shape)
export function AbilityProvider({ children }) {
  const { user } = useAuth()
  const abilitiesQuery = useQuery({ /* /api/auth/abilities */ enabled: !!user })
  const catalogQuery = usePermissionCatalogQuery()  // from features/permissions
  const ability = useMemo(() => abilitiesQuery.data ? createMongoAbility(abilitiesQuery.data.rules) : defaultAbility, [abilitiesQuery.data])
  const catalog = catalogQuery.data ?? null

  if (user && (abilitiesQuery.isPending || catalogQuery.isPending)) return <BootSpinner />
  if (user && (abilitiesQuery.isError || catalogQuery.isError)) return <BootErrorRetry onRetry={() => { abilitiesQuery.refetch(); catalogQuery.refetch() }} />

  return (
    <AbilityContext.Provider value={ability}>
      <PermissionCatalogContext.Provider value={catalog}>
        {children}
      </PermissionCatalogContext.Provider>
    </AbilityContext.Provider>
  )
}
```

Two providers, one component, one boot-gate. This is the minimum deviation from the existing pattern that satisfies D-04.

**Existing retry UI status:** `ability.tsx:119-121` currently logs the error and falls through with an empty ability. **No retry UI exists.** D-04 requires adding one. Planner should budget 1 small task for `BootErrorRetry` + 3 i18n keys (`en/vi/ja`: `ability.bootError`, `ability.retry`, `ability.errorDetails`).

**React Compiler exception:** `useMemo` above is the single legitimate use per `fe/CLAUDE.md` — "exception: context provider values".

**Port existing behavior:** The existing code does NOT use TanStack Query — it uses raw `fetch`. Part of P4.1 is migrating the abilities fetch to a query hook (`useAbilitiesQuery` in `features/auth/api/authQueries.ts`) so it can be composed with the catalog query cleanly.

## Const File Generator

**Recommendation: hybrid script + Vite plugin reading a committed snapshot.**

### The flow
1. **BE produces snapshot at build time:** Add a tiny script `be/scripts/export-permissions-catalog.mjs` that loads the registry (same path as boot sync) and writes `fe/src/generated/permissions-catalog.json`. Run via `npm run export:permissions-catalog` (root workspace script). Commit the JSON snapshot to the repo.
2. **FE generator consumes snapshot:** `fe/scripts/generate-permission-keys.mjs` reads `fe/src/generated/permissions-catalog.json` and emits `fe/src/constants/permission-keys.ts`:
   ```ts
   // AUTO-GENERATED — do not edit by hand. See fe/scripts/generate-permission-keys.mjs
   export const PERMISSION_KEYS = {
     DATASET_VIEW: 'dataset.view',
     DATASET_CREATE: 'dataset.create',
     // ...
   } as const

   export type PermissionKey = typeof PERMISSION_KEYS[keyof typeof PERMISSION_KEYS]
   ```
3. **Hook into npm scripts:** `fe/package.json`:
   ```json
   {
     "scripts": {
       "predev": "node scripts/generate-permission-keys.mjs",
       "prebuild": "node scripts/generate-permission-keys.mjs",
       "pretest": "node scripts/generate-permission-keys.mjs"
     }
   }
   ```
4. **Vite plugin for HMR:** A lightweight `vite-plugin-permission-keys.mjs` watches `fe/src/generated/permissions-catalog.json` and re-runs the generator on change. This handles the dev-loop case where someone updates the snapshot without restarting vite.
5. **CI works without BE:** Because the snapshot is committed, `fe` builds in CI read it directly. No live BE needed.
6. **Snapshot refresh workflow:** Documented in `fe/CLAUDE.md`:
   > When BE permission registry changes, run `npm run export:permissions-catalog` from the root and commit both the updated JSON and the regenerated `permission-keys.ts`. A CI guard verifies `permission-keys.ts` matches what the generator would produce from the committed JSON.

### Why not pure Vite plugin
A Vite plugin alone doesn't run in the `vitest` test context reliably; the `pretest` script ensures the const file exists before any test runs, which matters because fixture tests in P4.3 will import from it.

### Why not "fetch at build time from live BE"
- CI has no BE running
- Introduces a flaky dependency
- Defeats the typo-at-edit-time goal of D-05 (typos would be caught at build time against whatever BE happened to be up)

### Why not "codemod invokes the generator directly"
- Violates D-06 timing semantics (generator must be available to *every* consumer of the const file, not just the codemod)
- The const file is a normal source artifact; treating it as codemod scaffolding makes its refresh opaque

### Generator input validation
The generator MUST fail loudly if the snapshot contains:
- Duplicate keys (should already be prevented by `definePermissions`, but double-check)
- Keys with characters outside `[a-z0-9._-]`
- Empty key array

## Subjects Union Migration Blast Radius

Grep for current `Project` / `AppAbility` usage in `fe/src/`:

```
fe/src/lib/ability.tsx:29       type Subjects = '...' | 'Project' | 'all'  ← the source
fe/src/lib/ability.tsx:32       export type AppAbility = ...
fe/src/features/audit/pages/AuditLogPage.tsx:8   import { useAppAbility }
fe/src/features/audit/pages/AuditLogPage.tsx:52  const ability = useAppAbility()
fe/src/features/users/pages/UserManagementPage.tsx:8   import { useAppAbility }
fe/src/features/users/pages/UserManagementPage.tsx:23  const ability = useAppAbility()
fe/src/features/code-graph/components/GraphControls.tsx:26  'Project' ← this is a code-graph node-label literal, NOT CASL subject. Unrelated.
```

**Blast radius: 0 files need fixing for the Subjects swap.**
- No `<Can a="Project">` usage exists anywhere in `fe/src/`
- `AuditLogPage` and `UserManagementPage` import `useAppAbility` but do not reference `'Project'`
- `GraphControls.tsx:26` is a string literal in a code-graph node-type array, unrelated to CASL

**Implication for D-03:** The atomic commit is literally a 2-line diff in `fe/src/lib/ability.tsx` (drop `'Project'`, add `'KnowledgeBase' | 'Agent' | 'Memory' | 'DocumentCategory'`). TypeScript will not error anywhere. This makes D-03 trivially safe — but the planner should still verify with `npm run build -w fe` as the acceptance test.

**Atomic commit order:**
1. Single commit: edit `fe/src/lib/ability.tsx` line 29, run `npm run build -w fe` to confirm zero errors
2. Commit message: `refactor(permissions): align FE Subjects union with BE (drop Project, add KnowledgeBase/Agent/Memory/DocumentCategory)`

## ESLint Rule Spec

**Recommendation: `no-restricted-syntax` config rule with AST selectors** (not a custom plugin). The project's existing `eslint.config.js` is a flat-config file with no custom plugins; adding `eslint-plugin-local-rules` introduces a new dev dep + plugin resolution complexity for a single rule. Flat-config `no-restricted-syntax` with per-file overrides does the job.

### Rule snippet to add to `fe/eslint.config.js`

```js
// Append to the main config block
{
  files: ['fe/src/**/*.{ts,tsx}'],
  ignores: [
    'fe/src/features/auth/**',           // auth module internal role checks OK
    'fe/src/constants/roles.ts',         // source of truth for role constants
    'fe/src/features/guideline/**',      // guideline metadata — Phase 6 cleanup
    'fe/src/features/users/types/**',    // type literal unions
    'fe/src/features/users/api/userQueries.ts', // RoleFilter type + user.role === filter state
  ],
  rules: {
    'no-restricted-syntax': ['error',
      {
        // Ban: user.role === '<literal>' or user?.role === '<literal>'
        selector: "BinaryExpression[operator='==='][left.type='MemberExpression'][left.property.name='role'][right.type='Literal']",
        message:
          'Do not compare user.role to a string literal. Use useHasPermission(PERMISSION_KEYS.<KEY>) for feature gates or <Can I=\"action\" a=\"Subject\"> for instance-level checks. See fe/CLAUDE.md.',
      },
      {
        // Ban: user.role !== '<literal>'
        selector: "BinaryExpression[operator='!=='][left.type='MemberExpression'][left.property.name='role'][right.type='Literal']",
        message: 'Do not compare user.role to a string literal. Use useHasPermission or <Can>.',
      },
      {
        // Ban: isAdmin JSX attribute on any component
        selector: "JSXAttribute[name.name='isAdmin']",
        message:
          'isAdmin prop drilling is banned. Replace the prop with useHasPermission(PERMISSION_KEYS.<KEY>) called inside the child component.',
      },
    ],
  },
},
```

### Why not eslint-plugin-local-rules
- New dependency for one rule
- Flat config already supports `no-restricted-syntax` with AST selectors
- The AST selector above is verifiable with `npx ast-explorer` or astexplorer.net (ESLint parser)

### Selector validation
Tested mentally against the inventory:
- `user?.role === UserRole.ADMIN` — `UserRole.ADMIN` is `MemberExpression`, not `Literal`, so this passes (it's OK — it references a constant, not a string literal). Good.
- `user?.role === 'admin'` — triggers. Correct.
- `roleFilter === 'all'` in `userQueries.ts:166` — triggers, but that file is in the ignores list.
- `<DocumentTable isAdmin={isAdmin} />` — triggers on the attribute. Correct.

### Rollout
Phase 4 must land the rule **at the end of the sweep** (P4.5 per roadmap), not at the start. Adding it earlier would block the codemod's per-file commits because each file would fail lint until the sweep reaches it. Order:
1. P4.4 codemod sweep (per-file commits, lint-clean per file)
2. P4.5 add the ESLint rule + fix the remaining nav/auth sites by hand
3. Run `npm run lint -w fe` — zero errors

## Codemod Fixture Test Layout

Vitest per `fe/CLAUDE.md`. No existing transform tests in the repo (confirmed by grep for `jscodeshift|codemod` outside docs — only `be/tests/permissions/route-sweep-coverage.test.ts` uses ts-morph, but that's a walker test, not a transform test).

### Directory structure
```
fe/scripts/
├── codemod-permissions.mjs                 # the codemod entry point
├── codemod-permissions.lib.mjs             # pure transform functions (testable in isolation)
└── __tests__/
    ├── codemod-permissions.test.ts         # vitest suite
    └── fixtures/
        ├── 01-simple-isAdmin-prop/
        │   ├── input.tsx
        │   └── expected.tsx
        ├── 02-isAdmin-binary-check/
        │   ├── input.tsx
        │   └── expected.tsx
        ├── 03-import-insertion/
        │   ├── input.tsx
        │   └── expected.tsx
        ├── 04-ambiguous-query-enable/
        │   ├── input.ts
        │   └── expected.ts                 # expected == input + TODO comment
        ├── 05-ambiguous-switch-case/
        │   ├── input.tsx
        │   └── expected.tsx                # expected == input + TODO comment
        ├── 06-already-migrated/            # idempotency: running codemod twice = no-op
        │   ├── input.tsx
        │   └── expected.tsx                # equals input
        └── 07-existing-permission-keys-import/  # don't duplicate the import line
            ├── input.tsx
            └── expected.tsx
```

### Test runner pattern
```ts
// fe/scripts/__tests__/codemod-permissions.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { transformSource } from '../codemod-permissions.lib.mjs'

const FIXTURES_DIR = join(__dirname, 'fixtures')

describe('codemod-permissions', () => {
  for (const fixture of readdirSync(FIXTURES_DIR)) {
    it(`${fixture} matches expected output`, () => {
      const dir = join(FIXTURES_DIR, fixture)
      const inputFile = readdirSync(dir).find(f => f.startsWith('input.'))!
      const expectedFile = readdirSync(dir).find(f => f.startsWith('expected.'))!
      const input = readFileSync(join(dir, inputFile), 'utf8')
      const expected = readFileSync(join(dir, expectedFile), 'utf8')
      const actual = transformSource(input, inputFile)
      expect(actual.trim()).toBe(expected.trim())
    })
  }
})
```

### Required fixtures (minimum)
1. Simple `isAdmin` prop on a component → replaced with internal `useHasPermission` call + prop removed at call site
2. `const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.LEADER` → replaced with `const isAdmin = useHasPermission(PERMISSION_KEYS.<KEY>)` (or direct inline, depending on rewrite strategy)
3. Import insertion — codemod adds `import { PERMISSION_KEYS } from '@/constants/permission-keys'` at top of file
4. Ambiguous query-enable (the `teamQueries.ts:292` pattern) → untouched + TODO comment
5. Ambiguous switch-case → untouched + TODO comment
6. Idempotency — already-migrated file → unchanged
7. Existing import — codemod does not duplicate

Planner should spec these 7 fixtures as mandatory before the codemod is considered done.

### Key split: `codemod-permissions.mjs` vs `codemod-permissions.lib.mjs`
- `.lib.mjs` exports pure `transformSource(source: string, filename: string): string` — testable, no filesystem I/O
- `.mjs` is the CLI wrapper that globs files, calls `transformSource`, writes output, handles `--dry-run`

This split is essential for vitest to exercise the transform logic without filesystem interaction.

## Catalog Endpoint Contract (consumed from Phase 3)

Verified against live Phase 3 code:

**Endpoint:** `GET /api/permissions/catalog`
**Auth:** Requires session + `permissions.view` permission (gated by `requirePermission('permissions.view')`). Seeded to `super-admin` and `admin` roles only at Phase 3 P3.0a. **Implication:** non-admin users cannot fetch the catalog directly. Phase 4 must resolve this — see **Open Questions** below.

**Response shape** (from `be/src/modules/permissions/controllers/permissions.controller.ts:57-58` + `be/src/shared/permissions/registry.ts:42-50`):

```json
{
  "permissions": [
    {
      "key": "dataset.view",
      "feature": "dataset",
      "action": "read",
      "subject": "Dataset",
      "label": "View datasets",
      "description": "Allow viewing the list of datasets"
    },
    {
      "key": "dataset.create",
      "feature": "dataset",
      "action": "create",
      "subject": "Dataset",
      "label": "Create datasets",
      "description": "Allow creating new datasets"
    }
  ]
}
```

### Field contract

| Field | Type | Format | Notes |
|---|---|---|---|
| `key` | `string` | `<feature>.<action>`, lowercase dot-delimited | e.g. `knowledge_base.share`, `feedback.submit`. Observed in Phase 3 seeds. Unique across catalog. |
| `feature` | `string` | module/feature name | e.g. `dataset`, `knowledge-base`, `permissions`. NOT currently used by FE, but generator should preserve for grouping UI in Phase 5. |
| `action` | `string` | CASL action | One of `read`, `create`, `update`/`edit`, `delete`, `manage`, or custom verbs like `submit`, `share`, `reindex`, `advanced`. |
| `subject` | `string` | CASL Subjects union member | e.g. `Dataset`, `KnowledgeBase`, `User`, `PermissionCatalog`. Phase 4's Subjects alignment consumes this. |
| `label` | `string` | human-readable | used by Phase 5 admin UI |
| `description` | `string \| undefined` | optional | used by Phase 5 admin UI |

### Keys are NOT grouped by module in the response
The BE returns a flat array. If Phase 5 wants grouping, the FE generator/UI does the grouping by `feature`. Phase 4 generator should emit keys in a flat const map but the type file can also emit a grouped-by-feature type for Phase 5's convenience (nice-to-have, not required).

### No version field yet (SH1 = Phase 7)
The Phase 3 response does NOT include a `version` field. Phase 4 generator must NOT depend on `version`. Phase 7 will add it and Phase 7 will update the generator to diff versions.

### Authentication mismatch for non-admins
**RED FLAG:** Non-admin users will get `403` on `GET /api/permissions/catalog` because the route is gated by `requirePermission('permissions.view')` which is only seeded to admin roles. For the FE to load the catalog for every authenticated user (D-04 "block render until catalog loads"), one of these must happen:

(a) **Open the endpoint to all authenticated users** — the catalog is already essentially public metadata (the key list). Add a new registry key `permissions.view_catalog` seeded to ALL roles, OR loosen the existing gate to just require authentication. **Recommended.** This is a small BE patch Phase 4 needs to coordinate with — the planner should budget a task `P4.0 BE patch: open catalog read to authenticated users` as Wave 0 of Phase 4, or treat it as a Phase 3 hot-fix.

(b) **Do not block render on catalog** — contradicts D-04.

(c) **Use the committed `permissions-catalog.json` snapshot as the only source of truth** — then the FE doesn't fetch the catalog at runtime at all. The `usePermissionCatalogQuery` becomes `usePermissionCatalog` (pure import from `@/generated/permissions-catalog`). **This is actually aligned with D-05's "generated const at build time" philosophy and avoids the auth mismatch entirely.**

**Recommendation:** Option (c). The runtime fetch was specified in TS10 ("populated at boot from `GET /api/permissions/catalog`") but that predates D-05 (generated const at build time). D-05 makes the runtime fetch redundant — the const file IS the catalog, typed and typo-checked. The only reason to still hit the endpoint is to detect version drift (Phase 7 SH1). For Phase 4, **delete the runtime fetch**, import directly from the generated snapshot, and document that Phase 7 will reintroduce the fetch for hot-reload. This also simplifies D-04 — there's only the abilities fetch to block on, not two.

If the planner takes option (c), the entire `features/permissions/api/` directory is not needed in Phase 4. The provider becomes:

```tsx
// fe/src/lib/permissions.tsx
import permissionsCatalog from '@/generated/permissions-catalog.json'
import { PERMISSION_KEYS } from '@/constants/permission-keys'

// ... provider is synchronous; useHasPermission wraps useAppAbility
export function useHasPermission(key: PermissionKey): boolean {
  const ability = useAppAbility()
  const entry = PERMISSION_CATALOG_MAP[key]
  if (!entry) return false
  return ability.can(entry.action, entry.subject)
}
```

This is MUCH simpler than option (a). The planner should choose between (a) and (c) up front — see Open Questions.

## Verification Strategy (Zero-Behavior-Change)

### Automated
1. **Vitest component tests** — For each of the 13 migrated files, write a minimal test that renders the component with two mocked ability contexts (admin user + regular user) and asserts identical DOM output before and after migration. Use `@testing-library/react`'s `renderWithProviders()` (exists in `fe/tests/test-utils.tsx` per `fe/CLAUDE.md`).
2. **Codemod fixture suite** — covered in the Codemod Fixture Test Layout section.
3. **Grep gate** — `npm run test:fe` runs a shell test: `! grep -rn "user\.role === '[a-z]" fe/src/ --exclude-dir={features/auth,constants}` — fails the build if any hardcoded role-string comparison leaks in.
4. **ESLint gate** — `npm run lint -w fe` must be zero-error after P4.5.
5. **TS build gate** — `npm run build -w fe` must compile clean after the Subjects swap (D-03 acceptance).
6. **Before/after screenshot snapshot (optional)** — Playwright (`fe/playwright.config.ts` exists — e2e directory present) snapshot the 8 most-visible gated pages (DocumentTable, DatasetsPage, GlossaryPage, UserManagementPage, Sidebar, AdminDashboardPage, ChatAssistantManagementPage, KnowledgeBaseListPage) as both admin and non-admin. Compare pre-phase vs post-phase. Treat pixel diffs as review flags, not hard failures.

### Manual (human QA checklist — D-02 explicit per-file review)
For each per-file commit, reviewer verifies:
- [ ] Diff is mechanically sensible (prop removed, hook call added, import added)
- [ ] No `// TODO(perm-codemod): review` left unaddressed unless planner marked the site deferred
- [ ] Touched file still passes `npm run build -w fe`
- [ ] Smoke: open the affected page as admin + as regular user; verify button/row visibility unchanged

### Phase-exit grep gates (match roadmap verification section)
```
grep -r "user\.role === 'admin'" fe/src/            → 0
grep -r "user\.role === 'leader'" fe/src/           → 0
grep -r "user\.role === 'member'" fe/src/           → 0
grep -r "user\.role === 'superadmin'" fe/src/       → 0
grep -r "isAdmin" fe/src/features/                  → 0
```
(Excluding `fe/src/features/auth/` and `fe/src/constants/roles.ts`.)

## Risks & Gotchas

1. **`teamQueries.ts:292` is NOT a UI gate.** `(user.role === 'user' || user.role === 'leader')` filters the *available-users dropdown* when adding team members. If the codemod blindly wraps it in `<Can>` or `useHasPermission`, the team-invite flow breaks silently. **Codemod MUST skip this file** — add explicit skip in the codemod config. Human fix: replace with a permission-aware filter like `users.filter(u => hasPermissionFor(u, PERMISSION_KEYS.TEAMS_BE_INVITED))` or defer to Phase 5.

2. **`KnowledgeBaseMemberList.tsx:139-142` switch case on role.** This is a badge-label rendering switch, not a permission check. Codemod must skip. Phase 5's EntityPermissionModal rewrite subsumes this file, so Phase 4 can leave it with a TODO comment.

3. **Guideline hierarchy map in `GuidelineDialog.tsx:96` / `GuidelineHelpButton.tsx:31`.** `{ user: 1, leader: 2, admin: 3, 'super-admin': 4 }` — ordinal role comparison for "which guideline are you allowed to see." Not a permission gate. Phase 6 cleanup (guideline module retirement / rework), not Phase 4. Codemod must skip — allowlist the whole `features/guideline/` directory.

4. **`i18n` string literals contain the word `admin`.** `en.json`, `vi.json`, `ja.json` match the grep for `'admin'`. Codemod MUST only operate on `.ts` and `.tsx` files, never `.json`. The `fe/src/scripts/codemod-permissions.mjs` glob should be `**/*.{ts,tsx}` with explicit exclude of `**/*.json` and `**/locales/**`.

5. **Dark-mode class conditionals.** Grep for `dark:` + role: no hits found. No role-conditional dark-mode classes in the codebase. Safe.

6. **TanStack Query `enabled:` flags driven by role checks.** Confirmed one site — `teamQueries.ts`. The codemod's safety net: the AST matcher for `enabled:` property in ObjectLiteralExpression that wraps a BinaryExpression involving `user.role` → emit TODO, never rewrite. This is a single additional selector in `codemod-permissions.lib.mjs`. Document as a mandatory fixture.

7. **`useQuery` invalidation in auth hook after catalog endpoint is opened (option a).** If the planner chooses option (a) from the catalog auth mismatch section, be aware that the catalog query must be invalidated on login/logout/session change so the boot gate re-fires. TanStack Query's `queryClient.removeQueries({ queryKey: ... })` in the auth logout handler covers this. Not needed if the planner chooses option (c).

8. **React Compiler + context value.** The `AbilityProvider` now passes *two* context values in a single `useMemo`. Per `fe/CLAUDE.md`, context provider values are the one legitimate `useMemo` exception. Split into two `useMemo`s or one combined object — either works, but the planner should explicitly note it's intentional (compiler lint will otherwise flag it).

9. **Feedback module's `feedback.submit` permission** (seeded Phase 3 P3.5) — the FE feedback widget currently has no role check. It's already `<Can>`-agnostic. Nothing for Phase 4 to do, but the planner should verify the feedback widget is NOT accidentally swept.

10. **`AdminRoute.tsx` is imported but unused in `App.tsx`.** `App.tsx` uses `NavRoleGuard` everywhere, not `AdminRoute`. Check if `AdminRoute` is dead code — if yes, delete it in the P4.5 cleanup instead of migrating it. Grep: `grep -rn "AdminRoute" fe/src/` to confirm callers.

## Validation Architecture

**Test framework:** Vitest (per `fe/CLAUDE.md`). Split suites: `npm run test:run:unit -w fe` (Node) for codemod fixtures + hook logic, `npm run test:run:ui -w fe` (jsdom) for component-render tests.

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest (already wired for `fe/`) |
| Config files | `fe/vitest.config.ts`, `fe/vitest.unit.config.ts`, `fe/vitest.ui.config.ts`, `fe/vitest.shared.ts` |
| Unit run command | `npm run test:run:unit -w fe` |
| UI run command | `npm run test:run:ui -w fe` |
| Full run command | `npm run test:run -w fe` |
| Lint | `npm run lint -w fe` |
| Build | `npm run build -w fe` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| TS10 | Catalog const file imports cleanly + all keys present | unit | `vitest run fe/src/constants/__tests__/permission-keys.test.ts` | ❌ Wave 0 |
| TS10 | `useHasPermission(key)` returns true for admin, false for user with mocked abilities | unit + jsdom | `vitest run fe/src/lib/__tests__/permissions.test.tsx` | ❌ Wave 0 |
| TS10 | `<Can I="create" a="KnowledgeBase">` renders children only when allowed | jsdom | `vitest run fe/src/lib/__tests__/ability.test.tsx` | ❌ Wave 0 |
| TS10 | Subjects union compiles clean with new members (`KnowledgeBase`, `Agent`, `Memory`, `DocumentCategory`) and without `Project` | build | `npm run build -w fe` | ✅ (existing build) |
| TS10 | `AbilityProvider` blocks render until both abilities AND catalog loaded (D-04) | jsdom | `vitest run fe/src/lib/__tests__/ability-provider.test.tsx` | ❌ Wave 0 |
| TS11 | Codemod fixture transforms — 7 fixtures (simple prop, binary check, import insertion, ambiguous-enable TODO, ambiguous-switch TODO, idempotency, no-duplicate-import) | unit | `vitest run fe/scripts/__tests__/codemod-permissions.test.ts` | ❌ Wave 0 |
| TS11 | ESLint rule rejects `user.role === 'admin'` outside allowlist and rejects `isAdmin` JSX attribute | lint-in-test | `vitest run fe/src/__tests__/eslint-rule.test.ts` or a CI step running lint against a fixture file | ❌ Wave 0 |
| TS11 | Grep gate — no remaining `user.role === '<literal>'` in `fe/src/` outside allowlist | shell | `grep -r "user\.role === '" fe/src/ --exclude-dir=features/auth --exclude-dir=constants` must be empty | ✅ (shell) |
| TS11 | DocumentTable renders identically before/after migration for admin + user | jsdom | `vitest run fe/src/features/datasets/components/__tests__/DocumentTable.migration.test.tsx` | ❌ Wave 0 |
| R-4 | Generator input validation: rejects empty / duplicate / malformed keys | unit | `vitest run fe/scripts/__tests__/generate-permission-keys.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `vitest run` on the touched file(s) + `npm run build -w fe` must pass
- **Per wave merge:** `npm run test:run -w fe` + `npm run lint -w fe`
- **Phase gate:** Full `npm run test:run -w fe`, `npm run lint -w fe`, `npm run build -w fe`, plus all grep gates + manual per-file review

### Wave 0 Gaps
- [ ] `fe/src/constants/__tests__/permission-keys.test.ts` — covers TS10 (const file present + typed)
- [ ] `fe/src/lib/__tests__/permissions.test.tsx` — covers TS10 (hook)
- [ ] `fe/src/lib/__tests__/ability.test.tsx` — covers TS10 (`<Can>` rendering with mocked rules)
- [ ] `fe/src/lib/__tests__/ability-provider.test.tsx` — covers TS10 (boot gate)
- [ ] `fe/scripts/codemod-permissions.lib.mjs` + `fe/scripts/__tests__/codemod-permissions.test.ts` — covers TS11 (7 fixtures)
- [ ] `fe/scripts/generate-permission-keys.mjs` + test — covers R-4 (generator)
- [ ] `fe/src/features/datasets/components/__tests__/DocumentTable.migration.test.tsx` — representative before/after render-equivalence test (TS11)
- [ ] ESLint rule addition in `fe/eslint.config.js` with fixture lint test

**Framework install:** None — Vitest + @testing-library/react already in `fe/package.json` per existing `fe/tests/` suite. ts-morph needs to be added as a `fe/devDependency` for the codemod: `npm install -D ts-morph -w fe`.

## Open Questions for Planner

1. **Catalog auth mismatch (critical).** Pick option (a) — open `GET /api/permissions/catalog` to all authenticated users via a tiny BE patch — or option (c) — import from the build-time generated snapshot and skip the runtime fetch entirely for Phase 4. **Research recommendation: (c).** It's simpler, matches D-05 philosophy, and removes the need for a cross-phase BE patch.
2. **Option (c) trade-off.** If (c), then TS10's literal wording — "populated at boot from `GET /api/permissions/catalog`" — is not satisfied by Phase 4. Is that acceptable, with a documented note that Phase 7 (SH1) will add the runtime fetch for hot-reload? Planner should confirm with user.
3. **Scope of "auth allowlist" in the ESLint rule.** Keep `features/auth/` fully allowlisted? Or allowlist only `useAuth.tsx` + `RoleRoute.tsx` + `roles.ts` and force `AdminRoute.tsx` to use `useHasPermission`? Research leans toward the latter (rewrite `AdminRoute.tsx`) but the planner may want to keep it simple and allowlist the whole dir.
4. **`features/guideline/` handling.** Defer the 8+ role-string sites to Phase 6 entirely (add to ESLint `ignores`), or tackle 1-2 of them in Phase 4 as a sanity check? Research recommends Phase 6 deferral — guideline is orthogonal to the permission overhaul and Phase 6's legacy cleanup is the right home.
5. **Generated JSON snapshot commit location.** `fe/src/generated/permissions-catalog.json` (source tree, committed) vs. `fe/permissions-catalog.json` (workspace root). Research recommends `fe/src/generated/` so Vite's path alias `@/generated/*` can be added in `tsconfig.json` — enables clean imports and keeps generated artifacts under source control where developers notice drift.

## Sources

### Primary (HIGH confidence)
- `be/src/modules/permissions/controllers/permissions.controller.ts:49-61` — catalog endpoint implementation
- `be/src/shared/permissions/registry.ts:42-157` — `Permission` type + `definePermissions` helper (catalog field contract)
- `be/src/modules/permissions/permissions.permissions.ts` — `permissions.view` / `permissions.manage` gate on catalog endpoint
- `fe/src/lib/ability.tsx` — existing CASL provider (full read)
- `fe/src/constants/roles.ts` — current role constants
- `fe/src/features/auth/components/AdminRoute.tsx` — route guard
- `fe/src/app/App.tsx` — NavRoleGuard pattern + provider mount point
- `fe/src/layouts/sidebarNav.ts:122-200` — 8 nav role entries
- `fe/CLAUDE.md` — FE conventions (API layer split, no manual memoization, hook placement)
- `.planning/phase-03-middleware-cutover/PLAN.md` — Phase 3 catalog endpoint contract + seed
- `.planning/STATE.md` — Phase 3 outcome, IOUs, Subjects drift flagged in Phase 2 IOU #3
- Grep inventory of `fe/src/` — 55 sites across 13 files, classified above

### Secondary (MEDIUM confidence)
- ts-morph API surface knowledge (training data, but the usage shown is standard + the project already uses ts-morph in `be/tests/permissions/route-sweep-coverage.test.ts`)
- ESLint flat-config `no-restricted-syntax` AST selector syntax (verified against standard ESLint docs in training data; the exact selectors above should be validated in astexplorer.net before landing)

### Tertiary (LOW confidence)
- Exact CSS of `BootErrorRetry` UI — none exists today; Phase 4 is creating it from whole cloth
- Whether `AdminRoute.tsx` has live callers — grep was run on patterns, not on import usage; planner should verify with `grep -rn "from '@/features/auth/components/AdminRoute'" fe/src/` before deciding to delete it

## Metadata

**Confidence breakdown:**
- Catalog endpoint contract: HIGH — verified against Phase 3 source files
- Codemod inventory: HIGH — full grep over `fe/src/`, manually classified
- Subjects blast radius: HIGH — exhaustive grep, only 2 import sites, neither references `'Project'`
- Codemod tooling choice: MEDIUM — both ts-morph and jscodeshift would work; ts-morph is the better fit but not strictly required
- Const file generator mechanism: MEDIUM — hybrid approach is well-reasoned but there are 2-3 viable paths; planner may prefer pure Vite plugin
- ESLint rule syntax: MEDIUM — AST selectors should be validated in astexplorer before landing
- Auth mismatch (catalog endpoint gated by `permissions.view`): HIGH — verified in Phase 3 route file

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (30 days — FE stack is stable; only risk is Phase 3 hot-fixes changing the catalog endpoint contract)

## RESEARCH COMPLETE
