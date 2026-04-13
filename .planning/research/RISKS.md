# Risks & Gotchas

**Researched:** 2026-04-07
**Confidence:** HIGH (each risk cites a specific code site)

## R-1: `rbac.ts` shim must stay live during cutover (CRITICAL)

**Problem:** `be/src/shared/middleware/auth.middleware.ts:13` imports `hasPermission, Role, Permission, ADMIN_ROLES` from `rbac.ts`. ~60 routes call `requirePermission(...)`. If `rbac.ts` is deleted before every route migrates to `requireAbility` (R4), every one of those routes 500s on import error.

**Mitigation:**
- Keep `rbac.ts` as a **generated shim** that reads from `role_permissions` at boot and exports the same `hasPermission` signature.
- Mark `Permission` type as `string` (loose) during the migration window so the shim can return real DB-backed answers.
- Delete `rbac.ts` only AFTER every route has flipped to either `requirePermission(newKey)` (DB-backed) or `requireAbility`.
- Track removal in a checklist that lists all 60+ call sites.

**Detection:** A boot-time assertion `assert(role_permissions.count > 0)` ensures the shim has data before serving traffic.

## R-2: Redis ability cache must be invalidated globally on rollout (CRITICAL)

**Problem:** `ability.service.ts:75` defines `ABILITY_CACHE_PREFIX = 'ability:'` and caches CASL rules per session for `604800` seconds (7 days, line 78). After deploying R3, every existing session's cached rules are STALE (built from the old role-branch path) and may grant or deny incorrectly.

**Mitigation:**
- The deploy script must call `invalidateAllAbilities()` (defined at `ability.service.ts:249`, uses SCAN to avoid blocking).
- Add a versioned cache key prefix: `ability:v2:<sessionId>` so the cache namespace itself rotates and old keys naturally expire.
- Document this in the deploy runbook for R3.

**Detection:** Spike in 403s within minutes of deploy = cache wasn't flushed.

## R-3: Peewee tables in `advance-rag` reference role/permission fields directly

**Problem:** The Python worker (`advance-rag/api/db/`) does NOT join through the BE auth layer. If any Peewee model contains role/permission columns and queries them, those columns become a parallel source of truth that can drift.

**Investigation result:** Grep for `category_id|kb_id|knowledge_base_id|tenant_id` in `advance-rag/api/db` returned **no matches** — meaning advance-rag doesn't directly query categories at all. Tenant scoping happens via OS index name (`knowledge_<tenant_id>`). Good news: there's nothing to migrate on the Python side **for this milestone**.

**Future risk:** If R6 chooses Strategy B (write `category_id` to chunks — see `OPENSEARCH_INTEGRATION.md`), then `advance-rag/embedding_worker.py` and indexing pipeline will need cross-language constants in `advance-rag/embed_constants.py` AND `be/src/shared/constants/embedding.ts`, with the project rule's "must match" comments in both files.

## R-4: FE components hard-code role strings (CONSTANTS RULE VIOLATION)

**Problem:** The "no hardcoded string literals" rule from `CLAUDE.md` is violated in:
- `fe/src/features/teams/api/teamQueries.ts:292` — `user.role === 'user' \|\| user.role === 'leader'` (raw strings!)
- `fe/src/features/auth/components/AdminRoute.tsx:46` — uses `UserRole.ADMIN` constants (OK) but the route guard concept itself is the bug
- `fe/src/features/datasets/components/DocumentTable.tsx` — 10 occurrences of `isAdmin` boolean prop (10!)
- `fe/src/features/knowledge-base/components/StandardTabRedesigned.tsx:371` — `<ConnectorListPanel kbId={...} isAdmin />` with literal `true` baked in

**Mitigation:**
- ESLint rule (custom or `no-restricted-syntax`) banning `user.role ===` and `user?.role ===` outside the `auth` feature folder.
- Codemod in R8 that replaces `isAdmin` props with `<Can I="manage" a="...">` wrappers.
- Reject PRs that introduce new role-string comparisons during the migration window.

## R-5: `tenant_id` consistency on grant tables (DATA INTEGRITY)

**Problem:** `document_categories` does NOT have a `tenant_id` column (verified — `KB_CATEGORY_MODEL.md` section "Critical observation"). Tenant scoping is inherited from `knowledge_bases.tenant_id`. If `resource_grants` doesn't denormalize `tenant_id`, every ability check needs a 3-table JOIN (`resource_grants → document_categories → knowledge_bases`) on the hot path.

**Mitigation:**
- `resource_grants.tenant_id` is **mandatory** (NOT NULL).
- Insert path validates that the parent resource's `tenant_id` matches before accepting the grant.
- Add a Knex DB-level CHECK constraint or trigger to prevent cross-tenant grants from being created.

