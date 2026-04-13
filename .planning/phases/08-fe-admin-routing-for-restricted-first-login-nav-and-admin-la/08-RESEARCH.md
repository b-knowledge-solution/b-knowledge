# Phase 8: FE admin routing for restricted first-login nav and /admin layout with data-studio, agent-studio, IAM, system sections - Research

**Researched:** 2026-04-10
**Domain:** Frontend authenticated routing, shell splitting, admin navigation, and route gating
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Shell separation
- **D-01:** The authenticated frontend will have two sidebars: a standard user sidebar and a dedicated admin sidebar.
- **D-02:** Outside `/admin`, the normal authenticated sidebar must display only `Chat` and `Search`.
- **D-03:** All current admin-oriented areas must move under `/admin/...` and appear only inside the admin sidebar.

### Admin route structure
- **D-04:** The admin shell uses the `/admin` prefix for all admin feature routes.
- **D-05:** The admin sidebar must expose these top-level groups: `Data Studio`, `Agent Studio`, `IAM`, and `System`.
- **D-06:** Existing admin feature URLs should be renamed to new `/admin/...` URLs rather than kept as legacy non-admin aliases.
- **D-07:** Old non-prefixed admin routes such as `/iam/...`, `/data-studio/...`, and `/system/...` should not remain as the primary admin entry surface for this phase.

### Admin entry and access
- **D-08:** The user dropdown menu in the sidebar must show an `Administrator` entry before `Logout`.
- **D-09:** Clicking the `Administrator` entry must navigate to `/admin/data-studio/knowledge-base`.
- **D-10:** The `Administrator` entry and `/admin` access are gated by role, not by inferred permission sets.
- **D-11:** Only users with role `leader`, `admin`, or `super-admin` may see or access `/admin`.

### Scope constraints
- **D-12:** This phase is a routing and layout reorganization only; it should reuse existing admin pages rather than redesigning or expanding them.

### the agent's Discretion
- Exact component split between shared layout primitives and a new admin-specific layout.
- Whether the admin shell reuses the current `Header` and styling wholesale or introduces a thin admin wrapper around the same primitives.
- Exact redirect/403 behavior for unauthorized access attempts to `/admin/...` paths, as long as non-admin users cannot use the admin shell.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- Use the existing FE stack already in the repo: React 19, TypeScript strict, Vite 7.3, TanStack Query 5, Tailwind, shadcn/ui. [VERIFIED: fe/CLAUDE.md]
- New routing/layout work must follow the FE registration pattern: add the route in `App.tsx`, route metadata in `routeConfig.ts`, nav in the sidebar config, and wrap feature routes with `FeatureErrorBoundary`. [VERIFIED: fe/CLAUDE.md]
- Do not reintroduce `user.role === '...'` checks across general FE code; this phase is a locked exception only for `/admin` shell entry/access, so centralize the role check in auth/layout routing code rather than scattering it through pages. [VERIFIED: fe/CLAUDE.md; VERIFIED: 08-CONTEXT.md]
- Keep API/data hooks in feature `api/*Queries.ts`, not in `hooks/`. [VERIFIED: fe/CLAUDE.md]
- All new UI strings must be added in `en.json`, `vi.json`, and `ja.json`. [VERIFIED: fe/CLAUDE.md]
- Dark mode support is mandatory. [VERIFIED: fe/CLAUDE.md]
- All generated code must include JSDoc and non-obvious inline comments. [VERIFIED: AGENTS.md; VERIFIED: fe/CLAUDE.md]
- Avoid cross-feature imports except through shared code or barrel exports. [VERIFIED: AGENTS.md; VERIFIED: fe/CLAUDE.md]

## Summary

The current FE is organized around one authenticated layout, `MainLayout`, which always renders one global `Sidebar`, one global `Header`, and a single protected route tree. All admin-like areas currently live beside chat/search at top-level authenticated paths such as `/data-studio/...`, `/agent-studio/...`, `/iam/...`, and `/system/...`. The route tree, sidebar visibility, and header metadata are all path-driven, but they are driven by different registries: routes live in `App.tsx`, header/layout metadata lives in `routeConfig.ts`, and permission resolution for gated routes lives in `sidebarNav.ts`. [VERIFIED: fe/src/app/App.tsx; VERIFIED: fe/src/layouts/MainLayout.tsx; VERIFIED: fe/src/app/routeConfig.ts; VERIFIED: fe/src/layouts/sidebarNav.ts]

The minimum-safe refactor is to keep the existing page components and shell primitives, but split the authenticated route tree into two nested shells: a user shell for `/chat` and `/search`, and an admin shell rooted at `/admin/*`. The admin shell should reuse `Header`, `BroadcastBanner`, collapse behavior, and most sidebar link rendering, but it should have its own nav registry and route metadata namespace so `/admin/...` is not implemented as a large set of conditional branches inside the existing single `SIDEBAR_NAV`. [VERIFIED: fe/src/layouts/MainLayout.tsx; VERIFIED: fe/src/layouts/Sidebar.tsx; VERIFIED: fe/src/layouts/sidebarNav.ts]

