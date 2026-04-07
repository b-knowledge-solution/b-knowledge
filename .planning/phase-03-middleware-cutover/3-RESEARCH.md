# Phase 3: Middleware Cutover — Research

**Researched:** 2026-04-07
**Domain:** Express middleware refactor + REST API + cache invalidation + audit logging
**Confidence:** HIGH (every claim cites file:line in current main)

## Summary

Phase 3 is the milestone's highest-risk phase: it ships the first user-visible behavior change by flipping `config.permissions.useV2Engine` from `false` → `true`, replacing every legacy auth gate with one of two new middleware functions, and shipping a brand-new `permissions` module with its REST API. Phases 1 and 2 already laid every prerequisite: the `role_permissions`, `user_permission_overrides`, and `resource_grants` tables are seeded; `buildAbilityForV2` is wired behind the flag and parity-tested at `be/src/shared/services/ability.service.ts:231-385`; the cache prefix is already `'ability:v2:'`; and the legacy `rbac.ts` `hasPermission()` API is still imported by exactly **one** file (`be/src/shared/middleware/auth.middleware.ts:13`).

The cutover scope splits cleanly into two independent workstreams that can run in parallel: **(A)** middleware + route migration sweep across all 22 BE modules, and **(B)** new `be/src/modules/permissions/` module with TS7 CRUD endpoints and TS14 audit logging. The single critical-path coupling is the boot-time assertion that `role_permissions` is populated before either the shim or the new middleware reads from it.

**Primary recommendation:** Build `requirePermission(key)` and `requireAbility(action, subject, idParam?)` in a NEW file `be/src/shared/middleware/authorize.middleware.ts` (do not edit `auth.middleware.ts` in-place — keep the legacy file untouched until the route sweep is complete, then delete the legacy `requirePermission`/`requireRole`/`requireOwnership` exports in a final cleanup task). Both new middleware MUST go through the dispatcher `abilityService.buildAbilityFor` so they share the cached ability with `requireAbility` and benefit from the V2 cache prefix rotation. The shim option **(a)** in `rbac.ts` is the only safe path; option (b) is for Phase 6.

## User Constraints (from REQUIREMENTS.md + ROADMAP.md)

### Locked Decisions
- **TS6:** `requirePermission(key)` and `requireAbility(action, subject, idParam?)` are the canonical gates. Tenant scoping mandatory. Mixed-mode in `users.routes.ts` MUST be normalized.
- **TS7:** New `be/src/modules/permissions/` with controller / service / model / schemas / routes per `be/CLAUDE.md` strict layering (Controller → Service → Model, never bypass).
- **TS14:** Every mutation through the new permissions module writes an audit log entry. `permissionService.whoCanDo(action, subject, resourceId?)` helper required.
- **Authorization engine:** Single CASL engine fed from DB-backed catalog. V2 dispatcher is the active path post-cutover.
- **Mutating endpoints invalidate Redis ability cache.**
- **Cache key format:** `ability:v2:<sessionId>` (already shipped in P2.5).
- **Legacy `rbac.ts` shim stays during cutover** — explicit per `REQUIREMENTS.md` "Out of Scope" line 181. Do NOT delete in Phase 3.
- **REST conventions:** `be/CLAUDE.md` table at "RESTful API Route Conventions" — GET list, GET /:id, POST, PUT (full), PATCH (partial), DELETE; sub-resource actions via `POST /:id/<action>`.
- **No hardcoded string literals** — every action/effect/grantee_type must come from a constants file.
- **JSDoc required on every exported function.**

### Claude's Discretion
- Sync vs async middleware (analyzed below — recommendation: **always async**, dispatcher-based).
- Whether `requirePermission` deny path writes an audit entry (recommendation: yes for mutations, no for reads).
- Fail-closed vs fail-open on Redis unreachable (recommendation: **fail-closed in prod, fail-open with loud warn in dev**).
- Exact shape of audit log `metadata` JSON for permission mutations.
- Whether `whoCanDo` is exposed via REST in Phase 3 or kept service-internal (recommendation: service-only in Phase 3; REST exposure in Phase 5 admin UI).

### Deferred (OUT OF SCOPE for Phase 3)
- FE codemod (Phase 4).
- Admin UI (Phase 5).
- Legacy alias removal (`superadmin`, `member`) (Phase 6 — Phase 3 must NOT touch `roles.ts`).
- OpenSearch grant filter (Phase 6).
- `expires_at` enforcement (Phase 7).
- `requireOwnership` migration to permission-based bypass (R-9 — explicit follow-up).
- Per-document grants.
- Removal of legacy `requireRole`/`requireOwnership` middleware exports (Phase 6 cleanup).
- `whoCanDo` REST exposure (Phase 5).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TS6 | Authorization middleware (`requirePermission` + `requireAbility`); normalize mixed-mode users.routes.ts; every mutating route migrated | §3, §4, §5 |
| TS7 | Resource-grant CRUD API: catalog, role↔perm CRUD, user overrides CRUD, grants CRUD; cache invalidation + audit log on mutations | §7, §9 |
| TS14 | Audit log on every permission-module mutation; structured log on registry sync upsert/remove; `whoCanDo(action, subject, resourceId?)` helper | §8, §10 |

---

## Section 1 — Auth Call-Site Inventory (Current State)

**Drift check vs `EXISTING_AUTH_SURFACE.md`:** Verified against current `main`. **No drift detected** for the middleware definition file (`auth.middleware.ts`) — line numbers 13, 47, 65, 140, 198, 239, 293, 346 still correct. The 3 already-async-converted callers (`auth.controller.ts:65, 474, 566`) are still on those lines.

### 1.1 Single shim consumer
| File | Line | Import |
|------|------|--------|
| `be/src/shared/middleware/auth.middleware.ts` | 13 | `import { hasPermission, Role, Permission, ADMIN_ROLES } from '@/shared/config/rbac.js'` |

This is the **only** file in `be/src/` that imports from `rbac.ts`. After Phase 3, the new `authorize.middleware.ts` will not import from `rbac.ts` at all — `auth.middleware.ts` keeps its import while `requirePermission`/`requireRole`/`requireOwnership` still live there, and the rbac module becomes a self-contained DB-cached snapshot.

### 1.2 `requirePermission(key)` route attachments — full inventory (60+ sites)
Per `EXISTING_AUTH_SURFACE.md` §"requirePermission route attachments" — confirmed accurate:

