# Phase 9: Update docs with current milestone. Update all SRS, basic design and detail design for new permission feature on fe and be, i need it detail for new developer who will add new permission and maintain it later - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Update the product documentation set so it reflects the current permission-system milestone as implemented in the codebase. This phase covers:

- correcting outdated permission, role, and authorization content in existing SRS documents
- correcting outdated high-level/basic design documents for security, component, API, and database views where the permission overhaul changed the architecture
- correcting outdated detail-design documents for authorization and user/team permission flows
- adding one maintainer-focused permission guide for future developers who need to add new permissions or maintain the permission system later

This phase is documentation-only. It does not change permission behavior, APIs, schemas, or UI flows beyond documenting what already exists.

</domain>

<decisions>
## Implementation Decisions

### Documentation strategy
- **D-01:** Update existing SRS, basic-design, and detail-design documents in place rather than replacing the documentation set wholesale.
- **D-02:** Add one new maintainer-focused permission guide in addition to the in-place updates, because the existing docs are architecture-oriented and do not provide a safe extension workflow for future developers.
- **D-03:** The documentation update must reflect the current milestone state, not the pre-overhaul or legacy authorization model.

### Maintainer guide scope
- **D-04:** The new maintainer guide must cover the full "add a new permission" flow across backend, frontend, admin UI, tests, i18n, and documentation updates.
- **D-05:** The maintainer guide must be prescriptive and operational, not just conceptual. It should include step-by-step checklists, file maps, extension rules, and common mistakes.
- **D-06:** The maintainer guide should be written for a developer who did not build the milestone and needs to safely maintain it later.

### Source-of-truth policy
- **D-07:** Code remains the source of truth for permission behavior. Documentation must explain the architecture and maintenance workflow, but it must not invent behavior that is not present in the codebase.
- **D-08:** The new maintainer guide must link directly to the exact backend and frontend files that future developers will edit when adding or maintaining permissions.
- **D-09:** Planning artifacts may inform scope and historical intent, but they are not the long-term canonical product documentation. The docs must stand on their own for future maintainers.

### Documentation coverage expectations
- **D-10:** The updated documentation must cover both FE and BE permission architecture, not just backend authorization internals.
- **D-11:** The updated documentation must explain the current role model and remove obsolete language such as legacy `member`/pre-overhaul `rbac.ts`-centric behavior where it is no longer true.
- **D-12:** The updated documentation must describe how a new permission propagates through the system: registry/catalog, enforcement, frontend gating, admin surfaces, tests, and operational verification.

### the agent's Discretion
- Exact document split and whether the new maintainer guide lives under `docs/detail-design/auth/` or a closely related docs category, as long as it is easy to discover from the current docs navigation.
- Exact file list to update across SRS/basic/detail design, provided the final set closes the documented drift between docs and current code.
- Exact amount of diagramming versus prose, as long as the resulting docs remain practical for maintainers and accurate to the implemented system.

</decisions>

<specifics>
## Specific Ideas

- The user explicitly wants the docs updated for the "current milestone", not a generic future-state redesign.
- The user wants the documentation to be detailed enough for "new developer who will add new permission and maintain it later".
- The user approved the strongest documentation option: in-place corrections plus a new maintainer guide, with code treated as canonical and the docs written as a procedural guide.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and planning context
- `.planning/ROADMAP.md` §Phase 9 — scope anchor for this documentation phase
- `.planning/PROJECT.md` — milestone purpose and the permission-system core value
- `.planning/REQUIREMENTS.md` — locked permission-system decisions and acceptance matrix
- `.planning/STATE.md` — current milestone status and roadmap evolution

### Documentation workspace rules
- `docs/CLAUDE.md` — required docs placement, naming, sidebar update rules, and build verification
- `docs/.vitepress/config.ts` — current nav/sidebar structure that must be updated if new docs are added or moved

### Existing docs that are likely permission-drifted and need correction
- `docs/srs/core-platform/fr-user-team-management.md` — current SRS page most directly responsible for roles and permissions
- `docs/srs/core-platform/fr-authentication.md` — auth/session boundary that may need alignment with current permission behavior
- `docs/basic-design/system-infra/security-architecture.md` — high-level security/authorization model, currently legacy-oriented
- `docs/basic-design/component/api-design-overview.md` — API authorization shape and error expectations
- `docs/basic-design/component/api-design-endpoints.md` — endpoint-level permission descriptions that may now be stale
- `docs/basic-design/database/database-design-core.md` — user/team/role tables
- `docs/basic-design/database/database-design-rag.md` — KB/resource-grant related storage surfaces
- `docs/detail-design/auth/rbac-abac.md` — legacy summary auth design that is currently out of date
- `docs/detail-design/auth/rbac-abac-comprehensive.md` — comprehensive auth reference that must be reconciled with the implemented overhaul
- `docs/detail-design/user-team/user-management-overview.md` — user-management permission flows
- `docs/detail-design/user-team/user-management-detail.md` — user-operation permission flows and invalidation behavior
- `docs/detail-design/user-team/team-management-detail.md` — team permission inheritance and related flows