## R-6: Test coverage gaps in current `ability.service.ts`

**Problem:** Grep for tests of `ability.service` returns minimal coverage. The functions in scope for replacement include:
- `buildAbilityFor` — has role-branch logic at lines 101-156, no test file confirmed
- `cacheAbility` / `loadCachedAbility` — Redis-dependent, untested at unit level
- `buildOpenSearchAbacFilters` — only `Document` subject (line 303), zero tests for the translation logic
- `invalidateAllAbilities` — untested SCAN loop

**Mitigation (R13):**
- Vitest suite for `ability.service.ts` BEFORE replacing it. Snapshot the existing rules-output for each role so the new DB-backed implementation can be regression-tested against the same fixtures.
- Property-based test: `forEach(role) → buildAbilityFor(role)` produces a superset of `ROLE_PERMISSIONS[role]` mapped through the new `LEGACY_TO_NEW` table.
- Integration test for `requireAbility` middleware against an in-memory Redis.

## R-7: Mixed-mode middleware on the same route file (CONSISTENCY)

**Problem:** `be/src/modules/users/routes/users.routes.ts` mixes `requirePermission('manage_users')` (lines 49, 58, 68, 75, 82, 106, 118, 130) with `requireAbility('manage','User')` (line 93) **in the same file**. Any auditor reading this file can't tell which gating system is canonical for users.

**Mitigation:**
- R4 mandates exactly one gating mechanism per route, project-wide.
- During cutover, prefer `requirePermission(newKey)` everywhere — `requireAbility` is reserved for routes that need ABAC conditions (resource ownership, tenant scoping). Pure RBAC routes use the simpler `requirePermission`.

## R-8: `manage_users` is overloaded as a generic "writer" gate

**Problem:** Found in chat, search, broadcast routes — e.g. `chat-assistant.routes.ts:32, 69, 82, 95, 108` all use `manage_users` to gate **chat assistant CRUD**. This means anyone with permission to manage users currently can also create chat assistants, and vice versa nobody else can.

**Mitigation:**
- The day-one seed in `MIGRATION_PLAN.md` explicitly maps `manage_users` → `chat_assistants.*` so behavior doesn't change immediately.
- R4 then split-routes those endpoints into `chat_assistants.create/edit/delete` keys and removes them from the `manage_users` legacy mapping.
- This becomes a behavior change that needs admin opt-in (R12 audit log surfaces "permission scope tightened" events).

## R-9: `requireOwnership` admin bypass uses static `ADMIN_ROLES`

**Problem:** `auth.middleware.ts:274` and `:328` both call `ADMIN_ROLES.includes(user.role as Role)`. This is a constant array imported from `rbac.ts`. After migration, `ADMIN_ROLES` should ideally come from a query like "users that have `admin.bypass_ownership` permission" — but that's a behavior change.

**Mitigation:**
- Keep `ADMIN_ROLES` in the shim for the milestone.
- Document as a follow-up: convert `requireOwnership` to use a real permission check (`ownership.bypass`) in a future milestone.

## R-10: Permission changes don't propagate without session refresh

**Problem:** Per PROJECT.md "Out of Scope", this is acknowledged. The risk is that admins changing a user's role mid-session expect immediate effect.

**Mitigation:**
- `invalidateAbility(sessionId)` (already exists at `ability.service.ts:227`) is called from the role-change service path.
- Need to also call it on every session of the affected user — not just the admin's session. Requires a `findAllSessionsByUserId(userId)` lookup against Redis session keys.
- Document this in admin UI (R9): "Changes take effect on the user's next request."

## R-11: KB member CRUD currently uses `requireRole('admin','leader')` but the action is logically a `share`

**Problem:** `knowledge-base.routes.ts:146,147,152,153` use `requireRole`, while every other route in the same file uses `requireAbility('manage','KnowledgeBase')`. This is inconsistent and means a user with `requireAbility` access but not the static role can't manage members.

**Mitigation:**
- R4: replace these 4 routes with `requirePermission('knowledge_base.share')`.
- The new permission key isolates "can manage who has access" from "can edit the KB itself."

## R-12: Tenant_id missing from `chunk_id`/`message_id`-style cache keys

**Problem:** `ability.service.ts:75` uses key `ability:<sessionId>` — no tenant scope. If a single session ever spans tenants (multi-tenant user via `current_org_id` switch), the cached ability could leak across tenants.

**Mitigation:**
- Verify in `auth.controller.ts` whether org switching invalidates the ability cache. (Quick check needed in roadmap phase.)
- Consider key format `ability:<sessionId>:<orgId>` to make this impossible by construction.