| Module | File | Lines | Current key | New keys (per `PERMISSION_INVENTORY.md`) |
|---|---|---|---|---|
| users | `users/routes/users.routes.ts` | 49,58,68,75,82,106,118,130 | `manage_users` | `users.{view,create,view_ip,view_sessions,delete,assign_role,assign_perms}` |
| users (mixed) | `users/routes/users.routes.ts` | 93 | `requireAbility('manage','User')` | `users.edit` (NORMALIZE) |
| teams | `teams/routes/teams.routes.ts` | 21,29,37,45,53,61,69,77 | `manage_users` | `teams.{view,create,edit,delete,members,permissions}` |
| sync | `sync/routes/sync.routes.ts` | 30,51,59,67,77 | `manage_knowledge_base` | `sync_connectors.{view,create,edit,delete,run}` |
| llm-provider | `llm-provider/routes/llm-provider.routes.ts` | 18,21,24,27,30,33,36,39 | `manage_model_providers` | `llm_providers.{view,create,edit,delete,test}` |
| rag | `rag/routes/rag.routes.ts` | 38,46,47,48,51,55,56,61,65,68,71-74,81,82,85,86,88,91,94-96,103,107,124,128,137,138 | `manage_datasets` | `datasets.*`, `documents.*`, `chunks.*` (per inventory split) |
| chat-assistant | `chat/routes/chat-assistant.routes.ts` | 32,69,82,95,108 | `manage_users` ⚠ | `chat_assistants.{view,create,edit,delete}` |
| chat-embed | `chat/routes/chat-embed.routes.ts` | 37,50,63 | `manage_users` ⚠ | `chat_assistants.embed` |
| search | `search/routes/search.routes.ts` | 37,74,87,100,113 | `manage_users` ⚠ | `search_apps.{view,create,edit,delete}` |
| search-embed | `search/routes/search-embed.routes.ts` | 38,51,64 | `manage_users` ⚠ | `search_apps.embed` |
| system-tools | `system-tools/system-tools.routes.ts` | 19,27,35 | `view_system_tools`, `manage_system` | `system_tools.{view,run}` |
| preview | `preview/preview.routes.ts` | 14 | `view_search` ⚠ | `preview.view` |
| broadcast | `broadcast/routes/broadcast-message.routes.ts` | 41,49,57,65 | `manage_system` | `broadcast.{view,create,edit,delete}` |

### 1.3 `requireRole(...)` route attachments — convert to `requirePermission`
| Module | File | Lines | Roles | New key |
|---|---|---|---|---|
| dashboard | `dashboard/dashboard.routes.ts` | 25 | `'admin','leader'` | `dashboard.view` |
| dashboard | `dashboard/dashboard.routes.ts` | 40,55 | `'admin','super-admin'` | `dashboard.admin` |
| code-graph | `code-graph/code-graph.routes.ts` | 153 | `'admin'` | `code_graph.manage` |
| audit | `audit/routes/audit.routes.ts` | 30 | `'admin'` (whole-module via `router.use`) | `audit.view` (apply per-route, not via `router.use`) |
| feedback | `feedback/routes/feedback.routes.ts` | 32,50,70 | `'admin','leader'` | `feedback.{view,edit,delete}` |
| system | `system/routes/system.routes.ts` | 19 | `'admin'` | `system.view` |
| system-history | `system/routes/system-history.routes.ts` | 30,38,46,54,62,70,78 | `'admin'` | `system_history.view` |
| glossary | `glossary/routes/glossary.routes.ts` | 40,48,56,73,81,89,100,107 | `'admin'` | `glossary.{view,create,edit,delete,import}` |
| knowledge-base | `knowledge-base/routes/knowledge-base.routes.ts` | 146,147 | `'admin','leader'` | `knowledge_base.share` (R-11) |
| knowledge-base | `knowledge-base/routes/knowledge-base.routes.ts` | 152,153 | `'admin','leader'` | `knowledge_base.edit` |

### 1.4 `requireAbility(...)` route attachments — KEEP AS-IS, only verify subject names
These already use the CASL path; they will route through the V2 dispatcher transparently. No code change needed except verifying the `idParam` is correct on instance-level routes.

| Module | File | Action |
|---|---|---|
| knowledge-base | `knowledge-base/routes/knowledge-base.routes.ts` | L56–140 — KEEP, but pass `idParam: 'kbId'` (or whatever the param is named) so V2 row-scoped grants engage |
| agents | `agents/routes/agent.routes.ts` | L39–88 — KEEP, pass `idParam: 'id'` |
| memory | `memory/routes/memory.routes.ts` | L28 (whole-module `router.use`) — KEEP |

### 1.5 Service-layer `user.role ===` branches (the worst offenders)
These are NOT route gates — they're inside service code and CANNOT be replaced by middleware. They MUST be replaced with `abilityService.buildAbilityFor(...).can(action, subject)` calls inline, OR with calls to a new `permissionService.userHasPermission(userId, key)` helper.

| File | Line | Current | Phase 3 action |
|---|---|---|---|
| `modules/knowledge-base/services/knowledge-base.service.ts` | 29 | `user.role === ADMIN \|\| === SUPERADMIN` | Replace with `permissionService.userHasPermission(user, 'knowledge_base.manage')` — note: uses legacy alias `SUPERADMIN`, **DO NOT TOUCH the alias itself** (Phase 6 owns that). Keep the alias reference; just route through the new helper. |
| `modules/teams/services/team.service.ts` | 317 | `user.role === LEADER ? LEADER : MEMBER` | Out of scope — this is a TeamRole derivation, not an auth check. Leave alone. |
| `modules/teams/services/team.service.ts` | 345 | `user.role === ADMIN` early-return guard | Replace with `userHasPermission(user, 'teams.manage')` |
| `modules/sync/controllers/sync.controller.ts` | 71 | `=== ADMIN \|\| SUPERADMIN \|\| LEADER` | Replace with `userHasPermission(user, 'sync_connectors.run')` (legacy alias stays) |
| `modules/rag/services/rag.service.ts` | 50 | `user.role === ADMIN` admin-bypass | Replace with `userHasPermission(user, 'datasets.manage')` |
| `modules/search/controllers/search.controller.ts` | 64 | `req.user?.role` branch | Inspect — likely a UI scoping branch, may need a `search_apps.view_all` key |
| `modules/chat/controllers/chat-assistant.controller.ts` | 89 | `req.user?.role` branch | Same — likely needs `chat_assistants.view_all` |
| `modules/chat/services/chat-conversation.service.ts` | 1022 | `abilityService.buildAbilityFor(userContext)` | Already uses dispatcher — NO CHANGE; V2 will pick up automatically when flag flips |
| `modules/auth/auth.controller.ts` | 65, 474, 566 | `abilityService.buildAbilityFor(...)` | Already async + dispatcher — NO CHANGE |
| `modules/knowledge-base/controllers/knowledge-base.controller.ts` | 27 | `req.user.role` in audit context (read-only) | NO CHANGE — audit metadata only |

### 1.6 Modules with NO auth middleware (gap analysis from §"NO authorization middleware at all")
These need new gates added during the sweep. Recommended classification:

