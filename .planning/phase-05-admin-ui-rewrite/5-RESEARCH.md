---
phase: 05-admin-ui-rewrite
name: Admin UI Rewrite
researched: 2026-04-08
status: ready-for-planning
confidence: HIGH
requirements: [TS12, TS14, TS15]
---

# Phase 5: Admin UI Rewrite — Research

## Executive Summary

1. **No FE permission API surface exists yet.** `fe/src/features/permissions/` does not exist, and there is no `permissionsApi.ts` / `permissionsQueries.ts`. Phase 3 shipped BE endpoints but the FE has never called them. **P5.1 Wave 0 must scaffold the API + Queries layer before any page work can start.**
2. **The existing `PermissionManagementPage.tsx` is a dead file.** It is exported from `fe/src/features/users/index.ts:9` but **not mounted in `fe/src/app/App.tsx`** (grep confirms — the only `iam/*` route is `iam/users`). It's a static hardcoded 7-row permissions reference table with no API calls. Phase 5 is effectively a **greenfield rewrite**, not an adaptation. Planner must also add the route + sidebar nav entry.
3. **There is no user detail page.** `fe/src/features/users/pages/` contains only `UserManagementPage.tsx` (a paginated table). D-03's "Permissions tab on user detail page" requires **creating the user detail page from scratch** or repurposing a dialog. This materially expands P5.2 scope — planner must pick between (a) new `/iam/users/:id` route with tabs or (b) a large side-sheet/drawer from the user row. The CONTEXT.md D-03 explicitly says persistent URL → option (a).
4. **No shadcn `Command` component is installed.** `fe/src/components/ui/` has `dialog`, `tabs`, `sonner`, but NO `command.tsx` or `combobox.tsx`. The D-06 combined principal picker with type-filter chips must either (a) add shadcn Command via `npx shadcn@latest add command`, or (b) build a simple search input + filtered list (no fuzzy matching). **Planner decision required.**
5. **`whoCanDo` IS exposed as REST** at `GET /api/permissions/who-can-do?action=&subject=&resource_id=` (confirmed `be/src/modules/permissions/routes/permissions.routes.ts:54-60`). Returns users in caller's tenant who can perform the action. **Gated behind `permissions.view`** (same as rest of permissions module, seeded to admin + super-admin only). D-05 effective panel and D-11 Effective Access page both consume this.

---

## User Constraints (from 5-CONTEXT.md)

### Locked Decisions
- **D-01** Matrix = roles × permissions grid grouped by feature prefix, sections from `PERMISSION_KEYS`
- **D-02** Batch save with dirty-state tracking + sticky "Save changes (N)" button → one `PUT /api/permissions/roles/:role` per dirty role; optimistic; cancel clears dirty state
- **D-03** New "Permissions" tab on user detail page with persistent URL (`/users/:id?tab=permissions` or equivalent)
- **D-04** Two-list Allow/Deny override editor with searchable catalog picker grouped by feature; `POST`/`DELETE /api/permissions/users/:userId/overrides`
- **D-05** Collapsed "Effective permissions" verification panel below editor; powered by `whoCanDo` or FE-side merge
- **D-06** Single combined principal picker (user/team/role) with type filter chips `[All] [Users] [Teams] [Roles]`
- **D-07** Inline existing-grants list above the add form in the same modal
- **D-08** One shared modal for KB-level vs DocumentCategory-level, scope toggle at top; both legacy modals converge
- **D-09** Post-save toast on every mutation: "Saved. Affected users will see changes on their next request — they may need to refresh." (en, vi, ja)
- **D-10** No force-refresh of other users' sessions (deferred to Phase 7 SH1)
- **D-11** NEW P5.6 Effective Access page — users & teams × features read-mostly matrix via `whoCanDo`, with drill-down to P5.2 / P5.3

### Claude's Discretion
- Exact route shape for user detail tab (query param vs subroute)
- Whether two grant modals converge into one shared component or one wraps the other
- Pagination/virtualization strategy for Effective Access matrix
- Toast component reuse (already decided: sonner via `globalMessage` — see below)
- Loading skeletons / empty states
- Form-state primitives (native `useState` per fe/CLAUDE.md)

### Deferred Ideas (OUT OF SCOPE)
- Force-refresh other users' sessions → Phase 7 (SH1)
- Permission templates → out-of-band, revisit only if surfaced
- `expires_at` admin UI → SH3
- Self-service "what can I do" → SH4
- Bulk apply / multi-select edit in Effective Access

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TS12 | Admin UI rewrite: registry-driven matrix, per-user override editor, rewired grant modals, i18n (en/vi/ja), dark mode | Finding #1-4 below — BE endpoints ready, FE greenfield |
| TS14 | Audit & observability + `whoCanDo` helper used by admin UI | Finding #6 — `whoCanDo` REST exposed, powers D-05 + D-11 |
| TS15 | Vitest coverage: `useHasPermission`, `<Can>` rendering, matrix CRUD flows, ≥85% on permission UI | Finding #10-11 — existing test scaffold in `fe/tests/lib/permissions.test.tsx`, no coverage threshold configured |

---

## Project Constraints (from CLAUDE.md)

- **No hardcoded string literals** — matrix rows, picker options, API payloads must import `PERMISSION_KEYS` from `@/constants/permission-keys`. No bare `'admin'`/`'leader'`/`'member'`/`'user'` role strings in new code (ESLint `no-restricted-syntax` from Phase 4.5 enforces).
- **JSDoc mandatory** on every exported function, component, hook, interface — `@description`, `@param`, `@returns`.
- **Inline comments** above control flow, business logic, API calls.
- **API layer split** (fe/CLAUDE.md) — `permissionsApi.ts` (raw HTTP) + `permissionsQueries.ts` (TanStack Query hooks). Never `*Service.ts`.
- **No manual memoization** — no `React.memo`, `useMemo`, `useCallback` (React Compiler).
- **Forms = native `useState`**, no form libraries.
- **i18n triple** — every new string in `en.json` + `vi.json` + `ja.json`.
- **Dark mode** — class-based `dark:` prefix mandatory on every new surface.
- **No cross-module imports** — barrel-only imports, `fe/src/features/permissions/` must export via `index.ts`.

