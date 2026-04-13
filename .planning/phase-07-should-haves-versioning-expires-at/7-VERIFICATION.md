---
phase: 07-should-haves-versioning-expires-at
verified: 2026-04-09T13:20:24Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Verify live silent catalog refresh in a real authenticated browser session"
    expected: "After a server-side permission-catalog change, an already-open authenticated tab updates its in-memory catalog without a hard reload, toast, or modal; socket push is the fast path and polling self-heals within the configured fallback window."
    why_human: "This requires end-to-end browser, auth-session, and Socket.IO transport behavior across a live backend/frontend stack. Automated tests prove the wiring, but not the full runtime UX."
---

# Phase 7: Should-Haves (Versioning + expires_at) Verification Report

**Phase Goal:** By end of this phase, the catalog endpoint exposes a version hash that triggers FE refresh, and `expires_at` on `resource_grants` is honored by the ability builder — IF the milestone is on track.
**Verified:** 2026-04-09T13:20:24Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Wave 0 SH1 harnesses exist and are runnable before implementation plans extend them. | ✓ VERIFIED | [be/tests/permissions/catalog-versioning.test.ts](/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/catalog-versioning.test.ts), [fe/tests/features/permissions/permissionsCatalogRefresh.test.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/tests/features/permissions/permissionsCatalogRefresh.test.tsx), [fe/tests/features/permissions/permissionsApi.test.ts](/mnt/d/Project/b-solution/b-knowledge/fe/tests/features/permissions/permissionsApi.test.ts), and [fe/tests/lib/permissions.test.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/tests/lib/permissions.test.tsx) all exist and targeted FE/BE test commands execute successfully. |
| 2 | Authenticated clients can read a catalog response with a stable version token. | ✓ VERIFIED | [permissions.controller.ts](/mnt/d/Project/b-solution/b-knowledge/be/src/modules/permissions/controllers/permissions.controller.ts) returns `permissionsService.getVersionedCatalog()`, and [permissions.service.ts](/mnt/d/Project/b-solution/b-knowledge/be/src/modules/permissions/services/permissions.service.ts) computes a SHA-256 hash from a stable sort of registry entries. Backend test `catalog-versioning.test.ts` passed. |
| 3 | A permissions mutation emits one canonical server-side catalog-change signal without restart. | ✓ VERIFIED | [permissions.service.ts](/mnt/d/Project/b-solution/b-knowledge/be/src/modules/permissions/services/permissions.service.ts) calls `socketService.emit(SocketEvents.PermissionsCatalogUpdated, { version })` after successful role/override/grant mutations, and [socket-events.ts](/mnt/d/Project/b-solution/b-knowledge/be/src/shared/constants/socket-events.ts) centralizes the event name. Backend test `catalog-versioning.test.ts` passed this mutation seam. |
| 4 | Catalog polling reuses `GET /api/permissions/catalog` rather than adding a second version endpoint. | ✓ VERIFIED | [permissionsApi.ts](/mnt/d/Project/b-solution/b-knowledge/fe/src/features/permissions/api/permissionsApi.ts) exposes only `/api/permissions/catalog`, [permissionsQueries.ts](/mnt/d/Project/b-solution/b-knowledge/fe/src/features/permissions/api/permissionsQueries.ts) polls that query key, and repo grep found no `/catalog-version` or `/permissions/version` FE/BE endpoint usage. |
| 5 | An authenticated tab can refresh its in-memory permission catalog silently after the server version changes. | ✓ VERIFIED | [permissions.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/lib/permissions.tsx) seeds from snapshot, hydrates from `usePermissionCatalog(Boolean(user))`, and swaps the in-memory map only when `data.version` changes. FE UI tests prove live catalog precedence and map replacement without user-facing UI. |
| 6 | Socket push is the fast path, and missed events are recovered by bounded polling of the same catalog endpoint. | ✓ VERIFIED | [AuthenticatedSocketBridge.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/app/AuthenticatedSocketBridge.tsx) connects sockets only for authenticated sessions; [useSocket.ts](/mnt/d/Project/b-solution/b-knowledge/fe/src/hooks/useSocket.ts) invalidates `queryKeys.permissions.catalog()` on `SOCKET_EVENTS.PERMISSIONS_CATALOG_UPDATED`; [permissionsQueries.ts](/mnt/d/Project/b-solution/b-knowledge/fe/src/features/permissions/api/permissionsQueries.ts) sets a 5-minute `refetchInterval`. FE UI tests passed for socket invalidation and polling fallback. |
| 7 | Expired grants and overrides stop affecting effective permissions on the next server-side rebuild. | ✓ VERIFIED | [ability.service.ts](/mnt/d/Project/b-solution/b-knowledge/be/src/shared/services/ability.service.ts) reads grants via `ModelFactory.resourceGrant.findActiveForUser(...)` and overrides via `ModelFactory.userPermissionOverride.findActiveForUser(...)`; both model methods enforce `expires_at IS NULL OR expires_at > NOW()` in SQL. Backend unit and scratch-DB tests in [ability.service.test.ts](/mnt/d/Project/b-solution/b-knowledge/be/tests/shared/services/ability.service.test.ts) and [tenant-isolation.test.ts](/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/tenant-isolation.test.ts) passed. |
| 8 | Expired grants do not leak into grant-derived dataset resolution, and Phase 7 ships no cron/sweeper path. | ✓ VERIFIED | [ability.service.ts](/mnt/d/Project/b-solution/b-knowledge/be/src/shared/services/ability.service.ts) `resolveGrantedDatasetsForUser()` reuses `findActiveForUser(...)` before batching dataset resolution; [grant-dataset-resolution.test.ts](/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/grant-dataset-resolution.test.ts) passed scratch-DB cases for expired/live overlap and cross-tenant isolation. Grep found no cron/sweeper code in the phase files. |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `be/src/modules/permissions/services/permissions.service.ts` | Deterministic versioning and mutation-triggered emit | ✓ VERIFIED | Substantive service with `buildCatalogVersion()`, `getVersionedCatalog()`, and `emitCatalogUpdated()` wired into all mutation entry points. |
| `be/src/modules/permissions/controllers/permissions.controller.ts` | Versioned catalog HTTP contract | ✓ VERIFIED | `getCatalog()` returns the service payload directly; no stub or alternate endpoint. |
| `be/tests/permissions/catalog-versioning.test.ts` | Regression coverage for hash stability and emit behavior | ✓ VERIFIED | Covers version format, stability, controller payload, changed-registry hash, and mutation-driven socket emit. |
| `be/tests/shared/services/ability.service.test.ts` | Ability-builder regression coverage for expired inputs | ✓ VERIFIED | Verifies active-read path usage and expired-vs-live grant/override behavior. |
| `be/tests/permissions/tenant-isolation.test.ts` | DB-backed proof of expiry and tenant isolation on active reads | ✓ VERIFIED | Scratch-DB tests passed for cross-tenant filtering and expired/future override handling. |
| `be/tests/permissions/grant-dataset-resolution.test.ts` | Grant-to-dataset regression coverage for expired grants | ✓ VERIFIED | Scratch-DB tests passed for expired grants, archived versions, dedupe, and cross-tenant isolation. |
| `fe/src/lib/permissions.tsx` | Runtime catalog provider and live `useHasPermission` mapping | ✓ VERIFIED | Substantive provider seeded from snapshot and hydrated from live catalog query with fail-closed fallback. |
| `fe/src/app/Providers.tsx` | Root mounting point for runtime catalog + authenticated socket bridge | ✓ VERIFIED | Mounts `PermissionCatalogProvider` and `AuthenticatedSocketBridge` inside the real provider tree. |
| `fe/src/app/AuthenticatedSocketBridge.tsx` | Authenticated socket lifecycle and invalidation bridge | ✓ VERIFIED | Connects/disconnects socket from auth state and mounts query invalidation only when a socket exists. |
| `fe/src/features/permissions/api/permissionsApi.ts` | FE contract for `{ version, permissions }` | ✓ VERIFIED | Raw API wrapper matches the backend catalog payload and uses the existing catalog route. |
| `fe/src/features/permissions/api/permissionsQueries.ts` | Catalog query hook with bounded polling fallback | ✓ VERIFIED | Uses `queryKeys.permissions.catalog()` with a 5-minute refetch interval. |
| `fe/tests/features/permissions/permissionsCatalogRefresh.test.tsx` | Silent-refresh regression coverage | ✓ VERIFIED | Proves query hydration, manual invalidation reuse, polling fallback, socket invalidation, and socket lifecycle. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `be/src/modules/permissions/controllers/permissions.controller.ts` | `be/src/modules/permissions/services/permissions.service.ts` | Catalog response delegates to versioned service contract | ✓ WIRED | `PermissionsController.getCatalog()` calls `permissionsService.getVersionedCatalog()` and returns that payload. |
| `be/src/modules/permissions/services/permissions.service.ts` | `be/src/shared/services/socket.service.ts` | Emit catalog-updated event after successful mutations | ✓ WIRED | `replaceRolePermissions`, `createOverride`, `deleteOverride`, `createGrant`, and `deleteGrant` call `emitCatalogUpdated()`, which emits the canonical socket event with `{ version }`. |
| `be/src/shared/services/ability.service.ts` | `be/src/shared/models/resource-grant.model.ts` | Query-time filtered active grant reads | ✓ WIRED | `buildAbilityForV2()` and `resolveGrantedDatasetsForUser()` both call `ModelFactory.resourceGrant.findActiveForUser(...)`. |
| `be/src/shared/services/ability.service.ts` | `be/src/shared/models/user-permission-override.model.ts` | Query-time filtered active override reads | ✓ WIRED | `buildAbilityForV2()` calls `ModelFactory.userPermissionOverride.findActiveForUser(user.id, user.current_org_id)`. |
| `fe/src/app/Providers.tsx` | `fe/src/features/permissions/api/permissionsQueries.ts` | Socket invalidation plus bounded polling on catalog query key | ✓ WIRED | `Providers` mounts `AuthenticatedSocketBridge`; that bridge mounts `useSocketQueryInvalidation()`, which invalidates `queryKeys.permissions.catalog()`. `usePermissionCatalog()` owns the polling behavior on the same key. |
| `fe/src/lib/permissions.tsx` | `fe/src/features/permissions/api/permissionsApi.ts` | Live catalog response hydrates runtime map | ✓ WIRED | `PermissionCatalogProvider` calls `usePermissionCatalog()`; that hook calls `permissionsApi.getCatalog()` and updates the in-memory catalog map when the version changes. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `be/src/modules/permissions/controllers/permissions.controller.ts` | `catalog` | `permissionsService.getVersionedCatalog()` → registry entries from `permissionsRegistry.getAllPermissions()` | Yes | ✓ FLOWING |
| `fe/src/lib/permissions.tsx` | `catalogState` | `usePermissionCatalog()` → `permissionsApi.getCatalog()` → `GET /api/permissions/catalog` | Yes | ✓ FLOWING |
| `be/src/shared/services/ability.service.ts` | `resourceGrants` / `grants` | `ModelFactory.resourceGrant.findActiveForUser(...)` with SQL-side expiry filter | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Backend catalog versioning + mutation emit regression | `timeout 30s npm test -w be -- --run tests/permissions/catalog-versioning.test.ts tests/shared/services/ability.service.test.ts tests/permissions/tenant-isolation.test.ts tests/permissions/grant-dataset-resolution.test.ts --reporter=dot` | Initial sandbox run failed with `EPERM 127.0.0.1:5432`; re-run with DB access showed `catalog-versioning.test.ts` and `tenant-isolation.test.ts` passing before timeout. | ✓ PASS after escalation |
| Backend grant-derived dataset expiry regression | `timeout 60s npm test -w be -- --run tests/permissions/grant-dataset-resolution.test.ts --reporter=dot` | Passed: 1 file, 8 tests. | ✓ PASS |
| FE API contract regression | `timeout 60s npm run test:run:unit -w fe -- --reporter=dot tests/features/permissions/permissionsApi.test.ts` | Passed: 1 file, 15 tests. | ✓ PASS |
| FE runtime catalog refresh regression | `timeout 60s npm run test:run:ui -w fe -- --reporter=dot tests/lib/permissions.test.tsx tests/features/permissions/permissionsCatalogRefresh.test.tsx` | Passed: 2 files, 12 tests. | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `SH1` | `7.0`, `7.1`, `7.3` | Catalog endpoint includes `version`; FE refreshes in-memory catalog when server version changes via socket or polling; connected client picks up server-side additions without hard reload. | ✓ SATISFIED | Backend exposes `{ version, permissions }` and emits `permissions:catalog-updated`; frontend runtime provider hydrates from the live catalog, invalidates on socket event, and polls the same endpoint. Relevant tests passed in [catalog-versioning.test.ts](/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/catalog-versioning.test.ts), [permissionsCatalogRefresh.test.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/tests/features/permissions/permissionsCatalogRefresh.test.tsx), and [permissions.test.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/tests/lib/permissions.test.tsx). |
| `SH2` | `7.2` | `expires_at` on `resource_grants` is honored by the ability builder; query-time filtering is preferred over a sweeper; admin UI remains out of scope. | ✓ SATISFIED | `buildAbilityForV2()` and `resolveGrantedDatasetsForUser()` both consume SQL-filtered active reads; [resource-grant.model.ts](/mnt/d/Project/b-solution/b-knowledge/be/src/shared/models/resource-grant.model.ts) and [user-permission-override.model.ts](/mnt/d/Project/b-solution/b-knowledge/be/src/shared/models/user-permission-override.model.ts) enforce expiry in SQL; scratch-DB tests passed. |

### Anti-Patterns Found

No blocker anti-patterns found in the phase files. Grep hits were either intentional `return null` renderless components in [AuthenticatedSocketBridge.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/app/AuthenticatedSocketBridge.tsx) or pre-existing TODOs outside this phase’s goal surface.

### Human Verification Required

### 1. Live Silent Catalog Refresh

**Test:** Run the full stack, open an authenticated browser tab on a permission-gated screen, then introduce a server-side permission-catalog change that updates the backend catalog version.
**Expected:** The open tab updates its in-memory permission catalog without a hard reload, toast, or modal. If the socket event is missed, the same tab self-heals after the bounded polling interval.
**Why human:** This depends on end-to-end browser session state, actual Socket.IO transport, and real runtime behavior across FE and BE processes. Unit/UI tests confirm the wiring, but not the production-like browser flow.

---

_Verified: 2026-04-09T13:20:24Z_
_Verifier: Claude (gsd-verifier)_