| File | Recommended gate |
|---|---|
| `external/routes/api-key.routes.ts` | `requirePermission('api_keys.manage')` (currently no perm key — needs to be added to registry as new key) |
| `external/routes/external-api.routes.ts` | Out of scope — uses API-key auth, not session auth |
| `chat/routes/chat-conversation.routes.ts` | `requireAuth` only (user-scoped to own conversations) — leaves open as discretionary |
| `chat/routes/chat-file.routes.ts` | `requireAuth` only |
| `chat/routes/chat-openai.routes.ts` | API-key auth path — out of scope |
| `search/routes/search-openai.routes.ts` | API-key auth — out of scope |
| `agents/routes/agent-embed.routes.ts` | Public embed — out of scope |
| `agents/routes/agent-webhook.routes.ts` | Webhook signature auth — out of scope |
| `llm-provider/routes/llm-provider-public.routes.ts` | Public — out of scope |
| `user-history/user-history.routes.ts` | `requireAuth` only (user views own history) |

**Recommendation:** Phase 3 closes the gaps for `api-key.routes.ts` (genuine new permission), `chat-conversation.routes.ts`, `chat-file.routes.ts`, and `user-history.routes.ts` (just `requireAuth`). The other 6 are out of scope (separate auth schemes).

### 1.7 Drift flag
Cross-checked `EXISTING_AUTH_SURFACE.md` against current main. **No code drift since 2026-04-07.** The seed inventory is still accurate.

---

## Section 2 — The Mixed-Mode Auth Fault (`users.routes.ts`)

**File:** `be/src/modules/users/routes/users.routes.ts`

| Line | Current gate | Route | Reason for inconsistency | Canonical normalization |
|---|---|---|---|---|
| 49 | `requirePermission('manage_users')` | `GET /` | Class-level list — feature gate is correct | `requirePermission('users.view')` |
| 58 | `requirePermission('manage_users')` | `POST /` | Class-level create | `requirePermission('users.create')` |
| 68 | `requirePermission('manage_users')` | `GET /ip-history` | Class-level | `requirePermission('users.view_ip')` |
| 75 | `requirePermission('manage_users')` | `GET /:id/ip-history` | Should be instance — currently isn't | `requireAbility('read', 'User', 'id')` (instance-level read, idParam='id') |
| 82 | `requirePermission('manage_users')` | `GET /:id/sessions` | Should be instance | `requireAbility('read', 'User', 'id')` |
| **93** | **`requireAbility('manage', 'User')`** | **`PUT /:id`** | **Instance-level — was migrated to ABAC, others were not** | `requireAbility('edit', 'User', 'id')` |
| 106 | `requirePermission('manage_users')` | `DELETE /:id` | Should be instance | `requireAbility('delete', 'User', 'id')` |
| 118 | `requirePermission('manage_users')` | role assignment | High-sensitivity — keep class-level + add `requireRecentAuth` | `requirePermission('users.assign_role')` + `requireRecentAuth(15)` |
| 130 | `requirePermission('manage_users')` | perm assignment | Same | `requirePermission('users.assign_perms')` + `requireRecentAuth(15)` |

**Why the drift exists (best inference):** Line 93 (`PUT /:id`) was migrated to `requireAbility` as a one-off experiment when the CASL path was first introduced (the same commit that added `User` to the Subjects union). The other lines were not touched because the test surface for "edit own profile vs admin edits any profile" was the only one that needed the per-instance check at the time. The remaining lines kept the simpler `requirePermission` because there was no ABAC requirement for them.

**Canonical rule for Phase 3** (also document in `be/CLAUDE.md` after Phase 3 ships):
> Use `requireAbility(action, subject, idParam)` when `req.params[idParam]` is meaningful AND row-scoped grants are possible for that subject. Use `requirePermission(key)` for class-level operations (list, create, admin-wide) where no specific resource id is involved.

| Pattern | Use which gate |
|---|---|
| `GET /resource` (list all) | `requirePermission('resource.view')` |
| `POST /resource` (create new) | `requirePermission('resource.create')` |
| `GET /resource/:id` | `requireAbility('read', 'Resource', 'id')` |
| `PUT /resource/:id` | `requireAbility('edit', 'Resource', 'id')` |
| `DELETE /resource/:id` | `requireAbility('delete', 'Resource', 'id')` |
| `POST /resource/:id/<action>` | `requireAbility('edit', 'Resource', 'id')` (or a more specific action like `'run'`) |
| Class-level admin (assign role, etc.) | `requirePermission('resource.admin_action')` + `requireRecentAuth(15)` |

---

## Section 3 — `requirePermission(key)` Middleware Design

**File:** `be/src/shared/middleware/authorize.middleware.ts` (NEW — do not modify `auth.middleware.ts`)

```typescript
/**
 * @description Class-level feature gate. Checks whether the authenticated user
 * has the given permission key in their effective permission set (role +
 * overrides). Tenant-scoped via session.currentOrgId. Always async because
 * the underlying ability dispatcher is async (V2 reads from Postgres + Redis).
 *
 * @param {PermissionKey} key - Registry key e.g. 'users.view', 'datasets.create'
 * @returns {Function} Express middleware
 */
export function requirePermission(key: PermissionKey): RequestHandler
```

### Decisions

| Question | Decision | Rationale |
|---|---|---|
| Sync or async? | **Async** | V2 dispatcher is async; sync wrapper would force a separate code path. Single async signature simplifies tests. |
| Path: dispatcher or direct DB? | **Dispatcher** (`abilityService.buildAbilityFor`) | Reuses the cached ability with `requireAbility`, avoids double Redis hit, gets V2 cache prefix rotation for free. The registry lookup translates `key` → `(action, subject)` then calls `ability.can(action, subject)`. |
| Tenant discovery | `req.session.currentOrgId` | Same as `requireAbility`. Throw 401 if missing. |
| Deny status | `403` with `{ error: 'permission_denied', code: 'permission_denied', key }` | Structured code allows FE to surface the missing key in dev. |
| Audit log on deny? | **Yes for mutations, no for reads** | Reads are noisy; mutations are the security-relevant ones. Detect via `req.method !== 'GET'`. |
| Fail-closed on Redis unreachable? | **Production: fail-closed (503). Dev: fail-open with `log.warn`.** | Driven by `config.env === 'production'`. Dev fail-open prevents local devs from being locked out by a stopped Valkey container. |
| User missing from session | `401` `{ error: 'Unauthorized' }` | Same as existing `requireAuth` |
| Tenant missing from session | `401` `{ error: 'no_tenant_context' }` | Cannot scope without a tenant — fail closed |
| Where does `(action, subject)` translation happen? | At middleware factory time, **not** per-request | Look up `key` in registry once when the middleware is created; cache the resolved `(action, subject)` in closure. Throws at boot if key is unknown. |