---

## Findings per Research Priority

### 1. Existing FE permission API surface — NONE

- `fe/src/features/permissions/` — **does not exist** (`ls` confirmed).
- No `permissionsApi.ts`, no `permissionsQueries.ts`, no `fe/src/lib/permissionsApi.ts`.
- The only permission-related FE files today:
  - `fe/src/lib/permissions.tsx` — `useHasPermission(key)` hook (Phase 4)
  - `fe/src/lib/ability.tsx` — CASL provider, `<Can>` re-export (Phase 4)
  - `fe/src/constants/permission-keys.ts` — generated `PERMISSION_KEYS` (Phase 4)
  - `fe/src/generated/permissions-catalog.json` — committed snapshot (Phase 4)
- **Zero query hooks for any of the 10 Phase 3 endpoints.** Every endpoint must be wired fresh.

**Implication:** P5.1 has a mandatory Wave 0 task: scaffold `fe/src/features/permissions/` with `api/permissionsApi.ts`, `api/permissionsQueries.ts`, `types/permissions.types.ts`, `index.ts` barrel. All three subsequent plan slots (P5.1 matrix, P5.2 override editor, P5.3 grant modals) depend on this.

**BE endpoint inventory (from `be/src/modules/permissions/routes/permissions.routes.ts`):**

| Method | Path | Auth | Query/Body | Consumed by |
|--------|------|------|------------|-------------|
| GET | `/api/permissions/catalog` | `permissions.view` | — | (optional — FE uses snapshot) |
| GET | `/api/permissions/who-can-do` | `permissions.view` | `?action&subject&resource_id?` | D-05, D-11 |
| GET | `/api/permissions/roles/:role` | `permissions.view` | — | P5.1 load matrix |
| PUT | `/api/permissions/roles/:role` | `permissions.manage` | `{permission_keys, tenant_id?}` | P5.1 batch save |
| GET | `/api/permissions/users/:userId/overrides` | `permissions.view` | — | P5.2 load |
| POST | `/api/permissions/users/:userId/overrides` | `permissions.manage` | `{permission_key, effect, expires_at?}` | P5.2 add row |
| DELETE | `/api/permissions/overrides/:id` | `permissions.manage` | — | P5.2 remove row (note: `/overrides/:id`, NOT `/users/:userId/overrides/:id`) |
| GET | `/api/permissions/grants` | `permissions.view` | `?resource_type&resource_id` | P5.3 list |
| POST | `/api/permissions/grants` | `permissions.manage` | `{resource_type, resource_id, grantee_type, grantee_id, actions[], expires_at?}` | P5.3 add |
| DELETE | `/api/permissions/grants/:id` | `permissions.manage` | — | P5.3 remove |

**Gotcha:** the override delete path is `/api/permissions/overrides/:id` (NOT nested under user). This deviates from the TS7 REST spec — planner must reflect this exactly in `permissionsApi.ts` or the FE will 404.

**Zod body shapes are strict:**
- `createGrantSchema` requires `actions: z.array(z.string().min(1)).min(1)` — at least one action. The legacy `permission_level` field does NOT exist in the new API.
- `createOverrideSchema` requires `effect: z.enum(['allow', 'deny'])` and `permission_key: z.string().min(1)`.
- `replaceRolePermissionsSchema` accepts empty array for "revoke all"; `tenant_id` is nullable/optional.

---

### 2. `PermissionManagementPage.tsx` current state — DEAD CODE

- File: `fe/src/features/users/pages/PermissionManagementPage.tsx` (175 lines)
- Contents: static hardcoded 7-row `PermissionMatrixItem[]` array with bool cells for `admin`/`leader`/`user`. Pure i18n + shadcn `Table`. No API, no hooks beyond `useTranslation`.
- Exports: `export default function PermissionManagementPage()`
- Referenced in:
  - `fe/src/features/users/index.ts:9` — barrel re-export as named import
  - **NOT** referenced in `fe/src/app/App.tsx` — grep confirmed only `UserManagementPage` is routed under `iam/users`
  - **NOT** referenced in `fe/src/layouts/sidebarNav.ts` — no `iam/permissions` path
- **Verdict:** Dead file. The rewrite deletes its entire body and replaces with a new matrix. The planner should also:
  - Add route `iam/permissions` in `fe/src/app/App.tsx` (follow `iam/users` pattern: `<FeatureErrorBoundary><NavRoleGuard><PermissionManagementPage /></NavRoleGuard></FeatureErrorBoundary>`)
  - Add nav entry in `fe/src/layouts/sidebarNav.ts` under the IAM group with `requiredPermission: PERMISSION_KEYS.PERMISSIONS_VIEW` (or `PERMISSIONS_MANAGE` — see note on key availability below)
  - Add `ROUTE_PERMISSION_MAP` entry so `NavRoleGuard` auto-resolves
- **Key availability check needed:** `permissions.view` and `permissions.manage` must exist in `PERMISSION_KEYS` — Phase 3 W0 shipped `permissions.view/manage` per STATE.md commit `877d1fd`. Phase 4.1 snapshot should contain them. Planner must verify `fe/src/generated/permissions-catalog.json` contains both before referencing from the nav.

---

### 3. User detail page structure — DOES NOT EXIST

