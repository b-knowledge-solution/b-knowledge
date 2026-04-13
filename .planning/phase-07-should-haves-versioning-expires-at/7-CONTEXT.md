# Phase 7: Should-Haves (Versioning + expires_at) - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 remains optional and covers only the two milestone should-haves already in the roadmap:

1. **SH1: Permission catalog versioning** — the backend catalog endpoint exposes a stable version hash and the frontend refreshes its in-memory catalog when that version changes, without requiring a hard reload.
2. **SH2: Time-bounded grants (`expires_at`)** — keep expired resource grants from affecting effective permissions using query-time enforcement, with no extra admin UI work in this milestone.

**In scope:**
- `GET /api/permissions/catalog` response contract update for versioning
- FE detection and refresh flow for changed catalog versions
- Lightweight runtime trigger path for version refresh
- Tightening or validating `expires_at` behavior in the active ability/grant paths
- Tests proving both SH1 and SH2

**Out of scope:**
- Admin UI to create or edit `expires_at` values (still SH3 / deferred)
- Forced full-page reload UX
- Large cache-busting or deployment orchestration beyond catalog refresh
- Cron-based cleanup unless planning discovers a hard requirement that contradicts current assumptions

</domain>

<decisions>
## Implementation Decisions

### Catalog change detection
- **D-01:** Use **Socket.IO event + polling fallback** for catalog refresh detection.
- **D-02:** Socket push is the fast path for connected clients, but polling must cover reconnect gaps, sleeping tabs, and sessions that miss the event.
- **D-03:** Polling exists as resilience, not as the primary mechanism. Planning should keep it lightweight and bounded.

### Client refresh behavior
- **D-04:** Catalog changes refresh **silently in the background**.
- **D-05:** No toast, modal, or forced reload prompt is required for Phase 7.
- **D-06:** The goal is that connected clients pick up new permission keys without disrupting current work.

### `expires_at` enforcement
- **D-07:** Phase 7 uses **query-time enforcement only** for expired resource grants.
- **D-08:** Do **not** add a cron sweeper in this phase unless research proves the current query-time approach is insufficient.
- **D-09:** The canonical behavior target is: an expired grant disappears on the **next server-side ability rebuild / active grant read path**, not by background cleanup timing.

### Scope clarifications from the live codebase
- **D-10:** SH1 is a real gap, not a net-new invention. FE types already expect a catalog `version`, but the BE controller still returns only `{ permissions }`.
- **D-11:** SH2 is partially implemented already. `resource_grants` and `user_permission_overrides` are filtered by `expires_at` in SQL model reads today, so Phase 7 should avoid duplicating that behavior and instead close any remaining contract gaps in the active ability path and verification.

### the agent's Discretion
- Exact polling interval and retry behavior
- Exact Socket.IO event name and emitter location
- Whether catalog refresh invalidates TanStack Query entries directly or reuses an existing permission-query flow
- How the version hash is computed, as long as it is stable for identical registry contents
- Whether SH2 needs code changes, tests only, or both after research verifies the current path end-to-end

</decisions>

<specifics>
## Specific Ideas

- The preferred Phase 7 shape is the **minimal useful version**:
  - push-first detection
  - polling as fallback
  - silent in-memory refresh
  - query-time expiry handling only
- The phase should stay small. If planning finds that SH1 or SH2 expands into operational complexity, the milestone may still defer Phase 7 entirely rather than let it sprawl.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning and requirements
- `.planning/ROADMAP.md` — Phase 7 goal, plans, and optional status
- `.planning/REQUIREMENTS.md` §SH1-SH2 — should-have acceptance criteria
- `.planning/STATE.md` — current milestone status and the decision point after Phase 6

### Backend catalog path
- `be/src/modules/permissions/controllers/permissions.controller.ts` — current `GET /api/permissions/catalog` response shape
- `be/src/modules/permissions/services/permissions.service.ts` — current catalog source-of-truth path via registry
- `be/src/modules/permissions/routes/permissions.routes.ts` — route contract and auth gating
- `be/src/shared/permissions/index.ts` — registry aggregation source for catalog contents

### Frontend catalog consumers
- `fe/src/features/permissions/types/permissions.types.ts` — FE already models `keys + version`
- `fe/src/features/permissions/api/permissionsApi.ts` — runtime catalog fetch contract
- `fe/src/features/permissions/api/permissionsQueries.ts` — TanStack Query integration point
- `fe/src/lib/queryKeys.ts` — existing cache key for the catalog query

### Expiry / ability behavior
- `be/src/shared/services/ability.service.ts` — active V2 ability builder path
- `be/src/shared/models/resource-grant.model.ts` — SQL-side `expires_at` filtering for grants
- `be/src/shared/models/user-permission-override.model.ts` — SQL-side `expires_at` filtering for overrides
- `be/tests/permissions/models.test.ts` — current model-level expiry coverage
- `be/tests/permissions/tenant-isolation.test.ts` — existing expired-vs-live grant test coverage

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `permissionsService.getCatalog()` already returns the full registry payload from code, so SH1 can build on the existing source of truth instead of introducing a second catalog source.
- `usePermissionCatalog()` already exists on the FE, giving Phase 7 a natural runtime refresh entry point.
- `queryKeys.permissions.catalog()` already isolates the catalog cache key, so background refresh can stay narrow.

### Established Patterns
- Catalog reads are routed through the permissions admin module and gated by `permissions.view`.
- The FE already separates raw API calls from TanStack Query hooks, so Phase 7 should preserve that split.
- The active backend permission system already prefers SQL-side expiry filtering over background cleanup jobs.

### Integration Points
- The backend needs a stable way to expose and possibly broadcast catalog version changes from the permissions registry path.
- The frontend needs a single place to compare server version against in-memory state and trigger a silent refresh.
- SH2 planning should verify that every effective-permission path relevant to `resource_grants` is already honoring `expires_at`, then patch only the missing paths.

</code_context>

<deferred>
## Deferred Ideas

- Admin-facing `expires_at` creation/edit UX remains Phase SH3 / deferred.
- Any user-facing notice that permissions changed is deferred unless silent refresh proves insufficient.
- Cron-based cleanup of expired rows is deferred unless research shows a concrete operational need.
- Broader “live permission changes” behavior outside the catalog refresh boundary is not part of this phase.

</deferred>

---

*Phase: 07-should-haves-versioning-expires-at*
*Context gathered: 2026-04-09*
