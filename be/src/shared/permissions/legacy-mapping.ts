/**
 * @fileoverview Phase 1 / P1.5 — Legacy → new permission key expansion table.
 *
 * Maps every legacy permission string defined in `be/src/shared/config/rbac.ts`
 * (the `Permission` union at L62 and the `ROLE_PERMISSIONS` map at L113) to the
 * set of new registry keys that day-one `role_permissions` must contain so that
 * every pre-existing (role, legacyPermission) grant is preserved verbatim in
 * behavior.
 *
 * This module is shared between:
 *   1. The seed migration (`20260407062700_phase1_seed_role_permissions.ts`)
 *      which expands each legacy key and inserts the resulting rows.
 *   2. The parity test (`be/tests/permissions/role-seed.test.ts`) which
 *      imports the live `ROLE_PERMISSIONS` map and asserts that the seeded
 *      rows form a strict superset of the expansion.
 *
 * Keeping both call sites on a single source of truth prevents silent drift:
 * if a new legacy permission is ever added to `rbac.ts`, both the migration
 * and the test will fail loudly until the mapping is updated here.
 *
 * ## Deviation from PLAN.md P1.5 §T5.2
 *
 * The plan document (and `1-RESEARCH.md` §8) specified a 23-key `manage_users`
 * expansion that referenced `chat_assistants.{view,create,edit,delete,embed}`.
 * However, during P1.3 the chat module was intentionally consolidated into a
 * single `chat` feature namespace that aggregates assistant configuration,
 * conversations, and embeds — see the file header of
 * `be/src/modules/chat/chat.permissions.ts`. As a result no `chat_assistants.*`
 * keys exist in the live registry; the equivalent semantics are carried by
 * `chat.{view,create,edit,delete,embed}`. The expansion below uses the real
 * registry keys so the day-one parity guarantee is preserved.
 *
 * ## Deviation — dropped legacy keys
 *
 * Three legacy permissions have no corresponding new-registry entry and are
 * intentionally dropped from the expansion. Each is documented inline below
 * so a future reviewer understands the deletion was deliberate:
 *
 *   - `manage_storage`  — the storage sub-system was absorbed into documents /
 *     knowledge-base actions. The separate "storage" module never shipped.
 *   - `storage:read`    — same rationale.
 *   - `storage:write`   — same rationale.
 *   - `storage:delete`  — same rationale.
 *
 * If any future code path needs these capabilities it must go through the new
 * per-feature keys instead of resurrecting the legacy storage namespace.
 */

/**
 * @description Readonly mapping from a legacy `Permission` string (see
 * `rbac.ts` L62) to the list of new registry keys it expands into. Every key
 * on the right-hand side MUST exist in the live permission registry — the
 * seed migration re-validates this at runtime and throws if any referenced
 * key is missing, so drift is caught at `knex migrate:latest` time.
 */
