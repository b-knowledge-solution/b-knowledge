# Permission Inventory — Per-Module Catalog Seed

**Researched:** 2026-04-07
**Confidence:** HIGH for modules with route files; MEDIUM where current routes are gap areas

For each of the 22 BE modules: routes that exist (or that should), and the registry key they should map to in the new permission registry. This is the seed data for `permissions` + `role_permissions`.

**Key naming convention:** `<feature>.<action>` where action ∈ `view | create | edit | delete | manage` (`manage` reserved for module-wide admin operations like reseed, reindex, etc.)

## Legend
- ✓ = mapping inferred from existing route
- ✗ = no current middleware; needs new gating
- ⚠ = currently uses wrong/lazy permission key (e.g. `manage_users` for chat)

---

## 1. agents (`be/src/modules/agents/routes/agent.routes.ts`)

| Method | Path | Current | Proposed key |
|---|---|---|---|
| GET | `/` | `requireAbility('read', 'Agent')` ✓ | `agents.view` |
| POST | `/` | `requireAbility('manage', 'Agent')` ✓ | `agents.create` |
| GET | `/:id` | read | `agents.view` |
| PUT | `/:id` | manage | `agents.edit` |
| DELETE | `/:id` | manage | `agents.delete` |
| POST | `/:id/duplicate` | manage | `agents.create` |
| GET | `/:id/export` | read | `agents.view` |
| POST | `/:id/run` | read | `agents.run` (new action) |
| GET | `/:id/run/:runId/stream` | read | `agents.run` |
| POST | `/:id/run/:runId/cancel` | manage | `agents.run` |
| GET | `/:id/runs` | read | `agents.view` |
| POST | `/:id/debug` | manage | `agents.debug` (new) |
| `/tools/credentials` | (4 routes) | manage | `agents.credentials` (new — sensitive) |
| `/:id/versions` (4 routes) | mix | `agents.edit` |
| `agent-embed.routes.ts` | ✗ | `agents.embed` (public-keyed, but tenant-scoped) |
| `agent-webhook.routes.ts` | ✗ | (out-of-band, separate auth) |

## 2. audit (`be/src/modules/audit/routes/audit.routes.ts`)

Whole module gated by `requireRole('admin')` (L30).

| Method | Path | Proposed key |
|---|---|---|
| GET | `/` | `audit.view` |
| GET | `/:id` | `audit.view` |
| GET | `/export` | `audit.export` (new) |

## 3. auth (`be/src/modules/auth/auth.routes.ts`)
No permissions — login/logout/session endpoints. Out of scope.

## 4. broadcast (`be/src/modules/broadcast/routes/broadcast-message.routes.ts`)

| Method | Path | Current | Proposed |
|---|---|---|---|
| GET | `/` | `manage_system` ⚠ | `broadcast.view` |
| POST | `/` | `manage_system` ⚠ | `broadcast.create` |
| PUT | `/:id` | `manage_system` ⚠ | `broadcast.edit` |
| DELETE | `/:id` | `manage_system` ⚠ | `broadcast.delete` |

## 5. chat (`be/src/modules/chat/routes/chat-*.routes.ts`)

The 5 sub-modules currently mis-use `manage_users` as a write gate.

| File | Routes | Proposed |
|---|---|---|
| `chat-assistant.routes.ts` | L32, L69, L82, L95, L108 (`manage_users` ⚠) | `chat_assistants.{view,create,edit,delete}` (split per HTTP verb) |
| `chat-conversation.routes.ts` | ✗ no middleware | `chat.view` (read own), `chat.create` |
| `chat-embed.routes.ts` | L37, L50, L63 (`manage_users` ⚠) | `chat_assistants.embed` |
| `chat-file.routes.ts` | ✗ | `chat.upload` |
| `chat-openai.routes.ts` | ✗ | `chat.api` (api-key auth) |

## 6. code-graph (`be/src/modules/code-graph/code-graph.routes.ts`)

| Path | Current | Proposed |
|---|---|---|
| L153 build | `requireRole('admin')` | `code_graph.manage` |
| Other routes | ✗ | `code_graph.view` |

## 7. dashboard (`be/src/modules/dashboard/dashboard.routes.ts`)

| Method | Path | Current | Proposed |
|---|---|---|---|
| L25 | summary | `requireRole('admin','leader')` | `dashboard.view` |
| L40 | admin metrics | `requireRole('admin','super-admin')` | `dashboard.admin` |
| L55 | admin metrics | same | `dashboard.admin` |