### Pseudocode
```typescript
export function requirePermission(key: PermissionKey): RequestHandler {
  // Resolve key -> (action, subject) at factory time. Throws at boot if unknown.
  const perm = getPermissionByKey(key)
  if (!perm) throw new Error(`requirePermission: unknown key '${key}'`)

  return async (req, res, next) => {
    const user = req.session?.user
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    if (!req.session?.currentOrgId) {
      return res.status(401).json({ error: 'no_tenant_context' })
    }

    try {
      // Cached-or-build via dispatcher (shared with requireAbility)
      let ability = await abilityService.loadCachedAbility(req.sessionID)
      if (!ability) {
        ability = await abilityService.buildAbilityFor({
          id: user.id,
          role: user.role,
          is_superuser: user.is_superuser ?? null,
          current_org_id: req.session.currentOrgId,
        })
        await abilityService.cacheAbility(req.sessionID, ability)
      }

      if (ability.can(perm.action, perm.subject)) {
        ;(req as any).ability = ability
        return next()
      }

      // Audit-log only mutations
      if (req.method !== 'GET') {
        await auditService.log({
          userId: user.id,
          action: 'permission_denied',
          resourceType: perm.subject,
          metadata: { key, method: req.method, path: req.path },
        })
      }

      return res.status(403).json({ error: 'permission_denied', code: 'permission_denied', key })
    } catch (err) {
      // Redis unreachable, DB error, etc.
      if (config.env === 'production') {
        log.error('[authorize] fail-closed: ability check errored', { err, key })
        return res.status(503).json({ error: 'auth_service_unavailable' })
      } else {
        log.warn('[authorize] fail-OPEN in dev — Valkey/DB problem?', { err, key })
        return next()
      }
    }
  }
}
```

---

## Section 4 — `requireAbility(action, subject, idParam?)` Middleware Design

**File:** Same — `be/src/shared/middleware/authorize.middleware.ts`

### Signature change vs current
Current: `requireAbility(action, subject)` (auth.middleware.ts:346) — no idParam.
New: `requireAbility(action, subject, idParam?: string)` — optional idParam, default `'id'`.

### Decisions

| Question | Decision |
|---|---|
| Resource id source | `req.params[idParam]`. If `idParam` undefined, default `'id'`. |
| If `req.params[idParam]` is missing | Treat as class-level: call `ability.can(action, subject)` without conditions |
| If present | Call `ability.can(action, subject({ id: paramValue }))` — V2 row-scoped grants emit rules with `{ id: resource_id }` (see `ability.service.ts:283-286`), so the CASL match works |
| Tenant scoping | Inherited from rule conditions — V2 emits `{ tenant_id, id }` on every rule. Caller doesn't need to pass tenant. |
| Async | Yes (already is) |
| Fail behavior | Same as `requirePermission` — fail-closed prod, fail-open dev |

### Pseudocode
```typescript
export function requireAbility(
  action: Actions,
  subject: Subjects,
  idParam: string = 'id',
): RequestHandler {
  return async (req, res, next) => {
    const user = req.session?.user
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    if (!req.session?.currentOrgId) return res.status(401).json({ error: 'no_tenant_context' })

    try {
      let ability = await abilityService.loadCachedAbility(req.sessionID)
      if (!ability) {
        ability = await abilityService.buildAbilityFor({
          id: user.id,
          role: user.role,
          is_superuser: user.is_superuser ?? null,
          current_org_id: req.session.currentOrgId,
        })
        await abilityService.cacheAbility(req.sessionID, ability)
      }

      // Materialize the resource id, if present
      const resourceId = req.params?.[idParam]
      const allowed = resourceId
        ? ability.can(action, subject as any /* subject({ id: resourceId }) for class+inst */)
        : ability.can(action, subject)

      // CASL "subject helper" pattern: when row-scoped, build a sub-instance
      // CASL matches conditions against object literals, so we pass { id }
      const allowedRowScoped = resourceId
        ? ability.can(action, { type: subject, id: resourceId } as any)
        : allowed

      if (allowedRowScoped) {
        ;(req as any).ability = ability
        return next()
      }

      if (req.method !== 'GET') {
        await auditService.log({
          userId: user.id,
          action: 'permission_denied',
          resourceType: subject,
          resourceId,
          metadata: { ability_action: action, path: req.path },
        })
      }
      return res.status(403).json({ error: 'permission_denied', action, subject, resourceId })
    } catch (err) {
      if (config.env === 'production') return res.status(503).json({ error: 'auth_service_unavailable' })
      log.warn('[authorize] fail-OPEN in dev', { err })
      return next()
    }
  }
}
```

**Implementation note:** CASL's row-scoped check requires a subject **instance**, not a string. The new middleware uses CASL's `ForcedSubject` pattern (`{ type: 'KnowledgeBase', id: '...' }`) to match `can('read', 'KnowledgeBase', { id: 'X' })` rules emitted by V2.

---

## Section 5 — `rbac.ts` Shim Conversion

### Current state
`be/src/shared/config/rbac.ts` exports:
- `Role` (type alias)
- `Permission` (type alias — currently a strict union)
- `ROLE_PERMISSIONS` (the static Role → Permission[] map at line 113)
- `ADMIN_ROLES` (string[])
- `hasPermission(role, permission)` (sync)
- `isAtLeastRole` (line 203, dead code per surface inventory)

External callers (only `be/src/shared/middleware/auth.middleware.ts:13`).

### Two options

**Option (a) — Snapshot-cached shim (RECOMMENDED for Phase 3)**
- Boot-time `loadRbacSnapshot()` reads `role_permissions JOIN permissions` and builds an in-memory `Map<Role, Set<string>>`.
- `hasPermission(role, key)` becomes a synchronous Map lookup against the snapshot.
- `Permission` type relaxed to `string` (loose) so any catalog key works.
- Snapshot is refreshed on:
  - Boot (always)
  - PUT /api/permissions/roles/:role (cache invalidation triggers `rebuildRbacSnapshot()`)
- Manual `rebuildRbacSnapshot()` exposed for tests.
- `ROLE_PERMISSIONS` static export REMOVED (only the function `hasPermission` remains, plus `ADMIN_ROLES`).
- `ADMIN_ROLES` stays as a hardcoded constant for now (R-9 — Phase 6 follow-up).
- Backwards compatible: `hasPermission(role, 'manage_users')` still returns `true` for admin, because P1.5 seeded `role_permissions` with the legacy keys expanded.

**Option (b) — Deprecated-throw shim (DEFERRED to Phase 6)**
- `hasPermission()` throws in dev, logs in prod.
- Forces all callers to migrate before the function disappears.
- Too risky for Phase 3 — if a single migration step is missed, prod crashes.

### Recommendation
**Phase 3 ships option (a).** Phase 6 ships option (b) after the route sweep is verified by grep + tests.

### `hasPermission` external callers (full list)
Verified: there is **one** external caller in `be/src/`:
- `be/src/shared/middleware/auth.middleware.ts:157` — inside `requirePermission(permission)`

The legacy `auth.middleware.ts:requirePermission` STAYS for the duration of Phase 3 (so any not-yet-migrated route still works during the in-progress sweep). It is deleted in a final cleanup task at the end of Phase 3, after every route file is verified to import from `authorize.middleware.ts` instead.

**Migration order constraint:** A route file MUST switch its `import { requirePermission } from '@/shared/middleware/auth.middleware.js'` to `from '@/shared/middleware/authorize.middleware.js'` in the same commit as the key rename (`'manage_users'` → `'users.view'`), to keep the type system honest about which API it's calling.