The biggest planning risks are not visual. They are path-coupling and gating drift: many components hardcode old admin URLs for back buttons and deep-links; `routeConfig.ts` uses manual prefix matching that will break if the `/admin` prefix is added incompletely; and the current `NavRoleGuard` only works for routes represented in `SIDEBAR_NAV`, which already leaves `/code-graph/:kbId` effectively unguarded. The plan must therefore treat route migration as a coordinated registry refactor, not a simple search-and-replace of route strings. [VERIFIED: fe/src/app/App.tsx; VERIFIED: fe/src/app/routeConfig.ts; VERIFIED: fe/src/layouts/sidebarNav.ts; VERIFIED: fe/src/features/knowledge-base/components/CodeTabRedesigned.tsx]

**Primary recommendation:** Build two authenticated layout routes backed by separate declarative nav/metadata configs, and centralize `/admin` role gating in one route guard plus one admin-entry visibility helper before touching page-level links. [VERIFIED: fe/src/app/App.tsx; VERIFIED: 08-CONTEXT.md]

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react` | `19.0.0` [VERIFIED: fe/package.json] | FE rendering and route composition | Already the project baseline; phase work stays in existing React component/layout patterns. [VERIFIED: fe/package.json; VERIFIED: fe/CLAUDE.md] |
| `react-router-dom` | `7.11.0` [VERIFIED: fe/package.json] | Nested route tree, layout routes, redirects, path matching | The current app already uses nested `<Routes>`, `<Route>`, `<Outlet>`, `Navigate`, `NavLink`, and `useLocation`; the split-shell refactor should extend that structure, not replace it. [VERIFIED: fe/package.json; VERIFIED: fe/src/app/App.tsx; VERIFIED: fe/src/layouts/SidebarNavLink.tsx] |
| `@tanstack/react-query` | `5.90.12` [VERIFIED: fe/package.json] | Auth session query and feature data loading | Auth and page data are already query-driven; no routing work should introduce ad hoc data-fetch state. [VERIFIED: fe/package.json; VERIFIED: fe/src/features/auth/hooks/useAuth.tsx] |
| `react-i18next` / `i18next` | `16.3.5` / `25.6.3` [VERIFIED: fe/package.json] | Localized nav labels, dropdown labels, page titles | Route labels and page titles are translation-key-based already, so admin-shell additions should stay inside the same i18n pattern. [VERIFIED: fe/package.json; VERIFIED: fe/src/layouts/Sidebar.tsx; VERIFIED: fe/src/layouts/Header.tsx] |
| `lucide-react` | `0.560.0` [VERIFIED: fe/package.json] | Sidebar and dropdown icons | Existing nav config is icon-driven via Lucide components. [VERIFIED: fe/package.json; VERIFIED: fe/src/layouts/sidebarNav.ts] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@radix-ui/react-dropdown-menu` | `2.1.16` [VERIFIED: fe/package.json] | User dropdown including the new Administrator entry | Reuse the existing dropdown structure in `Sidebar.tsx` instead of creating a separate menu widget. [VERIFIED: fe/package.json; VERIFIED: fe/src/layouts/Sidebar.tsx] |
| `vitest` | `3.0.0` [VERIFIED: fe/package.json] | FE route/nav regression tests | Use for unit/UI tests covering shell selection, admin entry visibility, and migrated deep links. [VERIFIED: fe/package.json; VERIFIED: fe/vitest.ui.config.ts; VERIFIED: fe/vitest.unit.config.ts] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Two nested layout routes under the current router | Conditional shell rendering inside one `MainLayout` based on `location.pathname` | Faster to patch initially, but it keeps user/admin nav concerns tangled and forces `Sidebar`, `routeConfig`, and permission helpers to special-case `/admin` everywhere. [VERIFIED: fe/src/layouts/MainLayout.tsx; VERIFIED: fe/src/layouts/Sidebar.tsx; VERIFIED: fe/src/app/routeConfig.ts] |
| Separate admin/user nav registries with shared item types | One `SIDEBAR_NAV` with a `shell: 'user' | 'admin'` flag everywhere | Possible, but it still leaves one registry serving two fundamentally different shells and increases the chance that `getRoutePermission()` or active-state logic accidentally spans shells. [VERIFIED: fe/src/layouts/sidebarNav.ts] |

**Installation:** No new FE dependency is required for this phase if the implementation stays within React Router, existing auth hooks, and current sidebar primitives. [VERIFIED: fe/package.json; VERIFIED: fe/src/app/App.tsx]

**Version verification:** Versions above come from the checked-in workspace manifest, not a live registry lookup, because this research is scoped to the current repo’s implementation surface. [VERIFIED: fe/package.json]

## Architecture Patterns

### Recommended Project Structure
```text
fe/src/
├── app/
│   ├── App.tsx                   # Register user shell routes + admin shell routes
│   ├── routeConfig.ts            # Split/extend metadata lookup for /admin paths
│   └── routing/
│       └── adminRouting.ts       # Optional shared admin path constants/helpers
├── layouts/
│   ├── MainLayout.tsx            # Shared shell primitive or user shell
│   ├── AdminLayout.tsx           # Thin admin wrapper over shared shell pieces
│   ├── Sidebar.tsx               # Shared renderer; accept nav config + mode
│   └── sidebarNav.ts             # Split into user/admin nav exports or derive both
└── features/auth/
    └── components/
        └── AdminRoute.tsx        # Central /admin role gate
```

