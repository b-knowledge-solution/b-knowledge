# Existing Auth Surface — Migration Target Inventory

**Researched:** 2026-04-07
**Mode:** Ecosystem (focused codebase investigation)
**Confidence:** HIGH (every claim is a literal grep hit; cite file:line)

## Overview

There are **two parallel auth systems** operating side by side, plus ad-hoc role string comparisons sprinkled across services and the frontend. The new unified engine must replace every site listed below.

| System | Files | Style |
|---|---|---|
| Static RBAC | `be/src/shared/config/rbac.ts` | Hardcoded `Role -> Permission[]` map; checked via `hasPermission()` |
| CASL ABAC | `be/src/shared/services/ability.service.ts` | Role-branched `AbilityBuilder` + cached in Redis |
| Role hierarchy helpers | `be/src/shared/constants/roles.ts` | `isAdminRole`, `isElevatedRole`, `UserRole` enum (incl. legacy aliases) |

## Backend — Middleware definitions

| File | Line | Symbol | Notes |
|---|---|---|---|
| `be/src/shared/middleware/auth.middleware.ts` | 13 | `import { hasPermission, Role, Permission, ADMIN_ROLES }` | Sole consumer of `rbac.ts` |
| `be/src/shared/middleware/auth.middleware.ts` | 47 | `requireAuth` | Session check |
| `be/src/shared/middleware/auth.middleware.ts` | 65 | `requireRecentAuth(maxAgeMinutes)` | Reauth gate |
| `be/src/shared/middleware/auth.middleware.ts` | 140 | `requirePermission(permission)` | Calls `hasPermission(user.role, permission)` (line 157) AND falls through to `user.permissions` JSON array (lines 163-180) |
| `be/src/shared/middleware/auth.middleware.ts` | 198 | `requireRole(...roles)` | Direct `roles.includes(user.role)` check |
| `be/src/shared/middleware/auth.middleware.ts` | 239 | `requireOwnership(userIdParam, { allowAdminBypass })` | Bypass via `ADMIN_ROLES.includes(user.role)` (line 274) |
| `be/src/shared/middleware/auth.middleware.ts` | 293 | `requireOwnershipCustom(getOwnerId, ...)` | Bypass via `ADMIN_ROLES.includes(user.role)` (line 328) |
| `be/src/shared/middleware/auth.middleware.ts` | 346 | `requireAbility(action, subject)` | CASL path: loadCachedAbility -> buildAbilityFor -> `ability.can(...)` (line 377) |

## Backend — Static `hasPermission`/`isAdminRole`/`isElevatedRole`/`isAtLeastRole` call sites

These all live in `rbac.ts` or `roles.ts`; the only **external** consumers are:

| File | Line | Call |
|---|---|---|
| `be/src/shared/middleware/auth.middleware.ts` | 157 | `hasPermission(user.role, permission)` |
| `be/src/shared/middleware/auth.middleware.ts` | 274 | `ADMIN_ROLES.includes(user.role as Role)` |
| `be/src/shared/middleware/auth.middleware.ts` | 328 | `ADMIN_ROLES.includes(user.role as Role)` |
| `be/src/shared/constants/roles.ts` | 31 | `isAdminRole(role)` definition |
| `be/src/shared/constants/roles.ts` | 40 | `isElevatedRole(role)` definition |