---

## Section 6 — Permissions Module Skeleton

**Path:** `be/src/modules/permissions/`
**Layout:** Sub-directory (≥5 files per `be/CLAUDE.md`)

```
modules/permissions/
├── routes/
│   └── permissions.routes.ts
├── controllers/
│   └── permissions.controller.ts
├── services/
│   └── permissions.service.ts
├── models/
│   └── permissions.model.ts             # module-local helpers wrapping shared models
├── schemas/
│   └── permissions.schemas.ts           # Zod
├── permissions.permissions.ts           # registry file — keys: permissions.{view,manage,grant_user,grant_role,manage_grants}
└── index.ts                             # barrel
```

**Layering compliance:**
- Routes → controllers → service → service uses `ModelFactory.permission`, `ModelFactory.rolePermission`, `ModelFactory.userPermissionOverride`, `ModelFactory.resourceGrant` directly (these are the existing shared models from Phases 1+2 — `permissions.model.ts` is a thin module-local helper for any new joined queries that don't fit a single shared model)
- Controllers NEVER import `ModelFactory` (per CLAUDE.md strict rule)
- Services NEVER import `db` directly

### Endpoint specs (TS7)

All routes mounted under `/api/permissions`. All require `requireAuth` + at least `requirePermission('permissions.manage')` for mutations (R-9 — admin-only surface).

| Method | Path | Schema (req) | Schema (res) | Gate | Audit? | Cache invalidation |
|---|---|---|---|---|---|---|
| `GET` | `/catalog` | — | `{ permissions: PermissionKey[], version: string }` | `requireAuth` (any logged-in user — needed by FE bootstrap) | No | None |
| `GET` | `/roles/:role` | params: `{role: Role}` | `{ role, permissions: PermissionKey[] }` | `requirePermission('permissions.view')` | No | None |
| `PUT` | `/roles/:role` | body: `{ permissions: PermissionKey[] }` | `{ role, permissions, updated_at }` | `requirePermission('permissions.manage')` + `requireRecentAuth(15)` | YES (`grant_role`) | `invalidateAllAbilities()` (broad — affects every user with this role) AND `rebuildRbacSnapshot()` |
| `GET` | `/users/:userId/overrides` | params: `{userId}` | `{ overrides: UserPermissionOverride[] }` | `requirePermission('permissions.view')` | No | None |
| `POST` | `/users/:userId/overrides` | body: `{ permission_key, effect: 'allow'\|'deny', expires_at? }` | `UserPermissionOverride` | `requirePermission('permissions.manage')` + `requireRecentAuth(15)` | YES (`grant_user_override`) | Per-affected-user — `invalidateAllSessionsForUser(userId)` |
| `DELETE` | `/users/:userId/overrides/:id` | params | `{ deleted: id }` | `requirePermission('permissions.manage')` + `requireRecentAuth(15)` | YES (`revoke_user_override`) | Per-affected-user |
| `GET` | `/grants` | query: `{ subject_type?, subject_id?, grantee_type?, grantee_id? }` | `{ grants: ResourceGrant[] }` | `requirePermission('permissions.view')` | No | None |
| `POST` | `/grants` | body: `{ resource_type, resource_id, grantee_type, grantee_id, actions: string[], expires_at? }` | `ResourceGrant` | `requirePermission('permissions.manage')` | YES (`create_resource_grant`) | Per-grantee (user → that user's sessions; team → all team members; role → broad) |
| `DELETE` | `/grants/:id` | params | `{ deleted: id }` | `requirePermission('permissions.manage')` | YES (`revoke_resource_grant`) | Same as POST |

**Note on `GET /catalog` gate:** It's `requireAuth` (not `requirePermission('permissions.view')`) because every logged-in user's FE needs to bootstrap — without the catalog the FE can't render `<Can>` correctly. This is acceptable because the catalog is just permission *names*, not who has them.

### Tenant scoping
- `PUT /roles/:role` — `role_permissions` already has `tenant_id` (per Phase 1). Service MUST scope by `req.session.currentOrgId`.
- `POST /users/:userId/overrides` — service MUST verify the target user belongs to the actor's tenant before inserting. Cross-tenant write = 403.
- `POST /grants` — service MUST verify both the resource AND the grantee belong to the actor's tenant.

---

## Section 7 — Audit Log Integration

### Existing audit API
**File:** `be/src/modules/audit/services/audit.service.ts`
**Existing call signature** (per grep at lines 144-185):
```typescript
auditService.log({
  userId: string,
  action: AuditActionType | string,
  resourceType?: string,
  resourceId?: string,
  metadata?: Record<string, unknown>,
}): Promise<number | null>
```
The existing `AuditActionType` enum has 30+ entries (`CREATE_USER`, `UPDATE_USER`, etc.). Phase 3 adds new entries (see below).

### New audit action enum entries (extend `audit.service.ts:14-50`)
```typescript
PERMISSION_GRANT_ROLE: 'permission_grant_role',
PERMISSION_REVOKE_ROLE: 'permission_revoke_role',
PERMISSION_GRANT_USER_OVERRIDE: 'permission_grant_user_override',
PERMISSION_REVOKE_USER_OVERRIDE: 'permission_revoke_user_override',
PERMISSION_CREATE_RESOURCE_GRANT: 'permission_create_resource_grant',
PERMISSION_REVOKE_RESOURCE_GRANT: 'permission_revoke_resource_grant',
PERMISSION_DENIED: 'permission_denied',  // for the middleware deny path
PERMISSION_REGISTRY_SYNC: 'permission_registry_sync',  // for boot-time sync
```

These MUST be added to the constants file `be/src/shared/constants/` (not bare strings — per CLAUDE.md "no hardcoded string literals" rule). Actually, since `audit.service.ts` already defines them as a const object at line 14, extend that object. NO bare strings in service code.

### Per-endpoint audit log entry shapes

| Endpoint | action | resourceType | resourceId | metadata |
|---|---|---|---|---|
| PUT /roles/:role | `permission_grant_role` | `'Role'` | `role` | `{ before: PermissionKey[], after: PermissionKey[], added: [...], removed: [...] }` |
| POST /users/:userId/overrides | `permission_grant_user_override` | `'User'` | `userId` | `{ permission_key, effect, expires_at }` |
| DELETE /users/:userId/overrides/:id | `permission_revoke_user_override` | `'User'` | `userId` | `{ override_id, permission_key, effect }` |
| POST /grants | `permission_create_resource_grant` | `resource_type` | `resource_id` | `{ grantee_type, grantee_id, actions, expires_at }` |
| DELETE /grants/:id | `permission_revoke_resource_grant` | `resource_type` | `resource_id` | `{ grant_id, grantee_type, grantee_id }` |

### `whoCanDo` helper
**Service location:** `permissionService.whoCanDo(action, subject, resourceId?)`
**Returns:** `{ users: User[], reason: 'role'|'override'|'grant' }[]`

**Algorithm:**
1. Look up `(action, subject)` → list of permission keys via the registry (some keys map to the same `(action, subject)`).
2. Find every role in `role_permissions` that has any of those keys → expand to users via `users.role` lookup.
3. Find every `user_permission_overrides` row with `effect='allow'` for those keys → add those users.
4. Subtract every `user_permission_overrides` row with `effect='deny'` for those keys → remove those users.
5. If `resourceId` provided: also walk `resource_grants` where `(resource_type=subject, resource_id=resourceId, action IN g.actions)` → resolve `grantee_type/grantee_id` to user list (user → 1 user; team → team members; role → all users with role).
6. Tenant-scope the entire query by the caller's `current_org_id`.
7. Return deduplicated list with the reason.

**This is a powerful introspection tool — it MUST be tenant-scoped and MUST NOT be exposed via REST in Phase 3** (FE Phase 5 will surface it; until then, service-only).

---

## Section 8 — Cache Invalidation Strategy

**Module:** `be/src/shared/services/ability.service.ts`
**Existing exports:** `invalidateAbility(sessionId)` (line 477), `invalidateAllAbilities()` (line 499 — SCAN-based, non-blocking)

### New helper required
`invalidateAllSessionsForUser(userId)` — looks up every Redis session key for the user and calls `invalidateAbility` per session. **This does not exist yet** — Phase 3 must add it.

Implementation: SCAN `session:*`, deserialize each session value, check if `user.id === userId`, if so extract sessionId and invalidate. Slow (O(N sessions)) but acceptable since permission mutations are rare.

### Per-mutation invalidation matrix

| Mutation | Invalidation | Why |
|---|---|---|
| PUT /roles/:role | `invalidateAllAbilities()` + `rebuildRbacSnapshot()` | Affects every user with that role; broad sweep is correct |
| POST/DELETE /users/:userId/overrides | `invalidateAllSessionsForUser(userId)` | Single user — narrow sweep |
| POST /grants where grantee_type='user' | `invalidateAllSessionsForUser(grantee_id)` | Single user |
| POST /grants where grantee_type='team' | For each team member: `invalidateAllSessionsForUser(memberId)` | Bounded to team size |
| POST /grants where grantee_type='role' | `invalidateAllAbilities()` | Broad — same as role mutation |
| DELETE /grants/:id | Same as POST based on grantee_type | Mirror |

**Important:** All invalidation MUST happen INSIDE the same transaction or AFTER the DB commit. Recommendation: AFTER commit (the small race window where a stale cache survives until invalidate fires is acceptable; the alternative — invalidating before commit — risks invalidating then having the commit fail and leaving the cache cold for no reason).

---

## Section 9 — Feature Flag Flip

**File:** `be/src/shared/config/index.ts:489-497`
```typescript
permissions: {
  useV2Engine: process.env['USE_ABILITY_ENGINE_V2'] === 'true',
}
```

### Change
```typescript
permissions: {
  // Phase 3: V2 is the default. Override with USE_ABILITY_ENGINE_V2=false to revert.
  useV2Engine: process.env['USE_ABILITY_ENGINE_V2'] !== 'false',
}
```
- Default flips from `false` → `true`.
- Env override **still works** — `USE_ABILITY_ENGINE_V2=false` reverts to V1 (the rollback).
- `USE_ABILITY_ENGINE_V2=true` and unset are now equivalent.

### Verification
After the flip, confirm:
1. `config.permissions.useV2Engine === true` on a fresh boot with no env var (assertion in a test).
2. `USE_ABILITY_ENGINE_V2=false node ...` produces `false` (assertion in a test).
3. `USE_ABILITY_ENGINE_V2=true node ...` produces `true`.

### Rollback plan
If post-deploy spike in 403s detected:
1. Set `USE_ABILITY_ENGINE_V2=false` in production env.
2. Restart backend.
3. Call `invalidateAllAbilities()` via maintenance script (NOT automatic — operator decision) so V1 rebuild fires fresh.
4. V1 path reactivates; routes still work because `auth.middleware.ts:requirePermission` is still importing from the (now-shimmed) `rbac.ts`.

---

## Section 10 — Deploy Guardrails (Boot-Time Assertions)

These run during `app/index.ts` startup, AFTER migrations + boot sync, BEFORE the HTTP listener binds.

| Guardrail | Failure mode caught | Action |
|---|---|---|
| `assert(getAllPermissions().length > 0)` | Phase 1 P1.4 boot sync didn't run / registry not loaded | **FAIL FAST** — exit 1 (already in place per Phase 1 UAT fix per phase context) |
| `assert(role_permissions.count > 0)` | Phase 1 P1.5 seed migration didn't run | **FAIL FAST** — exit 1 |
| `assert(no resource_grants rows with empty actions[])` | Carry-forward IOU from Phase 2 — these are pre-P1.2 backfill rows | **FAIL FAST** in production (`config.env === 'production'`); **WARN** in dev |
| Drift: any `role_permissions.permission_key` not in registry catalog | Stale seed — registry shrunk but DB wasn't pruned | **WARN** with structured log; do NOT fail (might be intentional during a transitional window) |
| Drift: any active `user_permission_overrides.permission_key` not in registry catalog | User has override on a deleted permission | **WARN** with structured log; do NOT fail |
| `rebuildRbacSnapshot()` returns non-empty Map | Shim didn't load anything | **FAIL FAST** |

### Deploy script change (`docker/` or `scripts/`)
Per ROADMAP P3.5: deploy script (or post-migration hook) calls `invalidateAllAbilities()`. This is the SCAN-based version at `ability.service.ts:499` — non-blocking.

---

## Section 11 — Tests Required

### Vitest unit tests (`be/tests/permissions/`)

| File | Coverage |
|---|---|
| `authorize.middleware.test.ts` | `requirePermission` — happy path (admin allowed), deny path (user forbidden), no session → 401, no tenant → 401, Redis down in prod → 503, Redis down in dev → fall through. Same matrix for `requireAbility` plus row-scoped grant happy/deny. |
| `permissions.service.test.ts` | Each TS7 endpoint at the service layer: putRolePermissions, addUserOverride, removeUserOverride, createGrant, deleteGrant — happy + tenant-cross-leak + invalid permission key |
| `permissions.controller.test.ts` | HTTP layer: req validation via Zod, response shapes |
| `permissions-cache-invalidation.test.ts` | After PUT /roles/:role → confirm `invalidateAllAbilities` called; after POST /users/:userId/overrides → confirm `invalidateAllSessionsForUser` called; after POST /grants with grantee_type='user' → narrow invalidation |
| `permissions-audit.test.ts` | Every mutation through the permissions module produces a corresponding audit log entry — assert the audit row exists with the right action + metadata |
| `who-can-do.test.ts` | Tenant scoping; role + override + grant fan-out; deduplication; deny-override correctly subtracts |
| `rbac-shim.test.ts` | `loadRbacSnapshot` reads from DB; `hasPermission(role, key)` returns true for seeded keys; refresh after `rebuildRbacSnapshot()` picks up changes |
| `feature-flag-flip.test.ts` | With no env var → flag is `true`; `USE_ABILITY_ENGINE_V2=false` → `false`; `USE_ABILITY_ENGINE_V2=true` → `true` |

### Integration tests (`be/tests/permissions/integration/`)

| File | Coverage |
|---|---|
| `route-sweep-coverage.test.ts` | Programmatic test: import every `*.routes.ts` file in `be/src/modules/`, walk the Express router stack, assert that every mutating route (POST/PUT/PATCH/DELETE) has at least one of `requirePermission` or `requireAbility` in its middleware stack. **This is the test that proves the sweep is complete.** |
| `flag-flip-e2e.test.ts` | Spin up the server with V2 enabled, exercise the same scenarios as Phase 2 UAT Test 4 (login → KB nav → /api/auth/abilities) — assert no regressions |
| `permissions-rest-api.test.ts` | Each TS7 endpoint via supertest: catalog, role CRUD, override CRUD, grant CRUD; assert tenant isolation (T1 admin cannot grant on T2 resources) |

### Migration tests
**None required** — Phase 3 makes NO data migrations. All schema work shipped in Phase 1.

---

## Section 12 — Phase 3 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Silently un-gated route** (call site missed in sweep) | MEDIUM | HIGH (security) | `route-sweep-coverage.test.ts` — programmatic walk of every router in `be/src/modules/`; CI fails if any mutating route lacks both gates |
| **Permission denied for an admin** (V2 missing a key admin had via V1) | LOW | HIGH (P0 prod incident) | Phase 2 parity matrix already proves equivalence; Phase 3 adds an integration test that replays Phase 2 UAT Test 4 |
| **Cache invalidation lag** — admin grants, user keeps stale ability for up to 7 days | LOW | MEDIUM | Mutation handlers MUST invalidate inside the same request lifecycle. Test asserts invalidation calls. |
| **Deploy ordering** — code ships before migration | MEDIUM | MEDIUM | Safe order: migration runs first (P1+P2 already shipped), then code deploy with V2 default, then `invalidateAllAbilities()`. The old V1 path keeps working until the flag flips, so even if the DB has new tables and the code is mid-deploy, requests succeed. |
| `whoCanDo` cross-tenant leak | LOW | HIGH | Tenant-scope the entire query by `current_org_id`; unit-tested explicitly |
| **R-9: New `/api/permissions/*` endpoints under-gated** | MEDIUM | HIGH | All mutations require `requirePermission('permissions.manage')` + `requireRecentAuth(15)`; only `permissions.view` for reads; catalog endpoint is `requireAuth`-only by design (FE bootstrap) |
| **R-12: Cache key tenant scoping** | LOW (mostly addressed by P2.5 via `ability:v2:` prefix) | MEDIUM | Verify `auth.controller.ts` org-switch path calls `invalidateAbility(sessionId)`. If not, add `:<orgId>` suffix to key. **Action item for Phase 3:** read `auth.controller.ts` org-switch handler. |
| Mixed-mode normalization regression (line 93 currently uses `requireAbility('manage','User')` and switching to `'edit'` may change deny behavior for elevated-but-non-admin users) | MEDIUM | MEDIUM | Snapshot test before/after for the canonical user fixtures |
| The `Permission` type relaxation to `string` weakens type safety | LOW | LOW | Explicit comment in `rbac.ts`; ESLint warning encourages using `PermissionKey` from registry instead |
| Audit log volume from `permission_denied` entries on mutations | LOW | LOW | Only mutations log; reads do not. Sampling not needed at expected volume. |

---

## Section 13 — Project Constraints (from `be/CLAUDE.md` + root `CLAUDE.md`)

| Constraint | How Phase 3 honors it |
|---|---|
| Strict layering Controller → Service → Model | Permissions module follows this exactly. Controllers NEVER touch ModelFactory. |
| RESTful conventions table | TS7 endpoints use exact patterns: GET list, GET /:id, POST, PUT for full update, DELETE single. |
| No hardcoded string literals | All audit action names, effect strings, grantee_type values, gate codes come from constants. New constants file: `be/src/shared/constants/permissions-audit.ts` for the new audit actions, OR extend `audit.service.ts:14`. |
| Zod validate() on every mutation | All POST/PUT/DELETE in permissions module use `validate(schema)` middleware. |
| JSDoc on every exported function | Every middleware, service method, controller, model wrapper. Required tags: `@description`, `@param`, `@returns`, `@throws`. |
| Inline comments on control flow / DB queries / Redis ops / guards | Every branch in middleware, every cache invalidation call, every `if (!user)` guard. |
| Knex for all DB | Models only — service layer never imports `db`. |
| Singletons for global services | `auditService`, `permissionService`, `abilityService` — all singletons. |
| Barrel exports per module | `permissions/index.ts` exports the public API (service + types). No deep imports allowed from outside. |
| `requireRecentAuth` for sensitive operations | Role mutations + override mutations gate with `requireRecentAuth(15)`. |
| `tenant_id` scoping | Every service method takes (or derives from session) the current_org_id and scopes queries. |

---

## Section 14 — Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest 2.x (already in `be/`) |
| Config file | `be/vitest.config.ts` (existing) |
| Quick run command | `npm run test -w be -- be/tests/permissions/` |
| Full suite command | `npm run test -w be` |

### Phase Requirements → Test Map
| Req | Behavior | Type | Command | File exists? |
|---|---|---|---|---|
| TS6 | `requirePermission` happy/deny | unit | `npm run test -w be -- authorize.middleware` | ❌ Wave 0 |
| TS6 | `requireAbility` row-scoped happy/deny | unit | same | ❌ Wave 0 |
| TS6 | Mixed-mode normalization in users.routes.ts | integration | `permissions-rest-api` | ❌ Wave 0 |
| TS6 | Route sweep coverage (every mutating route gated) | integration | `route-sweep-coverage` | ❌ Wave 0 |
| TS7 | Each TS7 endpoint happy + denied + tenant-cross-leak | integration | `permissions-rest-api` | ❌ Wave 0 |
| TS7 | Cache invalidation on each mutation | unit | `permissions-cache-invalidation` | ❌ Wave 0 |
| TS14 | Audit log entry on each mutation | unit | `permissions-audit` | ❌ Wave 0 |
| TS14 | `whoCanDo` algorithm correctness + tenant scoping | unit | `who-can-do` | ❌ Wave 0 |
| Flag flip | Default true, env override works | unit | `feature-flag-flip` | ❌ Wave 0 |
| Shim | DB-backed snapshot, refresh on demand | unit | `rbac-shim` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -w be -- be/tests/permissions/`
- **Per wave merge:** `npm run test -w be`
- **Phase gate:** Full BE suite green + manual UAT (smoke: login + KB nav + permission CRUD via REST) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `be/tests/permissions/authorize.middleware.test.ts`
- [ ] `be/tests/permissions/permissions.service.test.ts`
- [ ] `be/tests/permissions/permissions.controller.test.ts`
- [ ] `be/tests/permissions/permissions-cache-invalidation.test.ts`
- [ ] `be/tests/permissions/permissions-audit.test.ts`
- [ ] `be/tests/permissions/who-can-do.test.ts`
- [ ] `be/tests/permissions/rbac-shim.test.ts`
- [ ] `be/tests/permissions/feature-flag-flip.test.ts`
- [ ] `be/tests/permissions/integration/route-sweep-coverage.test.ts`
- [ ] `be/tests/permissions/integration/flag-flip-e2e.test.ts`
- [ ] `be/tests/permissions/integration/permissions-rest-api.test.ts`
- [ ] Shared fixture: `be/tests/permissions/fixtures/users.ts` (admin/leader/user/super-admin per Phase 2 — REUSE if it exists)

---

## Section 15 — Open Questions

1. **Does `auth.controller.ts` invalidate the ability cache on org switch?**
   - What we know: The cache key is `ability:v2:<sessionId>` (no orgId). If a session can switch tenants, an old cached ability would apply to the new tenant.
   - What's unclear: whether org-switching is even a feature in this codebase.
   - Recommendation: read `auth.controller.ts` for org-switch handler in the first task of Phase 3. If org-switching exists, add `invalidateAbility(sessionID)` to that handler. If it doesn't exist, document and move on.

2. **Should the `requirePermission('permissions.manage')` admin gate be a NEW key in the registry, or piggyback on `manage_users`?**
   - Recommendation: NEW key. The permissions module is sensitive enough to warrant its own gate.
   - Add to the registry: `permissions.{view, manage}` as new keys in `be/src/modules/permissions/permissions.permissions.ts`. Day-one seed grants both to `super-admin` and `admin`. (NOTE: this is a new permission key — Phase 1 P1.5 won't have seeded it. Phase 3 needs a small migration to add the rows for these 2 new keys to existing roles. **This is a data-touching change** — the planner must include a Knex migration task.)

3. **`whoCanDo` performance for class-level questions** ("who can read DocumentCategory in tenant T?") could resolve to thousands of users.
   - Recommendation: cap at 1000 results with a `truncated: true` flag in the response. Pagination is overkill for an introspection helper.

4. **The route-sweep-coverage test** — how do we walk an Express router programmatically?
   - Recommendation: Express routers expose `router.stack` (each entry has `route.path`, `route.methods`, `route.stack` with middleware names). Iterate, filter mutating methods, assert middleware names include `requirePermission` or `requireAbility`.

5. **Should the new `permissions.permissions.ts` registry file be created in Phase 1 or Phase 3?**
   - Per Phase 1 P1.3: "one .permissions.ts per module (22 files)". The permissions module is the 23rd module — it didn't exist in Phase 1.
   - Recommendation: Phase 3 creates `be/src/modules/permissions/permissions.permissions.ts` with the new `permissions.{view,manage}` keys, and the Phase 3 migration seeds them.

---

## Section 16 — Code Examples (Verified Patterns)

### Existing audit log call (from `audit.service.ts:144-185`)
```typescript
await auditService.log({
  userId: user.id,
  action: AuditAction.PERMISSION_GRANT_ROLE,
  resourceType: 'Role',
  resourceId: role,
  metadata: { before: oldKeys, after: newKeys, added, removed },
})
```

### Existing dispatcher call (from `auth.middleware.ts:362-374`)
```typescript
let ability: AppAbility | null = await abilityService.loadCachedAbility(req.sessionID)
if (!ability) {
  ability = await abilityService.buildAbilityFor({
    id: user.id,
    role: user.role,
    is_superuser: user.is_superuser ?? null,
    current_org_id: req.session.currentOrgId || '',
  })
  await abilityService.cacheAbility(req.sessionID, ability)
}
```

### Existing V2 row-scoped rule emission (from `ability.service.ts:282-287`)
```typescript
for (const action of grant.actions) {
  can(action as Actions, grant.resource_type as Subjects, {
    ...tenantCondition,
    id: grant.resource_id,
  } as any)
}
```
This is the rule shape that `requireAbility(action, subject, idParam)` must match — pass `{ type: subject, id: paramValue }` to `ability.can()`.

### Cache invalidation call (from `ability.service.ts:477-484`)
```typescript
export async function invalidateAbility(sessionId: string): Promise<void> {
  const client = getRedisClient()
  if (!client) return
  const key = `${ABILITY_CACHE_PREFIX}${sessionId}`
  await client.del(key)
}
```

---

## Sources

### Primary (HIGH confidence — verified file:line in current main)
- `be/src/shared/middleware/auth.middleware.ts` — full read, lines 1-429
- `be/src/shared/services/ability.service.ts` — sections 220-420 read; V2 builder + dispatcher + cache + invalidate
- `be/src/shared/config/index.ts:487-497` — feature flag definition
- `be/src/modules/audit/services/audit.service.ts:1-200` — audit API and existing action enum
- `.planning/REQUIREMENTS.md` — TS6, TS7, TS14 requirements
- `.planning/ROADMAP.md` — Phase 3 plans P3.1–P3.5
- `.planning/research/EXISTING_AUTH_SURFACE.md` — verified zero drift since 2026-04-07
- `.planning/research/PERMISSION_INVENTORY.md` — full per-module key map
- `.planning/research/RISKS.md` — R-1 through R-12
- `be/CLAUDE.md` — strict layering, REST conventions, JSDoc rules

### Cross-checked
- `be/src/shared/permissions/{registry.ts, sync.ts, index.ts, legacy-mapping.ts}` — Phase 1 deliverables present
- `be/src/modules/audit/{controllers, services, models, routes}` — confirmed existing structure
- Phase 2 carry-forward IOU (legacy `permission_level`-only rows in `resource_grants`) — handled by V2 builder skip+log; Phase 3 deploy guardrail upgrades to fail-fast in production

---

## Metadata

**Confidence breakdown:**
- Auth call-site inventory: HIGH — every line cited and verified against EXISTING_AUTH_SURFACE.md and current main
- Middleware design: HIGH — pattern verified against existing `requireAbility` + V2 builder
- `rbac.ts` shim option (a): HIGH — only one external caller confirmed
- Permissions module endpoints: HIGH — TS7 spec is locked in REQUIREMENTS.md
- Audit integration: HIGH — existing audit service API verified
- Cache invalidation matrix: HIGH — `invalidateAbility` and `invalidateAllAbilities` exist; only new helper is `invalidateAllSessionsForUser`
- `whoCanDo` algorithm: MEDIUM — described but not yet prototyped; needs tenant-scoping verification during implementation
- Org-switch cache invalidation behavior: LOW — flagged as Open Question #1; needs reading `auth.controller.ts` org-switch handler

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (30 days — auth code is stable)