### Pattern 1: Path-driven split shells with shared primitives
**What:** Use React Router layout routes so `/chat` and `/search` render inside a user shell, while `/admin/*` renders the admin shell with its own sidebar config. [VERIFIED: fe/src/app/App.tsx; CITED: https://reactrouter.com/docs/en/v6/route/route]
**When to use:** When the shell itself changes by URL prefix, not just the page body. [VERIFIED: 08-CONTEXT.md]
**Example:**
```tsx
<Route element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
  <Route element={<UserLayout />}>
    <Route path="chat" element={<FeatureErrorBoundary><AiChatPage /></FeatureErrorBoundary>} />
    <Route path="search" element={<FeatureErrorBoundary><AiSearchPage /></FeatureErrorBoundary>} />
  </Route>

  <Route
    path="admin"
    element={
      <AdminRoute>
        <AdminLayout />
      </AdminRoute>
    }
  >
    <Route index element={<Navigate to="data-studio/knowledge-base" replace />} />
    <Route path="data-studio/knowledge-base" element={<FeatureErrorBoundary><KnowledgeBaseListPage /></FeatureErrorBoundary>} />
  </Route>
</Route>
```

### Pattern 2: Declarative nav and route metadata must stay in sync
**What:** The current FE already uses data registries for nav and header metadata. The admin-shell migration should preserve that pattern, but split the registries by shell or add a shared path-constant layer so routes, titles, active-state, and permission lookup all move together. [VERIFIED: fe/src/layouts/sidebarNav.ts; VERIFIED: fe/src/app/routeConfig.ts; VERIFIED: fe/src/layouts/Header.tsx]
**When to use:** On every moved route, especially detail pages and redirects. [VERIFIED: fe/src/app/routeConfig.ts]
**Example:**
```ts
export const ADMIN_ROUTE_PREFIX = '/admin'

export const ADMIN_NAV = [
  {
    labelKey: 'nav.dataStudio',
    children: [
      { path: `${ADMIN_ROUTE_PREFIX}/data-studio/knowledge-base`, requiredPermission: PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW },
      { path: `${ADMIN_ROUTE_PREFIX}/data-studio/datasets`, requiredPermission: PERMISSION_KEYS.DATASETS_VIEW },
    ],
  },
]
```

### Pattern 3: Role gate `/admin`, permission gate admin children
**What:** The phase’s locked rule is explicit: the entry into the admin shell is role-based, while the pages inside the admin shell can continue to use permission-based nav visibility and per-route permission checks. [VERIFIED: 08-CONTEXT.md; VERIFIED: fe/src/layouts/sidebarNav.ts; VERIFIED: fe/src/app/App.tsx]
**When to use:** On the `/admin` parent route and on the user-dropdown Administrator item. [VERIFIED: 08-CONTEXT.md; VERIFIED: fe/src/layouts/Sidebar.tsx]
**Example:**
```ts
const ADMIN_SHELL_ROLES = [UserRole.LEADER, UserRole.ADMIN, UserRole.SUPER_ADMIN] as const

function canAccessAdminShell(role: UserRoleType | undefined): boolean {
  return !!role && ADMIN_SHELL_ROLES.includes(role)
}
```

### Anti-Patterns to Avoid
- **Ad hoc `location.pathname.startsWith('/admin')` logic scattered across `Sidebar`, `Header`, and pages:** This duplicates shell selection rules and will drift. Keep shell choice in routing/layout boundaries. [VERIFIED: fe/src/app/App.tsx; VERIFIED: fe/src/layouts/MainLayout.tsx]
- **Page-level hardcoded role checks for admin visibility:** The project explicitly bans broad `user.role === '...'` checks outside auth except where centralized by this locked routing rule. [VERIFIED: fe/CLAUDE.md; VERIFIED: 08-CONTEXT.md]
- **Leaving old admin URLs in internal navigation after moving routes:** Back buttons, deep-links, and tests already hardcode old paths. Partial migration will produce broken loops and stale bookmarks. [VERIFIED: fe/src/features/users/pages/UserDetailPage.tsx; VERIFIED: fe/src/features/datasets/pages/DatasetDetailPage.tsx; VERIFIED: fe/src/features/knowledge-base/pages/KnowledgeBaseDetailPage.tsx; VERIFIED: fe/tests/features/users/UserDetailPage.test.tsx]

## Current Admin Surface Inventory

### Admin routes already registered in `App.tsx`
| Group | Current route(s) | Current page/module | Must move under `/admin`? |
|------|-------------------|---------------------|---------------------------|
| Data Studio | `/data-studio/knowledge-base`, `/data-studio/knowledge-base/:knowledgeBaseId` | `KnowledgeBaseListPage`, `KnowledgeBaseDetailPage` | Yes. [VERIFIED: fe/src/app/App.tsx] |
| Data Studio | `/data-studio/datasets`, `/data-studio/datasets/:id`, `/data-studio/datasets/:id/documents/:docId`, `/data-studio/datasets/:id/documents/:docId/chunks` | dataset pages | Yes. [VERIFIED: fe/src/app/App.tsx] |
| Agent Studio | `/agent-studio/chat-assistants`, `/agent-studio/search-apps`, `/agent-studio/histories`, `/agent-studio/agents`, `/agent-studio/agents/:id`, `/agent-studio/memory`, `/agent-studio/memory/:id` | chat/search/agents/memory/histories pages | Yes. [VERIFIED: fe/src/app/App.tsx] |
| IAM | `/iam/users`, `/iam/users/:id`, `/iam/teams`, `/iam/permissions`, `/iam/effective-access` | users/teams/permissions pages | Yes. [VERIFIED: fe/src/app/App.tsx] |
| System | `/system/dashboard`, `/system/audit-log`, `/system/system-tools`, `/system/system-monitor`, `/system/tokenizer`, `/system/broadcast-messages`, `/system/llm-providers` | system/admin pages | Yes. [VERIFIED: fe/src/app/App.tsx] |

### Hidden or non-sidebar admin-like routes the planner must include
| Route | Why it matters | Finding |
|------|-----------------|---------|
| `/code-graph/:kbId` | It is reachable from the Knowledge Base code tab via a button and is wrapped in `NavRoleGuard`, but it is not represented in `SIDEBAR_NAV`, so the current permission guard resolves `undefined` and becomes a no-op. This should be treated as an admin surface and moved deliberately under `/admin`, or explicitly de-scoped with a conscious decision. [VERIFIED: fe/src/app/App.tsx; VERIFIED: fe/src/layouts/sidebarNav.ts; VERIFIED: fe/src/features/knowledge-base/components/CodeTabRedesigned.tsx] | High-risk hidden route. |
| `/agent-studio/agents/new?mode=chat` and `/agent-studio/agents/new?mode=search` | These are not explicit route declarations; they rely on `/agent-studio/agents/:id` treating `new` as the dynamic `:id` value. Any `/admin` migration must preserve this behavior. [VERIFIED: fe/src/app/App.tsx; VERIFIED: fe/src/features/chat/components/CreateChatAssistantDialog.tsx; VERIFIED: fe/src/features/search/components/CreateSearchAppDialog.tsx] | Hidden dependency on dynamic route semantics. |

## Don’t Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| User/admin sidebar divergence | Two separate JSX trees with duplicated collapse/dropdown logic | Reuse the existing `Sidebar` renderer with injected nav config or thin wrappers around it | The current sidebar already handles collapse state, groups, dropdown, and permission-gated items. Reimplementing it doubles maintenance. [VERIFIED: fe/src/layouts/Sidebar.tsx; VERIFIED: fe/src/layouts/SidebarGroup.tsx] |
| Per-route permission lookup | Manual `if` trees for each admin route | Extend or split the current declarative `getRoutePermission()` mapping | Permission lookup already derives from nav config; the refactor should preserve one source of truth per shell. [VERIFIED: fe/src/layouts/sidebarNav.ts] |
| Header title routing | Scattered page-title logic inside layouts/pages | Keep title/help/full-bleed data in `routeConfig.ts` (or split configs with one shared getter) | `Header` and `MainLayout` already depend on central route metadata. [VERIFIED: fe/src/layouts/Header.tsx; VERIFIED: fe/src/layouts/MainLayout.tsx; VERIFIED: fe/src/app/routeConfig.ts] |
| Admin-entry visibility | Inline `user.role` checks in dropdowns and pages | One central helper or `AdminRoute` role gate backed by `UserRole` constants | The phase requires role-based admin shell access, but project conventions still favor centralized auth logic. [VERIFIED: fe/src/constants/roles.ts; VERIFIED: fe/src/features/auth/components/AdminRoute.tsx; VERIFIED: 08-CONTEXT.md] |

**Key insight:** The app already has three registries for the same route space: route declaration, route metadata, and route-to-permission mapping. The safest implementation rehomes admin paths by changing all three registries together, not by layering special-cases on only one of them. [VERIFIED: fe/src/app/App.tsx; VERIFIED: fe/src/app/routeConfig.ts; VERIFIED: fe/src/layouts/sidebarNav.ts]

## Common Pitfalls

### Pitfall 1: Migrating `App.tsx` routes without migrating `routeConfig.ts`
**What goes wrong:** The page still renders, but header titles, `fullBleed`, `hideHeader`, and guideline help buttons silently regress because `getRouteMetadata()` only knows the old path prefixes. [VERIFIED: fe/src/layouts/Header.tsx; VERIFIED: fe/src/layouts/MainLayout.tsx; VERIFIED: fe/src/app/routeConfig.ts]
**Why it happens:** `routeConfig.ts` uses exact and manual prefix matching for old `/data-studio`, `/agent-studio`, and `/search/apps` paths. [VERIFIED: fe/src/app/routeConfig.ts]
**How to avoid:** Add `/admin/...` entries and prefix logic before or together with route-tree changes. [VERIFIED: fe/src/app/routeConfig.ts]
**Warning signs:** Header falls back to `common.appName`, padding is wrong, or pages that used to be full-bleed gain default padding. [VERIFIED: fe/src/app/routeConfig.ts; VERIFIED: fe/src/layouts/Header.tsx]

### Pitfall 2: Assuming `NavRoleGuard` protects every admin route today
**What goes wrong:** A route wrapped in `NavRoleGuard` may still be effectively public to any authenticated user if it does not exist in `SIDEBAR_NAV`. [VERIFIED: fe/src/app/App.tsx; VERIFIED: fe/src/layouts/sidebarNav.ts]
**Why it happens:** `getRoutePermission()` derives exclusively from `SIDEBAR_NAV`, and missing paths return `undefined`, which the guard treats as unrestricted. [VERIFIED: fe/src/layouts/sidebarNav.ts; VERIFIED: fe/src/app/App.tsx]
**How to avoid:** During the refactor, decide whether route protection should continue to derive from nav config or move to an explicit route-permission map that also covers hidden routes like code graph. [VERIFIED: fe/src/layouts/sidebarNav.ts; VERIFIED: fe/src/features/knowledge-base/components/CodeTabRedesigned.tsx]
**Warning signs:** Hidden routes have no sidebar entry, but are still wrapped in `NavRoleGuard`. [VERIFIED: fe/src/app/App.tsx]

### Pitfall 3: Using permission gates for `/admin` entry instead of the locked role gate
**What goes wrong:** Users may gain or lose admin-shell visibility based on catalog permissions rather than the locked roles `leader`, `admin`, `super-admin`. [VERIFIED: 08-CONTEXT.md]
**Why it happens:** The current `AdminRoute` gates on `PERMISSION_KEYS.SYSTEM_VIEW`, and most nav visibility logic is also permission-based. [VERIFIED: fe/src/features/auth/components/AdminRoute.tsx; VERIFIED: fe/src/layouts/sidebarNav.ts]
**How to avoid:** Create a dedicated admin-shell gate backed by `UserRole` constants and use it only at the shell boundary and dropdown entry. Keep permission gating inside the shell for child items. [VERIFIED: fe/src/constants/roles.ts; VERIFIED: 08-CONTEXT.md]
**Warning signs:** The Administrator dropdown item appears/disappears when catalog permissions change, or a role outside the locked set can enter `/admin`. [VERIFIED: 08-CONTEXT.md]

### Pitfall 4: Missing page-level link migration
**What goes wrong:** Pages render under `/admin`, but back buttons and “view details” links bounce users to removed legacy URLs like `/iam/users` or `/data-studio/datasets`. [VERIFIED: fe/src/features/users/pages/UserDetailPage.tsx; VERIFIED: fe/src/features/datasets/pages/DatasetDetailPage.tsx; VERIFIED: fe/src/features/knowledge-base/pages/KnowledgeBaseDetailPage.tsx]
**Why it happens:** Many route strings are embedded in page components and tests, not just the central nav config. [VERIFIED: fe/src/features/users/components/RoleManagementTable.tsx; VERIFIED: fe/tests/features/users/UserDetailPage.test.tsx; VERIFIED: fe/tests/features/permissions/EffectiveAccessPage.test.tsx]
**How to avoid:** Build a route migration checklist from grep results and convert these call-sites to shared path helpers where practical. [VERIFIED: codebase grep]
**Warning signs:** Clicking back from a detail page lands on `/404`. [VERIFIED: fe/src/app/App.tsx]

### Pitfall 5: Breaking deep-linked admin flows by removing legacy paths with no redirect strategy
**What goes wrong:** Existing bookmarks and copied links to `/iam/...`, `/system/...`, `/data-studio/...`, and `/agent-studio/...` go straight to `/404` once those routes are removed. [VERIFIED: 08-CONTEXT.md; VERIFIED: fe/src/app/App.tsx]
**Why it happens:** The locked decision explicitly says non-prefixed admin URLs should not remain as the primary surface, and the router currently sends unknown paths to `/404`. [VERIFIED: 08-CONTEXT.md; VERIFIED: fe/src/app/App.tsx]
**How to avoid:** Make an explicit plan decision between one-shot compatibility redirects and immediate 404 removal. The phase allows redirects; it only forbids keeping legacy aliases as the primary admin surface. [INFERENCE from VERIFIED: 08-CONTEXT.md; VERIFIED: fe/src/app/App.tsx]
**Warning signs:** QA opens an old admin URL and immediately lands on `/404`. [VERIFIED: fe/src/app/App.tsx]

## Code Examples

Verified patterns from the current codebase:

### Shared route guard derived from config
```tsx
function NavRoleGuard({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const requiredPermission = getRoutePermission(pathname)

  if (!requiredPermission) {
    return <>{children}</>
  }

  return <PermissionGate requiredPermission={requiredPermission}>{children}</PermissionGate>
}
```
Source: `fe/src/app/App.tsx` [VERIFIED: fe/src/app/App.tsx]

### Route metadata lookup controls shell behavior
```ts
export function getRouteMetadata(pathname: string): RouteMetadata {
  if (ROUTE_CONFIG[pathname]) {
    return ROUTE_CONFIG[pathname]!
  }

  if (pathname.startsWith('/data-studio/datasets/')) {
    return ROUTE_CONFIG['/data-studio/datasets']!
  }

  return {
    titleKey: 'common.appName',
  }
}
```
Source: `fe/src/app/routeConfig.ts` [VERIFIED: fe/src/app/routeConfig.ts]

### User dropdown insertion point for the new admin entry
```tsx
<DropdownMenuContent side="top" align="start" className="w-56">
  <DropdownMenuItem onClick={() => openApiKeys()} className="cursor-pointer">
    <KeyRound className="mr-2 h-4 w-4" />
    {t('nav.apiKeys')}
  </DropdownMenuItem>
  <DropdownMenuItem onClick={() => openSettings()} className="cursor-pointer">
    <Settings className="mr-2 h-4 w-4" />
    {t('settings.title')}
  </DropdownMenuItem>
  <DropdownMenuSeparator />
  <DropdownMenuItem asChild className="cursor-pointer text-destructive focus:text-destructive">
    <Link to="/logout">
      <LogOut className="mr-2 h-4 w-4" />
      {t('nav.signOut')}
    </Link>
  </DropdownMenuItem>
</DropdownMenuContent>
```
Source: `fe/src/layouts/Sidebar.tsx` [VERIFIED: fe/src/layouts/Sidebar.tsx]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Role-string-gated FE navigation and routes | Permission-key-driven nav visibility and route permission resolution for most feature pages | Completed in milestone Phase 4/5 work already present in the repo. [VERIFIED: .planning/STATE.md; VERIFIED: fe/src/layouts/sidebarNav.ts; VERIFIED: fe/src/app/App.tsx] | Phase 8 must preserve permission gating inside admin pages while introducing a role-only shell boundary for `/admin`. [VERIFIED: 08-CONTEXT.md] |
| One authenticated shell for all logged-in pages | Two authenticated shells is now the locked direction for this phase | Phase 8 added on 2026-04-10. [VERIFIED: .planning/STATE.md; VERIFIED: 08-CONTEXT.md] | Planner should treat this as a layout/routing split, not a feature-page rewrite. [VERIFIED: 08-CONTEXT.md] |

**Deprecated/outdated:**
- Using `AdminRoute` as the admin-shell gate is outdated for this phase because it currently checks `PERMISSION_KEYS.SYSTEM_VIEW`, not the locked role set. [VERIFIED: fe/src/features/auth/components/AdminRoute.tsx; VERIFIED: 08-CONTEXT.md]
- Treating `SIDEBAR_NAV` as the complete source of route protection is already unsafe because `/code-graph/:kbId` is outside that registry. [VERIFIED: fe/src/app/App.tsx; VERIFIED: fe/src/layouts/sidebarNav.ts; VERIFIED: fe/src/features/knowledge-base/components/CodeTabRedesigned.tsx]

## Assumptions Log

All claims in this research were verified from the repo or cited from official React Router documentation — no user confirmation is required for unverified technical assumptions.

## Resolved Planning Decisions

1. **Old non-prefixed admin URLs will fail closed to `/404` immediately; no transitional redirects are part of Phase 8.**
   - Why this is the chosen answer: D-06 says existing admin feature URLs should be renamed to `/admin/...`, D-07 says the old non-prefixed admin routes should not remain the primary admin surface, and D-12 constrains the phase to routing/layout reorganization rather than adding compatibility layers. A redirect matrix would add scope and prolong dual-route drift without being required by any locked decision. [VERIFIED: 08-CONTEXT.md]
   - Planning consequence: tests must assert old `/iam/...`, `/data-studio/...`, `/agent-studio/...`, and `/system/...` URLs fall through to `/404` instead of redirecting.

2. **The hidden code-graph route becomes `/admin/code-graph/:kbId` and remains a hidden admin route rather than being nested under a new Knowledge Base sub-route.**
   - Why this is the chosen answer: the current page is already a hidden route launched from the Knowledge Base code tab, and moving it to `/admin/code-graph/:kbId` preserves that behavior with the smallest routing surface change while still satisfying D-03 and D-04. Nesting it under `/admin/data-studio/knowledge-base/:knowledgeBaseId/code-graph` would introduce a new information architecture and extra link churn beyond the locked routing-only scope in D-12. [VERIFIED: 08-CONTEXT.md; VERIFIED: fe/src/features/knowledge-base/components/CodeTabRedesigned.tsx; VERIFIED: fe/src/app/App.tsx]
   - Planning consequence: `App.tsx`, `routeConfig.ts`, route-permission resolution, the code-tab entry point, and `CodeGraphPage.tsx` back navigation must all agree on `/admin/code-graph/:kbId`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | FE build/test commands | ✓ | `v22.22.1` [VERIFIED: local command] | — |
| npm | FE build/test commands | ✓ | `10.9.4` [VERIFIED: local command] | — |

**Missing dependencies with no fallback:**
- None for research. [VERIFIED: local command]

**Missing dependencies with fallback:**
- None identified. This phase is FE code/config work on top of an already installed Node/npm toolchain. [VERIFIED: local command; VERIFIED: fe/package.json]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest` `3.0.0` with split UI (`jsdom`) and unit (`node`) configs. [VERIFIED: fe/package.json; VERIFIED: fe/vitest.ui.config.ts; VERIFIED: fe/vitest.unit.config.ts] |
| Config file | `fe/vitest.ui.config.ts`, `fe/vitest.unit.config.ts` [VERIFIED: fe/vitest.ui.config.ts; VERIFIED: fe/vitest.unit.config.ts] |
| Quick run command | `npm run test:run:ui -w fe -- --reporter=dot` [VERIFIED: fe/package.json] |
| Full suite command | `npm run test:run -w fe` [VERIFIED: fe/package.json] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PH8-R1 | Non-admin shell shows only Chat/Search nav outside `/admin` | UI | `npm run test:run:ui -w fe -- --reporter=dot` | ❌ Wave 0 |
| PH8-R2 | Leader/admin/super-admin can see Administrator dropdown entry and navigate to `/admin/data-studio/knowledge-base` | UI | `npm run test:run:ui -w fe -- --reporter=dot` | ❌ Wave 0 |
| PH8-R3 | `/admin` parent route redirects to `/admin/data-studio/knowledge-base` | UI/router | `npm run test:run:ui -w fe -- --reporter=dot` | ❌ Wave 0 |
| PH8-R4 | Non-admin roles cannot access `/admin/...` even if they hold broad permissions | UI/router | `npm run test:run:ui -w fe -- --reporter=dot` | ❌ Wave 0 |
| PH8-R5 | Existing admin detail/back-link flows navigate to new `/admin/...` URLs | UI | `npm run test:run:ui -w fe -- --reporter=dot` | Partial: [UserDetailPage.test.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/tests/features/users/UserDetailPage.test.tsx) exists, but targets old `/iam/...` paths. [VERIFIED: fe/tests/features/users/UserDetailPage.test.tsx] |

### Sampling Rate
- **Per task commit:** `npm run test:run:ui -w fe -- --reporter=dot` on the specific touched route/nav test files. [VERIFIED: fe/package.json]
- **Per wave merge:** `npm run test:run -w fe`. [VERIFIED: fe/package.json]
- **Phase gate:** `npm run build -w fe` plus `npm run test:run -w fe` green before `/gsd-verify-work`. [VERIFIED: fe/CLAUDE.md; VERIFIED: fe/package.json]

### Wave 0 Gaps
- [ ] Add a router-level shell test for `App.tsx` covering `/chat`, `/search`, `/admin`, and forbidden `/admin/...` access.
- [ ] Add sidebar dropdown tests covering Administrator entry visibility/order before Logout.
- [ ] Update `fe/tests/features/users/UserDetailPage.test.tsx` and `fe/tests/features/permissions/EffectiveAccessPage.test.tsx` to the new `/admin/iam/...` paths if those routes move as expected. [VERIFIED: fe/tests/features/users/UserDetailPage.test.tsx; VERIFIED: fe/tests/features/permissions/EffectiveAccessPage.test.tsx]
- [ ] Add regression coverage for the hidden route at `/admin/code-graph/:kbId`, including the page's admin-internal back navigation.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `ProtectedRoute` + `useAuth()` session check control access to authenticated shells. [VERIFIED: fe/src/features/auth/components/ProtectedRoute.tsx; VERIFIED: fe/src/features/auth/hooks/useAuth.tsx] |
| V3 Session Management | yes | Preserve redirect-to-login behavior with `?redirect=` when protected routes are hit unauthenticated. [VERIFIED: fe/src/features/auth/components/ProtectedRoute.tsx; VERIFIED: fe/src/features/auth/hooks/useAuth.tsx] |
| V4 Access Control | yes | Central `/admin` role gate plus existing permission-based route/nav gating. [VERIFIED: 08-CONTEXT.md; VERIFIED: fe/src/app/App.tsx; VERIFIED: fe/src/layouts/sidebarNav.ts] |
| V5 Input Validation | yes | Route params and search params should continue to be constrained through router patterns and controlled helper logic rather than ad hoc string handling. [VERIFIED: fe/src/app/App.tsx; VERIFIED: fe/src/features/users/pages/UserDetailPage.tsx; VERIFIED: fe/src/features/permissions/pages/EffectiveAccessPage.tsx] |
| V6 Cryptography | no | No cryptographic changes are in scope for this routing/layout phase. [VERIFIED: 08-CONTEXT.md] |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized admin-shell access by URL guessing | Elevation of Privilege | Gate `/admin` at the route boundary with explicit allowed roles and deny with `/403` or safe redirect. [VERIFIED: 08-CONTEXT.md; VERIFIED: fe/src/features/auth/components/ProtectedRoute.tsx] |
| Hidden route bypass through incomplete permission maps | Elevation of Privilege | Ensure every admin route has an explicit guard path, especially non-nav routes such as code graph. [VERIFIED: fe/src/app/App.tsx; VERIFIED: fe/src/layouts/sidebarNav.ts] |
| Open redirect / broken post-login routing | Tampering | Reuse existing redirect handling in auth and avoid inventing custom redirect query conventions for `/admin`. [VERIFIED: fe/src/features/auth/hooks/useAuth.tsx; VERIFIED: fe/src/features/auth/components/ProtectedRoute.tsx] |

## Sources

### Primary (HIGH confidence)
- `fe/src/app/App.tsx` - current route tree, default authenticated redirect, hidden code-graph route, and existing nav-permission guard wiring.
- `fe/src/app/routeConfig.ts` - header/full-bleed metadata registry and manual dynamic path matching.
- `fe/src/layouts/MainLayout.tsx` - current single authenticated shell composition.
- `fe/src/layouts/Sidebar.tsx` - current nav rendering and user dropdown insertion point.
- `fe/src/layouts/sidebarNav.ts` - current declarative nav groups and route-to-permission lookup.
- `fe/src/features/auth/components/AdminRoute.tsx` - current admin guard behavior.
- `fe/src/features/auth/hooks/useAuth.tsx` - authenticated user shape and role source.
- `fe/src/constants/roles.ts` - role constants and helper functions.
- `fe/src/features/users/pages/UserDetailPage.tsx` - hardcoded IAM back-links.
- `fe/src/features/datasets/pages/DatasetDetailPage.tsx` - hardcoded Data Studio back-links.
- `fe/src/features/knowledge-base/pages/KnowledgeBaseDetailPage.tsx` - hardcoded Knowledge Base back-links.
- `fe/src/features/knowledge-base/components/CodeTabRedesigned.tsx` - hidden code-graph entry point.
- `fe/package.json` - FE stack versions and test/build scripts.
- `fe/vitest.ui.config.ts` - UI test environment and coverage expectations.
- `fe/vitest.unit.config.ts` - unit test environment and coverage expectations.
- `.planning/phases/08-fe-admin-routing-for-restricted-first-login-nav-and-admin-la/08-CONTEXT.md` - locked phase decisions.
- `.planning/STATE.md` - phase history and milestone context.
- `AGENTS.md` - project-wide constraints.
- `fe/CLAUDE.md` - FE-specific conventions and routing/gating rules.

### Secondary (MEDIUM confidence)
- React Router Route documentation: https://reactrouter.com/docs/en/v6/route/route - nested/layout route concepts used by the recommendation. [CITED: https://reactrouter.com/docs/en/v6/route/route]

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - derived directly from the checked-in FE manifest and current code. [VERIFIED: fe/package.json]
- Architecture: HIGH - based on the live route/layout/nav implementation in the repo and locked phase constraints. [VERIFIED: fe/src/app/App.tsx; VERIFIED: fe/src/layouts/MainLayout.tsx; VERIFIED: 08-CONTEXT.md]
- Pitfalls: HIGH - each risk is tied to concrete current code paths and existing tests or missing guards. [VERIFIED: codebase grep]

**Research date:** 2026-04-10
**Valid until:** 2026-05-10

## RESEARCH COMPLETE

**Phase:** 08 - fe-admin-routing-for-restricted-first-login-nav-and-admin-la
**Confidence:** HIGH

### Key Findings
- The frontend currently has one authenticated shell only; `/admin` does not exist yet, and all admin-like pages live as peer routes beside chat/search. [VERIFIED: fe/src/app/App.tsx; VERIFIED: fe/src/layouts/MainLayout.tsx]
- The safest implementation is two nested authenticated shells with shared layout primitives, not a single layout full of `/admin` conditionals. [VERIFIED: fe/src/layouts/MainLayout.tsx; VERIFIED: fe/src/layouts/Sidebar.tsx]
- `/admin` entry/access must be implemented as a centralized role gate for `leader`, `admin`, and `super-admin`, while inner admin pages can keep permission-based gating. [VERIFIED: 08-CONTEXT.md; VERIFIED: fe/src/layouts/sidebarNav.ts]
- Route migration must update `App.tsx`, `routeConfig.ts`, `sidebarNav.ts`, page-level `navigate()`/`Link` calls, and route-dependent tests together. [VERIFIED: fe/src/app/App.tsx; VERIFIED: fe/src/app/routeConfig.ts; VERIFIED: fe/src/layouts/sidebarNav.ts; VERIFIED: codebase grep]
- `/code-graph/:kbId` is already a hidden admin-like route that escapes the current nav-derived permission map, so the planner must include it explicitly. [VERIFIED: fe/src/app/App.tsx; VERIFIED: fe/src/layouts/sidebarNav.ts; VERIFIED: fe/src/features/knowledge-base/components/CodeTabRedesigned.tsx]

### File Created
`.planning/phases/08-fe-admin-routing-for-restricted-first-login-nav-and-admin-la/08-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Derived from checked-in FE package/config files. |
| Architecture | HIGH | Derived from the live route tree, layout, nav config, and locked phase decisions. |
| Pitfalls | HIGH | Backed by concrete path references, hidden-route behavior, and existing test coverage gaps. |

### Resolved Decisions
- Old non-prefixed admin URLs fail closed to `/404` immediately; Phase 8 does not keep redirect aliases.
- The canonical hidden code-graph route is `/admin/code-graph/:kbId`, and its internal navigation stays within the `/admin` surface.

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