export const LEGACY_TO_NEW: Readonly<Record<string, readonly string[]>> = {
  // Basic read-only chat access for every role.
  view_chat: ['chat.view'],

  // Search app listing (feature slug is `search_apps`, not `search`).
  view_search: ['search_apps.view'],

  // User history browsing — flat single-action module.
  view_history: ['user_history.view'],

  // `manage_users` is the legacy "super permission" for admin surfaces.
  // Expands to 24 keys: users (8) + teams (6) + chat (5) + search_apps (5).
  // See the file-level comment above for the chat_assistants -> chat mapping.
  manage_users: [
    // Users module — full CRUD plus admin-only views (IP, sessions, role/perm assignment).
    'users.view',
    'users.create',
    'users.edit',
    'users.delete',
    'users.view_ip',
    'users.view_sessions',
    'users.assign_role',
    'users.assign_perms',
    // Teams module — full CRUD plus member and permission management.
    'teams.view',
    'teams.create',
    'teams.edit',
    'teams.delete',
    'teams.members',
    'teams.permissions',
    // Chat module — P1.3 consolidated chat_assistants + conversations + embeds
    // under a single `chat` feature namespace. These five keys correspond to
    // the old chat_assistants.{view,create,edit,delete,embed} surface.
    'chat.view',
    'chat.create',
    'chat.edit',
    'chat.delete',
    'chat.embed',
    // Search apps module — CRUD plus embed.
    'search_apps.view',
    'search_apps.create',
    'search_apps.edit',
    'search_apps.delete',
    'search_apps.embed',
  ],

  // System configuration surface: system settings + parsing config + history.
  manage_system: ['system.view', 'system.parsing_config', 'system_history.view'],

  // Knowledge base management: KB CRUD + sharing/bindings/sync, document
  // categories CRUD + bulk import, and the KB-side documents.view action.
  manage_knowledge_base: [
    // Knowledge base primary CRUD and lifecycle.
    'knowledge_base.view',
    'knowledge_base.create',
    'knowledge_base.edit',
    'knowledge_base.delete',
    'knowledge_base.share',
    'knowledge_base.chats',
    'knowledge_base.searches',
    'knowledge_base.sync',
    // Document categories — CRUD plus bulk import.
    'document_categories.view',
    'document_categories.create',
    'document_categories.edit',
    'document_categories.delete',
    'document_categories.import',
    // Read-side document browsing (write actions live under manage_datasets).
    'documents.view',
  ],

  // Analytics / dashboard — includes the admin-only panel.
  view_analytics: ['dashboard.view', 'dashboard.admin'],

  // System tools landing page plus the ability to run tools.
  view_system_tools: ['system_tools.view', 'system_tools.run'],

  // Dataset pipeline management: datasets CRUD + advanced jobs, write-side
  // document actions (parse/enrich/bulk), and chunk-level CRUD.
  manage_datasets: [
    // Datasets module — CRUD + sharing + reindex + advanced jobs.
    'datasets.view',
    'datasets.create',
    'datasets.edit',
    'datasets.delete',
    'datasets.share',
    'datasets.reindex',
    'datasets.advanced',
    // Documents module — write-side actions owned by the dataset pipeline
    // (documents.view lives under manage_knowledge_base above).
    'documents.create',
    'documents.edit',
    'documents.delete',
    'documents.parse',
    'documents.enrich',
    'documents.bulk',
    // Chunks module — CRUD inside a document.
    'chunks.view',
    'chunks.create',
    'chunks.edit',
    'chunks.delete',
  ],

  // LLM provider catalog management. Note: the registry uses the plural
  // feature slug `llm_providers` (not `llm_provider`).
  manage_model_providers: [
    'llm_providers.view',
    'llm_providers.create',
    'llm_providers.edit',
    'llm_providers.delete',
    'llm_providers.test',
  ],

  // --- Intentionally empty expansions (documented deviations) ---
  // The legacy storage namespace was absorbed into documents / knowledge_base
  // during Phase 1's registry design. Mapping these to an empty array means
  // the seed migration emits zero rows for them, which matches reality: no
  // code path checks storage:* post-Phase 1.
  manage_storage: [],
  'storage:read': [],
  'storage:write': [],
  'storage:delete': [],
} as const

/**
 * @description Locked Phase 1 decision (REQUIREMENTS.md TS4): the `agents.*`
 * and `memory.*` feature namespaces have no legacy counterpart and are
 * granted to `admin` and `super-admin` only on day one. Listed here so the
 * migration and the parity test share one source of truth.
 */
export const AGENTS_MEMORY_ADMIN_ONLY_KEYS: readonly string[] = [
  // Agents — full lifecycle plus run/debug/credentials/embed.
  'agents.view',
  'agents.create',
  'agents.edit',
  'agents.delete',
  'agents.run',
  'agents.debug',
  'agents.credentials',
  'agents.embed',
  // Memory — CRUD only.
  'memory.view',
  'memory.create',
  'memory.edit',
  'memory.delete',
] as const

/**
 * @description Roles that receive the `agents.*` and `memory.*` permissions
 * on day one.
 *
 * Originally locked in Phase 1 as "admin + super-admin only", but Phase 2's
 * P2.4 parity matrix discovered that V1's `buildAbilityForV1Sync()` at
 * `be/src/shared/services/ability.service.ts` lines 173-174 also grants
 * `manage Agent` and `manage Memory` to the `leader` role via hard-coded
 * `if` blocks. Since Phase 2's contract is "zero user-visible behavior
 * change" when flipping `config.permissions.useV2Engine` to true, the locked
 * Phase 1 decision is amended here to preserve V1's existing leader behavior.
 *
 * The original Phase 1 reasoning ("admin + super-admin only") was likely
 * more restrictive than V1's actual production behavior. A future milestone
 * can revisit whether `leader` should retain agents/memory access; until
 * then, V1's status quo wins per the Phase 2 parity contract.
 *
 * Note: this constant change only affects FRESH databases via P1.5. Existing
 * databases that already ran P1.5 before this amendment landed are patched
 * in `20260407090000_phase02_patch_role_permissions_for_v2_parity.ts`, which
 * inserts the same agents/memory rows for the leader role.
 *
 * @see Phase 2 P2.4 divergences rows 4-5
 * @see be/src/shared/services/ability.service.ts:173-174
 */
export const AGENTS_MEMORY_ADMIN_ROLES: readonly string[] = [
  'admin',
  'super-admin',
  'leader',
] as const