- `fe/src/features/users/pages/` contains only `UserManagementPage.tsx` (a paginated table with inline role-change dropdowns and dialogs — `CreateUserDialog`, `GuidelineDialog`).
- There is **no user detail page**, no `UserDetailPage.tsx`, no `/iam/users/:id` route.
- The existing flow: admin clicks a user in `RoleManagementTable` → inline role change via dropdown. No navigation.
- There is no existing tab system in `fe/src/features/users/` to plug into.

**Planner choice (D-03 requires persistent URL):**
- **Option A (recommended):** Create `fe/src/features/users/pages/UserDetailPage.tsx` + route `iam/users/:id`. Use shadcn `Tabs` (`fe/src/components/ui/tabs.tsx` exists) with tabs `[Profile] [Permissions]`. Make rows in `RoleManagementTable` clickable → `navigate(\`/iam/users/\${id}\`)`. Use `useSearchParams` for `?tab=permissions` deep-linking.
- **Option B:** Slide-over drawer from user row. Rejected in CONTEXT.md — D-03 says persistent URL.
- **Scope warning:** creating UserDetailPage is net-new work not called out in the CONTEXT "Existing files to rewrite" section. **Planner must allocate a dedicated task** and a minimal Profile tab (just display existing user fields) to avoid shipping a tab with only one usable screen.

---

### 4. `KnowledgeBasePermissionModal` + `EntityPermissionModal` current state

**`KnowledgeBasePermissionModal.tsx`** (311 lines):
- Imports from `../api/knowledgeBaseApi`: `getKnowledgeBasePermissions`, `setKnowledgeBasePermission`, `removeKnowledgeBasePermission`, `updateKnowledgeBase`, and types `KnowledgeBasePermission`, `KnowledgeBase`.
- Calls legacy `knowledge_base_permissions` API (the per-tab UI flags table — **NOT** the same as `resource_grants`).
- UX: Public/Private toggle, multi-select team checkbox list, selected teams table with delete buttons. Only grants to teams (not users, not roles).
- Save flow: (1) PUT `updateKnowledgeBase({is_private})`; (2) if public → remove all team perms; (3) if private → diff add/remove with `tab_documents: 'view', tab_chat: 'view', tab_settings: 'none'` defaults.
- Toast: `globalMessage.success/error` (sonner).

**`EntityPermissionModal.tsx`** (437 lines):
- Imports: `getEntityPermissionsByEntity`, `setEntityPermission`, `removeEntityPermission`, type `KnowledgeBaseEntityPermission`.
- Calls legacy `knowledge_base_entity_permissions` API (the table that was RENAMED to `resource_grants` in Phase 1, but the FE API layer still uses the legacy endpoints — **the BE may still expose the legacy endpoints as a shim, or they may be gone entirely**; planner must verify which KB endpoints still exist before the rewrite).
- UX: Entity info banner, Private toggle, team multi-select + user multi-select (separate lists), combined grantee table with name/email columns and delete buttons.
- Entity types: `'category' | 'chat' | 'search'`. The new modal (per D-08) supports `'KnowledgeBase' | 'DocumentCategory'` only — `chat` and `search` entity permissions are **out of the new `resource_grants` scope** per REQUIREMENTS.md ("Resource grant scope (this milestone) | KnowledgeBase + DocumentCategory").
- Save flow: diff + for-loop of individual add/remove calls. Each row default `permission_level: 'view'`.

**Shared structure:** Both modals share the "load permissions + load teams → local dirty state → Private toggle → diff save" skeleton. They are roughly 70% duplicate code. The D-08 "single shared modal with scope toggle" is a clear win: one internal `<ResourceGrantEditor>` with a `scope` prop takes `'KnowledgeBase' | 'DocumentCategory'`.

