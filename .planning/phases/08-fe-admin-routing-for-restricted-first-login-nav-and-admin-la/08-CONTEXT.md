# Phase 8: FE admin routing for restricted first-login nav and /admin layout with data-studio, agent-studio, IAM, system sections - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Split the authenticated frontend into two route/layout areas:

- the standard logged-in app shell shows only `Chat` and `Search` in its sidebar
- a separate admin shell under `/admin/...` contains all admin features grouped into `Data Studio`, `Agent Studio`, `IAM`, and `System`

This phase covers frontend routing, shell/layout separation, sidebar/menu behavior, and admin entry navigation. It does not add new admin capabilities beyond moving existing admin features onto `/admin/...` paths.

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<specifics>
## Specific Ideas

- The user explicitly wants "2 sidebar, one for all user only have chat and search, and another is only have admin faeture".
- `/admin` should open at `/admin/data-studio/knowledge-base`.
- The `Administrator` menu item belongs in the user dropdown, positioned before logout.
- The role gate is explicit: `leader`, `admin`, and `super-admin`.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and project constraints
- `.planning/ROADMAP.md` §Phase 8 — Phase entry and current scope anchor for this routing split
- `.planning/STATE.md` §Roadmap Evolution — records why Phase 8 was added now

### Frontend architecture and conventions
- `fe/CLAUDE.md` — FE routing, layout, i18n, permission-gating, and module-boundary conventions

### Existing routing and shell registration
- `fe/src/app/App.tsx` — current protected route tree and the existing placement of admin routes
- `fe/src/app/routeConfig.ts` — route metadata map and dynamic-path matching behavior
- `fe/src/layouts/MainLayout.tsx` — current authenticated shell composition
- `fe/src/layouts/Sidebar.tsx` — current sidebar rendering and user dropdown insertion point
- `fe/src/layouts/sidebarNav.ts` — current nav grouping and route-to-permission mapping
- `fe/src/features/auth/components/AdminRoute.tsx` — existing admin-only gate pattern in FE
- `fe/src/features/auth/hooks/useAuth.tsx` — source of `user.role` values used for the explicit `/admin` role gate

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fe/src/layouts/MainLayout.tsx`: current authenticated shell already composes `Sidebar`, `Header`, and `Outlet`; likely reusable as the base for a split standard/admin shell.
- `fe/src/layouts/Sidebar.tsx`: already owns both nav rendering and the user dropdown, so it is the natural place to insert the new `Administrator` entry.
- `fe/src/layouts/sidebarNav.ts`: current nav is declarative, grouped, and permission-aware; this phase should likely split or derive separate nav configs rather than hardcoding conditional JSX.
- `fe/src/app/routeConfig.ts`: title/header/full-bleed behavior is centralized, so `/admin/...` pages should be registered here instead of scattering metadata.

### Established Patterns
- Route registration is three-part: add metadata in `routeConfig.ts`, add `<Route>` elements in `App.tsx`, and add sidebar entries in `sidebarNav.ts`.
- Existing admin pages are already implemented and mostly guarded through `NavRoleGuard` plus permission keys; the new phase should re-home them instead of rebuilding page logic.
- FE guidance prefers permission keys for feature visibility, but this phase has a locked exception for the admin shell entry/access itself: gate `/admin` by explicit role membership (`leader`, `admin`, `super-admin`).

### Integration Points
- The `/admin` shell must connect to existing page modules in `features/dashboard`, `features/datasets`, `features/knowledge-base`, `features/users`, `features/permissions`, `features/system`, `features/chat`, `features/search`, `features/agents`, `features/memory`, and `features/histories`.
- The user dropdown in `Sidebar.tsx` must integrate the new admin entry without removing `API Keys`, `Settings`, or `Logout`.
- Any route metadata or helper matching that currently assumes `/data-studio/...`, `/iam/...`, `/system/...`, or `/agent-studio/...` must be updated to understand `/admin/...` prefixed paths.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-fe-admin-routing-for-restricted-first-login-nav-and-admin-la*
*Context gathered: 2026-04-10*
