# Phase 7: Should-Haves (Versioning + expires_at) - Research

**Researched:** 2026-04-09
**Domain:** Permission catalog refresh propagation and time-bounded permission grants
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Deferred Ideas (OUT OF SCOPE)
- Admin-facing `expires_at` creation/edit UX remains Phase SH3 / deferred.
- Any user-facing notice that permissions changed is deferred unless silent refresh proves insufficient.
- Cron-based cleanup of expired rows is deferred unless research shows a concrete operational need.
- Broader “live permission changes” behavior outside the catalog refresh boundary is not part of this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SH1 | The `GET /api/permissions/catalog` response includes a `version` field (e.g., a hash of the registry contents). The FE re-fetches and refreshes its in-memory catalog when the server version changes (via Socket.IO event or polling). Done when adding a permission server-side propagates to a connected client without requiring a hard reload. | Stable hash from BE registry, Socket.IO room/global emit, TanStack Query invalidation/polling, FE runtime catalog source replacing snapshot-only behavior. |
| SH2 | The `expires_at` column on `resource_grants` is honored by the ability builder (expired grants are not loaded). A small cron sweeps expired rows on a schedule (or filters at query time — preferred). Admin UI exposure of `expires_at` is out of scope. | Existing SQL-side expiry filters and passing tests show query-time filtering already works; remaining work is gap verification and targeted coverage, not a cron job. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Use the existing monorepo stack and workspace boundaries: backend changes stay in `be/`, frontend changes stay in `fe/`. [VERIFIED: CLAUDE.md]
- The repo prefers `code-review-graph` tools first for search/architecture work, but those MCP tools were not available in this session, so research fell back to direct code reads and `rg`. [VERIFIED: CLAUDE.md] [VERIFIED: available tools in session]
- TypeScript strict mode, single quotes, and functional patterns are required. [VERIFIED: CLAUDE.md]
- No hardcoded string literals for fixed domain values; new event names/constants should live in shared constants files rather than inline comparisons. [VERIFIED: CLAUDE.md]
- All exported TypeScript code must include JSDoc, and non-obvious control flow/integration points need inline comments. [VERIFIED: CLAUDE.md]
- Backend layering is strict `controller -> service -> model`; services must not access `db` directly. [VERIFIED: be/CLAUDE.md]
- Backend config must go through `config`, never `process.env` directly. [VERIFIED: be/CLAUDE.md]
- Frontend data-fetching belongs in `api/*Queries.ts`; UI-only hooks belong in `hooks/`. [VERIFIED: fe/CLAUDE.md]
- Frontend real-time patterns should use Socket.IO plus query invalidation. [VERIFIED: fe/CLAUDE.md]
- Query keys must come from `fe/src/lib/queryKeys.ts`; do not invent local query keys. [VERIFIED: fe/CLAUDE.md]
- No manual memoization in the FE (`React.memo`, `useMemo`, `useCallback`) unless already justified by repo rules. [VERIFIED: fe/CLAUDE.md]

## Summary

SH1 is a genuine contract and runtime gap today: the FE type for `GET /api/permissions/catalog` already expects `{ keys, version }`, but the backend controller still returns `{ permissions }`, and the runtime permission hook is explicitly documented as snapshot-only in Phase 4. [VERIFIED: fe/src/features/permissions/types/permissions.types.ts] [VERIFIED: be/src/modules/permissions/controllers/permissions.controller.ts] [VERIFIED: fe/src/lib/permissions.tsx]