## 8. external (`be/src/modules/external/routes/*.ts`)

Two sub-files, both currently ungated:

| File | Proposed |
|---|---|
| `api-key.routes.ts` | `api_keys.{view,create,edit,delete}` |
| `external-api.routes.ts` | (api-key auth path — separate from session perms) |

## 9. feedback (`be/src/modules/feedback/routes/feedback.routes.ts`)

| Path | Current | Proposed |
|---|---|---|
| L32, L50, L70 | `requireRole('admin','leader')` | `feedback.view`, `feedback.edit`, `feedback.delete` |
| (user submit) | ✗ | `feedback.submit` (any authenticated user) |

## 10. glossary (`be/src/modules/glossary/routes/glossary.routes.ts`)

8 sites, all `requireRole('admin')` (L40, L48, L56, L73, L81, L89, L100, L107).

| Proposed |
|---|
| `glossary.view`, `glossary.create`, `glossary.edit`, `glossary.delete`, `glossary.import` |

## 11. knowledge-base (`be/src/modules/knowledge-base/routes/knowledge-base.routes.ts`)

The largest single module — 80+ routes. Current state mixes `requireAbility` with `requireRole`.

| Sub-resource | Current | Proposed |
|---|---|---|
| KB CRUD (L56-60) | `requireAbility('read'\|'manage','KnowledgeBase')` | `knowledge_base.{view,create,edit,delete}` + `resource_grants.kb_id` |
| KB permissions API (L65-67) | `requireAbility` | `knowledge_base.share` (new) |
| KB datasets bind (L72-74) | `requireAbility` | `knowledge_base.edit` |
| Categories (L79-83) | `requireAbility` | `document_categories.{view,create,edit,delete}` + `resource_grants.category_id` |
| Versions (L88-91) | `requireAbility` | `document_categories.edit` |
| Git/zip import (L96-97) | `requireAbility` | `document_categories.import` |
| Version documents (L100-107) | `requireAbility` | `documents.{view,create,delete}` |
| KB chats (L112-116) | `requireAbility` | `knowledge_base.chats` (new) |
| KB searches (L121-125) | `requireAbility` | `knowledge_base.searches` (new) |
| Sync configs (L130-133) | `requireAbility` | `knowledge_base.sync` (new) |
| Entity permissions (L138-140) | `requireAbility` | `knowledge_base.share` |
| Members (L145-147) | `requireRole('admin','leader')` ⚠ | `knowledge_base.share` |
| Datasets bind (L152-153) | `requireRole('admin','leader')` ⚠ | `knowledge_base.edit` |

## 12. llm-provider (`be/src/modules/llm-provider/routes/llm-provider.routes.ts`)

All 9 routes use `manage_model_providers` ✓ (L18-39).

| Proposed (split by verb) |
|---|
| `llm_providers.view`, `llm_providers.create`, `llm_providers.edit`, `llm_providers.delete`, `llm_providers.test` |
| `llm-provider-public.routes.ts` ✗ → public list, no perm needed |

## 13. memory (`be/src/modules/memory/routes/memory.routes.ts`)

L28 entire module gated by `requireAbility('manage','Memory')` ✓.

| Proposed |
|---|
| `memory.{view,create,edit,delete}` |

## 14. preview (`be/src/modules/preview/preview.routes.ts`)

L14 `requirePermission('view_search')` ⚠ (lazy mapping).

| Proposed |
|---|
| `preview.view` |

## 15. rag (`be/src/modules/rag/routes/rag.routes.ts`)

The biggest `requirePermission` user — ~30 routes, all `manage_datasets`. Needs split:

| Sub-resource | Routes | Proposed |
|---|---|---|
| Datasets CRUD | L46-48 | `datasets.{create,edit,delete}` |
| Dataset versions | L51 | `datasets.edit` |
| Dataset access | L55-56 | `datasets.share` (new) |
| Settings | L61, L65 | `datasets.edit` |
| Re-embed | L68 | `datasets.reindex` (new) |
| Chunks | L71-74 | `chunks.{create,edit,delete}` (new sub-feature) |
| Documents | L81, L82, L85, L86, L88, L91, L94-96 | `documents.{create,edit,delete,parse}` |
| Bulk ops | L95-96 | `documents.bulk` (new) |
| Advanced tasks (graphrag/raptor/mindmap) | L103 | `datasets.advanced` (new) |
| Doc enrichment | L107 | `documents.enrich` (new) |
| Graph run | L124 | `datasets.advanced` |
| Metadata | L128, L38 | `datasets.edit` |
| Parsing scheduler | L137-138 | `system.parsing_config` (new — system-level) |

