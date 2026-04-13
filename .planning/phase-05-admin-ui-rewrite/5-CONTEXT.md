# Phase 5: Admin UI Rewrite — Context

**Gathered:** 2026-04-08
**Status:** Ready for planning
**Depends on:** Phase 4 (catalog snapshot, `PERMISSION_KEYS`, `useHasPermission`, `<Can>`, ESLint guard)

<domain>
## Phase Boundary

Give admins full UI control over **roles**, **per-user overrides**, and **resource grants** (KB + DocumentCategory) — entirely from the frontend, sourced from the build-time catalog snapshot, with zero hardcoded permission enums. Wire the rewritten admin surfaces to the BE permission endpoints shipped in Phase 3 (Wave 4).

**In scope (per ROADMAP P5.1–P5.5):**
- Rewrite `fe/src/features/users/pages/PermissionManagementPage.tsx` as a registry-driven role × permission matrix (P5.1)
- New per-user override editor surface (P5.2)
- Rewire `KnowledgeBasePermissionModal.tsx` + `EntityPermissionModal.tsx` to `/api/permissions/grants` (P5.3)
- i18n (en/vi/ja) + dark-mode pass on all new surfaces (P5.4)
- Vitest coverage on `useHasPermission`, `<Can>`, and matrix CRUD flows (P5.5)

**In scope (added during discussion):**
- **NEW P5.6 — "Effective Access" page** — read-mostly users & teams × permissions matrix powered by the existing `whoCanDo` BE helper, with drill-down links into the P5.2 override editor and P5.3 grant modals. **This is scope addition, not in the original roadmap.** Justified because (a) `whoCanDo` is already shipped, so it's wire-up not net-new BE work, and (b) the user explicitly asked for a user/team-centric view alongside the role matrix. Planner should treat as a new plan slot, not smuggle into P5.1.

**Out of scope (deferred or other phases):**
- Backend changes — all endpoints already exist (Phase 3, Wave 4)
- Force-refresh of other users' sessions → Phase 7 (SH1 hot-reload)
- `expires_at` UI controls → SH3 (deferred)
- Self-service "what can I do" page → SH4 (deferred)
- Permission templates (flagged in roadmap "Out-of-band concerns")

</domain>

<decisions>
## Implementation Decisions

### P5.1 — Role × Permission Matrix
- **D-01: Layout = roles × permissions grid, grouped by feature module.**
  - Columns = roles (`admin`, `leader`, `member`, `super-admin`); rows = permission keys grouped into collapsible sections by the dotted-prefix feature (e.g. `dataset.*`, `agent.*`, `knowledgebase.*`).
  - Section headers come from `PERMISSION_KEYS` grouping; no hardcoded module list.
  - Closest to roadmap "matrix view" phrasing and scales to 22 modules.