(Note: `isAtLeastRole` is **defined** in `rbac.ts:203` but has **zero external call sites** — it's dead code.)

## Backend — Direct `user.role ===` / `req.user.role` comparisons (the worst offenders)

These must all migrate to `requirePermission` middleware or `ability.can` checks:

| File | Line | Comparison |
|---|---|---|
| `be/src/modules/knowledge-base/services/knowledge-base.service.ts` | 29 | `user.role === UserRole.ADMIN \|\| user.role === UserRole.SUPERADMIN` (uses **legacy alias!**) |
| `be/src/modules/teams/services/team.service.ts` | 317 | `user.role === UserRole.LEADER ? TeamRole.LEADER : TeamRole.MEMBER` |
| `be/src/modules/teams/services/team.service.ts` | 345 | `user.role === UserRole.ADMIN` (early return guard) |
| `be/src/modules/sync/controllers/sync.controller.ts` | 71 | `user.role === UserRole.ADMIN \|\| user.role === UserRole.SUPERADMIN \|\| user.role === UserRole.LEADER` (legacy alias!) |
| `be/src/modules/rag/services/rag.service.ts` | 50 | `user.role === UserRole.ADMIN` (admin bypass) |
| `be/src/modules/search/controllers/search.controller.ts` | 64 | `req.user?.role` branch |
| `be/src/modules/chat/controllers/chat-assistant.controller.ts` | 89 | `req.user?.role` branch |
| `be/src/modules/auth/auth.controller.ts` | 65 | `abilityService.buildAbilityFor(...)` (login flow) |
| `be/src/modules/auth/auth.controller.ts` | 474 | `abilityService.buildAbilityFor(...)` (reauth flow) |
| `be/src/modules/auth/auth.controller.ts` | 566 | `abilityService.buildAbilityFor(...)` (`/api/auth/abilities` endpoint) |
| `be/src/modules/chat/services/chat-conversation.service.ts` | 1022 | `abilityService.buildAbilityFor(userContext)` (per-message access check) |
| `be/src/modules/knowledge-base/controllers/knowledge-base.controller.ts` | 27 | passes `req.user.role` in audit context (read-only — OK) |
| `be/src/shared/services/ability.service.ts` | 105 | `user.is_superuser === true \|\| user.role === UserRole.SUPER_ADMIN` |
| `be/src/shared/services/ability.service.ts` | 117 | `user.role === UserRole.ADMIN` (rule branch) |
| `be/src/shared/services/ability.service.ts` | 130 | `user.role === UserRole.LEADER` (rule branch) |

## Backend — `requirePermission` route attachments

`requirePermission(...)` is the static-RBAC path. Every site listed below currently feeds the new permission registry as the seed for `role_permissions`.

### users module — `be/src/modules/users/routes/users.routes.ts`
- L49 `GET /` `manage_users`
- L58 `POST /` `manage_users`
- L68 `GET /ip-history` `manage_users`
- L75 `GET /:id/ip-history` `manage_users`
- L82 `GET /:id/sessions` `manage_users`
- L93 `requireAbility('manage', 'User')` (mixed-mode!)
- L106 `manage_users`
- L118 `manage_users`
- L130 `manage_users`

### teams module — `be/src/modules/teams/routes/teams.routes.ts`
- L21 `GET /` `manage_users`
- L29 `POST /` `manage_users`
- L37 `PUT /:id` `manage_users`
- L45 `DELETE /:id` `manage_users`
- L53 `GET /:id/members` `manage_users`
- L61 `POST /:id/members` `manage_users`
- L69 `DELETE /:id/members/:userId` `manage_users`
- L77 `POST /:id/permissions` `manage_users`

### sync module — `be/src/modules/sync/routes/sync.routes.ts`
- L30, L51, L59, L67, L77 — all `manage_knowledge_base`

### llm-provider module — `be/src/modules/llm-provider/routes/llm-provider.routes.ts`
- L18, L21, L24, L27 — `GET *` `manage_model_providers`
- L30 `POST /` `manage_model_providers`
- L33 `PUT /:id` `manage_model_providers`
- L36 `DELETE /:id` `manage_model_providers`
- L39 `POST /:id/test-connection` `manage_model_providers`

### rag module — `be/src/modules/rag/routes/rag.routes.ts`
- L38, L46, L47, L48, L51, L55, L56, L61, L65, L68, L71-74, L81, L82, L85, L86, L88, L91, L94-96, L103, L107, L124, L128, L137, L138 — all `manage_datasets` (rag is the heaviest static-RBAC user)

### chat module
- `be/src/modules/chat/routes/chat-assistant.routes.ts` L32, L69, L82, L95, L108 — all `manage_users` (incorrectly used as a "writer" gate!)
- `be/src/modules/chat/routes/chat-embed.routes.ts` L37, L50, L63 — all `manage_users` (same bug pattern)

### search module
- `be/src/modules/search/routes/search.routes.ts` L37, L74, L87, L100, L113 — all `manage_users`
- `be/src/modules/search/routes/search-embed.routes.ts` L38, L51, L64 — all `manage_users`

### system-tools — `be/src/modules/system-tools/system-tools.routes.ts`
- L19 `GET /` `view_system_tools`
- L27 `GET /health` `view_system_tools`
- L35 `POST /:id/run` `manage_system`

### preview — `be/src/modules/preview/preview.routes.ts`
- L14 `GET /:bucketName/*` `view_search`

### broadcast — `be/src/modules/broadcast/routes/broadcast-message.routes.ts`
- L41 `GET /` `manage_system`
- L49 `POST /` `manage_system`
- L57 `PUT /:id` `manage_system`
- L65 `DELETE /:id` `manage_system`

## Backend — `requireRole` route attachments (the **least flexible** sites)

| File | Line | Roles | Routes |
|---|---|---|---|
| `be/src/modules/dashboard/dashboard.routes.ts` | 25 | `'admin', 'leader'` | dashboard summary |
| `be/src/modules/dashboard/dashboard.routes.ts` | 40 | `'admin', 'super-admin'` | admin metrics |
| `be/src/modules/dashboard/dashboard.routes.ts` | 55 | `'admin', 'super-admin'` | admin metrics |
| `be/src/modules/code-graph/code-graph.routes.ts` | 153 | `'admin'` | code graph build |
| `be/src/modules/audit/routes/audit.routes.ts` | 30 | `'admin'` | `router.use(requireRole('admin'))` — entire module |
| `be/src/modules/feedback/routes/feedback.routes.ts` | 32, 50, 70 | `'admin', 'leader'` | feedback CRUD |
| `be/src/modules/system/routes/system.routes.ts` | 19 | `'admin'` | dashboard stats |
| `be/src/modules/system/routes/system-history.routes.ts` | 30, 38, 46, 54, 62, 70, 78 | `'admin'` | history endpoints |
| `be/src/modules/glossary/routes/glossary.routes.ts` | 40, 48, 56, 73, 81, 89, 100, 107 | `'admin'` | glossary CRUD |
| `be/src/modules/knowledge-base/routes/knowledge-base.routes.ts` | 146 | `'admin', 'leader'` | add member (mixed with `requireAbility` elsewhere in same file!) |
| `be/src/modules/knowledge-base/routes/knowledge-base.routes.ts` | 147 | `'admin', 'leader'` | remove member |
| `be/src/modules/knowledge-base/routes/knowledge-base.routes.ts` | 152 | `'admin', 'leader'` | bind datasets |
| `be/src/modules/knowledge-base/routes/knowledge-base.routes.ts` | 153 | `'admin', 'leader'` | unbind datasets |

## Backend — `requireAbility` route attachments (the CASL path — preserve & extend)

### knowledge-base module — `be/src/modules/knowledge-base/routes/knowledge-base.routes.ts`
Lines 56-140 (every KB sub-resource): all `requireAbility('read'|'manage', 'KnowledgeBase')`. Specifically: list/get/create/update/delete KB (L56-60), permissions (L65-67), datasets (L72-74), categories (L79-83), versions (L88-91), git/zip import (L96-97), version documents (L100-107), chats (L112-116), searches (L121-125), sync configs (L130-133), entity permissions (L138-140).

### agents module — `be/src/modules/agents/routes/agent.routes.ts`
Lines 39-88: tool credentials (`manage`, `Agent`), CRUD (L48-52), duplicate/export (L58-59), runs (L65-68), debug (L74-79), versions (L85-88).

### memory module — `be/src/modules/memory/routes/memory.routes.ts`
- L28 `router.use(requireAbility('manage', 'Memory'))` — entire module gate

### users module
- `be/src/modules/users/routes/users.routes.ts` L93 `requireAbility('manage', 'User')` (mixed with `requirePermission`)

## Backend — Modules with **NO authorization middleware at all** (gap analysis)

Confirmed via grep: the following route files contain **no** `requireAuth`, `requirePermission`, `requireRole`, or `requireAbility` references and need full coverage:

| File | Status |
|---|---|
| `be/src/modules/external/routes/external-api.routes.ts` | Public API key auth path (separate auth scheme) — verify scope |
| `be/src/modules/external/routes/api-key.routes.ts` | Likely needs `manage_users` or new `api_keys.manage` |
| `be/src/modules/chat/routes/chat-conversation.routes.ts` | User-scoped chat CRUD — needs user-level perms |
| `be/src/modules/chat/routes/chat-file.routes.ts` | File upload to chat |
| `be/src/modules/chat/routes/chat-openai.routes.ts` | OpenAI-compat endpoint |
| `be/src/modules/search/routes/search-openai.routes.ts` | OpenAI-compat search |
| `be/src/modules/agents/routes/agent-embed.routes.ts` | Public embed |
| `be/src/modules/agents/routes/agent-webhook.routes.ts` | Webhook |
| `be/src/modules/llm-provider/routes/llm-provider-public.routes.ts` | Public model list |
| `be/src/modules/user-history/user-history.routes.ts` | User self-history (likely just `requireAuth`) |

These need to be classified during R4 (middleware coverage).

## Frontend — `<Can>` and `useAppAbility` consumers

| File | Line | Usage |
|---|---|---|
| `fe/src/lib/ability.tsx` | 57 | `Can = createContextualCan(AbilityContext.Consumer)` (definition) |
| `fe/src/lib/ability.tsx` | 75 | `useAppAbility()` (definition) |
| `fe/src/features/users/pages/UserManagementPage.tsx` | 8 | `import { useAppAbility }` |
| `fe/src/features/users/pages/UserManagementPage.tsx` | 23 | `const ability = useAppAbility()` |
| `fe/src/features/audit/pages/AuditLogPage.tsx` | 8 | `import { useAppAbility }` |
| `fe/src/features/audit/pages/AuditLogPage.tsx` | 52 | `const ability = useAppAbility()` |

That is the **entire** FE adoption of CASL today — only 2 pages out of 24 features. R8 needs to instrument every other feature.

## Frontend — Direct `user.role ===` / `isAdmin` boolean prop drilling (anti-pattern)

These all violate the "no hardcoded role strings" rule and must move to `useHasPermission(key)`:

| File | Line | Comparison |
|---|---|---|
| `fe/src/constants/roles.ts` | 21 | `isAdminRole(role)` definition |
| `fe/src/constants/roles.ts` | 31 | `isElevatedRole(role)` definition |
| `fe/src/features/auth/components/AdminRoute.tsx` | 46 | `user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN` (route guard) |
| `fe/src/features/datasets/pages/DatasetsPage.tsx` | 27 | `user?.role === UserRole.ADMIN \|\| user?.role === UserRole.LEADER` |
| `fe/src/features/datasets/pages/DatasetsPage.tsx` | 80, 107, 108, 120, 121 | `isAdmin` prop drilling |
| `fe/src/features/datasets/pages/DatasetDetailPage.tsx` | 47 | same admin/leader check |
| `fe/src/features/datasets/pages/DatasetDetailPage.tsx` | 177, 299, 316 | `isAdmin` propagation |
| `fe/src/features/datasets/components/ConnectorListPanel.tsx` | 43, 56, 172, 187, 213 | `isAdmin` prop |
| `fe/src/features/datasets/components/DatasetCard.tsx` | 23, 34, 73 | `isAdmin` prop |
| `fe/src/features/datasets/components/DocumentTable.tsx` | 50, 131, 194, 248, 260, 264, 270, 282, 344, 364 | `isAdmin` prop (10 sites in one component!) |
| `fe/src/features/glossary/pages/GlossaryPage.tsx` | 37, 68, 76 | `user?.role === ADMIN \|\| LEADER` then prop |
| `fe/src/features/glossary/components/TaskManagementTab.tsx` | 35, 47, 146, 157, 190, 204, 210, 216, 230 | `isAdmin` prop |
| `fe/src/features/glossary/components/KeywordManagementTab.tsx` | 36, 46, 145, 156, 189, 202, 208, 214, 232 | `isAdmin` prop |
| `fe/src/features/teams/api/teamQueries.ts` | 292 | `user.role === 'user' \|\| user.role === 'leader'` (**hardcoded string literal!**) |
| `fe/src/features/users/api/userQueries.ts` | 166 | `roleFilter === 'all' \|\| user.role === roleFilter` (filter UI — acceptable) |
| `fe/src/features/knowledge-base/components/StandardTabRedesigned.tsx` | 371 | `<ConnectorListPanel kbId={...} isAdmin />` (hardcoded `true`!) |

## Migration Target Summary

| Surface | Count |
|---|---|
| BE `requirePermission` route sites | ~60 |
| BE `requireRole` route sites | ~25 |
| BE `requireAbility` route sites | ~70 (KB + agents + memory + users) |
| BE service-layer `user.role ===` branches | 7 |
| BE modules without **any** auth middleware | 10 route files |
| FE `<Can>`/`useAppAbility` consumers | 2 pages |
| FE `user.role ===` / `isAdmin` consumers | ~50 sites across 12 files |

Every single one of these is a migration target for R3/R4/R8.