## 16. search (`be/src/modules/search/routes/*.ts`)

Mirrors chat — uses `manage_users` ⚠ as a write gate.

| File | Routes | Proposed |
|---|---|---|
| `search.routes.ts` | L37, L74, L87, L100, L113 | `search_apps.{view,create,edit,delete}` |
| `search-embed.routes.ts` | L38, L51, L64 | `search_apps.embed` |
| `search-openai.routes.ts` | ✗ | `search.api` |

## 17. sync (`be/src/modules/sync/routes/sync.routes.ts`)

5 routes, all `manage_knowledge_base` ✓.

| Proposed |
|---|
| `sync_connectors.{view,create,edit,delete,run}` |

## 18. system (`be/src/modules/system/routes/system.routes.ts` + `system-history.routes.ts`)

| File | Routes | Current | Proposed |
|---|---|---|---|
| `system.routes.ts` | L19 | `requireRole('admin')` | `system.view` |
| `system-history.routes.ts` | L30, L38, L46, L54, L62, L70, L78 | `requireRole('admin')` | `system_history.view` (admin-wide chat/search/agent history) |

## 19. system-tools (`be/src/modules/system-tools/system-tools.routes.ts`)

| Path | Current | Proposed |
|---|---|---|
| L19 GET / | `view_system_tools` ✓ | `system_tools.view` |
| L27 GET /health | `view_system_tools` ✓ | `system_tools.view` |
| L35 POST /:id/run | `manage_system` ✓ | `system_tools.run` |

## 20. teams (`be/src/modules/teams/routes/teams.routes.ts`)

8 routes, all `manage_users` ⚠.

| Proposed |
|---|
| `teams.{view,create,edit,delete}`, `teams.members`, `teams.permissions` |

## 21. user-history (`be/src/modules/user-history/user-history.routes.ts`)

✗ Currently no middleware. User-self scoped.

| Proposed |
|---|
| `user_history.view` (default-allow for any authenticated user; admin override via `system_history.view`) |

## 22. users (`be/src/modules/users/routes/users.routes.ts`)

| Method | Path | Current | Proposed |
|---|---|---|---|
| L49 GET / | `manage_users` | `users.view` |
| L58 POST / | `manage_users` | `users.create` |
| L68 GET /ip-history | `manage_users` | `users.view_ip` (new — sensitive) |
| L75 GET /:id/ip-history | `manage_users` | `users.view_ip` |
| L82 GET /:id/sessions | `manage_users` | `users.view_sessions` (new) |
| L93 PUT /:id | `requireAbility('manage','User')` | `users.edit` |
| L106 DELETE /:id | `manage_users` | `users.delete` |
| L118, L130 | role/perm changes | `users.assign_role`, `users.assign_perms` (new — should require recent auth too) |

## Day-One Seed (`role_permissions`)

Each role gets the union of permissions corresponding to its current `ROLE_PERMISSIONS` map. The day-one mapping table is then:

| Legacy permission | New keys |
|---|---|
| `manage_users` | `users.{view,create,edit,delete,view_ip,view_sessions,assign_role,assign_perms}`, `teams.*` |
| `manage_system` | `broadcast.*`, `system.*`, `system_tools.run`, `system.parsing_config` |
| `manage_knowledge_base` | `knowledge_base.*`, `document_categories.*`, `sync_connectors.*` |
| `manage_datasets` | `datasets.*`, `documents.*`, `chunks.*` |
| `manage_storage` | (storage routes — currently ungated; map to new `storage.*`) |
| `manage_model_providers` | `llm_providers.*` |
| `view_chat` | `chat.view` |
| `view_search` | `search.view`, `preview.view` |
| `view_history` | `user_history.view` |
| `view_analytics` | `dashboard.view` |
| `view_system_tools` | `system_tools.view` |
| `storage:read` / `:write` / `:delete` | `storage.{read,write,delete}` |

This mapping is the canonical seed for the migration script (R10).