- **D-02: Save model = batch with dirty-state tracking + sticky "Save changes (N)" button.**
  - Admin toggles freely; matrix tracks dirty cells per role.
  - On Save, fire **one `PUT /api/permissions/roles/:role` per dirty role** (BE atomically replaces the role's permission set via `RolePermissionModel.replaceForRole`).
  - Optimistic update; on success, invalidate the role-permission TanStack Query cache and show R-10 toast (D-09).
  - Cancel = clear dirty state, no PUT.
  - Per-cell autosave **rejected** because it multiplies BE calls and fights the atomic-replace semantics.

### P5.2 — Per-User Override Editor
- **D-03: Surface = new "Permissions" tab on the user detail page.**
  - Persistent URL (`/users/:id?tab=permissions` or equivalent — planner to decide route shape).
  - Matches roadmap phrasing "New flow on user detail page".
  - Modal + slide-over rejected because the override list can grow long and admins need a stable URL for investigation.

- **D-04: Allow/deny UX = two-list "Allow overrides" + "Deny overrides" with add-from-catalog picker.**
  - Each section is empty by default (admins start with role inheritance only).
  - "Add allow" / "Add deny" buttons open a searchable catalog-key picker grouped by feature.
  - Each row has a `[×]` remove button.
  - Maps 1:1 to `user_permission_overrides` rows where `effect ∈ {allow, deny}`.
  - Uses `POST /api/permissions/users/:userId/overrides` and `DELETE /api/permissions/users/:userId/overrides/:id`.
  - Tri-state checkbox list **rejected** as too noisy when only 2 overrides exist.

- **D-05: Effective view = collapsed "Effective permissions" panel below the editor.**
  - Editor stays clean and override-only (auditable).
  - Below, a collapsible panel shows the merged effective permission set (role defaults + overrides + grants relevant to this user) so the admin can verify a change without leaving the page.
  - Data source: `whoCanDo` helper or an equivalent FE-side merge using catalog + role-permissions + this user's overrides.

### P5.3 — Resource Grant Modal Rewire
- **D-06: Principal picker = single combined search with type-filter chips.**
  - One search input. Result rows show users, teams, and roles intermixed, each with a type icon and label.
  - Filter chips above the results: `[All] [Users] [Teams] [Roles]`.
  - Selected principal becomes the grantee for the new grant row.
  - Tabbed picker rejected (extra clicks); three-stacked-fields rejected (verbose).

- **D-07: Existing grants = inline list inside the modal, above the add form.**
  - Modal opens showing "Current grants" for this KB/category with `[×]` remove buttons.
  - "Add grant" form below uses the D-06 picker.
  - Same context = same modal — matches Notion / Linear / GitHub collaborator UX.
  - Separate "Sharing page" rejected (extra navigation for routine edits).

- **D-08: KB-level vs DocumentCategory-level = single modal with scope toggle at the top.**
  - Scope switcher: "Whole knowledge base" vs "Specific category".
  - When "Specific category" is chosen, a category picker appears.
  - Same picker + actions UI for both cases — one component, not two.
  - Both `KnowledgeBasePermissionModal.tsx` and `EntityPermissionModal.tsx` should converge on this shared modal (planner to decide whether one wraps the other or they share an internal component).
  - Endpoints: `/api/permissions/grants` family (Phase 3, Wave 4).

### R-10 — Session Refresh Notice
- **D-09: Post-save toast on every mutation across P5.1, P5.2, P5.3.**
  - Toast text (en, with vi/ja translations in P5.4): *"Saved. Affected users will see changes on their next request — they may need to refresh."*
  - Surfaces only when relevant (after a successful mutation), so it doesn't clutter the UI for browse-only sessions.
  - Persistent banner rejected (noise); inline-only hint rejected (too easy to miss to satisfy R-10).

- **D-10: No force-refresh of other users' sessions in Phase 5.**
  - Force-refresh requires WebSocket push or session-broadcast infra that doesn't exist today.
  - Deferred to Phase 7 (SH1 hot-reload) where it can be built alongside the runtime catalog fetch.

### P5.6 (NEW) — Effective Access Page
- **D-11: New read-mostly admin page: users & teams × permissions matrix powered by `whoCanDo`.**
  - Rows = features (permission keys grouped by feature, same grouping as D-01).
  - Columns = users + teams (paginated/searchable; the cartesian product is too large to render at once — planner must decide pagination/virtualization).
  - Each cell shows whether the principal effectively has the permission (✓/✗) with a hover/click → drill-down to "why" (role default vs override vs grant).
  - Drill-down links: edit a user cell → opens the user's P5.2 override editor; edit a team cell → opens the relevant P5.3 grant modal.
  - Read-mostly: edits happen via P5.2 / P5.3, not inline in this matrix.
  - Data source: `permissionService.whoCanDo(action, subject, resourceId?)` shipped in Phase 3, Wave 4 (TS14).
  - **Planner: this is a new plan slot (P5.6), not part of P5.1.**

### Claude's Discretion
- Exact route shape for the user detail "Permissions" tab (D-03) — query param vs subroute.
- Whether the two grant modals (`KnowledgeBasePermissionModal`, `EntityPermissionModal`) converge into one shared component or one wraps the other (D-08).
- Pagination/virtualization strategy for the Effective Access matrix (D-11).
- Toast component reuse (use existing toast system; don't introduce a new one).
- Loading skeletons / empty states across all new surfaces.
- Form-state primitives (per fe/CLAUDE.md: native `useState`, no form libraries).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase boundary & requirements
- `.planning/ROADMAP.md` §"Phase 5: Admin UI Rewrite" — phase goal, plan list, verification criteria, R-10
- `.planning/REQUIREMENTS.md` TS12 (admin UI rewrite), TS14 (`whoCanDo`), TS15 (FE matrix tests)
- `.planning/research/RISKS.md` R-10 (session refresh on permission change)

### Prior phase context (locked decisions Phase 5 inherits)
- `.planning/phase-04-fe-catalog-can-codemod/4-CONTEXT.md` — D-01 (`<Can>` vs `useHasPermission` rule), D-04 revised (snapshot-only catalog), D-05 (`PERMISSION_KEYS` constants), D-06 (snapshot→generator→codemod sequencing)
- `.planning/phase-04-fe-catalog-can-codemod/4.5-SUMMARY.md` — final ESLint rule that bans role-string comparisons; new admin code must not regress

### BE contracts (frozen — Phase 3, Wave 4)
- `be/src/modules/permissions/` — controller, service, model layer for the 10 admin CRUD endpoints
- `PUT /api/permissions/roles/:role` — atomic role permission replacement (used by D-02)
- `GET/POST/DELETE /api/permissions/users/:userId/overrides` — used by D-04
- `GET/POST/DELETE /api/permissions/grants` family — used by D-06/D-07/D-08
- `permissionService.whoCanDo(action, subject, resourceId?)` — used by D-05 effective panel and D-11 Effective Access page

### Frontend conventions
- `fe/CLAUDE.md` — API layer split (`*Api.ts` + `*Queries.ts`), no manual memoization, i18n in 3 locales, dark mode mandatory, native `useState` for forms, no form libs
- `fe/STATE_MANAGEMENT.md` — URL state for filterable views (relevant for matrix filters and Effective Access pagination)

### Existing files to rewrite
- `fe/src/features/users/pages/PermissionManagementPage.tsx` (P5.1)
- `fe/src/features/knowledge-base/components/KnowledgeBasePermissionModal.tsx` (P5.3)
- `fe/src/features/knowledge-base/components/EntityPermissionModal.tsx` (P5.3)

### Catalog source
- `fe/src/generated/permissions-catalog.json` (Phase 4 snapshot)
- `fe/src/constants/permission-keys.ts` (generated from snapshot)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`PERMISSION_KEYS` constants** (Phase 4) — drives all matrix rows, override picker options, and grant action lists. No hardcoded enums anywhere in Phase 5.
- **`useHasPermission(key)`** (Phase 4) — gates the admin pages themselves (likely `SYSTEM_VIEW` or a dedicated permission catalog admin key — planner to confirm).
- **`<Can>`** — for any per-row gating that needs CASL subject reasoning.
- **`AbilityProvider`** + `/api/auth/abilities` fetch — unchanged; new admin pages consume it like the rest of the app.
- **`permissionService.whoCanDo`** (BE, Phase 3 Wave 4) — powers D-05 effective panel and the entire D-11 Effective Access page.
- **`RolePermissionCacheService`** (BE, Phase 3 Wave 4) — already invalidates server-side on every mutation; FE just needs to invalidate its TanStack Query caches and show the R-10 toast.
- **shadcn/ui components** — Card, Table, Tabs, Dialog, Combobox/Command, Toast (planner should reuse, not reinvent).

### Established Patterns
- API split convention (`fe/CLAUDE.md`): create `permissionsApi.ts` (raw HTTP) + `permissionsQueries.ts` (TanStack Query hooks) for the new admin endpoints if not already present.
- Modal rewrite pattern: keep the existing modal component file paths so call sites don't move; rewrite their internals.
- ESLint rule from Phase 4.5 will enforce no role-string comparisons in any new admin code.

### Integration Points
- **User detail page** — needs a new "Permissions" tab slot (D-03). Locate the existing tab system in `fe/src/features/users/`.
- **KB detail page** — already launches `KnowledgeBasePermissionModal`; rewire is in-place.
- **Sidebar nav** — add a new entry for the Effective Access page (P5.6); gate with the same admin permission as PermissionManagementPage. Phase 4.5 nav system uses `useHasPermission`-resolved keys.
- **Toast system** — reuse existing toast component for the R-10 notice (D-09).

</code_context>

<specifics>
## Specific Ideas

- The user explicitly framed the "user/team-centric matrix" mental model, which is what motivated the new P5.6 plan slot. Planner should treat the Effective Access page as a real deliverable, not an afterthought.
- The R-10 toast text should mention "next request" / "may need to refresh" — admins need to understand why the change isn't instant in other users' active sessions.
- Both grant modals should converge on a shared internal component to avoid the duplication that exists today.

</specifics>

<deferred>
## Deferred Ideas

- **Force-refresh other users' sessions from the UI** → Phase 7 (SH1 hot-reload). Requires WebSocket / session-broadcast infra not yet built.
- **Permission templates** (e.g., "Apply 'Editor' template to this user") — flagged in ROADMAP "Out-of-band concerns" for Phase 5; revisit only if a real need surfaces during execution.
- **`expires_at` controls in admin UI** → SH3 (deferred stretch).
- **Self-service "what can I do" profile sub-page** → SH4 (deferred stretch). Note: D-11's Effective Access page is admin-facing, not self-service — they're distinct.
- **Bulk apply across multiple users / multi-select edit in Effective Access** — out of scope for Phase 5; revisit if admins request it post-launch.

</deferred>

---

*Phase: 05-admin-ui-rewrite*
*Context gathered: 2026-04-08*