**Rewire checklist for each modal:**
- Drop `../api/knowledgeBaseApi` permission imports — swap to `fe/src/features/permissions/api/permissionsQueries.ts` hooks.
- Replace `grantee_type: 'team'` bool toggles with single combined `{grantee_type, grantee_id}` rows.
- Replace `permission_level: 'view'` string with `actions: [PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW]` array (or whichever canonical read action).
- Delete `chat`/`search` entity branches — out of scope.
- Delete `is_private` toggle logic — `resource_grants` has no `is_private` flag; the semantics are "no grants = public" implicit.
- **⚠ Behavior change:** dropping `is_private` is a visible behavior change. Discuss with planner whether the `updateKnowledgeBase({is_private})` call must be preserved (probably yes — it's still a KB property that affects visibility elsewhere). Recommend keeping the Public/Private switch that writes `is_private` to the KB record AND additionally managing `resource_grants` when private. This preserves `knowledgeBase.is_private` semantics.
- Both modal files keep their original paths so call sites in KB detail page don't move (per CONTEXT code_context). Only their internals are rewritten to import a shared `ResourceGrantEditor`.

**Call sites to verify:**
- `KnowledgeBasePermissionModal` is called from the KB detail page (look in `fe/src/features/knowledge-base/pages/`) — CONTEXT says "already launches" it.
- `EntityPermissionModal` is called from per-row lock icons on category/chat/search rows. Since `chat` and `search` scopes are out of scope, **those call sites must be rewired to either disappear or keep using the legacy path** — planner must decide. Recommendation: scope P5.3 to `category` only and file the `chat`/`search` cases as a follow-up IOU.

---

### 5. Principal picker / combobox patterns — NONE EXIST

- `ls fe/src/components/ui/command*` → **no match**
- `ls fe/src/components/ui/combobox*` → **no match**
- Available shadcn primitives: `dialog.tsx`, `tabs.tsx`, `sonner.tsx` (confirmed via Glob)
- Existing "pickers" in the codebase are all multi-select checkbox lists built from raw `<input type="checkbox">` (see both permission modals lines 246-256 and 342-373). No fuzzy search, no keyboard navigation, no type-filter chips.

**Data sources for D-06 combined picker:**
- **Users:** `userApi.getUsers()` from `fe/src/features/users/api/userApi.ts` — already used in `EntityPermissionModal.tsx:23,94`. Returns `UserType[]` with `id`, `displayName`, `email`.
- **Teams:** `teamApi.getTeams()` from `fe/src/features/teams/api/teamApi.ts` — already used in both modals. Returns `Team[]` with `id`, `name`.
- **Roles:** hardcoded set `['super-admin', 'admin', 'leader', 'user']` from the BE `roleParamSchema` enum. **Do NOT hardcode as string literals** per the ESLint rule — import from `fe/src/constants/roles.ts` (which Phase 4 kept in place; Phase 6 removes legacy aliases, but `'super-admin'`/`'admin'`/`'leader'`/`'user'` remain). Confirm exact constant name with `fe/src/constants/roles.ts` before referencing.

**Planner decision for picker implementation:**
1. **Install shadcn Command** via `npx shadcn@latest add command popover` — adds `fe/src/components/ui/command.tsx`. Provides `<Command>`, `<CommandInput>`, `<CommandList>`, `<CommandItem>`, `<CommandGroup>`. Gives fuzzy search + keyboard nav + grouped results. **Recommended.** Used by shadcn Combobox pattern.
2. **Hand-roll** a simple search input + `.filter(row => row.name.toLowerCase().includes(q))` filtered list with type chips as a `<div role="group">`. Faster to ship, no new deps, weaker UX.

The picker logic (fetch users+teams+roles → merge into `{type, id, label, icon}[]` → filter by chip state + search query) should be extracted to a shared `<PrincipalPicker>` component in `fe/src/features/permissions/components/` so P5.3 modal and any future use share it.

**Build-time note:** there's no existing "user search" or "team search" server endpoint — the modals fetch ALL users and teams up-front. For the picker in a single-tenant deploy this is acceptable. For large tenants (>1000 users), planner should consider a server-side search, but that's out of scope for Phase 5 unless a real tenant hits the limit.

---

### 6. `whoCanDo` consumption pattern — REST, gated

- **REST route:** `GET /api/permissions/who-can-do?action=<string>&subject=<string>&resource_id=<uuid?>`
- **Auth:** `requireAuth + requirePermission('permissions.view')` — only admin + super-admin by default seed (STATE.md Phase 3).
- **Query schema** (`whoCanDoQuerySchema` in `be/src/modules/permissions/schemas/permissions.schemas.ts:93`):
  - `action: string` (required, e.g. `'read'`, `'delete'`)
  - `subject: string` (required, e.g. `'KnowledgeBase'`, `'User'`)
  - `resource_id: uuid` (optional, narrows the resource_grant branch)
- **Service signature** (`permissions.service.ts:439`): `whoCanDo(action, subject, resourceId?, tenantId?)` returns users.
- **Controller** at `permissions.controller.ts:313` wraps and returns via standard JSON response.

**Consumption for D-05 (effective panel):** call for every permission key in the catalog (expensive — ~80 keys × N users). **Recommendation:** do NOT fan out `whoCanDo` from the FE for D-05. Instead, reuse the fact that the admin is editing overrides for a specific user; compute "effective permissions for this user" by merging the already-loaded data client-side:
- Role permissions for user's role (from `GET /api/permissions/roles/:role`)
- Override rows (from `GET /api/permissions/users/:userId/overrides`)
- Grants (from `GET /api/permissions/grants` filtered by grantee)
- This is a pure FE merge and requires no new BE work. It's also what CONTEXT D-05 mentions as an option: "whoCanDo helper or an equivalent FE-side merge".

**Consumption for D-11 (Effective Access page):** `whoCanDo` per cell is O(features × principals) = 80 × 100+ = 8000+ calls — unacceptable. **Planner MUST request or design a batched endpoint, OR** accept that the D-11 page is scoped to per-feature views: "show me who can do `knowledge_base.view`" as a single call, then switch features via a dropdown. This avoids a cartesian product in the UI. **This is a significant design decision the planner should surface explicitly in P5.6's plan.**

Alternative: build D-11 by fanning out `whoCanDo` once per feature row and caching results in TanStack Query — a 80-request flood on page load, paginated users as columns. Tolerable on admin pages but slow on first render. Acceptable for a read-mostly admin tool.

---

### 7. Toast component — sonner via `globalMessage`

- `fe/src/lib/globalMessage.ts` wraps `sonner` toast:
  ```typescript
  import { toast } from 'sonner'
  export const globalMessage = {
    success: (content: string) => toast.success(content),
    error: (content: string) => toast.error(content),
    info: (content: string) => toast.info(content),
    warning: (content: string) => toast.warning(content),
  }
  ```
- Component: `fe/src/components/ui/sonner.tsx` (Sonner shadcn wrapper, mounted at app root).
- Every new mutation should call `globalMessage.success(t('permissions.savedSessionNotice'))` after success. The toast text for R-10/D-09 is already specified in CONTEXT.
- **Do NOT introduce a new toast system.** Reuse `globalMessage`.

---

### 8. i18n file locations & key conventions

- Files: `fe/src/i18n/locales/{en,vi,ja}.json`
- Loader: `fe/src/i18n/index.ts`
- Existing namespacing:
  - Top-level `"iam": {...}` exists (en.json line 135) — contains `permissions.*`, `roles.*` subkeys already (e.g. `iam.permissions.title`, `iam.roles.admin`)
  - Top-level `"permissions": {...}` also exists (line 203) — separate namespace, probably from a different subsystem
  - Top-level `"knowledgeBase": {...}` exists with `editPermissions`, `permissionsSaved`, `permissionsSaveError`, `publicAccess`, `privateAccess`, `selectTeams`, `entityPermissions.*` — the legacy modal strings
- **Recommended approach:** Add a new `"permissions": { "admin": { "matrix": {...}, "overrides": {...}, "grants": {...}, "effective": {...} } }` subtree to avoid clashing with existing keys. All new strings live under that namespace.
- **3-locale mandate:** every new key added to `en.json` MUST be added to `vi.json` and `ja.json` in the same commit. Phase 4's CI enforces this via the lint/build pass.
- **R-10 toast text** (from CONTEXT D-09):
  - en: "Saved. Affected users will see changes on their next request — they may need to refresh."
  - vi: (translator-provided)
  - ja: (translator-provided)
  - Suggested key: `permissions.admin.sessionRefreshNotice`

---

### 9. Dark mode patterns

- Tailwind class-based `dark:` prefix (confirmed in both existing permission modals).
- Pattern in existing admin pages: `className="text-slate-800 dark:text-white"`, `className="dark:bg-slate-800 dark:border-slate-700"`, `className="bg-gray-50 dark:bg-slate-700"`.
- No gotchas — just pair every light-mode class with a `dark:` variant. ESLint/CI does not enforce this; rely on manual review and the P5.4 dark-mode pass.
- The existing `PermissionManagementPage.tsx:93-101` uses `bg-green-100 dark:bg-green-900/30` for check icons — a reusable pattern for the new matrix cells.

---

### 10. Vitest setup for FE

- Config: `fe/vitest.config.ts` extends `vitest.shared` with `environment: 'jsdom'`, `globals: true`, `setupFiles: ['./tests/setup.ts']`, `include: ['tests/**/*.test.{ts,tsx}']`.
- Test directory: `fe/tests/` (NOT co-located with source)
- Existing permission tests:
  - `fe/tests/lib/permissions.test.tsx` — `useHasPermission` tested with `renderHook` + mocked `AbilityContext.Provider` + hand-built `createMongoAbility([{action, subject}])`. Clean reference pattern.
  - Likely also `fe/tests/lib/ability.test.tsx` (referenced in the permissions test as a sibling pattern) — worth reading for `<Can>` mocking reference.
- Test utils: `fe/tests/test-utils.tsx` provides `renderWithProviders()`, `renderWithRouter()` (per fe/CLAUDE.md).
- Mocks available: localStorage, matchMedia, ResizeObserver, IntersectionObserver, i18next, React Router.

**Pattern for P5.5 matrix CRUD test:**
1. Mock `permissionsApi` module (vi.mock)
2. Build a test ability via `createMongoAbility` granting `permissions.view` + `permissions.manage`
3. Wrap the page component in `<AbilityContext.Provider value={ability}><QueryClientProvider>...</QueryClientProvider></AbilityContext.Provider>`
4. Use `@testing-library/react` to find cells, click, assert dirty state, click Save, assert mutation called

**Pattern for `<Can>` rendering (from existing test):**
```tsx
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: null }) }))
const ability = createMongoAbility([{ action: 'read', subject: 'KnowledgeBase' }])
render(
  <AbilityContext.Provider value={ability as never}>
    <Can I="read" a="KnowledgeBase"><span>visible</span></Can>
  </AbilityContext.Provider>
)
expect(screen.getByText('visible')).toBeInTheDocument()
```

---

### 11. Coverage threshold tooling — NONE CONFIGURED

- `fe/vitest.config.ts` does not set `test.coverage.thresholds.*`
- `npm run test:coverage` (fe/CLAUDE.md) runs Istanbul but does not fail on threshold
- **≥85% target from TS15 is currently unenforced.**

**Planner decision:** either (a) add `coverage: { thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 }, include: ['src/features/permissions/**', 'src/lib/permissions.tsx', 'src/lib/ability.tsx'] }` to `vitest.config.ts` — enforced in CI, or (b) ship the tests and verify coverage manually in the P5.5 verification step. Option (a) is stronger and aligns with the "enforced tripwire" pattern Phase 4.5 used for ESLint.

---

### 12. Effective Access page scale

- No existing user list page uses virtualization — `UserManagementPage.tsx:86-94` uses `Pagination` component + server-side `limit/offset`.
- No team list pagination reference found in the investigation time budget.
- **Typical tenant scale (assumption):** tens to low hundreds of users, tens of teams. A naive render of 100 rows × 80 columns (features) = 8000 cells — OK without virtualization in modern browsers but sluggish on interaction.
- **Recommended Phase 5 approach:**
  - Rows = features (80, collapsible into groups — already familiar from D-01)
  - Columns = paginated principals (users+teams), page size = 10-20 columns at a time
  - Swap columns via a "Principals" pagination bar at the top
  - No virtualization library needed (no `react-window`)
- **Alternative:** single-feature view — dropdown picks one feature, table lists all principals with ✓/✗ on one column. Simpler, same data via the same `whoCanDo` calls. Ships faster.

Planner should confirm the pagination-over-virtualization call and spec it in P5.6's plan.

---

### 13. Phase-specific risks / gotchas

1. **`PermissionManagementPage.tsx` is dead code.** It's exported but not routed. Rewriting it requires ALSO adding the route + sidebar nav entry + `ROUTE_PERMISSION_MAP` entry. Easy to miss and ship a page that's unreachable.
2. **User detail page does not exist.** D-03 "new Permissions tab" implicitly requires creating the parent page. Allocate a full task for this and a minimal Profile tab.
3. **`EntityPermissionModal` supports `chat` and `search` entity types** that are out of new resource_grants scope. Planner must decide: keep legacy endpoints for those, or drop the chat/search lock icons from their call sites. Recommendation: IOU them.
4. **Legacy KB permissions API (`getKnowledgeBasePermissions`, `setEntityPermission` etc.) may still exist in BE.** Phase 1 renamed the TABLE but the FE API layer in `knowledgeBaseApi` may still point at legacy routes. Planner's Wave 0 must verify which routes the existing methods hit and whether they 404 post-Phase-3.
5. **`knowledge_base_permissions` (the per-tab UI flags table) is still in use** by `KnowledgeBasePermissionModal` via `tab_documents/tab_chat/tab_settings`. REQUIREMENTS.md TS1 explicitly excludes this table from the milestone. The rewritten modal should drop that concept — but dropping it removes a user-visible feature. **Planner must confirm with user** whether per-tab flags are being sunset as part of P5.3 or preserved as a separate concern. Safest: preserve them alongside resource_grants (dual-write at save time) until a later phase formally sunsets.
6. **BE route inconsistency:** override delete is `/api/permissions/overrides/:id` not `/api/permissions/users/:userId/overrides/:id`. Mirror exactly in `permissionsApi.ts`.
7. **`permissions.view`/`permissions.manage` gate** — only admin + super-admin seeded. A leader cannot open the admin pages. `AdminRoute` (Phase 4.5) uses `PERMISSION_KEYS.SYSTEM_VIEW` which may or may not be seeded to leader — verify before deciding the gate for the new pages. Plausibly use `PERMISSION_KEYS.PERMISSIONS_MANAGE` to keep it admin-only.
8. **`is_private` on KB record** is separate from `resource_grants`. Dropping the public/private toggle in P5.3 is a visible behavior change; keep the toggle and write to both.
9. **No shadcn Command installed.** D-06 picker needs a decision before P5.3 can proceed.
10. **`knowledge_base_id` column is NOT NULL on `resource_grants`** (Phase 3 IOU #2 in STATE.md) — this restricts grant creation to `resource_type === 'KnowledgeBase'`. **DocumentCategory grants will FAIL** until that migration ships. Phase 5 must include the nullable migration as Wave 0 (technically a BE task, but it's a hard prerequisite for P5.3 D-08). **Carry-forward from Phase 3; surface prominently in the plan.**
11. **`be/src/shared/models/` is gitignored** (Phase 3 IOU #3) — if any new FE-oriented BE model work is needed, use `git add -f`. FE-only work should not hit this.
12. **No FE integration tests for the permissions BE module** (Phase 3 IOU #4) — P5.5 should consider adding at least one end-to-end smoke test that exercises the full request chain for the matrix save flow.

---

## Runtime State Inventory

Phase 5 is a FE rewrite, not a rename/refactor/migration phase — most categories don't apply. Explicit audit:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — P5 adds no new DB records at rename-time. The nullable `knowledge_base_id` migration is BE-only and shipped as a Wave 0 prerequisite. | BE migration task in Wave 0 |
| Live service config | None — no n8n/Datadog/Tailscale config. | None |
| OS-registered state | None. | None |
| Secrets/env vars | None — no new secrets introduced. | None |
| Build artifacts | `fe/dist/` is regenerated on every build; no stale artifact concern. Phase 4's `permissions-catalog.json` snapshot is committed; Phase 5 does not modify it. | None |

---

## Environment Availability

Phase 5 is FE-only and requires no new external dependencies. Existing stack:

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node 22+ | Vite build, vitest | Assumed per project rules | — | — |
| BE API (port 3001) | All API calls | Must be running for dev | — | Mock at vitest level |
| shadcn Command | D-06 picker (IF chosen) | ❌ not installed | — | Hand-rolled search+filter list |
| shadcn Popover | Paired with Command | ❌ not installed | — | Hand-rolled positioned div |

**Missing with fallback:** shadcn Command/Popover. Install via `npx shadcn@latest add command popover` if the planner chooses option A.

---

## Validation Architecture

Per project config (`.planning/config.json` has `nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x + @testing-library/react + jsdom |
| Config file | `fe/vitest.config.ts` (extends `fe/vitest.shared.ts`) |
| Quick run command | `cd fe && npm run test:run:unit` |
| Full suite command | `cd fe && npm run test:run` (includes UI tests) |
| Coverage command | `cd fe && npm run test:coverage` |
| Build check | `cd fe && npm run build` |
| Lint check | `cd fe && npm run lint` |

### Phase Requirements → Test Map

| Req ID / Decision | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| TS12 / D-01 | Role × permission matrix renders features from `PERMISSION_KEYS` grouping | unit (component) | `pytest` N/A — `npm run test:run:unit -- permissions-matrix` | ❌ Wave 0 — new test file `fe/tests/features/permissions/PermissionMatrix.test.tsx` |
| TS12 / D-02 | Dirty-state tracking: toggle cell → "Save changes (1)" appears → click Save → `PUT /roles/:role` called once per dirty role | unit (component + mocked api) | `npm run test:run:unit -- permissions-matrix` | ❌ Wave 0 |
| TS12 / D-02 | Cancel clears dirty state without mutation | unit | same file as above | ❌ Wave 0 |
| TS12 / D-03 | User detail `?tab=permissions` deep-links into override editor | unit | `npm run test:run:unit -- user-detail` | ❌ Wave 0 — new `fe/tests/features/users/UserDetailPage.test.tsx` |
| TS12 / D-04 | Add allow override → POST called with `{effect: 'allow'}`; delete row → DELETE called | unit | `npm run test:run:unit -- override-editor` | ❌ Wave 0 — new `OverrideEditor.test.tsx` |
| TS12 / D-05 | Effective panel merges role + overrides + grants client-side | unit | same as D-04 | ❌ Wave 0 |
| TS12 / D-06 | Principal picker filters by chip type (users/teams/roles) and search query | unit | `npm run test:run:unit -- principal-picker` | ❌ Wave 0 — new `PrincipalPicker.test.tsx` |
| TS12 / D-07 | Inline existing grants render above add form; delete removes row and calls DELETE | unit | `npm run test:run:unit -- grant-editor` | ❌ Wave 0 — new `GrantEditor.test.tsx` |
| TS12 / D-08 | Scope toggle switches resource_type between `KnowledgeBase` and `DocumentCategory` | unit | same as D-07 | ❌ Wave 0 |
| TS12 / D-09 (R-10) | Successful mutation shows `globalMessage.success` with session-refresh notice | unit (spy on sonner) | `npm run test:run:unit -- session-notice` | ❌ Wave 0 |
| TS12 / D-11 (P5.6) | Effective Access page renders paginated principals × features with drill-down links | unit | `npm run test:run:unit -- effective-access` | ❌ Wave 0 — new `EffectiveAccessPage.test.tsx` |
| TS14 | `whoCanDo` API client function called with correct query params | unit | `npm run test:run:unit -- permissions-api` | ❌ Wave 0 — new `permissionsApi.test.ts` |
| TS15 | `useHasPermission` hook | unit | already passing | ✅ `fe/tests/lib/permissions.test.tsx` |
| TS15 | `<Can>` rendering | unit | reference | ✅ `fe/tests/lib/ability.test.tsx` (assumed — verify) |
| TS12 | i18n: new keys present in all 3 locales | static | `cd fe && npm run build` (TS + build passes) + manual grep | ✅ build pipeline |
| TS12 | Dark mode: every new surface has `dark:` variants | manual | screenshot review in verification | — (manual) |
| CLAUDE.md | No `user.role === '<literal>'` or `isAdmin` props | static | `cd fe && npm run lint` | ✅ Phase 4.5 ESLint rule enforcing |
| CLAUDE.md | No bare permission key strings — all via `PERMISSION_KEYS.X` | static | `cd fe && npm run build` (TS error on bare string) + grep sanity check | ✅ compile-time |

### Sampling Rate
- **Per task commit:** `cd fe && npm run build && npm run lint && npm run test:run:unit`
- **Per wave merge:** `cd fe && npm run test:run` (includes UI/jsdom suite)
- **Phase gate:** Full suite green + `npm run test:coverage` showing ≥85% on `src/features/permissions/**` and `src/lib/permissions.tsx`

### Wave 0 Gaps
- [ ] `fe/tests/features/permissions/PermissionMatrix.test.tsx` — matrix CRUD flows (D-01, D-02)
- [ ] `fe/tests/features/permissions/OverrideEditor.test.tsx` — allow/deny flows (D-04, D-05)
- [ ] `fe/tests/features/permissions/GrantEditor.test.tsx` — scope toggle + inline list (D-07, D-08)
- [ ] `fe/tests/features/permissions/PrincipalPicker.test.tsx` — search + chips (D-06)
- [ ] `fe/tests/features/permissions/EffectiveAccessPage.test.tsx` — paginated matrix (D-11)
- [ ] `fe/tests/features/permissions/permissionsApi.test.ts` — API client contracts
- [ ] `fe/tests/features/users/UserDetailPage.test.tsx` — tab deep-linking (D-03)
- [ ] `fe/vitest.config.ts` — add coverage thresholds for permission UI paths (optional but recommended)
- [ ] Manual UAT checklist document (`fe/tests/uat/phase-5-admin-ui.md`) — screenshot-level dark-mode + i18n verification

### Sources

**Primary (HIGH confidence):**
- `be/src/modules/permissions/routes/permissions.routes.ts` — authoritative endpoint list
- `be/src/modules/permissions/schemas/permissions.schemas.ts` — authoritative request shapes
- `be/src/modules/permissions/services/permissions.service.ts:439` — whoCanDo signature
- `fe/src/features/users/pages/PermissionManagementPage.tsx` — dead code confirmed
- `fe/src/features/users/pages/UserManagementPage.tsx` — tabbing reference
- `fe/src/features/knowledge-base/components/KnowledgeBasePermissionModal.tsx` + `EntityPermissionModal.tsx` — legacy modals
- `fe/src/lib/permissions.tsx`, `fe/src/lib/ability.tsx` — Phase 4 primitives
- `fe/src/lib/globalMessage.ts` — sonner wrapper
- `fe/tests/lib/permissions.test.tsx` — test pattern reference
- `fe/vitest.config.ts` — test config
- `.planning/phase-05-admin-ui-rewrite/5-CONTEXT.md` — locked decisions
- `.planning/STATE.md` — Phase 3 outcomes + carry-forward IOUs
- `CLAUDE.md`, `fe/CLAUDE.md`, `be/CLAUDE.md` — project constraints

**Secondary (MEDIUM confidence):**
- `fe/src/app/App.tsx` — routing grep (only `iam/users` mounted, confirmed)
- `fe/src/i18n/locales/en.json` — namespace discovery (grep-level)

---

## Recommended Plan Structure

### Wave 0 (sequential — must land before anything else)
- **Task 0.1 [BE — prerequisite]:** Knex migration making `resource_grants.knowledge_base_id` nullable (Phase 3 IOU #2). **Blocks P5.3 D-08.**
- **Task 0.2 [FE]:** Scaffold `fe/src/features/permissions/` with `api/permissionsApi.ts`, `api/permissionsQueries.ts`, `types/permissions.types.ts`, `components/`, `pages/`, `index.ts`. Wire every endpoint from the BE inventory table (10 endpoints). Include JSDoc on every export. No UI yet.
- **Task 0.3 [FE]:** Install shadcn Command + Popover (`npx shadcn@latest add command popover`) IF picker decision = option A.
- **Task 0.4 [FE]:** Verify `PERMISSION_KEYS.PERMISSIONS_VIEW` and `PERMISSION_KEYS.PERMISSIONS_MANAGE` exist in `fe/src/generated/permissions-catalog.json`. If missing, regenerate snapshot (`npm run permissions:export-catalog`).
- **Task 0.5 [FE]:** Verify which legacy KB endpoints (`getKnowledgeBasePermissions`, `setEntityPermission`, etc.) still work post-Phase-3. Document in an IOU if any 404.

### P5.1 — Role × Permission Matrix Page (parallel with P5.2, P5.3 after Wave 0)
- Task 1.1: Rewrite `PermissionManagementPage.tsx` body (delete 175-line static matrix).
- Task 1.2: Implement matrix component with `PERMISSION_KEYS` grouped by dotted prefix (e.g. `dataset.*`). Columns = roles enum.
- Task 1.3: Dirty-state tracker: `Map<role, Set<permKey>>` in `useState`. Sticky footer "Save changes (N)" where N = dirty role count.
- Task 1.4: Save flow: fire one `PUT /roles/:role` per dirty role, optimistic update, TanStack cache invalidate, R-10 toast.
- Task 1.5: Add route `iam/permissions` in `App.tsx` + sidebar nav entry in `sidebarNav.ts` + `ROUTE_PERMISSION_MAP` entry. Gate with `PERMISSION_KEYS.PERMISSIONS_MANAGE`.
- Task 1.6: Vitest for matrix CRUD + dirty-state + cancel.
- Task 1.7: i18n keys in 3 locales.

### P5.2 — User Detail + Override Editor (parallel with P5.1, P5.3)
- Task 2.1: Create `fe/src/features/users/pages/UserDetailPage.tsx` with shadcn Tabs `[Profile] [Permissions]`, route `iam/users/:id`, `useSearchParams` for `?tab=`.
- Task 2.2: Minimal Profile tab (read-only display of existing `UserType` fields).
- Task 2.3: Row-click navigation from `RoleManagementTable` → user detail.
- Task 2.4: Override editor component — two lists (Allow/Deny), each with `[+ Add]` button opening catalog picker and `[×]` remove.
- Task 2.5: Catalog picker reuses `PERMISSION_KEYS` snapshot + feature-prefix grouping from P5.1.
- Task 2.6: Collapsed effective-permissions panel below, client-side merge (role + overrides + grants).
- Task 2.7: Vitest + i18n + dark mode + R-10 toast on mutations.

### P5.3 — Shared Grant Modal (parallel with P5.1, P5.2)
- Task 3.1: Create `fe/src/features/permissions/components/ResourceGrantEditor.tsx` — shared internal component with `{scope: 'KnowledgeBase' | 'DocumentCategory', resourceId, kbId?}` props.
- Task 3.2: Scope toggle at top. Scope switcher determines `resource_type` in payloads.
- Task 3.3: Inline existing-grants list via `GET /api/permissions/grants?resource_type&resource_id`.
- Task 3.4: Add-grant form with `<PrincipalPicker>` (shared component — users+teams+roles + chips + search).
- Task 3.5: Rewire `KnowledgeBasePermissionModal.tsx` internals to render `<ResourceGrantEditor scope='KnowledgeBase' />`. Preserve `is_private` toggle (dual-write to KB record + resource_grants).
- Task 3.6: Rewire `EntityPermissionModal.tsx` for `category` branch → `<ResourceGrantEditor scope='DocumentCategory' kbId={...} />`. Document IOU for `chat`/`search` branches (keep legacy temporarily or drop lock icons).
- Task 3.7: Vitest for scope toggle, grant add/remove, picker chips.
- Task 3.8: i18n + dark mode + R-10 toast.

### P5.4 — i18n + Dark Mode Pass (after P5.1/2/3 merged)
- Task 4.1: Audit every new surface; screenshot light + dark.
- Task 4.2: Translate new `permissions.admin.*` keys in `vi.json` and `ja.json`.
- Task 4.3: Manual verification checklist.

### P5.5 — Test Hardening (parallel with P5.4)
- Task 5.1: Add vitest `coverage.thresholds` to `fe/vitest.config.ts` scoped to permission UI paths.
- Task 5.2: Fill any gaps from the Validation Architecture table to hit ≥85%.
- Task 5.3: Add `<Can>` rendering test if `fe/tests/lib/ability.test.tsx` missing/thin.

### P5.6 — Effective Access Page (after P5.1 — shares feature grouping) (NEW SLOT)
- Task 6.1: New page `fe/src/features/permissions/pages/EffectiveAccessPage.tsx`, route `iam/effective-access`.
- Task 6.2: Paginated principals (users+teams) × features matrix, one row per feature group.
- Task 6.3: Cell value via `whoCanDo(action, subject)` per-feature fan-out with TanStack Query caching (one query per visible feature row, invalidated when principals page changes).
- Task 6.4: Drill-down: click a user cell → `navigate('/iam/users/:id?tab=permissions')`; click a team cell → open `KnowledgeBasePermissionModal` or a new grant modal preloaded with the team.
- Task 6.5: Sidebar nav entry + route + gate with `PERMISSIONS_VIEW`.
- Task 6.6: Vitest + i18n + dark mode.

### Parallelization graph
```
Wave 0 (sequential)
  → P5.1 ║ P5.2 ║ P5.3  (parallel)
        → P5.6          (after P5.1 for grouping, independent otherwise)
        → P5.4 ║ P5.5   (after P5.1/2/3)
```

---

## RESEARCH COMPLETE