The smallest correct SH1 plan is to keep the backend registry as the source of truth, add a deterministic version hash computed from a stable sort of registry entries, expose that version from the catalog endpoint, and propagate changes through one Socket.IO event plus a lightweight poll of the same endpoint or a cheaper version-only check. [VERIFIED: be/src/modules/permissions/services/permissions.service.ts] [VERIFIED: be/src/shared/permissions/index.ts] [CITED: https://socket.io/docs/v4/rooms/] [CITED: https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation] [CITED: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults]

SH2 is already implemented in the active read path much more than the roadmap implies: `resource_grants` and `user_permission_overrides` both filter `expires_at` in SQL, and `buildAbilityForV2()` consumes those model methods rather than bypassing them. Targeted backend tests passed on 2026-04-09 for expired grant filtering at both model and ability-builder levels, so Phase 7 should treat SH2 as a verification-and-gap-closure task, not a net-new feature. [VERIFIED: be/src/shared/models/resource-grant.model.ts] [VERIFIED: be/src/shared/models/user-permission-override.model.ts] [VERIFIED: be/src/shared/services/ability.service.ts] [VERIFIED: targeted tests 2026-04-09]

**Primary recommendation:** Plan SH1 as the real implementation work, and plan SH2 as “prove and tighten” with no cron sweeper unless a specific uncovered path is found. [VERIFIED: codebase grep] [VERIFIED: targeted tests 2026-04-09]

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Express | `^4.21.0` [VERIFIED: be/package.json] | Serve `/api/permissions/catalog` and emit change events from the existing backend. | Already owns the permissions routes and startup lifecycle. [VERIFIED: be/package.json] [VERIFIED: be/src/modules/permissions/routes/permissions.routes.ts] |
| Socket.IO server | `^4.8.3` [VERIFIED: be/package.json] | Push catalog-version change events to connected clients. | The backend already initializes Socket.IO at boot when enabled and exposes `emit`/`emitToRoom`. [VERIFIED: be/package.json] [VERIFIED: be/src/app/index.ts] [VERIFIED: be/src/shared/services/socket.service.ts] |
| Socket.IO client | `^4.8.3` [VERIFIED: fe/package.json] | Receive catalog-version change events in the FE. | The FE already ships a singleton socket client and event hooks. [VERIFIED: fe/package.json] [VERIFIED: fe/src/lib/socket.ts] [VERIFIED: fe/src/hooks/useSocket.ts] |
| TanStack Query | `^5.90.12` [VERIFIED: fe/package.json] | Poll fallback, cache invalidation, and silent background refetch of the permissions catalog. | The FE already isolates the catalog query key and uses TanStack Query across the app. [VERIFIED: fe/package.json] [VERIFIED: fe/src/features/permissions/api/permissionsQueries.ts] [VERIFIED: fe/src/lib/queryKeys.ts] |
| React | `^19.0.0` [VERIFIED: fe/package.json] | Host the runtime permission/ability providers. | The existing auth, ability, and provider composition is already where SH1 needs to land. [VERIFIED: fe/package.json] [VERIFIED: fe/src/app/Providers.tsx] [VERIFIED: fe/src/lib/ability.tsx] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@casl/ability` | `^6.8.0` [VERIFIED: be/package.json] | Runtime ability checks continue to gate actual access even after catalog refresh. | Keep using it as the enforcement layer; SH1 only refreshes the key-to-action/subject mapping. [VERIFIED: be/package.json] [VERIFIED: be/src/shared/services/ability.service.ts] |
| Node.js | `v22.22.1` [VERIFIED: environment probe 2026-04-09] | Local execution runtime for BE/FE tooling. | Use for build/test work in this phase. [VERIFIED: environment probe 2026-04-09] |
| Docker | `29.3.1` [VERIFIED: environment probe 2026-04-09] | Infra fallback for Postgres/Valkey/OpenSearch-backed validation. | Use when DB-backed integration tests need the project stack rather than local CLIs. [VERIFIED: environment probe 2026-04-09] [VERIFIED: CLAUDE.md] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Socket.IO push + TanStack polling | Poll-only | Simpler, but contradicts locked decision D-01 and loses fast-path propagation. [VERIFIED: 7-CONTEXT.md] |
| Query-time expiry only | Cron sweeper | Adds operational surface without improving correctness of the active read path already filtering in SQL. [VERIFIED: be/src/shared/models/resource-grant.model.ts] [VERIFIED: be/src/shared/models/user-permission-override.model.ts] |
| Hash from in-memory registry contents | DB-backed version row | DB versioning adds another state source; the registry is already the canonical catalog source. [VERIFIED: be/src/modules/permissions/services/permissions.service.ts] |

**Installation:**
```bash
npm install
```

**Version verification:** The versions above were verified from the repo’s pinned `package.json` files and environment probes in this session, not from live registry queries. [VERIFIED: be/package.json] [VERIFIED: fe/package.json] [VERIFIED: environment probe 2026-04-09]

## Architecture Patterns

### Recommended Project Structure
```text
be/src/
├── modules/permissions/              # catalog endpoint contract + mutation emitters
├── shared/permissions/               # registry source of truth + version helper
├── shared/services/socket.service.ts # broadcast change event
└── shared/constants/                 # event-name/version constants

fe/src/
├── features/permissions/api/         # runtime catalog fetch hook + polling
├── lib/permissions.tsx               # replace snapshot-only lookup with runtime state
├── lib/socket.ts                     # shared authenticated socket connection
├── hooks/useSocket.ts                # event->query invalidation or event subscription
└── app/Providers.tsx                 # mount global socket/catalog refresh bridge
```

### Pattern 1: Deterministic Catalog Version From Registry
**What:** Compute the catalog version from the same in-memory registry entries returned by `getAllPermissions()`, after sorting by stable key order. [VERIFIED: be/src/modules/permissions/services/permissions.service.ts] [VERIFIED: be/scripts/export-permissions-catalog.mjs]
**When to use:** Every `GET /api/permissions/catalog` response and every mutation/boot-sync path that needs to announce “catalog changed.” [VERIFIED: be/src/modules/permissions/routes/permissions.routes.ts] [VERIFIED: be/src/shared/permissions/index.ts]
**Why:** The FE snapshot exporter already sorts the catalog for deterministic output, which is the right precedent for a stable hash. [VERIFIED: be/scripts/export-permissions-catalog.mjs]
**Example:**
```ts
// Source: local code pattern in be/scripts/export-permissions-catalog.mjs
const entries = [...getAllPermissions()].sort((a, b) => a.key.localeCompare(b.key))
const payload = entries.map(({ key, action, subject, feature, label, description }) => ({
  key,
  action,
  subject,
  feature,
  label,
  description: description ?? null,
}))
const version = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
```

### Pattern 2: Push-First, Query-Key-Scoped Refresh
**What:** On a catalog-change socket event, invalidate or refetch only `queryKeys.permissions.catalog()`, then rebuild the FE’s permission-key lookup from the fresh response. [VERIFIED: fe/src/features/permissions/api/permissionsQueries.ts] [VERIFIED: fe/src/lib/queryKeys.ts]
**When to use:** Global runtime permission-catalog refresh. [VERIFIED: 7-CONTEXT.md]
**Why:** TanStack Query supports partial query-key invalidation, and the repo already isolates the permissions catalog cache key. [CITED: https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation] [VERIFIED: fe/src/lib/queryKeys.ts]
**Example:**
```ts
// Source: TanStack Query invalidation pattern + local queryKeys.permissions.catalog()
queryClient.invalidateQueries({ queryKey: queryKeys.permissions.catalog() })
```

### Pattern 3: Query-Time Expiry Via Model Methods
**What:** Continue enforcing `expires_at` in SQL model reads and make all ability/grant resolution paths go through those model methods. [VERIFIED: be/src/shared/models/resource-grant.model.ts] [VERIFIED: be/src/shared/models/user-permission-override.model.ts]
**When to use:** Ability rebuilds, effective grant reads, and dataset-resolution paths. [VERIFIED: be/src/shared/services/ability.service.ts] [VERIFIED: be/src/modules/permissions/services/permissions.service.ts]
**Why:** The current system already filters on `expires_at IS NULL OR expires_at > NOW()` in SQL, which uses one time source and avoids duplicate JS-side filtering. [VERIFIED: be/src/shared/models/resource-grant.model.ts] [VERIFIED: be/src/shared/models/user-permission-override.model.ts]
**Example:**
```ts
// Source: be/src/shared/models/resource-grant.model.ts
.where({ tenant_id: tenantId })
.andWhere((qb) => {
  qb.whereNull('expires_at').orWhereRaw('expires_at > NOW()')
})
```

### Anti-Patterns to Avoid
- **Adding a cron sweeper by default:** Research found no uncovered correctness need for one because active reads already filter expired rows in SQL. [VERIFIED: be/src/shared/models/resource-grant.model.ts] [VERIFIED: be/src/shared/models/user-permission-override.model.ts] [VERIFIED: targeted tests 2026-04-09]
- **Hashing unsorted registry output:** Registry side-effect load order is explicit today, but deterministic sort is still safer for a stable version contract. [VERIFIED: be/src/shared/permissions/index.ts] [VERIFIED: be/scripts/export-permissions-catalog.mjs]
- **Assuming socket invalidation works globally today:** The FE has socket hooks, but no shared `connectSocket()` call in the app provider/auth path, so a new event would be a no-op unless Phase 7 wires connection lifecycle. [VERIFIED: fe/src/lib/socket.ts] [VERIFIED: fe/src/hooks/useSocket.ts] [VERIFIED: codebase grep]
- **Leaving FE on snapshot-only permission metadata:** `useHasPermission()` currently reads a generated JSON snapshot, so a refreshed ability alone does not teach the FE about new permission keys. [VERIFIED: fe/src/lib/permissions.tsx] [VERIFIED: fe/src/generated/permissions-catalog.json]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Client-side cache refresh | Custom ad-hoc event bus | TanStack Query invalidation/refetch on `queryKeys.permissions.catalog()` | The app already standardizes cache invalidation there, and TanStack supports prefix/exact matching cleanly. [VERIFIED: fe/src/lib/queryKeys.ts] [CITED: https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation] |
| Real-time fanout | Manual websocket room tracking in feature code | Existing `socketService.emit` / `emitToRoom` / `emitToUser` helpers | The backend already centralizes Socket.IO connection and rooms in one singleton. [VERIFIED: be/src/shared/services/socket.service.ts] |
| Expiry cleanup correctness | JS-side `Date.now()` filtering scattered in services | Existing SQL filters in `ResourceGrantModel` and `UserPermissionOverrideModel` | Prevents clock skew and duplicated logic. [VERIFIED: be/src/shared/models/resource-grant.model.ts] [VERIFIED: be/src/shared/models/user-permission-override.model.ts] |
| Catalog source of truth | Separate DB-managed catalog payload | Existing registry from `getAllPermissions()` | The DB is a mirror; the code registry is canonical. [VERIFIED: be/src/modules/permissions/services/permissions.service.ts] |

**Key insight:** SH1 should reuse the repo’s existing “single source + invalidation” primitives instead of inventing a second permissions state machine. [VERIFIED: codebase review]

## Common Pitfalls

### Pitfall 1: Refreshing Abilities But Not Catalog Metadata
**What goes wrong:** Existing UI gates based on `PERMISSION_KEYS` and the generated catalog snapshot still do not know about new keys even if `/api/auth/abilities` is refreshed. [VERIFIED: fe/src/lib/permissions.tsx] [VERIFIED: fe/src/constants/permission-keys.ts]
**Why it happens:** The FE permission lookup is snapshot-only today, and `AbilityProvider` fetches rules independently from the catalog. [VERIFIED: fe/src/lib/permissions.tsx] [VERIFIED: fe/src/lib/ability.tsx]
**How to avoid:** Introduce one runtime catalog source in `lib/permissions.tsx` or a dedicated provider and rebuild the key->(action,subject) map from fresh catalog data. [VERIFIED: fe/src/lib/permissions.tsx]
**Warning signs:** New BE key exists in registry/tests, but gated FE UI never exposes it until a rebuild/export. [VERIFIED: be/scripts/export-permissions-catalog.mjs] [VERIFIED: codebase review]

### Pitfall 2: Emitting Socket Events Without a Global Socket Connection
**What goes wrong:** The backend emits a catalog-change event, but no browser receives it. [VERIFIED: be/src/shared/services/socket.service.ts] [VERIFIED: codebase grep]
**Why it happens:** `useSocketQueryInvalidation()` only listens to an existing socket instance, and the main app path does not currently call `connectSocket()`. [VERIFIED: fe/src/hooks/useSocket.ts] [VERIFIED: fe/src/app/Providers.tsx] [VERIFIED: codebase grep]
**How to avoid:** Add a provider-level authenticated socket connect/disconnect lifecycle tied to the auth session before relying on push delivery. [VERIFIED: fe/src/features/auth/hooks/useAuth.tsx] [VERIFIED: fe/src/app/Providers.tsx]
**Warning signs:** Polling path works in tests/manual verification, but socket path never fires in browser. [ASSUMED]

### Pitfall 3: Polling Too Slowly Because of Existing Query Defaults
**What goes wrong:** Fallback detection feels delayed or inconsistent. [ASSUMED]
**Why it happens:** The app’s default query `staleTime` is 5 minutes, and TanStack Query only refetches stale queries automatically unless you explicitly set `refetchInterval` or manual invalidation. [VERIFIED: fe/src/main.tsx] [CITED: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults]
**How to avoid:** Set an explicit bounded polling strategy for the catalog query rather than relying on global defaults. [CITED: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults]
**Warning signs:** Polling code exists but the network tab shows no periodic catalog request. [ASSUMED]

### Pitfall 4: Planning SH2 As New Behavior Instead of Proven Behavior
**What goes wrong:** The plan wastes time adding duplicate expiry filters or a cron job. [VERIFIED: codebase review]
**Why it happens:** REQUIREMENTS and ROADMAP still describe SH2 as if it must be built, but the current code and tests show it is already enforced in the core read path. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: .planning/ROADMAP.md] [VERIFIED: targeted tests 2026-04-09]
**How to avoid:** Treat SH2 as “verify all active paths and add missing tests,” not “re-implement expiry.” [VERIFIED: targeted tests 2026-04-09]
**Warning signs:** Proposed tasks introduce `Date.now()` checks in services or a new sweep worker without a failing path to justify them. [VERIFIED: codebase grep]

## Code Examples

Verified patterns from official sources and local code:

### Query-Key Scoped Invalidation
```ts
// Source: https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation
queryClient.invalidateQueries({ queryKey: ['permissions', 'catalog'] })
```

### Socket.IO Room Broadcast
```ts
// Source: https://socket.io/docs/v4/rooms/
io.to('some room').emit('some event')
```

### Existing Backend Grant Expiry Filter
```ts
// Source: be/src/shared/models/resource-grant.model.ts
return this.knex(this.tableName)
  .where({ tenant_id: tenantId })
  .andWhere((qb) => {
    qb.whereNull('expires_at').orWhereRaw('expires_at > NOW()')
  })
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FE permission metadata is a generated snapshot committed to git. [VERIFIED: fe/src/lib/permissions.tsx] | Phase 7 should move to runtime-refreshable catalog metadata while keeping generated constants for compile-time keys where useful. [VERIFIED: 7-CONTEXT.md] | Snapshot-only behavior was locked in Phase 4; the file explicitly says Phase 7 will introduce runtime fetch. [VERIFIED: fe/src/lib/permissions.tsx] | SH1 needs a provider/hook refactor, not just an endpoint tweak. [VERIFIED: codebase review] |
| SH2 described as future should-have. [VERIFIED: .planning/REQUIREMENTS.md] | SQL-side expiry filtering is already live in model and ability paths. [VERIFIED: be/src/shared/models/resource-grant.model.ts] [VERIFIED: be/src/shared/services/ability.service.ts] | Implemented by Phases 1-3 and validated by current tests. [VERIFIED: targeted tests 2026-04-09] | The plan should emphasize verification coverage and avoid unnecessary scope. [VERIFIED: targeted tests 2026-04-09] |

**Deprecated/outdated:**
- Treating `/api/permissions/catalog` as returning only a raw permissions array is outdated relative to FE type expectations and SH1 scope. [VERIFIED: be/src/modules/permissions/controllers/permissions.controller.ts] [VERIFIED: fe/src/features/permissions/types/permissions.types.ts]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A dedicated version-only endpoint is unnecessary and the existing catalog endpoint can shoulder polling. | Summary / Architecture Patterns | Low; planner may choose a cheaper endpoint if profiling says the full catalog payload is too heavy. |
| A2 | A provider-level socket connection tied to auth is the right FE integration point for SH1. | Architecture Patterns / Pitfalls | Medium; if another global realtime bootstrap exists outside the inspected code path, planner could overbuild. |
| A3 | Polling warning signs are inferred from current defaults rather than from a failing live runtime capture. | Common Pitfalls | Low; affects tuning, not core design. |

## Open Questions (RESOLVED)

1. **Should polling hit the full catalog endpoint or a cheaper version-only endpoint?**
   - What we know: The locked decision only requires polling fallback, not a separate route. [VERIFIED: 7-CONTEXT.md]
   - Resolution: Phase 7 plans reuse `GET /api/permissions/catalog` for polling and do not add `/catalog-version` or `/permissions/version`. [VERIFIED: .planning/phase-07-should-haves-versioning-expires-at/7.1-PLAN.md] [VERIFIED: .planning/phase-07-should-haves-versioning-expires-at/7.3-PLAN.md]
   - Rationale: The phase is optional, should stay small, and the planner was able to satisfy SH1 without introducing a second endpoint. [VERIFIED: 7-CONTEXT.md] [VERIFIED: plan review 2026-04-09]

2. **Where should the backend emit the catalog-changed event?**
   - What we know: Role/override/grant mutations already centralize in `permissions.service.ts`, and Socket.IO emit helpers already exist. [VERIFIED: be/src/modules/permissions/services/permissions.service.ts] [VERIFIED: be/src/shared/services/socket.service.ts]
   - Resolution: Emit only from `permissions.service.ts` mutation paths, not from boot-time registry sync. [VERIFIED: .planning/phase-07-should-haves-versioning-expires-at/7.1-PLAN.md]
   - Rationale: Mutation-origin emits keep the source of truth aligned with the existing admin write path and avoid noisy startup invalidation storms. [VERIFIED: 7.1-PLAN.md] [VERIFIED: plan review 2026-04-09]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | BE/FE tests and builds | ✓ | `v22.22.1` | — |
| npm | Workspace scripts | ✓ | `10.9.4` | — |
| Docker | Infra-backed validation if needed | ✓ | `29.3.1` | — |
| `psql` CLI | Direct local Postgres inspection | ✗ | — | Use `docker compose` or existing Vitest scratch-DB harness |
| `pg_isready` | Local Postgres readiness probe | ✗ | — | Use Docker health / app startup checks |
| `redis-cli` | Direct Valkey/Redis inspection | ✗ | — | Use app-level tests or Dockerized service |

**Missing dependencies with no fallback:**
- None identified for planning or code changes. [VERIFIED: environment probe 2026-04-09]

**Missing dependencies with fallback:**
- Local Postgres/Redis CLIs are missing, but the repo already uses Docker and scratch-DB test helpers for permissions validation. [VERIFIED: environment probe 2026-04-09] [VERIFIED: be/tests/permissions/_helpers.ts] [VERIFIED: CLAUDE.md]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Backend: Vitest `2.1.9`; Frontend: Vitest `3.2.4` [VERIFIED: be/package.json] [VERIFIED: FE test output 2026-04-09] |
| Config file | `be/vitest.config.ts`, `fe/vitest.unit.config.ts`, `fe/vitest.ui.config.ts` [VERIFIED: file reads] |
| Quick run command | `npm test -w be -- --run tests/permissions/models.test.ts tests/permissions/tenant-isolation.test.ts --reporter=dot` [VERIFIED: command run 2026-04-09] |
| Full suite command | `npm run test -w be` and `npm run test:run -w fe` [VERIFIED: be/package.json] [VERIFIED: fe/package.json] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SH1 | Catalog response includes stable `version`, and FE silently refreshes runtime catalog on socket/poll change detection. | FE unit + FE UI + BE unit/integration | `npm run test:run:unit -w fe -- --reporter=dot tests/features/permissions/permissionsApi.test.ts` plus new SH1 tests | ❌ Wave 0 |
| SH2 | Expired `resource_grants` do not affect effective ability rules on next rebuild. | BE integration | `npm test -w be -- --run tests/permissions/models.test.ts tests/permissions/tenant-isolation.test.ts --reporter=dot` | ✅ |

### Sampling Rate
- **Per task commit:** Run the targeted BE or FE command that matches the touched surface. [VERIFIED: package scripts]  
- **Per wave merge:** Run both targeted BE permissions tests and FE permissions/socket tests. [VERIFIED: command runs 2026-04-09]
- **Phase gate:** Targeted BE + FE tests green, plus one manual connected-client verification for SH1 socket/poll behavior. [VERIFIED: SH1 acceptance criteria]

### Wave 0 Gaps
- [ ] `be/tests/permissions/catalog-versioning.test.ts` — verify deterministic version generation and endpoint contract for `{ keys, version }`.
- [ ] `fe/tests/features/permissions/permissionsCatalogRefresh.test.tsx` — verify silent background refresh updates runtime catalog map after version change.
- [ ] Extend `fe/tests/hooks/useSocket.test.ts` — verify catalog event invalidates/refetches `queryKeys.permissions.catalog()`.
- [ ] Extend `fe/tests/lib/permissions.test.tsx` or replace with provider-backed runtime catalog tests — current coverage is snapshot-only.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Existing auth/session flow is reused, not changed directly. [VERIFIED: fe/src/features/auth/hooks/useAuth.tsx] |
| V3 Session Management | yes | Reuse authenticated session + existing socket handshake/auth model. [VERIFIED: be/src/shared/services/socket.service.ts] [VERIFIED: fe/src/lib/socket.ts] |
| V4 Access Control | yes | CASL ability engine + tenant-scoped SQL filters. [VERIFIED: be/src/shared/services/ability.service.ts] [VERIFIED: be/src/shared/models/resource-grant.model.ts] |
| V5 Input Validation | yes | Zod schemas on permissions routes. [VERIFIED: be/src/modules/permissions/routes/permissions.routes.ts] [VERIFIED: be/src/modules/permissions/schemas/permissions.schemas.ts] |
| V6 Cryptography | yes | Use Node `crypto` for version hashing if a hash is added; do not hand-roll hash logic. [ASSUMED] |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant permission leakage | Information Disclosure | Keep `tenant_id` as the leading predicate in model queries and in emitted CASL conditions. [VERIFIED: be/src/shared/models/resource-grant.model.ts] [VERIFIED: be/src/shared/services/ability.service.ts] |
| Unauthorized socket-triggered refresh spam | Denial of Service | Only trust server-emitted events; clients should not mutate catalog state directly from arbitrary payloads. [VERIFIED: be/src/shared/services/socket.service.ts] [ASSUMED] |
| Stale permission metadata after backend change | Elevation of Privilege / Authorization Drift | Invalidate/refetch catalog on bounded poll or server push; do not rely on static FE snapshot alone. [VERIFIED: fe/src/lib/permissions.tsx] [CITED: https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation] |
| Expired grants remaining effective | Elevation of Privilege | Continue SQL-side `expires_at` filtering on all active grant/override reads. [VERIFIED: be/src/shared/models/resource-grant.model.ts] [VERIFIED: be/src/shared/models/user-permission-override.model.ts] |

## Sources

### Primary (HIGH confidence)
- Local codebase files listed in `7-CONTEXT.md` — current implementation seams and contracts checked directly. [VERIFIED: codebase read]
- `https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation` — partial query-key invalidation behavior. [CITED: https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation]
- `https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults` — `staleTime`, background refetch triggers, and `refetchInterval`. [CITED: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults]
- `https://socket.io/docs/v4/rooms/` — room join/broadcast semantics for targeted emits. [CITED: https://socket.io/docs/v4/rooms/]
- Targeted test runs on 2026-04-09:
  - `npm test -w be -- --run tests/permissions/models.test.ts tests/permissions/tenant-isolation.test.ts --reporter=dot`
  - `timeout 60s npm run test:run:unit -w fe -- --reporter=dot tests/features/permissions/permissionsApi.test.ts`
  - `timeout 60s npm run test:run:ui -w fe -- --reporter=dot tests/lib/ability.test.tsx tests/lib/permissions.test.tsx tests/hooks/useSocket.test.ts` [VERIFIED: command runs 2026-04-09]

### Secondary (MEDIUM confidence)
- `https://www.npmjs.com/package/socket.io?activeTab=dependents` — npm package metadata search result for Socket.IO release recency. [VERIFIED: web search]
- `https://www.npmjs.com/package/%40tanstack/react-query/v/4.24.3` — npm search result demonstrating package metadata/search availability, though repo-pinned versions were taken from local manifests instead. [VERIFIED: web search]

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - based on repo-pinned dependencies, current code usage, and official docs for invalidation/rooms. [VERIFIED: package files] [CITED: official docs]
- Architecture: HIGH - based on current provider/socket/query seams inspected directly in code. [VERIFIED: codebase read]
- Pitfalls: HIGH - backed by direct code gaps and passing targeted tests; only polling-tuning details remain assumed. [VERIFIED: codebase read] [VERIFIED: targeted tests 2026-04-09]

**Research date:** 2026-04-09
**Valid until:** 2026-05-09