### Backend permission implementation
- `be/src/shared/permissions/registry.ts` — permission catalog entry point
- `be/src/shared/permissions/sync.ts` — boot sync from code registry to DB catalog
- `be/src/shared/permissions/legacy-mapping.ts` — legacy-to-new mapping context
- `be/src/shared/config/rbac.ts` — current shim/compatibility surface, not the old canonical source
- `be/src/shared/services/ability.service.ts` — effective ability construction and permission evaluation
- `be/src/shared/services/role-permission-cache.service.ts` — cached role-permission snapshot behavior
- `be/src/shared/middleware/auth.middleware.ts` — enforcement path for `requirePermission` / `requireAbility`
- `be/src/modules/permissions/` — permission catalog, role/override/grant APIs, and admin-side backend contract
- `be/src/shared/constants/resource-grants.ts` — resource grant constants and subject/action vocabulary

### Frontend permission implementation
- `fe/src/lib/permissions.tsx` — frontend permission catalog/provider surface
- `fe/src/lib/ability.tsx` — CASL ability consumption on the FE
- `fe/src/features/permissions/api/permissionsApi.ts` — raw permission/admin HTTP layer
- `fe/src/features/permissions/api/permissionsQueries.ts` — query hooks for permission admin flows
- `fe/src/features/permissions/components/PermissionMatrix.tsx` — role-permission matrix UI
- `fe/src/features/permissions/components/OverrideEditor.tsx` — per-user override UI
- `fe/src/features/permissions/components/ResourceGrantEditor.tsx` — resource grant maintenance UI
- `fe/src/features/permissions/pages/EffectiveAccessPage.tsx` — effective access surface
- `fe/src/generated/permissions-catalog.json` and `fe/scripts/generate-permission-keys.mjs` — FE-side generated permission catalog artifacts

### Test surfaces that should inform maintainer guidance
- `be/tests/permissions/` — backend permission-system regression, migration, middleware, grant, and catalog tests
- `fe/tests/features/permissions/` — frontend admin UI and catalog refresh tests
- `fe/tests/lib/permissions.test.tsx` — frontend permission-provider behavior

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `docs/CLAUDE.md`: already defines where SRS/basic/detail design docs belong and requires VitePress sidebar updates plus a docs build after changes.
- `docs/.vitepress/config.ts`: centralizes docs navigation, so any new maintainer guide must be added here to be discoverable.
- `docs/detail-design/auth/`: already contains the most relevant authorization docs, making it the likely home for a future maintainer guide unless planning finds a clearer category.
- `be/src/shared/permissions/registry.ts` + per-module `*.permissions.ts` files: these are the concrete backend extension points the future maintainer guide must explain.
- `fe/src/features/permissions/` and `fe/src/lib/permissions.tsx`: these provide the concrete frontend/admin surfaces that documentation should point maintainers toward.

### Established Patterns
- The docs site is category-based and strongly structured; updates should reuse the existing SRS/basic/detail design taxonomy rather than inventing an ad hoc doc location.
- The current docs contain substantial legacy authorization language: `member`, old `rbac.ts` source-of-truth assumptions, and older ABAC grant structures. Planning must treat documentation drift as a first-class correction target.
- Permission behavior now spans registry sync, DB catalog, CASL ability building, middleware enforcement, FE catalog consumption, admin management UI, and targeted tests. A maintainer guide that omits any of these steps will be incomplete.

### Integration Points
- Documentation changes must connect planning artifacts, docs pages, backend permission architecture, frontend gating/admin UI, and docs-site navigation.
- The new maintainer guide should connect directly to the BE registry files, FE catalog/gating files, permission admin UI, and the test directories used to validate new permissions.
- Any new or renamed documentation page must also be integrated into `docs/.vitepress/config.ts` so future maintainers can actually find it.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-update-docs-with-current-milestone-update-all-srs-basic-desi*
*Context gathered: 2026-04-12*
